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

	await locator.scrollIntoViewIfNeeded().catch(() => {});
	await locator.screenshot({ path: out });
	await finish(`captured ${match.address} (${match.kind}) -> ${out}`);
}

if (typeof flags.selector === "string") {
	const locator = frame.locator(flags.selector).first();
	if (!(await locator.count())) {
		await browser.close();
		fail(`selector matched nothing: ${flags.selector}`);
	}
	await locator.screenshot({ path: out });
	await finish(`captured ${flags.selector} -> ${out}`);
}

await page.screenshot({ path: out, fullPage: Boolean(flags.full) });
await finish(`captured ${flags.frame ?? "site"} frame -> ${out}`);
