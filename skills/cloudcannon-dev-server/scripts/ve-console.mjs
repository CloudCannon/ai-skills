#!/usr/bin/env node

/**
 * Watches console output, page errors and failed requests across every frame.
 *
 * Listeners only see what happens after they attach, so this reloads the editor
 * by default — otherwise the interesting messages have already been and gone.
 *
 * Usage:
 *   node ve-console.mjs --watch 20
 *   node ve-console.mjs --watch 20 --no-reload --grep RCC
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { connect, siteFrame } from "./lib/session.mjs";

const USAGE = `
ve-console.mjs — console messages, page errors and failed requests

  node ve-console.mjs [--watch <seconds>] [--grep <text>] [--no-reload]

Flags:
  --watch      Seconds to listen (default 15)
  --grep       Only show lines containing this string
  --no-reload  Listen to the page as-is instead of reloading it first
  --errors     Only show errors and failed requests

Named failure modes are called out explicitly — a 404 on /_rcc/locales.json
silently disables the RCC locale switcher and is indistinguishable from a
broken editor unless you look here.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const grep = typeof flags.grep === "string" ? flags.grep : null;
const seconds = Number(flags.watch ?? 15);
const lines = [];
// --grep and --errors decide what gets printed, but the failure-mode notes
// below have to reason about everything that happened — a `--grep RCC` run
// would otherwise hide the very 404 that explains the RCC failure.
const captured = [];

function record(line) {
	captured.push(line);
	if (grep && !line.includes(grep)) return;
	if (flags.errors && !/^\[(error|pageerror|failed|http \d)/.test(line)) return;
	lines.push(line);
	console.log(line);
}

const { browser, page } = await connect();

page.on("console", (m) => record(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => record(`[pageerror] ${e.message.split("\n")[0].slice(0, 300)}`));
page.on("requestfailed", (r) => record(`[failed] ${r.url()} — ${r.failure()?.errorText}`));
page.on("response", (r) => {
	if (r.status() >= 400) record(`[http ${r.status()}] ${r.url()}`);
});

if (!flags["no-reload"]) {
	console.log("reloading the editor to capture startup messages...\n");
	await page.reload({ waitUntil: "domcontentloaded" });
}

await page.waitForTimeout(seconds * 1000);

// --- Named failure modes ---
const notes = [];
if (captured.some((l) => l.includes("_rcc/locales.json") && l.includes("http 4"))) {
	notes.push(
		"/_rcc/locales.json 404 — the RCC locale switcher will not appear. The manifest\n" +
			"  is written by `rosey-cloudcannon-connector write-locales`; Rosey's default\n" +
			"  --exclusions also strips JSON, so the postbuild must override it.",
	);
}
if (captured.some((l) => l.includes("RCC: loaded"))) {
	const note = await diagnoseRcc();
	if (note) notes.push(note);
}

console.log(`\n${lines.length} line(s) captured over ${seconds}s`);
if (notes.length) {
	console.log("\nnotes:");
	for (const n of notes) console.log(`- ${n}`);
}

await browser.close();

/**
 * Whether RCC got past init().
 *
 * Not from the logs: "RCC: loaded" is a bare console.log, but the matching
 * "Ready — N locales" goes through RCC's verbose-gated logger and is therefore
 * absent on every page without [data-rcc-verbose]. Treating that absence as a
 * failure reports a broken switcher on healthy pages.
 *
 * The DOM answers it properly — injectSwitcher() is the second-to-last thing
 * init() does, so the switcher existing means every early return was passed.
 */
async function diagnoseRcc() {
	const frame = siteFrame(page);
	if (!frame) return null;

	let present;
	try {
		present = await frame.evaluate(() => !!document.querySelector("#rcc-locale-switcher"));
	} catch {
		return null; // frame went away; better to say nothing than to guess
	}
	if (present) return null;

	// warn() is not verbose-gated, so a warning here is RCC's own explanation.
	const warned = captured.find((l) => l.includes("RCC:") && l.startsWith("[warning]"));
	return (
		"RCC loaded but never rendered #rcc-locale-switcher, so init() returned early.\n" +
		(warned
			? `  It said: ${warned.replace(/^\[warning\]\s*/, "")}`
			: "  It warned about nothing, so this was one of the silent early returns:\n" +
				"  no [data-rcc] (or <main>) container, no locales discovered, or an empty\n" +
				"  locale list after data-rcc-exclude.") +
		"\n  Re-run with data-rcc-verbose on the page for RCC's own trace."
	);
}
