#!/usr/bin/env node

/**
 * Clicks a region, a CSS match, or a piece of text — in the site being edited
 * or in the CloudCannon chrome around it.
 *
 * Usage:
 *   node ve-click.mjs --path content_blocks.0.heading.heading_text
 *   node ve-click.mjs --text "Save" --frame app
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { locateRegion, suggest } from "./lib/regions.mjs";

const USAGE = `
ve-click.mjs — click inside the editor

  node ve-click.mjs --path <address>   [--frame site]
  node ve-click.mjs --selector <css>   [--frame site|app|host]
  node ve-click.mjs --text "<label>"   [--frame app]

Flags:
  --path       Region address from ve-components.mjs
  --selector   CSS selector
  --text       Visible text to click (exact match first, then substring)
  --frame      site (default) | app | host
  --wait       Milliseconds to settle after clicking (default 1500)
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();
const frame = await resolveFrame(page, flags.frame ?? "site");
const settle = Number(flags.wait ?? 1500);

let locator;
let label;

if (typeof flags.path === "string") {
	const { match, locator: l, regions } = await locateRegion(frame, flags.path);
	if (!match) {
		await browser.close();
		fail(`no region at "${flags.path}". Available:\n${suggest(regions, flags.path)}`);
	}
	locator = l;
	label = `${match.address} (${match.kind})`;
} else if (typeof flags.selector === "string") {
	locator = frame.locator(flags.selector).first();
	label = flags.selector;
} else if (typeof flags.text === "string") {
	locator = frame.getByText(flags.text, { exact: true }).first();
	if (!(await locator.count())) locator = frame.getByText(flags.text).first();
	label = `text "${flags.text}"`;
} else {
	await browser.close();
	fail("one of --path, --selector or --text is required");
}

if (!(await locator.count())) {
	await browser.close();
	fail(`nothing matched ${label}`);
}

await locator.scrollIntoViewIfNeeded().catch(() => {});
await locator.click({ timeout: 15000 });
await page.waitForTimeout(settle);

console.log(`clicked ${label}`);
await browser.close();
