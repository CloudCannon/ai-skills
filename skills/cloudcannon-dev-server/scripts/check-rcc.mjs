#!/usr/bin/env node

/**
 * Runs the RCC checklist against the page open in the Visual Editor.
 *
 * This is a composition of the ve-* primitives, not a black box — read it and
 * copy the parts you need when checking something it does not cover.
 *
 * Usage:
 *   node check-rcc.mjs --locale fr
 *   node check-rcc.mjs --locale fr --expect fr,de
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";
import { collectRegions } from "./lib/regions.mjs";
import { fetchOutput } from "./lib/devserver.mjs";

const USAGE = `
check-rcc.mjs — verify the RCC locale layer in the Visual Editor

  node check-rcc.mjs [--locale fr] [--expect fr,de] [--port 10101]

Flags:
  --locale   Locale to switch into for the swap test (default: first available)
  --expect   Comma-separated locales the switcher must offer
  --port     Dev server port (default 10101)

Exits non-zero if any check fails. Open a page first with ve-open.mjs.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const results = [];
const check = (name, ok, detail = "") => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// --- 1. The locale manifest (no browser needed) ---
// A 404 here silently disables the switcher and looks exactly like a broken
// editor, so it is checked before anything else.
const manifest = await fetchOutput("/_rcc/locales.json", flags);
let declared = [];
if (manifest.status === 200) {
	try {
		declared = JSON.parse(manifest.body).locales ?? [];
	} catch {}
	check("locale manifest served", true, `/_rcc/locales.json → ${declared.join(", ")}`);
} else {
	check("locale manifest served", false, `/_rcc/locales.json → ${manifest.status}`);
}

const { browser, page } = await connect();
const frame = await resolveFrame(page, "site");

// --- 2. The client is active ---
const env = await frame.evaluate(() => ({
	inEditorMode: Boolean(window.inEditorMode),
	hasCloudCannon: Boolean(window.CloudCannon),
	switcher: Boolean(document.querySelector("#rcc-locale-switcher")),
	popoverText: document.querySelector("#rcc-locale-popover")?.textContent?.trim() ?? "",
	staleBadge: document.querySelector("#rcc-stale-badge")?.textContent?.trim() ?? "",
	roseyCount: document.querySelectorAll("[data-rosey]").length,
}));

check("editor mode active", env.inEditorMode, "window.inEditorMode");
check("CloudCannon API present", env.hasCloudCannon);
check("locale switcher rendered", env.switcher, "#rcc-locale-switcher");
check("translatable elements found", env.roseyCount > 0, `${env.roseyCount} [data-rosey]`);

// --- 3. The switcher offers the expected locales ---
const expected = typeof flags.expect === "string" ? flags.expect.split(",") : declared;
for (const loc of expected) {
	const present = env.popoverText.toUpperCase().includes(loc.trim().toUpperCase());
	check(`switcher offers "${loc.trim()}"`, present, env.popoverText || "(popover empty)");
}

// --- 4. Switching a locale swaps the content ---
const target = String(flags.locale ?? declared[0] ?? "").trim();
if (target) {
	const before = await frame.evaluate(collectRegions);
	const beforeText = before.filter((r) => r.rosey).map((r) => r.text);

	await frame.evaluate(() => document.querySelector("#rcc-locale-switcher")?.click());
	await page.waitForTimeout(800);
	const clicked = await frame.evaluate((loc) => {
		const popover = document.querySelector("#rcc-locale-popover");
		if (!popover) return false;
		const hit = [...popover.querySelectorAll("*")].find(
			(el) => el.children.length === 0 && el.textContent.trim().toUpperCase() === loc.toUpperCase(),
		);
		if (!hit) return false;
		hit.click();
		return true;
	}, target);
	await page.waitForTimeout(2500);

	check(`clicked "${target}" in the switcher`, clicked);

	// data-rcc-locale-active is a BOOLEAN marker (toggleAttribute) — it never
	// carries the locale code. Assert presence; read the locale from the
	// swapped container instead.
	const state = await frame.evaluate(() => ({
		active: document.documentElement.hasAttribute("data-rcc-locale-active"),
		root: document.querySelectorAll("[data-rcc-translation-root]").length,
		dir: document.querySelector("[data-rcc-translation-root]")?.getAttribute("dir") ?? null,
	}));
	check("locale view active", state.active, "html[data-rcc-locale-active]");
	check("translation root present", state.root > 0, `${state.root} container(s)`);

	const after = await frame.evaluate(collectRegions);
	const afterText = after.filter((r) => r.rosey).map((r) => r.text);
	const changed = afterText.filter((t, i) => t !== beforeText[i]).length;
	check("content swapped", changed > 0, `${changed} translatable element(s) changed`);

	// RTL locales must flip direction on the swapped container.
	if (["ar", "he", "fa", "ur"].includes(target)) {
		check("RTL direction applied", state.dir === "rtl", `dir=${state.dir}`);
	}

	// --- 5. Switching back restores the original ---
	await frame.evaluate(() => document.querySelector("#rcc-locale-switcher")?.click());
	await page.waitForTimeout(800);
	await frame.evaluate(() => {
		const popover = document.querySelector("#rcc-locale-popover");
		const hit = [...(popover?.querySelectorAll("*") ?? [])].find(
			(el) => el.children.length === 0 && /^original$/i.test(el.textContent.trim()),
		);
		hit?.click();
	});
	await page.waitForTimeout(2000);

	const restored = await frame.evaluate(() => ({
		active: document.documentElement.hasAttribute("data-rcc-locale-active"),
		orphans: document.querySelectorAll("[data-rcc-translation-root]").length,
	}));
	check("restored to original", !restored.active, "html[data-rcc-locale-active] removed");
	check("no orphaned translation root", restored.orphans === 0, `${restored.orphans} left`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

await browser.close();
process.exit(failed.length ? 1 : 0);
