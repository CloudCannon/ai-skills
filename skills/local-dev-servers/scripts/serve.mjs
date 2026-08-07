#!/usr/bin/env node

/**
 * Starts a dev server on the port you asked for, or fails saying why — and
 * records it so it can be stopped again.
 *
 * The two failure modes this exists to prevent:
 *   1. Silently landing on a fallback port, so every later check verifies a
 *      different server than the one just started.
 *   2. Leaving the server running once the task is done.
 *
 * Usage:
 *   node serve.mjs start --port 4321 --cmd "npm run dev" --ready /
 *   node serve.mjs list
 *   node serve.mjs stop --all
 */

import { spawn } from "node:child_process";
import { openSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, handleHelp, fail, relTime } from "./lib/args.mjs";
import {
	inspectPort,
	belongsTo,
	stopProcess,
	descendantsOf,
	listeningPortsOf,
	listenersOn,
} from "./lib/procs.mjs";
import { identify } from "./lib/probes.mjs";
import * as registry from "./lib/registry.mjs";

const USAGE = `
serve.mjs — start a dev server on the port you meant, and be able to stop it

  node serve.mjs start --port <n> --cmd "<command>" [--cwd <dir>] [--ready <path>]
  node serve.mjs list
  node serve.mjs stop [--port <n> | --pid <n> | --all]

start flags:
  --port      Port the server MUST bind. Not a suggestion — see below.
  --cmd       Command to run
  --cwd       Working directory (default: cwd)
  --ready     HTTP path polled until it responds (default: just the port)
  --label     Name for the registry
  --timeout   Seconds to wait for readiness (default 60)
  --reclaim   Stop an agent-started server already on this port and take it
  --expect    Require the identity probe to report this server type

stop flags:
  --port / --pid   Stop one entry
  --all            Stop everything this machine's agent sessions started

If the port is taken, start refuses rather than picking another one, and tells
you what is on it. If the server binds a DIFFERENT port than requested, start
reports that as a failure and stops it — a fallback port silently invalidates
every check that follows.
`;

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);
const command = positional[0] ?? "list";

// --------------------------------------------------------------------------

/** The end of a server's log — the reason it failed is almost always here. */
function tailLog(path, lines = 15) {
	try {
		const all = readFileSync(path, "utf-8").trimEnd().split("\n");
		const tail = all.slice(-lines);
		return [`--- ${path} (last ${tail.length} lines) ---`, ...tail].join("\n");
	} catch {
		return `(no output was written to ${path})`;
	}
}

