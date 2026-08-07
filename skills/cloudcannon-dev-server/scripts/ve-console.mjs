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
import { connect } from "./lib/session.mjs";

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

function record(line) {
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
if (lines.some((l) => l.includes("_rcc/locales.json") && l.includes("http 4"))) {
	notes.push(
		"/_rcc/locales.json 404 — the RCC locale switcher will not appear. The manifest\n" +
			"  is written by `rosey-cloudcannon-connector write-locales`; Rosey's default\n" +
			"  --exclusions also strips JSON, so the postbuild must override it.",
	);
}
if (lines.some((l) => l.includes("RCC: loaded")) && !lines.some((l) => l.includes("Ready —"))) {
	notes.push(
		'"RCC: loaded" without "Ready — N locales" means init() returned early.\n' +
			"  Re-run with data-rcc-verbose on the page to see which check failed.",
	);
}

console.log(`\n${lines.length} line(s) captured over ${seconds}s`);
if (notes.length) {
	console.log("\nnotes:");
	for (const n of notes) console.log(`- ${n}`);
}

await browser.close();
