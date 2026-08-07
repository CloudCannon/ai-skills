// A record of what this machine's agent sessions have started.
//
// Cleanup is only possible if starting was recorded. Without this, a server
// started an hour ago is indistinguishable from one a person started, and the
// safe move is always "leave it alone" — which is how ports fill up.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAlive } from "./procs.mjs";

const DIR = join(tmpdir(), "agent-dev-servers");
const FILE = join(DIR, "registry.json");

function load() {
	if (!existsSync(FILE)) return [];
	try {
		return JSON.parse(readFileSync(FILE, "utf-8"));
	} catch {
		return [];
	}
}

function save(entries) {
	mkdirSync(DIR, { recursive: true });
	writeFileSync(FILE, JSON.stringify(entries, null, 1));
}

export function add(entry) {
	const entries = load().filter((e) => e.pid !== entry.pid);
	entries.push({ ...entry, startedAt: new Date().toISOString() });
	save(entries);
}

/**
 * Drops an entry by any pid associated with it.
 *
 * Callers hold whichever pid they happened to see — the spawned one or the
 * listener — so matching only `pid` leaves stale entries behind and the same
 * port gets reported twice.
 */
export function remove(pid) {
	save(load().filter((e) => e.pid !== pid && e.listenerPid !== pid));
}

/** Registered entries, annotated with whether the process is still alive. */
export function list() {
	return load().map((e) => ({ ...e, alive: isAlive(e.pid) }));
}

/** Drops entries whose process is gone. Returns how many were pruned. */
export function prune() {
	const entries = load();
	const live = entries.filter((e) => isAlive(e.pid));
	save(live);
	return entries.length - live.length;
}

/**
 * Looks up an entry by port or by any pid associated with it.
 *
 * MUST match `listenerPid` as well as `pid`: the process that binds the port is
 * usually a grandchild of the one that was spawned, so matching only the
 * spawned pid makes an agent's own server look foreign — and it then refuses to
 * reclaim its own port.
 */
export function find({ port, pid }) {
	const entries = list();
	if (pid) {
		const hit = entries.find((e) => e.pid === pid || e.listenerPid === pid);
		if (hit) return hit;
	}
	if (port) return entries.find((e) => e.port === Number(port));
	return undefined;
}

export const registryPath = FILE;
export const logDir = DIR;
