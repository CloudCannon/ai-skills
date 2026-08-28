#!/usr/bin/env node

/**
 * Proves an edit reached disk. The editor showing new text only proves the DOM
 * changed.
 *
 * --until polls the file itself; without it, this streams the SSE event feed.
 * The two are not interchangeable: the dev server emits no event for writes it
 * makes itself, so an editor save never appears on the stream.
 *
 * Usage:
 *   node watch-writes.mjs --until src/pages/index.md
 *   node watch-writes.mjs --timeout 20
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { fileInfo, watchEvents } from "./lib/devserver.mjs";

const USAGE = `
watch-writes.mjs — prove the dev server wrote a file

  node watch-writes.mjs --until <source-relative path> [--timeout <seconds>]
  node watch-writes.mjs [--timeout <seconds>]                 (event stream)

Flags:
  --until     Poll this file; exit 0 as soon as its bytes change (creation and
              deletion count), exit 1 if the timeout is reached first
  --timeout   Seconds to watch (default 15)
  --interval  Seconds between polls (default 0.25)
  --output    Stream mode only: also report output-change events (noisy)
  --port      Dev server port (default 10101)

Start this before making the edit — the baseline is taken at startup.

Without --until this streams SSE events: file-create, file-edit, file-delete,
output-change (200ms debounced). That stream carries external writes only —
the dev server suppresses events for its own, so Visual Editor saves are
invisible to it. Only --until catches those.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const timeoutMs = Number(flags.timeout ?? 15) * 1000;
const until = typeof flags.until === "string" ? flags.until : null;
const seconds = timeoutMs / 1000;

if (until) {
	await pollFile(until);
} else {
	await streamEvents();
}

/**
 * Reads the file back rather than trusting the event stream, which never
 * reports the dev server's own writes.
 */
async function pollFile(path) {
	const intervalMs = Number(flags.interval ?? 0.25) * 1000;
	const before = await snapshot(path);

	console.log(
		before
			? `watching ${path} for ${seconds}s (${before.info.file_size} bytes now)...`
			: `watching ${path} for ${seconds}s (no such file yet)...`,
	);

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, intervalMs));

		const now = await snapshot(path);
		if (now?.key === before?.key) continue;

		if (now) {
			console.log(`wrote          ${path} (${before?.info.file_size ?? 0} -> ${now.info.file_size} bytes)`);
		} else {
			console.log(`deleted        ${path}`);
		}
		process.exit(0);
	}

	console.log(`\nNO WRITE to "${path}" within ${seconds}s`);
	process.exit(1);
}

/** null when the file does not exist; `key` changes whenever the bytes do. */
async function snapshot(path) {
	let info;
	try {
		info = await fileInfo(path, flags);
	} catch (err) {
		fail(err.message);
	}
	if (!info) return null;
	return { info, key: `${info.last_modified}\u0000${info.file_size}\u0000${info.content}` };
}

async function streamEvents() {
	console.log(`streaming events for ${seconds}s...`);

	await watchEvents({
		timeoutMs,
		flags,
		onEvent({ event, data }) {
			if (event === "output-change" && !flags.output) return;

			const paths = event === "output-change" ? (data?.paths ?? []) : [data?.path];
			for (const p of paths) console.log(`${event.padEnd(14)} ${p}`);
		},
	});
}
