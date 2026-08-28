#!/usr/bin/env node

/**
 * Reports what the dev server is serving, and whether it is stale.
 *
 * Run this before any browser work. `cloudcannon dev` serves an output
 * directory but never builds it, so the most common way to waste a session is
 * to inspect a build from before the change under test.
 *
 * Usage:
 *   node dev-status.mjs
 *   node dev-status.mjs --check /en/ --check /fr/
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, handleHelp } from "./lib/args.mjs";
import { details, fetchOutput, baseUrl } from "./lib/devserver.mjs";

const USAGE = `
dev-status.mjs — what is the dev server serving, and is it current

  node dev-status.mjs [--check <url path>]... [--port 10101]

Flags:
  --check   URL path that must return 200 (repeatable)
  --root    Site root on disk for the staleness check (default: cwd)
  --port    Dev server port (default 10101)

The staleness check needs --root to be the site directory. Pointed anywhere
else it reports UNKNOWN rather than guessing — it never reports a fresh build
it did not actually verify.

Exits non-zero if the server is unreachable or any --check fails.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

let info;
try {
	info = await details(flags);
} catch (err) {
	console.error(err.message);
	process.exit(1);
}

console.log(`server:    ${baseUrl(flags)}`);
console.log(`site:      ${info.siteName}`);
console.log(`outputDir: ${info.outputDir}`);
console.log(`source:    ${info.sourceFiles.length} files`);

// --- Staleness: newest source file vs newest output file ---
const root = String(flags.root ?? process.cwd());
function newestMtime(files) {
	let newest = 0;
	let which = null;
	let found = 0;
	for (const f of files) {
		try {
			const m = statSync(join(root, f)).mtimeMs;
			found++;
			if (m > newest) {
				newest = m;
				which = f;
			}
		} catch {}
	}
	return { newest, which, found };
}

const ignorable = /^(node_modules|\.git|_untranslated_site)\//;
const sources = info.sourceFiles.filter(
	(f) => !ignorable.test(f) && !f.startsWith(`${info.outputDir}/`),
);
const src = newestMtime(sources);

let outMtime = 0;
try {
	outMtime = statSync(join(root, info.outputDir)).mtimeMs;
} catch {}

// The paths from /__api/details are relative to the site, so a --root pointing
// anywhere else resolves none of them. That must not read as a clean bill of
// health: "I checked and it is current" and "I could not check at all" have to
// look different, or this reports a fresh build for a stale one — the exact
// mistake the script exists to prevent. Running from outside the site is now
// routine, since CC_PLAYWRIGHT_DIR removed the reason to cd into it.
if (!src.found || !outMtime) {
	const missing = !src.found
		? `any of its ${sources.length} source files`
		: `its ${info.outputDir}/ directory`;
	console.log(`build:     UNKNOWN — could not find ${missing} under ${root}`);
	console.log("           staleness NOT checked. Pass --root <site directory>.");
} else if (src.newest > outMtime) {
	const mins = Math.round((src.newest - outMtime) / 60000);
	console.log(
		`\nSTALE: ${src.which} is ${mins} minute(s) newer than ${info.outputDir}/.` +
			"\n       Rebuild before trusting anything you see — cloudcannon dev does not build.",
	);
} else {
	console.log("build:     output is at least as new as the sources");
}

// --- Reachability checks ---
const checks = flags.check === undefined ? [] : [].concat(flags.check);
let failed = 0;
if (checks.length) console.log("");
for (const path of checks) {
	const { status, resolved } = await fetchOutput(String(path), flags);
	const ok = status >= 200 && status < 400;
	if (!ok) failed++;
	const via = resolved !== String(path) ? `  (via ${resolved})` : "";
	console.log(`${ok ? "ok  " : "FAIL"} ${status}  ${path}${ok ? via : ""}`);
}

process.exit(failed ? 1 : 0);
