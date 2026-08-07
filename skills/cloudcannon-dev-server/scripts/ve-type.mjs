#!/usr/bin/env node

/**
 * Edits a text region in place, the way a person would: click it to focus the
 * inline editor, replace the text, then blur so CloudCannon commits the value.
 *
 * Pair with watch-writes.mjs to prove the edit reached disk.
 *
 * Usage:
 *   node ve-type.mjs --path content_blocks.0.heading.heading_text --text "New heading"
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { locateRegion, suggest } from "./lib/regions.mjs";

const USAGE = `
ve-type.mjs — edit a text region inline

  node ve-type.mjs --path <address> --text "<new text>" [--append]

Flags:
  --path      Region address from ve-components.mjs (a text region)
  --text      Text to type
  --append    Append rather than replace (default replaces the contents)
  --wait      Milliseconds to settle after blurring (default 2500)

The edit is committed on blur. CloudCannon writes to disk shortly after, so
allow ~1s before reading the file back.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

if (typeof flags.path !== "string") fail("--path is required");
if (typeof flags.text !== "string") fail("--text is required");

const { browser, page } = await connect();
const frame = await resolveFrame(page, "site");

const { match, locator, regions } = await locateRegion(frame, flags.path);
if (!match) {
	await browser.close();
	fail(`no region at "${flags.path}". Available:\n${suggest(regions, flags.path)}`);
}
if (match.kind !== "text") {
	console.warn(
		`warning: ${match.address} is a "${match.kind}" region, not "text" — typing may not apply`,
	);
}

const before = match.text?.trim() ?? "";

await locator.scrollIntoViewIfNeeded().catch(() => {});
await locator.click({ timeout: 15000 });
await page.waitForTimeout(600);

if (!flags.append) {
	await page.keyboard.press("Meta+a").catch(() => {});
}

// insertText emits ONE input event for the whole string. Typing key-by-key
// re-renders the component on every keystroke, which detaches the element the
// locator is holding — the edit then dies after the first character.
await page.keyboard.insertText(String(flags.text));

// Blur commits the value; without it CloudCannon may never write.
await frame.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(Number(flags.wait ?? 2500));

// Re-resolve rather than reusing the locator: the edit re-renders the subtree,
// so both the element and its data-cc-addr stamp are gone by now.
const { match: afterMatch } = await locateRegion(frame, flags.path);
const after = afterMatch?.text?.trim() ?? "";

console.log(`region: ${match.address}`);
console.log(`before: ${JSON.stringify(before.slice(0, 80))}`);
console.log(`after:  ${JSON.stringify(after.slice(0, 80))}`);
console.log(after === before ? "NO CHANGE — the edit did not take" : "changed");

await browser.close();
