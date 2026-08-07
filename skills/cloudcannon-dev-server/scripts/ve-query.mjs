#!/usr/bin/env node

/**
 * Dumps the details of one region or CSS match, including its own address so a
 * region found by eye (in a screenshot or the tree) can be turned into an
 * address the other scripts accept.
 *
 * Usage:
 *   node ve-query.mjs --path content_blocks.0.heading.heading_text
 *   node ve-query.mjs --selector "h1" --all
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { collectRegions, locateRegion, suggest } from "./lib/regions.mjs";

const USAGE = `
ve-query.mjs — inspect a region or CSS match in detail

  node ve-query.mjs --path <address>
  node ve-query.mjs --selector <css> [--all]

Flags:
  --path       Region address from ve-components.mjs
  --selector   CSS selector, resolved in the site frame
  --all        With --selector, report every match instead of the first
  --frame      site (default) | app | host
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const { browser, page } = await connect();
const frame = await resolveFrame(page, flags.frame ?? "site");

if (typeof flags.path === "string") {
	const { match, regions } = await locateRegion(frame, flags.path);
	if (!match) {
		await browser.close();
		fail(`no region at "${flags.path}". Available:\n${suggest(regions, flags.path)}`);
	}
	// Ancestors make the nesting legible — which array, which item, which field.
	// This must walk the DOM, not compare path prefixes: an image region nested
	// in an array item composes to the SAME path as the item, so a prefix test
	// reports siblings as ancestors.
	const ancestors = await frame.evaluate((address) => {
		const el = document.querySelector(`[data-cc-addr="${address.replace(/"/g, '\\"')}"]`);
		const out = [];
		let cur = el?.parentElement;
		while (cur) {
			const a = cur.getAttribute?.("data-cc-addr");
			if (a) out.unshift(a);
			cur = cur.parentElement;
		}
		return out;
	}, match.address);

	console.log(JSON.stringify({ ...match, ancestors }, null, 1));
	await browser.close();
	process.exit(0);
}

if (typeof flags.selector !== "string") fail("one of --path or --selector is required");

// Stamp addresses first so each CSS match can report the region it belongs to.
await frame.evaluate(collectRegions);

const results = await frame.evaluate(
	({ selector, all }) => {
		const els = [...document.querySelectorAll(selector)];
		const list = all ? els : els.slice(0, 1);
		return list.map((el) => {
			const r = el.getBoundingClientRect();
			const data = {};
			for (const a of el.attributes) if (a.name.startsWith("data-")) data[a.name] = a.value;
			const owner = el.closest("[data-cc-addr]");
			return {
				tag: el.tagName.toLowerCase(),
				address: el.getAttribute("data-cc-addr") ?? undefined,
				withinRegion: owner?.getAttribute("data-cc-addr") ?? undefined,
				data,
				box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
				visible: r.width > 0 && r.height > 0,
				text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
			};
		});
	},
	{ selector: flags.selector, all: Boolean(flags.all) },
);

if (!results.length) {
	await browser.close();
	fail(`selector matched nothing: ${flags.selector}`);
}

console.log(JSON.stringify(results, null, 1));
await browser.close();
