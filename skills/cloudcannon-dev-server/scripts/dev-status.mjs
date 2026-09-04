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

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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

/**
 * The newest file anywhere under the output directory.
 *
 * A directory's own mtime is not its build time: it moves when an entry is
 * added or removed, not when a file inside is rewritten. Comparing against it
 * calls an in-place rebuild stale, and a stray dropped file fresh. Symlinked
 * directories are not followed.
 */
function newestOutputMtime(dir) {
	let newest = 0;
	let which = null;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return { newest, which };
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		const found = entry.isDirectory() ? newestOutputMtime(full) : fileMtime(full);
		if (found.newest > newest) ({ newest, which } = found);
	}
	return { newest, which };
}

function fileMtime(full) {
	try {
		return { newest: statSync(full).mtimeMs, which: full };
	} catch {
		return { newest: 0, which: null };
	}
}

const out = newestOutputMtime(join(root, info.outputDir));
const outMtime = out.newest;

// The paths from /__api/details are relative to the site, so a --root pointing
// anywhere else resolves none of them. That must not read as a clean bill of
// health: "I checked and it is current" and "I could not check at all" have to
// look different, or this reports a fresh build for a stale one — the exact
// mistake the script exists to prevent. Running from outside the site is now
// routine, since CC_PLAYWRIGHT_DIR removed the reason to cd into it.
if (!src.found || !outMtime) {
	const missing = !src.found
		? `any of its ${sources.length} source files`
		: `any file under its ${info.outputDir}/ directory`;
	console.log(`build:     UNKNOWN — could not find ${missing} under ${root}`);
	console.log("           staleness NOT checked. Pass --root <site directory>.");
} else if (src.newest > outMtime) {
	console.log(
		`\nSTALE: ${src.which} is ${ago(src.newest - outMtime)} newer than ${relative(root, out.which)}.` +
			"\n       Rebuild before trusting anything you see — cloudcannon dev does not build.",
	);
} else {
	console.log(`build:     ${relative(root, out.which)} is at least as new as every source`);
}

/** A gap of seconds is the common case — a rebuild that just ran. */
function ago(ms) {
	const mins = Math.round(ms / 60000);
	return mins < 1 ? `${Math.max(1, Math.round(ms / 1000))} second(s)` : `${mins} minute(s)`;
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