async function start() {
	if (!flags.port) fail("--port is required");
	if (typeof flags.cmd !== "string") fail("--cmd is required");

	const port = Number(flags.port);
	const cwd = String(flags.cwd ?? process.cwd());
	const timeoutMs = Number(flags.timeout ?? 60) * 1000;

	// --- Is the port free? ---
	const holders = inspectPort(port);
	if (holders.length) {
		const proc = holders[0];
		const registered = registry.find({ pid: proc.pid, port });
		const identity = await identify(port);

		if (registered && flags.reclaim) {
			console.log(`port ${port} held by pid ${proc.pid} (${identity.name}), started by an agent session ${relTime(registered.startedAt)} — reclaiming`);
			const result = await stopProcess(proc.pid);
			registry.remove(proc.pid);
			if (result !== "stopped" && result !== "killed" && result !== "already-stopped") {
				fail(`could not stop pid ${proc.pid}: ${result}`);
			}
		} else {
			console.error(`port ${port} is already in use.\n`);
			console.error(`  ${identity.name}${identity.detail ? ` (${identity.detail})` : ""}`);
			console.error(`  pid ${proc.pid}, cwd ${proc.cwd ?? "unknown"}`);
			console.error(`  cmd ${proc.command}\n`);
			if (registered) {
				console.error(`Started by an agent session ${relTime(registered.startedAt)}.`);
				console.error(`Re-run with --reclaim to stop it and take the port.`);
			} else if (belongsTo(proc, cwd)) {
				console.error(`This is in your project but was NOT started by an agent session —`);
				console.error(`most likely a terminal you have open. Ask before stopping it.`);
			} else {
				console.error(`This belongs to a different project. Do not stop it.`);
			}
			console.error(`\nNOT falling back to another port: a server on an unexpected port`);
			console.error(`makes every later check verify the wrong thing.`);
			process.exit(1);
		}
	}

	// --- Start it ---
	mkdirSync(registry.logDir, { recursive: true });
	const logPath = join(registry.logDir, `${port}.log`);
	const logFd = openSync(logPath, "a");

	const child = spawn(String(flags.cmd), {
		cwd,
		shell: true,
		detached: true,
		stdio: ["ignore", logFd, logFd],
	});
	child.unref();

	console.log(`starting: ${flags.cmd}`);
	console.log(`cwd:      ${cwd}`);
	console.log(`log:      ${logPath}`);

	// A command that dies on startup is the common case (bad flag, missing
	// dep, syntax error). Notice it immediately instead of polling a dead
	// process until the timeout.
	let exited = null;
	child.on("exit", (code, signal) => {
		exited = { code, signal };
	});

	// --- Wait for readiness ---
	const deadline = Date.now() + timeoutMs;
	let ready = false;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 500));

		if (exited && !listenersOn(port).length) {
			console.error(`\nFAILED: the command exited immediately (code ${exited.code ?? exited.signal}).\n`);
			console.error(tailLog(logPath));
			process.exit(1);
		}

		if (listenersOn(port).length) {
			if (typeof flags.ready === "string") {
				try {
					const res = await fetch(`http://localhost:${port}${flags.ready}`);
					if (res.status < 500) {
						ready = true;
						break;
					}
				} catch {}
			} else {
				ready = true;
				break;
			}
		}

		// Did it bind somewhere else instead? Fail fast rather than at timeout.
		const tree = descendantsOf(child.pid);
		const bound = listeningPortsOf(tree).filter((p) => p !== port);
		if (bound.length) {
			console.error(`\nFAILED: asked for port ${port}, but the server bound ${bound.join(", ")}.`);
			console.error(`This is a fallback port. Stopping it — verifying against the wrong`);
			console.error(`server is worse than not starting one.\n`);
			console.error(`Free port ${port} first (node port.mjs ${port}), or pass the port`);
			console.error(`through explicitly, e.g. --cmd "npm run dev -- --port ${port}".`);
			for (const pid of tree.reverse()) await stopProcess(pid, { timeoutMs: 2000 });
			process.exit(1);
		}
	}

	if (!ready) {
		console.error(`\nFAILED: nothing listening on port ${port} after ${timeoutMs / 1000}s.\n`);
		console.error(tailLog(logPath));
		for (const pid of descendantsOf(child.pid).reverse()) {
			await stopProcess(pid, { timeoutMs: 2000 });
		}
		process.exit(1);
	}

	// --- Confirm it is the server we expected ---
	const identity = await identify(port);
	if (typeof flags.expect === "string" && identity.id !== flags.expect) {
		console.error(`\nFAILED: expected a "${flags.expect}" server on ${port}, found ${identity.name}.`);
		for (const pid of descendantsOf(child.pid).reverse()) {
			await stopProcess(pid, { timeoutMs: 2000 });
		}
		process.exit(1);
	}

	// The listener is often a grandchild; register it so stop can reach it.
	const listener = listenersOn(port)[0] ?? child.pid;
	registry.add({
		port,
		pid: child.pid,
		listenerPid: listener,
		cmd: String(flags.cmd),
		cwd,
		label: typeof flags.label === "string" ? flags.label : identity.id,
		log: logPath,
	});

	console.log(`\nready on http://localhost:${port} — ${identity.name}${identity.detail ? ` (${identity.detail})` : ""}`);
	console.log(`registered as pid ${child.pid}; stop with: node serve.mjs stop --port ${port}`);
}

// --------------------------------------------------------------------------

function list() {
	const pruned = registry.prune();
	const entries = registry.list();

	if (!entries.length) {
		console.log("nothing registered");
		if (pruned) console.log(`(pruned ${pruned} dead entr${pruned === 1 ? "y" : "ies"})`);
		return;
	}

	for (const e of entries) {
		console.log(
			`${String(e.port).padEnd(6)} ${e.alive ? "running" : "dead   "}  ${e.label ?? ""}  pid ${e.pid}  ${relTime(e.startedAt)}`,
		);
		console.log(`       ${e.cmd}`);
		console.log(`       ${e.cwd}`);
	}
	if (pruned) console.log(`\npruned ${pruned} dead entr${pruned === 1 ? "y" : "ies"}`);
}

// --------------------------------------------------------------------------

async function stop() {
	const entries = registry.list();
	let targets;

	if (flags.all) {
		targets = entries;
	} else if (flags.port) {
		targets = entries.filter((e) => e.port === Number(flags.port));
	} else if (flags.pid) {
		targets = entries.filter((e) => e.pid === Number(flags.pid));
	} else {
		fail("one of --port, --pid or --all is required");
	}

	if (!targets.length) {
		console.log("nothing matching in the registry");
		console.log("(only servers started through serve.mjs are stoppable here — by design)");
		return;
	}

	for (const e of targets) {
		// Stop children first so a wrapper cannot respawn them.
		const tree = descendantsOf(e.pid).reverse();
		const results = [];
		for (const pid of tree) results.push(await stopProcess(pid));

		// The listener can escape the tree if the wrapper double-forked.
		for (const proc of inspectPort(e.port)) {
			if (!tree.includes(proc.pid)) results.push(await stopProcess(proc.pid));
		}

		registry.remove(e.pid);
		const stillUp = listenersOn(e.port).length > 0;
		console.log(
			`${e.port}  ${stillUp ? "STILL IN USE" : "stopped"}  (${results.join(", ") || "no processes"})`,
		);
	}
}

// --------------------------------------------------------------------------

switch (command) {
	case "start":
		await start();
		break;
	case "list":
		list();
		break;
	case "stop":
		await stop();
		break;
	default:
		fail(`unknown command "${command}". Expected start, list or stop.`);
}
