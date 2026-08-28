#!/usr/bin/env node

/**
 * Screenshots the editor, or one region of it, to a PNG the agent can read.
 *
 * Usage:
 *   node ve-screenshot.mjs --out shot.png
 *   node ve-screenshot.mjs --path content_blocks.0#array-item --out hero.png
 *   node ve-screenshot.mjs --frame app --out chrome.png
 */

import { resolve } from "node:path";
import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { locateRegion, suggest } from "./lib/regions.mjs";

const USAGE = `
ve-screenshot.mjs — capture the editor or a single region

  node ve-screenshot.mjs [--path <address>] [--selector <css>] [--out <file>]

Flags:
  --path       Region address from ve-components.mjs. Bookshop ranges have no
               host element, so their capture is clipped to the union of the
               nodes between the markers.
  --selector   Plain CSS selector instead of an address.
  --frame      site (default) | app | host
  --out        Output path (default ./ve-shot.png)
  --full       Full scrollable page rather than the viewport
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const out = resolve(String(flags.out ?? "ve-shot.png"));
const { browser, page } = await connect();
const frame = await resolveFrame(page, flags.frame ?? "site");

// The preview lives in an iframe, and Playwright's capture-beyond-viewport only
// applies to the top-level page — so anything inside the frame that sits below
// the frame's own viewport is never painted, and an element screenshot of it
// comes back part blank with no error. Growing the top-level viewport grows the
// preview pane with it, which is the only way to get the whole thing rendered.
const MAX_VIEWPORT_PX = 8000;

/**
 * Runs `capture` with the browser viewport temporarily grown so a box of
 * `needW` x `needH` CSS pixels fits inside the site frame. Restores the
 * viewport afterwards, including when the capture throws.
 *
 * `capture` is re-invoked after the resize rather than closing over anything
 * measured before it: growing the viewport reflows the page, so the element and
 * its box have to be resolved again.
 */
async function withFittedViewport(needW, needH, capture) {
	const which = flags.frame ?? "site";
	if (which === "app") return { result: await capture(frame), grewTo: null, short: null };

	const inner = await frame.evaluate(() => ({ w: innerWidth, h: innerHeight }));
	if (needW <= inner.w && needH <= inner.h) {
		return { result: await capture(frame), grewTo: null, short: null };
	}

	const cdp = await page.context().newCDPSession(page);
	const { cssLayoutViewport: vp } = await cdp.send("Page.getLayoutMetrics");
	const pageW = Math.round(vp.clientWidth);
	const pageH = Math.round(vp.clientHeight);
	// Whatever the editor chrome takes up around the preview has to be added on
	// top of the region's own size, so measure it rather than assuming.
	const chromeW = pageW - inner.w;
	const chromeH = pageH - inner.h;

	const wantW = Math.min(MAX_VIEWPORT_PX, Math.max(pageW, Math.ceil(needW) + chromeW + 40));
	const wantH = Math.min(MAX_VIEWPORT_PX, Math.max(pageH, Math.ceil(needH) + chromeH + 40));

	try {
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: wantW,
			height: wantH,
			deviceScaleFactor: 0,
			mobile: false,
		});
		await page.waitForTimeout(1200);

		const grown = await resolveFrame(page, which);
		const after = await grown.evaluate(() => ({ w: innerWidth, h: innerHeight }));
		const short = needW > after.w || needH > after.h ? after : null;
		return { result: await capture(grown), grewTo: `${wantW}x${wantH}`, short };
	} finally {
		await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
	}
}

/** Reports how the capture was obtained, so a truncated one is never silent. */
function fitNote({ grewTo, short }, needW, needH) {
	if (short) {
		return `\nwarning: the target is ${Math.ceil(needW)}x${Math.ceil(needH)} but the preview only reached ${short.w}x${short.h} — the image is truncated.`;
	}
	return grewTo ? ` (viewport grown to ${grewTo} to fit)` : "";
}

async function finish(msg) {
	console.log(msg);
	await browser.close();
	process.exit(0);
}

if (typeof flags.path === "string") {
	const { match, locator, regions } = await locateRegion(frame, flags.path);
	if (!match) {
		await browser.close();
		fail(`no region at "${flags.path}". Available:\n${suggest(regions, flags.path)}`);
	}

	if (match.source === "bookshop") {
		// No single element wraps the instance — clip the page shot to its box.
		const [x, y, width, height] = match.box;
		await page.screenshot({ path: out, clip: { x, y, width, height } });
		await finish(`captured ${match.address} (bookshop range, clipped) -> ${out}`);
	}

	const [, , needW, needH] = match.box;
	const fit = await withFittedViewport(needW, needH, async (f) => {
		const { locator: l } = await locateRegion(f, flags.path);
		const target = l ?? locator;
		await target.scrollIntoViewIfNeeded().catch(() => {});
		await target.screenshot({ path: out });
	});
	await finish(
		`captured ${match.address} (${match.kind}) -> ${out}${fitNote(fit, needW, needH)}`,
	);
}

if (typeof flags.selector === "string") {
	const locator = frame.locator(flags.selector).first();
	if (!(await locator.count())) {
		await browser.close();
		fail(`selector matched nothing: ${flags.selector}`);
	}
	const box = (await locator.boundingBox()) ?? { width: 0, height: 0 };
	const fit = await withFittedViewport(box.width, box.height, async (f) => {
		const target = f.locator(flags.selector).first();
		await target.scrollIntoViewIfNeeded().catch(() => {});
		await target.screenshot({ path: out });
	});
	await finish(`captured ${flags.selector} -> ${out}${fitNote(fit, box.width, box.height)}`);
}

// Screenshot the frame itself, not the top-level page: for the site frame a
// page shot is mostly CloudCannon chrome, with the preview cropped to whatever
// the editor pane leaves visible.
const which = flags.frame ?? "site";
if (which === "app") {
	await page.screenshot({ path: out, fullPage: Boolean(flags.full) });
	await finish(`captured ${which} frame -> ${out}`);
} else if (flags.full) {
	// fullPage has no frame equivalent — shoot the frame's <body>, which grows
	// to the full scrollable content and is therefore almost always taller than
	// the frame's viewport, so it needs the same fitting a region does.
	const doc = await frame.evaluate(() => ({
		w: document.documentElement.scrollWidth,
		h: document.documentElement.scrollHeight,
	}));
	const fit = await withFittedViewport(doc.w, doc.h, async (f) => {
		await f.locator("body").screenshot({ path: out });
	});
	await finish(`captured ${which} frame (full) -> ${out}${fitNote(fit, doc.w, doc.h)}`);
} else {
	const el = await frame.frameElement();
	await el.screenshot({ path: out });
	await finish(`captured ${which} frame -> ${out}`);
}
