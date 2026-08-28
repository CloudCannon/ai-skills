#!/usr/bin/env node

/**
 * Edits a text region in place, the way a person would: click it to focus the
 * inline editor, replace the text, then blur so CloudCannon commits the value.
 *
 * Pair with `watch-writes.mjs --until <path>` to prove the edit reached disk.
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

if (flags.append) {
	// The click above lands wherever the pointer hit — the centre of the
	// element's box, which is the MIDDLE of the text, not its end. Without
	// this the insert splices into the middle of the existing value and still
	// reports "changed", so a broken append reads as a successful one:
	//   append "[END]" to "You choose your editing experience."
	//   -> "You choose yo[END]ur editing experience."
	// Select all, then collapse the selection to its end.
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.press("ArrowRight");
} else {
	// ControlOrMeta, not Meta: Meta+a only selects all on macOS. On Linux it
	// does nothing, so the insert below lands at the caret and the new text is
	// spliced INTO the old rather than replacing it — and the check at the end
	// still reports "changed", so the corruption looks like success.
	await page.keyboard.press("ControlOrMeta+a");

	// Delete the selection before inserting, rather than letting the insert
	// replace it. Typing over a selection makes the browser carry that
	// selection's formatting onto the new text: replacing a heading that
	// contains <span class="highlight-text"> writes
	//   <font color="#5429ff">new text</font>
	// to disk, and CloudCannon then marks that font tag
	// contenteditable="false", so the region is also no longer editable.
	// Deleting first leaves an empty node with no inherited style.
	// Measured: this is the only thing that helps — execCommand("removeFormat")
	// before the insert leaves the font tag exactly as it was.
	await page.keyboard.press("Delete");
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
//
// Retry while it reads back empty. Writing the file makes the dev server push a
// live-sync update, and re-resolving inside that re-render finds the region
// present but not yet refilled — reporting an empty value for an edit that
// actually worked. A region the edit really did empty still reports empty, it
// just costs a few extra polls to say so.
let afterMatch = null;
let afterLocator = null;
let after = "";
for (let i = 0; i < 8; i++) {
	({ match: afterMatch, locator: afterLocator } = await locateRegion(frame, flags.path));
	after = afterMatch?.text?.trim() ?? "";
	if (after) break;
	await page.waitForTimeout(500);
}

console.log(`region: ${match.address}`);
console.log(`before: ${JSON.stringify(before.slice(0, 80))}`);
console.log(`after:  ${JSON.stringify(after.slice(0, 80))}`);
console.log(after === before ? "NO CHANGE — the edit did not take" : "changed");

// Comparing text alone cannot see markup the browser added around it, which is
// how the <font> injection above went unnoticed: textContent is identical
// either way. Only inline style carriers are flagged — a block region wrapping
// plain text in <p> is CloudCannon doing its job, not damage.
if (afterMatch && !flags.text.includes("<")) {
	const html = await afterLocator
		.first()
		.evaluate((el) => el.innerHTML)
		.catch(() => "");
	// A plain text region has no block structure to gain, so <div>/<br> in one
	// means the browser turned newlines into markup. Typing (or pasting) three
	// lines into a heading writes
	//   heading: Line one<div>Line two</div><div>Line three</div>
	// to the YAML — unescaped, unlike a "<" the user typed — and the built page
	// then shows those tags as literal text.
	//
	// Only when the typed string actually contained a newline, and only for
	// plain text regions — block regions legitimately wrap their content.
	//
	// ProseMirror's own separator/trailing-break nodes are editor scaffolding
	// and never reach disk, so they are filtered out. Do NOT filter
	// c-cloudcannon-locked-element the same way: the editor puts that class on
	// the div it makes for the line break, then strips the class and keeps the
	// div on save — it is the corruption, not chrome.
	const plainText = match.kind === "text" && !match.dataType;
	const brokeLines = plainText && /[\r\n]/.test(flags.text);
	const carriers = brokeLines ? "font|b|i|u|strike|div|br" : "font|b|i|u|strike";
	const injected = (
		html.match(new RegExp(`<(${carriers})\\b[^>]*>|<[a-z]+[^>]*\\sstyle="[^"]+"`, "gi")) ?? []
	).filter((tag) => !/ProseMirror/.test(tag));
	if (injected.length) {
		console.log(
			`\nwarning: the region gained formatting markup that "${flags.text}" does not contain:\n  ${[...new Set(injected)].join("\n  ")}\nThe value on disk is not the plain text above.`,
		);
	}
}

await browser.close();
