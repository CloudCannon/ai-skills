// Browser session: resolve playwright-core, attach to the running Chrome over
// CDP, and locate the frames that matter.

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

export const CDP_PORT = process.env.CC_CDP_PORT ?? 9222;

const INSTALL_HINT = `playwright-core is not installed.

  npm install -g playwright-core

Only playwright-core is needed — these scripts attach to a Chrome you already
launched (see browser.mjs), so no bundled browsers are downloaded.`;

/**
 * playwright-core is CommonJS, so it must be default-imported; a named
 * `import { chromium }` throws SyntaxError under ESM.
 */
export async function getChromium() {
	const require = createRequire(import.meta.url);
	const candidates = [];

	try {
		candidates.push(execSync("npm root -g", { encoding: "utf-8" }).trim());
	} catch {}
	candidates.push(process.cwd());

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

	console.error(INSTALL_HINT);
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
 * Waits until the site frame exists and has rendered content. The SPA boots,
 * fetches, and injects, so there is a long window where the frame exists but is
 * empty — checking for the frame alone is not enough.
 */
export async function waitForSiteFrame(page, { timeoutMs = 45000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const frame = siteFrame(page);
		if (frame) {
			try {
				const ready = await frame.evaluate(
					() => document.body && document.body.children.length > 0,
				);
				if (ready) return frame;
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
