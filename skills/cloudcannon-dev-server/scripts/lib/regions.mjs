// Region discovery and addressing.
//
// A "region" is one addressable thing on the page, normalised across the
// systems that can produce one (CloudCannon editable regions in either markup
// form, and Bookshop component instances). Everything downstream — query,
// click, type, screenshot — operates on regions, so no script needs to know
// which system produced it.

/**
 * Runs INSIDE the site frame. Must be entirely self-contained: Playwright
 * serialises this function, so it cannot reference anything in module scope.
 */
export function collectRegions() {
	const EDITABLE_TAGS = [
		"editable-text",
		"editable-image",
		"editable-component",
		"editable-array-item",
		"editable-source",
	];

	function kindOf(el) {
		const attr = el.getAttribute("data-editable");
		if (attr) return attr;
		const tag = el.tagName.toLowerCase();
		if (tag.startsWith("editable-")) return tag.slice("editable-".length);
		return null;
	}

	/**
	 * data-prop is RELATIVE to its enclosing region, not an absolute path:
	 * an array wrapper carries "content_blocks", its item carries "0", and a
	 * field inside carries "heading.heading_text". The absolute path only
	 * exists as the join of every data-prop from the root down.
	 */
	function absolutePath(el) {
		const parts = [];
		let cur = el;
		while (cur && cur !== document.body && cur.getAttribute) {
			const p = cur.getAttribute("data-prop");
			if (p) parts.unshift(p);
			cur = cur.parentElement;
		}
		return parts.join(".");
	}

	function propAttrs(el) {
		const out = {};
		for (const a of el.attributes || []) {
			if (a.name.startsWith("data-prop-")) out[a.name.slice("data-prop-".length)] = a.value;
		}
		return Object.keys(out).length ? out : undefined;
	}

	function describe(el) {
		let r = el.getBoundingClientRect();

		// `display: contents` elements have no box at all, by definition, while
		// their contents render and are perfectly clickable. Component wrappers
		// around grid items use it constantly, and it nests — so walking
		// children is not enough. A Range over the contents measures what is
		// actually painted, text nodes included.
		if (r.width === 0 && r.height === 0) {
			try {
				const range = document.createRange();
				range.selectNodeContents(el);
				const rangeBox = range.getBoundingClientRect();
				range.detach?.();
				if (rangeBox.width || rangeBox.height) r = rangeBox;
			} catch {}
		}

		return {
			tag: el.tagName.toLowerCase(),
			box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
			visible: r.width > 0 && r.height > 0,
			// CloudCannon marks text regions contenteditable when it wires them
			// up, not on click — so this is a static answer to "did the editor
			// actually take this region", no interaction required.
			live: el.isContentEditable === true,
			text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
		};
	}

	const regions = [];

	// --- CloudCannon editable regions (both markup forms) ---
	const hosts = new Set([
		...document.querySelectorAll("[data-editable]"),
		...document.querySelectorAll(EDITABLE_TAGS.join(",")),
	]);

	for (const el of hosts) {
		const kind = kindOf(el);
		if (!kind) continue;
		regions.push({
			__el: el,
			source: "editable-regions",
			kind,
			path: absolutePath(el),
			component: el.getAttribute("data-component") || undefined,
			// data-id is the value of the field named by the wrapper's
			// data-id-key (usually _uuid) — stable across reorders, unlike index.
			id: el.getAttribute("data-id") || undefined,
			idKey: el.getAttribute("data-id-key") || undefined,
			componentKey: el.getAttribute("data-component-key") || undefined,
			dataType: el.getAttribute("data-type") || undefined,
			rosey: el.getAttribute("data-rosey") || undefined,
			// Source regions address a whole raw file, so they carry
			// data-path/data-key instead of a frontmatter data-prop.
			filePath: el.getAttribute("data-path") || undefined,
			fileKey: el.getAttribute("data-key") || undefined,
			props: propAttrs(el),
			...describe(el),
		});
	}

	// --- Rosey-tagged elements that are not editable regions ---
	// RCC creates its own inline editors for [data-rosey], so a translatable
	// element need not be a CloudCannon region at all. Without these, the
	// elements RCC actually operates on would have no address.
	for (const el of document.querySelectorAll("[data-rosey]")) {
		if (hosts.has(el)) continue;
		regions.push({
			__el: el,
			source: "rosey",
			kind: "rosey",
			// Namespaced so a Rosey key can never collide with a data path.
			path: `rosey:${el.getAttribute("data-rosey")}`,
			rosey: el.getAttribute("data-rosey"),
			roseyNs: el.closest("[data-rosey-ns]")?.getAttribute("data-rosey-ns") || undefined,
			dataType: el.getAttribute("data-type") || undefined,
			...describe(el),
		});
	}

	// --- Bookshop component instances (comment-delimited, not elements) ---
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
	const open = [];
	let node;
	while ((node = walker.nextNode())) {
		const data = node.data.trim();
		if (!data.startsWith("bookshop-live")) continue;

		if (/^bookshop-live\s+end/.test(data)) {
			const start = open.pop();
			if (!start) continue;

			// Collect the sibling nodes between the markers — a Bookshop
			// instance has no host element, so its "box" is the union of them.
			const nodes = [];
			let cur = start.node.nextSibling;
			while (cur && cur !== node) {
				nodes.push(cur);
				cur = cur.nextSibling;
			}
			const boxes = nodes
				.filter((n) => n.nodeType === 1)
				.map((n) => n.getBoundingClientRect());
			const x = Math.min(...boxes.map((b) => b.x), Infinity);
			const y = Math.min(...boxes.map((b) => b.y), Infinity);
			const right = Math.max(...boxes.map((b) => b.x + b.width), -Infinity);
			const bottom = Math.max(...boxes.map((b) => b.y + b.height), -Infinity);

			regions.push({
				__el: nodes.find((n) => n.nodeType === 1),
				source: "bookshop",
				kind: "component",
				path: start.path,
				component: start.name,
				marker: start.raw.slice(0, 120),
				nodeCount: nodes.length,
				tag: "#range",
				box: boxes.length
					? [Math.round(x), Math.round(y), Math.round(right - x), Math.round(bottom - y)]
					: [0, 0, 0, 0],
				visible: boxes.length > 0 && right > x,
				text: nodes
					.map((n) => n.textContent || "")
					.join(" ")
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, 80),
			});
			continue;
		}

		// Opening marker, e.g. `bookshop-live name(components/hero) params(...)`
		const name = data.match(/name\(([^)]*)\)/)?.[1];
		const bind = data.match(/context\(([^)]*)\)/)?.[1] || data.match(/bind\(([^)]*)\)/)?.[1];
		open.push({ node, name, path: bind ?? "", raw: data });
	}

	// --- Canonical, unique addresses ---
	// A path alone is not unique: an image region nested directly inside an
	// array item has no data-prop of its own, so it composes to the SAME path
	// as the item. Qualify with kind, then with an occurrence index.
	// A region that binds only through data-prop-* (a component wrapper with
	// data-prop-sections, say) composes to an empty path. Give it a synthetic
	// address, or it is the one region on the page nothing can address.
	for (const r of regions) {
		if (!r.path) r.path = `#${r.component ?? r.kind}`;
	}

	const kindsByPath = {};
	for (const r of regions) (kindsByPath[r.path] ??= new Set()).add(r.kind);

	const seen = {};
	for (const r of regions) {
		// Qualify by kind only when the clash is between DIFFERENT kinds (an
		// image and its enclosing array item compose to the same path). Repeats
		// of one kind just get an occurrence number, so Rosey keys stay legible
		// as rosey:button_text:3 rather than rosey:button_text#rosey:3.
		const addr = kindsByPath[r.path].size > 1 ? `${r.path}#${r.kind}` : r.path;
		const n = (seen[addr] = (seen[addr] ?? 0) + 1);
		r.address = n > 1 ? `${addr}:${n}` : addr;
	}

	// Stamp the address onto each host element so Node can reach it with an
	// ordinary locator. evaluate() cannot hand DOM references back across the
	// boundary, so an attribute is the bridge. Bookshop ranges have no host
	// element; their first element node carries the stamp instead.
	for (const r of regions) {
		const host = r.__el;
		if (host && host.setAttribute) host.setAttribute("data-cc-addr", r.address);
		delete r.__el;
	}

	return regions;
}

