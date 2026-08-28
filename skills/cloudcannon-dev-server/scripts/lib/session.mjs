// Browser session: resolve playwright-core, attach to the running Chrome over
// CDP, and locate the frames that matter.

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CDP_PORT = process.env.CC_CDP_PORT ?? 9222;

// How long to keep waiting for editable regions after the site frame has
// rendered content, before accepting a page that simply has none.
const BINDING_GRACE_MS = 5000;

// Regions appearing is not the same as the region set being final. On a site
// with client-side hydration the server-rendered markup is bound first, then
// the islands hydrate and rebuild their DOM — on an Astro page here the count
// went 122 -> 94 1.2s after the first regions appeared. Anything that read the
// page in that window saw addresses that were about to stop existing.
//
// So: require the count to hold still for a while, rather than trusting the
// first non-zero reading.
//
// 2000ms is set against measurement, not taste: on this Astro page the drop
// landed 700-880ms after the first regions appeared, across three cold loads.
// readyState is no help — it reaches "complete" ~300ms BEFORE the drop — and
// CloudCannon never re-runs its binder, so there is no event to wait on either.
const SETTLE_STABLE_MS = 2000;
const SETTLE_SAMPLE_MS = 250;
const SETTLE_MAX_MS = 15000;

const INSTALL_HINT = `playwright-core is not installed.

  npm install -g playwright-core

Only playwright-core is needed — these scripts attach to a Chrome you already
launched (see browser.mjs), so no bundled browsers are downloaded.

Where a global install is not possible, install it anywhere and point
CC_PLAYWRIGHT_DIR at the directory holding the resulting node_modules.`;

/**
 * playwright-core is CommonJS, so it must be default-imported; a named
 * `import { chromium }` throws SyntaxError under ESM.
 */
