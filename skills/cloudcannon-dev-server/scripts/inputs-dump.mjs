#!/usr/bin/env node

/**
 * Dumps the inputs CloudCannon actually rendered for the open file.
 *
 * This answers the question `_inputs` config cannot: not "what did I write",
 * but "what did the editor build from it". Wrong type, missing label, an input
 * that silently did not appear — all of them look fine in the YAML.
 *
 * Usage:
 *   node inputs-dump.mjs
 *   node inputs-dump.mjs --grep title --json
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { connect } from "./lib/session.mjs";

const USAGE = `
inputs-dump.mjs — what inputs did CloudCannon render for the open file

  node inputs-dump.mjs [--grep <text>] [--json]

Flags:
  --grep   Only inputs whose label contains this string
  --into   Navigate into the array item whose card starts with this text,
           then dump its inputs. Nested inputs are not in the DOM until you do.
  --json   Emit JSON

Open a file first with ve-open.mjs. Works with --editor visual (sidebar) or
--editor content.

Inputs live in the CloudCannon app frame, not the site frame, so this reads the
app's own DOM — see driving-the-editor.md on selector stability.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();

// Nested inputs do not exist in the DOM until you navigate into their group —
// CloudCannon swaps child views rather than expanding inline. --into clicks the
// named array item first so its own inputs can be dumped.
if (typeof flags.into === "string") {
	const opened = await page.mainFrame().evaluate((name) => {
		const card = [...document.querySelectorAll(".c-card--clickable")].find((c) =>
			(c.innerText || "").trim().toLowerCase().startsWith(name.toLowerCase()),
		);
		if (!card) return false;
		card.click();
		return true;
	}, flags.into);

	if (!opened) {
		console.error(`no array item card starting with "${flags.into}" — run without --into to list them`);
		await browser.close();
		process.exit(1);
	}
	await page.waitForTimeout(1500);
	console.log(`opened "${flags.into}"\n`);
}

const inputs = await page.mainFrame().evaluate((scoped) => {
	// Each input is one c-data-editor-block; nesting mirrors the data shape.
	// After navigating into an item, CloudCannon adds a child view rather than
	// replacing the parent's blocks — so scope to the innermost view, otherwise
	// the parent's inputs are reported again alongside the child's.
	const views = [...document.querySelectorAll(".yaml-child-view-container")];
	const root = scoped && views.length ? views[views.length - 1] : document;
	const blocks = [...root.querySelectorAll("c-data-editor-block")];

	return blocks.map((block) => {
		const label = block.querySelector(".c-label")?.innerText.trim() ?? null;

		// label[for] points at the control's id — the only reliable pairing,
		// since the control is a sibling rather than a child.
		const id = block.querySelector(".c-label")?.getAttribute("for");
		const control = id ? document.getElementById(id) : null;

		let type = "group";
		if (control) {
			const tag = control.tagName.toLowerCase();
			// CloudCannon renders select inputs as a button that opens a
			// listbox, so the tag name alone reports them as "button".
			const isSelect =
				control.getAttribute("aria-haspopup") === "listbox" || control.closest(".c-select");
			if (isSelect) type = "select";
			else if (tag === "input") type = control.getAttribute("type") ?? "text";
			else if (tag === "textarea") type = "textarea";
			else if (tag === "select") type = "select";
			else type = tag;
		} else if (block.querySelector("[contenteditable='true']")) {
			type = "rich-text";
		}

		const depth = (() => {
			let d = 0;
			let p = block.parentElement;
			while (p) {
				if (p.tagName?.toLowerCase() === "c-data-editor-block") d++;
				p = p.parentElement;
			}
			return d;
		})();

		const value = control
			? (control.value ?? "").slice(0, 60)
			: (block.innerText || "").trim().split("\n")[1]?.slice(0, 60) ?? "";

		// Array items appear as cards titled with the structure they matched.
		// A card showing the wrong structure name is a misconfigured
		// structure match — visible here and almost nowhere else.
		const items = [...block.querySelectorAll(".c-card--clickable")].map(
			(c) => (c.innerText || "").trim().split("\n")[0].slice(0, 40),
		);
		if (items.length) type = "array";

		return {
			label,
			type,
			depth,
			items,
			disabled: Boolean(control?.disabled),
			readOnly: Boolean(control?.readOnly),
			required: Boolean(control?.required),
			value,
		};
	});
}, typeof flags.into === "string");

const filtered =
	typeof flags.grep === "string"
		? inputs.filter((i) => (i.label ?? "").toLowerCase().includes(flags.grep.toLowerCase()))
		: inputs;

if (flags.json) {
	console.log(JSON.stringify(filtered, null, 1));
} else if (!filtered.length) {
	console.log("no inputs found — is a file open, and is the sidebar showing?");
	console.log("(open one with ve-open.mjs, then re-run)");
} else {
	for (const i of filtered) {
		const indent = "  ".repeat(i.depth);
		const badges = [
			i.disabled ? "disabled" : "",
			i.readOnly ? "readonly" : "",
			i.required ? "required" : "",
		]
			.filter(Boolean)
			.join(" ");
		console.log(`${indent}${i.label ?? "(no label)"}  [${i.type}]${badges ? `  ${badges}` : ""}`);
		if (i.value) console.log(`${indent}    "${i.value}"`);
		for (const [n, item] of (i.items ?? []).entries()) {
			console.log(`${indent}    ${n}. ${item}`);
		}
	}
	console.log(`\n${filtered.length} input(s)`);
}

await browser.close();