// --- Node-side helpers ---

/**
 * Indexes the page, then returns a Playwright locator for one address.
 *
 * collectRegions stamps data-cc-addr as a side effect, which is what makes the
 * locator possible — evaluate() cannot pass DOM references back to Node.
 * Returns { match, locator, regions }; match is null when nothing resolved.
 */
export async function locateRegion(frame, address) {
	const regions = await frame.evaluate(collectRegions);
	const match =
		regions.find((r) => r.address === address) ?? regions.find((r) => r.path === address);
	if (!match) return { match: null, locator: null, regions };

	const escaped = match.address.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return { match, locator: frame.locator(`[data-cc-addr="${escaped}"]`), regions };
}

/** Formats "did you mean" candidates for an unresolved address. */
export function suggest(regions, address, limit = 8) {
	const needle = String(address).toLowerCase();
	const scored = regions
		.map((r) => r.address)
		.filter((a) => a.toLowerCase().includes(needle) || needle.includes(a.toLowerCase()))
		.slice(0, limit);
	const list = scored.length ? scored : regions.map((r) => r.address).slice(0, limit);
	return list.map((a) => `  ${a}`).join("\n");
}

/** Turns --path/--component/--editable/--selector flags into a filter. */
export function addressFilter(flags) {
	const filters = [];

	if (typeof flags.path === "string") {
		filters.push((r) => r.path === flags.path || r.address === flags.path);
	}
	if (typeof flags.component === "string") {
		const [name, nth] = flags.component.split("#");
		const matches = (r) => (r.component ?? "").endsWith(name);
		filters.push(nth ? occurrence(matches, Number(nth)) : matches);
	}
	if (typeof flags.editable === "string") {
		const [kind, nth] = flags.editable.split("#");
		const matches = (r) => r.kind === kind;
		filters.push(nth ? occurrence(matches, Number(nth)) : matches);
	}
	if (typeof flags.rosey === "string") {
		filters.push((r) => r.rosey === flags.rosey);
	}

	if (!filters.length) return null;
	return (regions) => regions.filter((r) => filters.every((f) => f(r, regions)));
}

/** Occurrence-qualified match: 1-based, counted over matching regions only. */
function occurrence(matches, n) {
	return (r, all) => {
		if (!matches(r)) return false;
		const list = all.filter(matches);
		return list.indexOf(r) === n - 1;
	};
}

export function describeAddressFlags(flags) {
	return (
		["path", "component", "editable", "rosey", "selector"]
			.filter((k) => typeof flags[k] === "string")
			.map((k) => `--${k} ${flags[k]}`)
			.join(" ") || "(no address given)"
	);
}
