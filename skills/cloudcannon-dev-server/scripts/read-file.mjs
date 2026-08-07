#!/usr/bin/env node

/**
 * Reads a source file through the dev server's file API — the same view of
 * disk the CloudCannon app has.
 *
 * Usage:
 *   node read-file.mjs rosey/locales/fr.json
 *   node read-file.mjs rosey/locales/fr.json --key hero.title
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { fileInfo } from "./lib/devserver.mjs";

const USAGE = `
read-file.mjs — read a source file via the dev server

  node read-file.mjs <path> [--key <dotted.path>] [--meta]

Flags:
  --key    For JSON files, print just this dotted key
  --meta   Print size and mtime instead of contents
  --port   Dev server port (default 10101)
`;

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);

const path = positional[0];
if (!path) fail("a file path is required");

let info;
try {
	info = await fileInfo(path, flags);
} catch (err) {
	fail(err.message);
}
if (!info) fail(`not found: ${path}`);

if (flags.meta) {
	// The API names these file_size / last_modified, not size / mtime.
	console.log(
		JSON.stringify({ path, size: info.file_size, modified: info.last_modified }, null, 1),
	);
	process.exit(0);
}

if (typeof flags.key === "string") {
	let root;
	try {
		root = JSON.parse(info.content);
	} catch {
		fail(`${path} is not JSON, so --key cannot be used`);
	}

	// Try the whole flag as one literal key first. Rosey locale keys are
	// namespaced with a colon and may contain dots ("footer:blog"), so splitting
	// on "." would never find them.
	let value = root?.[flags.key];
	if (value === undefined) {
		value = root;
		for (const part of flags.key.split(".")) value = value?.[part];
	}

	if (value === undefined) fail(`no key "${flags.key}" in ${path}`);
	console.log(JSON.stringify(value, null, 1));
	process.exit(0);
}

console.log(info.content);
