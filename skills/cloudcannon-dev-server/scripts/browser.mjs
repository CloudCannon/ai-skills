#!/usr/bin/env node

/**
 * Starts / stops the Chrome instance the other scripts attach to.
 *
 * One long-lived browser is deliberate: the CloudCannon SPA takes several
 * seconds to boot and the editor holds state (open page, switched locale,
 * unsaved edits). Every other script reconnects over CDP, so they stay small
 * and one-shot without paying the boot cost each time.
 *
 * Usage:
 *   node browser.mjs start [--headless] [--cdp-port 9222]
 *   node browser.mjs status
 *   node browser.mjs stop
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, handleHelp, fail } from "./lib/args.mjs";

const USAGE = `
browser.mjs — control the Chrome instance used for Visual Editor checks

  node browser.mjs start [--headless] [--cdp-port 9222]
  node browser.mjs status
  node browser.mjs stop

Flags:
  --headless     Run without a visible window. Default is headed: the CC app is
                 heavy and headless occasionally renders differently.
  --cdp-port     DevTools port other scripts attach to (default 9222).
`;

const CHROME_PATHS = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
];

const STATE_DIR = join(tmpdir(), "cc-dev-server-driver");
const PID_FILE = join(STATE_DIR, "chrome.pid");
// A dedicated profile — never the user's real Chrome profile, which would mean
// driving their live session, cookies and all.
const PROFILE_DIR = join(STATE_DIR, "chrome-profile");

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);

const port = flags["cdp-port"] ?? 9222;
const command = positional[0] ?? "status";

async function isUp() {
	try {
		const res = await fetch(`http://localhost:${port}/json/version`);
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
}

switch (command) {
	case "start": {
		if (await isUp()) {
			console.log(`Chrome already listening on ${port}`);
			break;
		}
		const bin = CHROME_PATHS.find((p) => existsSync(p));
		if (!bin) fail(`no Chrome found. Looked in:\n  ${CHROME_PATHS.join("\n  ")}`);

		mkdirSync(PROFILE_DIR, { recursive: true });
		const args = [
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${PROFILE_DIR}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-features=ChromeWhatsNewUI",
			"about:blank",
		];
		if (flags.headless) args.unshift("--headless=new");

		const child = spawn(bin, args, { detached: true, stdio: "ignore" });
		child.unref();
		writeFileSync(PID_FILE, String(child.pid));

		for (let i = 0; i < 40; i++) {
			await new Promise((r) => setTimeout(r, 250));
			const v = await isUp();
			if (v) {
				console.log(`Chrome ${v.Browser} listening on ${port} (pid ${child.pid})`);
				console.log(`profile: ${PROFILE_DIR}`);
				process.exit(0);
			}
		}
		fail("Chrome started but never opened the debugging port");
		break;
	}

	case "stop": {
		const pids = new Set();

		if (existsSync(PID_FILE)) {
			pids.add(Number(readFileSync(PID_FILE, "utf-8").trim()));
			rmSync(PID_FILE, { force: true });
		}

		// Fall back to whatever holds the debugging port, but only if it is
		// running against our own profile directory. A pid file is easy to lose
		// — started by hand, cleaned by the OS, or a crashed session — and
		// without this the browser is orphaned with no way to stop it. The
		// profile check is what keeps this from killing the user's Chrome.
		try {
			const held = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			for (const raw of held.split("\n").filter(Boolean)) {
				const pid = Number(raw);
				const cmd = execSync(`ps -p ${pid} -o command=`, {
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "ignore"],
				});
				if (cmd.includes(PROFILE_DIR)) pids.add(pid);
			}
		} catch {}

		if (!pids.size) {
			console.log("no Chrome to stop");
			break;
		}

		for (const pid of pids) {
			try {
				process.kill(pid, "SIGTERM");
				console.log(`stopped Chrome (pid ${pid})`);
			} catch {
				console.log(`Chrome pid ${pid} was not running`);
			}
		}
		break;
	}

	case "status": {
		const v = await isUp();
		console.log(
			v ? `up — ${v.Browser} on port ${port}` : `down — nothing listening on port ${port}`,
		);
		break;
	}

	default:
		fail(`unknown command "${command}". Expected start, stop or status.`);
}
