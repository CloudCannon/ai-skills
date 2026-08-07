#!/usr/bin/env node

/**
 * Lists every addressable region on the page currently open in the Visual
 * Editor — the index an agent reads to find something without knowing the
 * markup.
 *
 * Usage:
 *   node ve-components.mjs
 *   node ve-components.mjs --kind array-item
 *   node ve-components.mjs --component hero --json
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { collectRegions } from "./lib/regions.mjs";

const USAGE = `
ve-components.mjs — index every addressable region on the open page

  node ve-components.mjs [--kind <k>] [--component <name>] [--rosey] [--json]

Flags:
  --kind        Only regions of this data-editable kind (text, image, array,
                array-item, component, source)
  --component   Only regions whose component name contains this string
  --rosey       Only regions carrying data-rosey (translatable)
  --visible     Only regions with a non-zero bounding box
  --json        Emit raw JSON instead of the aligned table

The "address" column is what every other ve-* script accepts as --path.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();
const frame = await resolveFrame(page, "site");
let regions = await frame.evaluate(collectRegions);

if (typeof flags.kind === "string") regions = regions.filter((r) => r.kind === flags.kind);
if (typeof flags.component === "string")
	regions = regions.filter((r) => (r.component ?? "").includes(flags.component));
if (flags.rosey) regions = regions.filter((r) => r.rosey);
if (flags.visible) regions = regions.filter((r) => r.visible);

if (flags.json) {
	console.log(JSON.stringify(regions, null, 1));
} else if (!regions.length) {
	console.log("no regions matched");
} else {
	const w = (key, min) =>
		Math.max(min, ...regions.map((r) => String(r[key] ?? "").length));
	const aw = w("address", 7);
	const kw = w("kind", 4);
	const cw = w("component", 9);

	console.log(
		`${"ADDRESS".padEnd(aw)}  ${"KIND".padEnd(kw)}  ${"COMPONENT".padEnd(cw)}  SOURCE`,
	);
	for (const r of regions) {
		const extra = [
			r.rosey ? `rosey=${r.rosey}` : "",
			r.id ? `id=${r.id.slice(0, 8)}` : "",
			r.dataType ? `type=${r.dataType}` : "",
			r.visible ? "" : "hidden",
		]
			.filter(Boolean)
			.join(" ");
		console.log(
			`${String(r.address).padEnd(aw)}  ${r.kind.padEnd(kw)}  ${String(r.component ?? "").padEnd(cw)}  ${r.source}${extra ? `  ${extra}` : ""}`,
		);
		if (r.text) console.log(`${" ".repeat(4)}"${r.text}"`);
	}
	console.log(`\n${regions.length} region(s)`);
}

await browser.close();
