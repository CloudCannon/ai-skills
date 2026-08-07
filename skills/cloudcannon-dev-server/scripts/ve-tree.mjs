#!/usr/bin/env node

/**
 * Prints an outline of the page showing only CMS-relevant nodes.
 *
 * ve-components.mjs gives a flat index; this shows the nesting, which is what
 * you want when the question is "what is this thing inside of".
 *
 * Usage:
 *   node ve-tree.mjs
 *   node ve-tree.mjs --root content_blocks.0#array-item --depth 4
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { collectRegions, suggest } from "./lib/regions.mjs";

const USAGE = `
ve-tree.mjs — annotated outline of the CMS-relevant DOM

  node ve-tree.mjs [--root <address>] [--depth <n>] [--all]

Flags:
  --root    Only the subtree under this region address
  --depth   Maximum nesting to print (default 6)
  --all     Include plain elements, not just CMS-relevant ones
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();
const frame = await resolveFrame(page, "site");

const regions = await frame.evaluate(collectRegions);
if (typeof flags.root === "string" && !regions.some((r) => r.address === flags.root)) {
	await browser.close();
	fail(`no region at "${flags.root}". Available:\n${suggest(regions, flags.root)}`);
}

const tree = await frame.evaluate(
	({ root, depth, all }) => {
		const INTERESTING =
			"[data-cc-addr],[data-editable],[data-prop],[data-rosey],[data-cms-bind],[data-component]";

		const start = root
			? document.querySelector(`[data-cc-addr="${root.replace(/"/g, '\\"')}"]`)
			: document.body;
		if (!start) return [];

		const out = [];
		(function walk(el, level) {
			if (level > depth) return;
			for (const child of el.children) {
				const relevant = child.matches(INTERESTING);
				if (relevant || all) {
					const bits = [];
					const addr = child.getAttribute("data-cc-addr");
					const kind = child.getAttribute("data-editable");
					const comp = child.getAttribute("data-component");
					const rosey = child.getAttribute("data-rosey");
					if (kind) bits.push(kind);
					if (comp) bits.push(comp);
					if (rosey) bits.push(`rosey=${rosey}`);
					out.push({
						level,
						tag: child.tagName.toLowerCase(),
						addr,
						bits,
						text: (child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
					});
				}
				walk(child, relevant || all ? level + 1 : level);
			}
		})(start, 0);

		// Bookshop instances are comments, so they never appear as children —
		// list them separately rather than pretending the outline is complete.
		const comments = [];
		const w = document.createTreeWalker(start, NodeFilter.SHOW_COMMENT);
		let n;
		while ((n = w.nextNode())) {
			if (n.data.includes("bookshop-live")) comments.push(n.data.trim().slice(0, 100));
		}
		return { out, comments };
	},
	{
		root: typeof flags.root === "string" ? flags.root : null,
		depth: Number(flags.depth ?? 6),
		all: Boolean(flags.all),
	},
);

for (const row of tree.out) {
	const indent = "  ".repeat(row.level);
	const tags = row.bits.length ? `  [${row.bits.join(" ")}]` : "";
	const addr = row.addr ? `  → ${row.addr}` : "";
	console.log(`${indent}${row.tag}${tags}${addr}`);
	if (row.text && row.bits.length) console.log(`${indent}    "${row.text}"`);
}

if (tree.comments?.length) {
	console.log(`\nbookshop markers (comment nodes, not shown in the outline above):`);
	for (const c of tree.comments) console.log(`  <!--${c}-->`);
}

await browser.close();
