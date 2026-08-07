#!/usr/bin/env node

/**
 * Writes a source file exactly as the CloudCannon app would, without driving
 * the UI. Useful for setting up a state to verify, or for testing that the
 * site rebuilds correctly on an app-initiated change.
 *
 * Usage:
 *   node write-file.mjs src/_data/site.json --from ./patched.json
 *   echo '{"a":1}' | node write-file.mjs src/_data/site.json --stdin
 */

import { readFileSync } from "node:fs";
import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { upload, fileInfo } from "./lib/devserver.mjs";

const USAGE = `
write-file.mjs — write a source file via the dev server

  node write-file.mjs <path> --content "<text>"
  node write-file.mjs <path> --from <local file>
  node write-file.mjs <path> --stdin

Flags:
  --content   Literal content to write
  --from      Copy the content from a local file
  --stdin     Read the content from stdin
  --port      Dev server port (default 10101)

Writes through /__api/upload, so the dev server treats it as an app-initiated
change and does NOT echo it back as a file-edit event.
`;

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);

const path = positional[0];
if (!path) fail("a file path is required");

let content;
if (typeof flags.content === "string") {
	content = flags.content;
} else if (typeof flags.from === "string") {
	content = readFileSync(flags.from, "utf-8");
} else if (flags.stdin) {
	content = readFileSync(0, "utf-8");
} else {
	fail("one of --content, --from or --stdin is required");
}

const before = await fileInfo(path, flags).catch(() => null);

try {
	await upload(path, content, flags);
} catch (err) {
	fail(err.message);
}

console.log(
	`${before ? "updated" : "created"} ${path} (${content.length} bytes)`,
);