export async function getChromium() {
	const require = createRequire(import.meta.url);
	const candidates = [];

	if (process.env.CC_PLAYWRIGHT_DIR) candidates.push(process.env.CC_PLAYWRIGHT_DIR);
	try {
		candidates.push(
			execSync("npm root -g", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
		);
	} catch {}
	candidates.push(process.cwd());
	// Falling back to the skill's own directory means these scripts work from
	// anywhere, not only from the site they happen to be driving.
	candidates.push(dirname(fileURLToPath(import.meta.url)));

	for (const base of candidates) {
		try {
			const resolved = require.resolve("playwright-core", { paths: [base] });
			const mod = await import(`file://${resolved}`);
			return (mod.default ?? mod).chromium;
		} catch {}
	}

	try {
		const mod = await import("playwright-core");
		return (mod.default ?? mod).chromium;
	} catch {}

	console.error(`${INSTALL_HINT}\n\nLooked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`);
	process.exit(1);
}

/** Attaches to the Chrome started by browser.mjs and returns its first page. */
export async function connect() {
	const chromium = await getChromium();
	let browser;
	try {
		browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
	} catch (err) {
		console.error(
			`cannot attach to Chrome on port ${CDP_PORT} — run \`node browser.mjs start\` first.\n(${err.message})`,
		);
		process.exit(1);
	}

	const ctx = browser.contexts()[0];
	const page = ctx.pages()[0] ?? (await ctx.newPage());
	return { browser, page };
}

/**
 * The Visual Editor nests two frames, BOTH named "editor-iframe":
 *
 *   top                 the CloudCannon SPA
 *   └── editor-iframe   /app/assets/e2e/omnipage/editor.html   (the VE host)
 *       └── editor-iframe   about:blank                        (the site itself)
 *
 * The site's DOM lives in the innermost one, and its URL is about:blank because
 * the host injects the fetched page into it. Selecting by frame NAME is
 * therefore ambiguous — always take the last match, never the first.
 */
export function siteFrame(page) {
	const frames = page.frames().filter((f) => f.name() === "editor-iframe");
	if (!frames.length) return null;
	return frames.at(-1);
}

/** The VE host frame (editor.html) — where the inject handshake happens. */
export function hostFrame(page) {
	return page.frames().find((f) => f.url().includes("/omnipage/editor.html")) ?? null;
}

/**
 * Waits until the site frame exists, has rendered content, and its set of
 * editable regions has stopped changing. The SPA boots, fetches, and injects,
 * so there is a long window where the frame exists but is empty — checking for
 * the frame alone is not enough.
 *
 * Returns the frame. Pass an object to `out` to also receive the settled region
 * count and whether it actually settled, which is what ve-open reports.
 */
export async function waitForSiteFrame(page, { timeoutMs = 45000, out } = {}) {
	const deadline = Date.now() + timeoutMs;
	// Content arrives before the editor binds it. Between those two moments the
	// frame looks ready but has no editable regions, and the ones that do exist
	// are addressed differently (unindexed, so repeats collapse onto one path
	// and get :2/:3 suffixes) — so an address read here can fail to resolve a
	// moment later. Wait for the binding to settle, not just for content.
	let contentAt = null;
	while (Date.now() < deadline) {
		const frame = siteFrame(page);
		if (frame) {
			try {
				const state = await frame.evaluate(() => ({
					hasContent: !!document.body && document.body.children.length > 0,
					editable: document.querySelectorAll("[data-editable]").length,
				}));
				if (state.hasContent) {
					if (state.editable > 0) return await settleRegions(frame, deadline, out);
					// A page with genuinely no editable regions must not hang, so
					// give binding a grace period and then accept the frame.
					contentAt ??= Date.now();
					if (Date.now() - contentAt > BINDING_GRACE_MS) {
						if (out) Object.assign(out, { count: 0, settled: true });
						return frame;
					}
				}
			} catch {
				// Frame detached mid-navigation; retry.
			}
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(
		"timed out waiting for the site frame — is a page open in the Visual Editor? (run ve-open.mjs)",
	);
}

/**
 * Polls the region count until it holds still for SETTLE_STABLE_MS. Hydration
 * both adds and removes regions, so this waits for *any* change to stop rather
 * than for the count to stop rising.
 *
 * Gives up after SETTLE_MAX_MS and reports it rather than waiting forever: a
 * page that mutates its own DOM on a timer would otherwise never be ready.
 */
async function settleRegions(frame, deadline, out) {
	// Every script resolves the site frame, so paying the full window on each
	// one would tax a whole session for a page that settled long ago. The mark
	// lives on the frame's window, which a navigation clears — so ve-open always
	// pays it, and the scripts that follow only re-settle if the page moved.
	try {
		const mark = await frame.evaluate(() => {
			const n = document.querySelectorAll("[data-editable]").length;
			return { count: n, marked: window.__ccSettledCount === n };
		});
		if (mark.marked) {
			if (out) Object.assign(out, { count: mark.count, settled: true });
			return frame;
		}
	} catch {}

	const start = Date.now();
	let last = null;
	let lastChangeAt = start;

	const done = async (count, settled) => {
		if (settled) {
			await frame
				.evaluate((n) => {
					window.__ccSettledCount = n;
				}, count)
				.catch(() => {});
		}
		if (out) Object.assign(out, { count, settled });
		return frame;
	};

	while (Date.now() < deadline) {
		let count;
		try {
			count = await frame.evaluate(() => document.querySelectorAll("[data-editable]").length);
		} catch {
			// Detached mid-hydration — the frame reference is stale, so let the
			// caller re-resolve rather than reporting a count from nowhere.
			break;
		}

		const now = Date.now();
		if (count !== last) {
			last = count;
			lastChangeAt = now;
		} else if (now - lastChangeAt >= SETTLE_STABLE_MS) {
			return await done(count, true);
		}

		if (now - start >= SETTLE_MAX_MS) return await done(count, false);
		await new Promise((r) => setTimeout(r, SETTLE_SAMPLE_MS));
	}

	if (out) Object.assign(out, { count: last ?? 0, settled: false });
	return frame;
}

/** Resolves the frame named by --frame: "site" (default) or "app". */
export async function resolveFrame(page, which = "site") {
	if (which === "app") return page.mainFrame();
	if (which === "host") {
		const f = hostFrame(page);
		if (!f) throw new Error("editor host frame not found");
		return f;
	}
	return waitForSiteFrame(page);
}
