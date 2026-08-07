#!/usr/bin/env node

/**
 * Audits every editable region on the open page for the faults that make a
 * region look wired but behave badly in the editor.
 *
 * This is the check for migration work and for maintaining components: most of
 * it is static analysis of the rendered DOM, so it is fast and deterministic.
 * The one interactive check (does clicking actually open an editor) is opt-in.
 *
 * Usage:
 *   node check-editable-regions.mjs
 *   node check-editable-regions.mjs --click content_blocks.0.heading.heading_text
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { collectRegions, locateRegion } from "./lib/regions.mjs";

const USAGE = `
check-editable-regions.mjs — audit the regions on the open page

  node check-editable-regions.mjs [--click <address>] [--json]

Flags:
  --click   Also click this region and confirm an editor opens
  --json    Emit the findings as JSON

Checks (all static unless noted):
  - every region resolves to a data path, or is a source region with
    data-path + data-key
  - array wrappers declare data-id-key, so item keys are stable identities
    rather than positions
  - array items carry data-id, i.e. the identity field is actually seeded
  - image regions bind something (data-prop or data-prop-src)
  - no two regions share an address
  - no region is zero-sized or hidden, which makes it unclickable
  - text regions that hold markdown declare data-type

Exits non-zero if any error-level finding is present.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();
const frame = await resolveFrame(page, "site");

/**
 * CloudCannon wires regions asynchronously, so a check run straight after
 * ve-open sees text regions that are not contenteditable *yet* and reports
 * them as broken. Re-collect until the number of wired regions stops rising.
 */
async function collectSettled({ tries = 4, gapMs = 1500 } = {}) {
	let previous = -1;
	let regions = [];
	for (let i = 0; i < tries; i++) {
		regions = await frame.evaluate(collectRegions);
		const live = regions.filter((r) => r.kind === "text" && r.live).length;
		const texts = regions.filter((r) => r.kind === "text").length;
		if (live === texts || live === previous) break;
		previous = live;
		await page.waitForTimeout(gapMs);
	}
	return regions;
}

const regions = await collectSettled();

const findings = [];
const add = (level, address, message) => findings.push({ level, address, message });

const editable = regions.filter((r) => r.source === "editable-regions");

for (const r of editable) {
	// --- Binding ---
	if (r.kind === "source") {
		// Source regions edit a whole raw file, so they use data-path/data-key
		// instead of a frontmatter path.
		if (!r.filePath || !r.fileKey) {
			add("error", r.address, `source region missing ${r.filePath ? "data-key" : "data-path"}`);
		}
	} else if (!r.path.startsWith("#")) {
		// A composed path exists — bound.
	} else if (!r.props) {
		// Any kind may bind through data-prop-* rather than data-prop: a
		// component wrapper commonly uses data-prop-<slot>. Only flag a region
		// that binds through neither.
		add("error", r.address, `${r.kind} region binds nothing (no data-prop or data-prop-*)`);
	}

	// --- Array identity ---
	// Without data-id-key, CloudCannon falls back to array position. Keys then
	// shift whenever an editor reorders items, which silently reassigns content.
	if (r.kind === "array" && !r.idKey) {
		add("warn", r.address, "array wrapper has no data-id-key — item keys will be positional");
	}
	if (r.kind === "array-item" && !r.id) {
		add("warn", r.address, "array item has no data-id — the identity field is not seeded");
	}

	// --- Reachability ---
	// An empty region and an invisible one look the same from the outside but
	// have different fixes, so report them separately.
	if (!r.visible && !r.text) {
		add("warn", r.address, `${r.kind} region renders nothing — there is no content to click`);
	} else if (!r.visible) {
		add("warn", r.address, `${r.kind} region has content but no box — it cannot be clicked`);
	}

	// --- Did the editor actually wire it up? ---
	// The point of the whole audit: a region can be marked up correctly and
	// still not be picked up. CloudCannon sets contenteditable on text regions
	// when it wires them, so a text region without it is inert.
	if (r.kind === "text" && !r.live && r.visible) {
		add("error", r.address, "text region is not contenteditable — CloudCannon did not wire it up");
	}

	// --- Markdown regions ---
	// A markdown region without data-type is perpetually stale and uneditable.
	if (r.kind === "text" && /markdown|content|body/i.test(r.path ?? "") && !r.dataType) {
		add("warn", r.address, "markdown-looking text region has no data-type (expect block or text)");
	}
}

// --- Ambiguity ---
const seen = new Map();
for (const r of regions) {
	if (seen.has(r.address)) add("error", r.address, "two regions share this address");
	seen.set(r.address, true);
}

// --- Interactive check ---
if (typeof flags.click === "string") {
	const { match, locator } = await locateRegion(frame, flags.click);
	if (!match) {
		add("error", flags.click, "no region at this address to click");
	} else {
		await locator.scrollIntoViewIfNeeded().catch(() => {});
		await locator.click({ timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(1200);

		// Counting contenteditable elements does not work — CloudCannon sets
		// them all up front, so the total never changes on click. Focus landing
		// inside the region is the signal that it took the click.
		const focused = await frame.evaluate((address) => {
			const el = document.querySelector(`[data-cc-addr="${address.replace(/"/g, '\\"')}"]`);
			const active = document.activeElement;
			return Boolean(el && active && (el === active || el.contains(active)));
		}, match.address);

		if (focused) console.log(`click: focus landed inside ${match.address}\n`);
		else add("error", match.address, "clicking the region did not focus an editor");
	}
}

// --- Report ---
const errors = findings.filter((f) => f.level === "error");
const warnings = findings.filter((f) => f.level === "warn");

if (flags.json) {
	console.log(JSON.stringify({ regionCount: regions.length, findings }, null, 1));
} else {
	const byKind = {};
	for (const r of regions) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
	console.log(
		`${regions.length} region(s): ${Object.entries(byKind)
			.map(([k, n]) => `${n} ${k}`)
			.join(", ")}\n`,
	);

	for (const f of [...errors, ...warnings]) {
		console.log(`${f.level === "error" ? "ERROR" : "warn "}  ${f.address}`);
		console.log(`       ${f.message}`);
	}

	console.log(
		findings.length
			? `\n${errors.length} error(s), ${warnings.length} warning(s)`
			: "\nno issues found",
	);
}

await browser.close();
process.exit(errors.length ? 1 : 0);
