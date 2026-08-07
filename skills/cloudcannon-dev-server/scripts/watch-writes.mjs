#!/usr/bin/env node

/**
 * Streams the dev server's file events, so an edit made in the editor can be
 * proven to have reached disk.
 *
 * The editor showing new text only proves the DOM changed. This is what proves
 * CloudCannon wrote the file.
 *
 * Usage:
 *   node watch-writes.mjs --timeout 20
 *   node watch-writes.mjs --until rosey/locales/fr.json
 */

import { parseArgs, handleHelp } from "./lib/args.mjs";
import { watchEvents } from "./lib/devserver.mjs";

const USAGE = `
watch-writes.mjs — stream file events from the dev server

  node watch-writes.mjs [--timeout <seconds>] [--until <path fragment>]

Flags:
  --timeout   Seconds to watch (default 15)
  --until     Exit 0 as soon as an event mentions this path fragment;
              exit 1 if the timeout is reached first
  --output    Also report output-change events (noisy during a rebuild)
  --port      Dev server port (default 10101)

Events: file-create, file-edit, file-delete (source files),
        output-change (the built site). Both are debounced by 200ms.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const timeoutMs = Number(flags.timeout ?? 15) * 1000;
const until = typeof flags.until === "string" ? flags.until : null;
let matched = false;

console.log(`watching for ${timeoutMs / 1000}s${until ? ` until "${until}"` : ""}...`);

await watchEvents({
	timeoutMs,
	flags,
	onEvent({ event, data }) {
		if (event === "output-change" && !flags.output) return;

		const paths = event === "output-change" ? (data?.paths ?? []) : [data?.path];
		for (const p of paths) {
			console.log(`${event.padEnd(14)} ${p}`);
			if (until && String(p).includes(until)) {
				matched = true;
				return true;
			}
		}
	},
});

if (until) {
	console.log(matched ? `\nmatched "${until}"` : `\nNO WRITE matching "${until}"`);
	process.exit(matched ? 0 : 1);
}
