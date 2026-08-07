// Finding out what actually holds a port.
//
// The whole skill rests on being able to attribute a listening process to a
// project. `cwd` is what makes that possible — a port number tells you nothing
// about whose server it is.

import { execFileSync } from "node:child_process";

function run(cmd, args) {
	try {
		return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return "";
	}
}

/** PIDs listening on a TCP port. Empty when the port is free. */
export function listenersOn(port) {
	const out = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
	return [...new Set(out.split("\n").filter(Boolean).map(Number))];
}

/** Full command line for a pid. */
export function commandOf(pid) {
	return run("ps", ["-p", String(pid), "-o", "command="]).trim();
}

/** Working directory of a pid — the attribution key. */
export function cwdOf(pid) {
	const out = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
	const line = out.split("\n").find((l) => l.startsWith("n"));
	return line ? line.slice(1) : null;
}

/**
 * Seconds since the process started, or null.
 *
 * Uses `lstart` (an absolute date) rather than `etimes`, which exists on Linux
 * but not on macOS, and rather than `etime`, whose format shifts between
 * MM:SS, HH:MM:SS and DD-HH:MM:SS.
 */
export function ageOf(pid) {
	const lstart = run("ps", ["-p", String(pid), "-o", "lstart="]).trim();
	if (!lstart) return null;
	const started = new Date(lstart);
	if (Number.isNaN(started.getTime())) return null;
	return Math.max(0, Math.round((Date.now() - started.getTime()) / 1000));
}

export function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err.code === "EPERM";
	}
}

/**
 * A pid and all of its descendants.
 *
 * `npm run dev` is a wrapper: the process that actually binds the port is
 * usually a grandchild, so checking only the spawned pid never finds the
 * listener.
 */
export function descendantsOf(pid, seen = new Set()) {
	if (seen.has(pid)) return [...seen];
	seen.add(pid);
	const children = run("pgrep", ["-P", String(pid)])
		.split("\n")
		.filter(Boolean)
		.map(Number);
	for (const child of children) descendantsOf(child, seen);
	return [...seen];
}

/** Every TCP port a set of pids is listening on. */
export function listeningPortsOf(pids) {
	if (!pids.length) return [];
	const out = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", pids.join(",")]);
	const ports = out
		.split("\n")
		.slice(1)
		.map((line) => line.match(/:(\d+)\s+\(LISTEN\)/)?.[1])
		.filter(Boolean)
		.map(Number);
	return [...new Set(ports)];
}

/** Everything known about whoever holds a port. */
export function inspectPort(port) {
	const pids = listenersOn(port);
	return pids.map((pid) => ({
		pid,
		port: Number(port),
		command: commandOf(pid),
		cwd: cwdOf(pid),
		ageSeconds: ageOf(pid),
	}));
}

/**
 * Stops a process politely, then firmly.
 *
 * SIGTERM lets a dev server clean up its own children and sockets; SIGKILL
 * leaves the port in TIME_WAIT and can orphan workers, so it is the fallback
 * rather than the default.
 */
export async function stopProcess(pid, { timeoutMs = 5000 } = {}) {
	if (!isAlive(pid)) return "already-stopped";

	try {
		process.kill(pid, "SIGTERM");
	} catch (err) {
		if (err.code === "ESRCH") return "already-stopped";
		if (err.code === "EPERM") return "permission-denied";
		throw err;
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 150));
		if (!isAlive(pid)) return "stopped";
	}

	try {
		process.kill(pid, "SIGKILL");
	} catch {}
	await new Promise((r) => setTimeout(r, 300));
	return isAlive(pid) ? "refused-to-die" : "killed";
}

/** True when a process's cwd is at or below `root` — i.e. it is this project's. */
export function belongsTo(proc, root) {
	if (!proc.cwd || !root) return false;
	const a = proc.cwd.replace(/\/+$/, "");
	const b = root.replace(/\/+$/, "");
	return a === b || a.startsWith(`${b}/`);
}
