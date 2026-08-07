#!/usr/bin/env node

/**
 * Finds dev servers left running on this machine and offers to stop them.
 *
 * Registered servers from earlier sessions are the ones that pile up: the
 * session that started them ended without cleaning up, and nothing else knows
 * they exist. Unregistered listeners are reported but never touched.
 *
 * Usage:
 *   node sweep.mjs
 *   node sweep.mjs --stop-registered
 *   node sweep.mjs --ports 3000,4321,5173,8080 --root /path/to/project
 */

import { parseArgs, handleHelp, relTime } from "./lib/args.mjs";
import { inspectPort, belongsTo, stopProcess } from "./lib/procs.mjs";
import { identify } from "./lib/probes.mjs";
import * as registry from "./lib/registry.mjs";

const USAGE = `
sweep.mjs — find dev servers left running, and clean up the ones you own

  node sweep.mjs [--ports 3000,4321] [--root <dir>] [--stop-registered] [--older-than <min>]

Flags:
  --ports             Ports to scan (default: the common dev-server ports)
  --root              Project root used to attribute processes (default: cwd)
  --stop-registered   Actually stop servers this machine's agent sessions started
  --older-than        With --stop-registered, only stop entries older than N minutes

Reports everything; stops nothing unless --stop-registered is passed, and even
then only touches entries in the registry.
`;

// Ports agents and dev servers habitually land on, including the +1/+2 fallbacks
// that appear precisely when something was already running.
const COMMON = [
	3000, 3001, 3002, 4000, 4321, 4322, 5000, 5173, 5174, 5175, 8000, 8080, 8081, 8888, 9000,
	1313, 10101, 11101,
	// Headless-browser debugging ports: agents leave these behind more often
	// than dev servers, and a stray browser holds far more memory.
	9222, 9223,
];

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const root = String(flags.root ?? process.cwd());
const ports =
	typeof flags.ports === "string" ? flags.ports.split(",").map((p) => Number(p.trim())) : COMMON;

const pruned = registry.prune();
const registered = registry.list();
const registeredPids = new Set(registered.map((e) => e.pid));

const found = [];
for (const port of ports) {
	for (const proc of inspectPort(port)) {
		const identity = await identify(port);
		const entry = registered.find((e) => e.pid === proc.pid || e.port === port);
		found.push({ ...proc, identity, entry, ours: belongsTo(proc, root) });
	}
}

if (!found.length) {
	console.log(`scanned ${ports.length} port(s) — nothing listening`);
	if (pruned) console.log(`pruned ${pruned} dead registry entr${pruned === 1 ? "y" : "ies"}`);
	process.exit(0);
}

console.log(`scanned ${ports.length} port(s), found ${found.length} listener(s):\n`);

const stoppable = [];
for (const f of found) {
	const age = f.ageSeconds != null ? `${Math.round(f.ageSeconds / 60)}m` : "?";
	let tag;
	if (f.entry) {
		tag = `AGENT-STARTED (${relTime(f.entry.startedAt)}) — stoppable`;
		stoppable.push(f);
	} else if (f.ours) {
		tag = "this project, started outside an agent session — leave alone";
	} else {
		tag = "another project — leave alone";
	}

	console.log(`${String(f.port).padEnd(6)} ${f.identity.name}`);
	console.log(`       pid ${f.pid}, ${age} old — ${tag}`);
	console.log(`       ${f.cwd ?? "cwd unknown"}`);
}

if (!stoppable.length) {
	console.log(`\nnothing to clean up: no listener was started by an agent session.`);
	console.log(`Unregistered servers are never stopped automatically — they are as`);
	console.log(`likely to be a terminal you have open as they are to be litter.`);
	process.exit(0);
}

if (!flags["stop-registered"]) {
	console.log(`\n${stoppable.length} server(s) can be cleaned up.`);
	console.log(`Re-run with --stop-registered to stop them.`);
	process.exit(0);
}

const minAge = Number(flags["older-than"] ?? 0) * 60;
console.log("");
for (const f of stoppable) {
	if (minAge && (f.ageSeconds ?? 0) < minAge) {
		console.log(`${f.port}  skipped (younger than ${flags["older-than"]}m)`);
		continue;
	}
	const result = await stopProcess(f.pid);
	registry.remove(f.pid);
	console.log(`${f.port}  ${result}`);
}
