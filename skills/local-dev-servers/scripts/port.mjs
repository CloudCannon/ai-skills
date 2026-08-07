#!/usr/bin/env node

/**
 * Reports what is holding a port, and whether it belongs to this project.
 *
 * Run this before starting anything. "Port 3000 is busy" is not actionable;
 * "port 3000 is your own Astro server from 40 minutes ago, started in this
 * directory" is.
 *
 * Usage:
 *   node port.mjs 3000
 *   node port.mjs 3000 4321 10101 --root /path/to/project
 */

import { parseArgs, handleHelp, fail, relTime } from "./lib/args.mjs";
import { inspectPort, belongsTo } from "./lib/procs.mjs";
import { identify } from "./lib/probes.mjs";
import { find } from "./lib/registry.mjs";

const USAGE = `
port.mjs — what is on a port, and is it yours

  node port.mjs <port>...  [--root <dir>] [--json]

Flags:
  --root   Project root used to attribute processes (default: cwd)
  --json   Emit JSON

Exit codes: 0 if every port is free, 1 if any is occupied.
`;

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);

if (!positional.length) fail("at least one port is required");

const root = String(flags.root ?? process.cwd());
const report = [];

for (const raw of positional) {
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`not a port: ${raw}`);

	const holders = inspectPort(port);
	if (!holders.length) {
		report.push({ port, free: true });
		continue;
	}

	for (const proc of holders) {
		const identity = await identify(port);
		// Match on port as well as pid: watchers restart their child, so the
		// listener pid drifts away from whatever was recorded at start.
		const registered = find({ pid: proc.pid, port });
		report.push({
			port,
			free: false,
			pid: proc.pid,
			command: proc.command,
			cwd: proc.cwd,
			ageSeconds: proc.ageSeconds,
			serverType: identity.id,
			serverName: identity.name,
			serverDetail: identity.detail,
			ours: belongsTo(proc, root),
			registered: Boolean(registered),
			startedBy: registered ? `an agent session, ${relTime(registered.startedAt)}` : null,
		});
	}
}

if (flags.json) {
	console.log(JSON.stringify(report, null, 1));
} else {
	for (const r of report) {
		if (r.free) {
			console.log(`${r.port}  free`);
			continue;
		}
		const mins = r.ageSeconds != null ? `${Math.round(r.ageSeconds / 60)}m old` : "age unknown";
		console.log(`${r.port}  IN USE — ${r.serverName}${r.serverDetail ? ` (${r.serverDetail})` : ""}`);
		console.log(`      pid ${r.pid}, ${mins}`);
		console.log(`      cmd ${r.command}`);
		console.log(`      cwd ${r.cwd ?? "unknown"}`);
		if (r.registered) {
			console.log(`      started by ${r.startedBy} — safe to reclaim with serve.mjs --reclaim`);
		} else if (r.ours) {
			console.log(`      in this project, but NOT started by an agent session.`);
			console.log(`      Probably yours from a terminal. Ask before stopping it.`);
		} else {
			console.log(`      NOT this project. Do not stop it — pick another port or ask.`);
		}
	}
}

process.exit(report.some((r) => !r.free) ? 1 : 0);
