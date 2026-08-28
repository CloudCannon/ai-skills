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
import {
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	statfsSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs, handleHelp, fail } from "./lib/args.mjs";

const USAGE = `
browser.mjs — control the Chrome instance used for Visual Editor checks

  node browser.mjs start [--headless] [--cdp-port 9222]
  node browser.mjs status
  node browser.mjs stop

Flags:
  --headless     Run without a visible window. Default is headed: the CC app is
                 heavy and headless occasionally renders differently. Forced on
                 when there is no display to open a window on.
  --cdp-port     DevTools port other scripts attach to (default 9222).
  --window-size  Browser window, WxH (default 1600x1000). The CloudCannon
                 editor collapses its panes below roughly 1200 wide.

Environment:
  CC_CHROME_BIN        Chrome/Chromium binary to use instead of the usual OS
                       locations. Required wherever Chrome is somewhere this
                       does not look — most containers, a Playwright download,
                       Chrome for Testing, a wrapper script.
  CC_CHROME_FLAGS      Extra Chrome flags, space separated. Appended last, so
                       they win over everything set here.
  CC_CHROME_NO_AUTO_FLAGS
                       Skip the container flags described below.

Inside a container this adds --no-sandbox and/or --disable-dev-shm-usage when
it detects they are needed, and says so. Both conditions otherwise surface as
a startup timeout rather than as themselves.
`;

// Set CC_CHROME_BIN to use a specific binary — a Playwright download, a
// container's own Chromium, or a wrapper script. Containers rarely have Chrome
// in any of the paths below.
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
const LOG_FILE = join(STATE_DIR, "chrome.log");

const { flags, positional } = parseArgs();
handleHelp(flags, USAGE);

const port = flags["cdp-port"] ?? 9222;
const command = positional[0] ?? "status";

/**
 * Whether we are running inside a container.
 *
 * Used only to decide whether to relax Chrome's own sandbox, so it is
 * deliberately narrow: on a normal desktop none of this applies and nothing is
 * added.
 */
function inContainer() {
	if (process.platform !== "linux") return false;
	if (existsSync("/.dockerenv") || existsSync("/run/.containerenv")) return true;
	try {
		return /docker|lxc|kubepods|containerd|podman/.test(readFileSync("/proc/1/cgroup", "utf-8"));
	} catch {
		return false;
	}
}

/**
 * Chrome's setuid sandbox helper, which it refuses to start without.
 *
 * Copying a Chromium tree as a non-root user loses the setuid bit, and most
 * containers cannot chown it back. Chrome then aborts with "The SUID sandbox
 * helper binary was found, but is not configured correctly" — mirrored here so
 * --no-sandbox is added for the actual reason rather than on a guess.
 */
function suidSandboxUsable(bin) {
	try {
		const helper = join(dirname(realpathSync(bin)), "chrome-sandbox");
		const st = statSync(helper);
		return st.uid === 0 && (st.mode & 0o4000) !== 0;
	} catch {
		return false; // no helper beside the binary, or bin is a wrapper script
	}
}

/** Chrome exhausts the 64MB /dev/shm most containers ship with and crashes. */
function devShmTooSmall() {
	try {
		const { bsize, blocks } = statfsSync("/dev/shm");
		return bsize * blocks <= 64 * 1024 * 1024;
	} catch {
		return false;
	}
}

/** Flags a container needs, with the reason for each, for reporting. */
function containerFlags(bin) {
	if (process.env.CC_CHROME_NO_AUTO_FLAGS || !inContainer()) return [];
	const needed = [];
	if (process.getuid?.() === 0) {
		needed.push(["--no-sandbox", "running as root"]);
	} else if (!suidSandboxUsable(bin)) {
		needed.push(["--no-sandbox", "chrome-sandbox is not setuid root"]);
	}
	if (devShmTooSmall()) needed.push(["--disable-dev-shm-usage", "/dev/shm is 64MB or less"]);
	return needed;
}

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
		const override = process.env.CC_CHROME_BIN;
		if (override && !existsSync(override))
			fail(`CC_CHROME_BIN is set to "${override}" but nothing exists there`);
		const bin = override ?? CHROME_PATHS.find((p) => existsSync(p));
		if (!bin)
			fail(
				`no Chrome found. Looked in:\n  ${CHROME_PATHS.join("\n  ")}\n` +
					"Set CC_CHROME_BIN to a Chrome/Chromium binary to use one elsewhere.",
			);

		mkdirSync(PROFILE_DIR, { recursive: true });

		// Headed is the better default, but only where a window can actually be
		// opened. On a display-less Linux box — which is every container — headed
		// Chrome fails in a way that reads as a startup timeout, so fall back
		// rather than making every sandbox user discover --headless the hard way.
		const noDisplay =
			process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
		const headless = Boolean(flags.headless) || noDisplay;
		if (noDisplay && !flags.headless) {
			console.log("no DISPLAY — starting headless");
		}

		// The editor is a three-pane desktop UI: at the headless default of
		// 800x600 the panes overlap the preview and region screenshots come out
		// clipped, so set a desktop-sized window explicitly.
		const windowSize = flags["window-size"] ?? "1600x1000";
		const args = [
			`--remote-debugging-port=${port}`,
			`--window-size=${String(windowSize).replace("x", ",")}`,
			`--user-data-dir=${PROFILE_DIR}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-features=ChromeWhatsNewUI",
		];

		const auto = containerFlags(bin);
		if (auto.length) {
			args.push(...auto.map(([flag]) => flag));
			console.log(
				`container detected — added ${auto.map(([flag, why]) => `${flag} (${why})`).join(", ")}`,
			);
		}

		// Last, so a caller can override anything decided above.
		args.push(...(process.env.CC_CHROME_FLAGS ?? "").split(/\s+/).filter(Boolean));

		args.push("about:blank");
		if (headless) args.unshift("--headless=new");

		// Chrome's stderr goes to a log rather than /dev/null: when it dies during
		// startup the reason is only ever in there, and without it the failure
		// below looks like a timeout rather than the crash it usually is.
		const log = openSync(LOG_FILE, "w");
		const child = spawn(bin, args, { detached: true, stdio: ["ignore", log, log] });
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
		fail(
			`Chrome (${bin}) started but never opened the debugging port.\n` +
				`Its output (${LOG_FILE}):\n` +
				(readFileSync(LOG_FILE, "utf-8").trim() || "  <nothing>"),
		);
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
