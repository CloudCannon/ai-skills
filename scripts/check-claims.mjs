#!/usr/bin/env node
/**
 * Verifies the skills' claims about CloudCannon's shipped packages.
 *
 * `check-links.mjs` proves the docs are internally consistent. This proves the
 * parts that cannot avoid transcription are still true: a quick start has to
 * show a real command, a routing table has to name real ones, and those rot
 * between releases without anything in review or CI noticing.
 *
 *   1. Every `--flag` on a `cloudcannon …` invocation exists on *that* command.
 *   2. Every `--flag` named elsewhere exists on some command.
 *   3. Every `receiver.method()` in the SDK skill's prose exists on that client.
 *
 * It checks one direction only. A flag the package gained and the skills never
 * mention is invisible here; `diff-surface.mjs` covers that.
 *
 * The packages are read, never executed: no engine constraint, no dependencies.
 * They are NOT dependencies of this repo — `--install` puts the pinned versions
 * under a temp prefix, because installing into the repo re-resolves its own
 * devDependencies:
 *
 *   npm run check:claims -- --install
 *
 * The pins are package.json's `documentedPackages`; CI runs the same command.
 *
 * Usage: node scripts/check-claims.mjs [--quiet] [--install]
 *                                      [--cli-dir <path>] [--sdk-dir <path>]
 *
 * `--cli-dir` / `--sdk-dir` (or `CC_CLI_DIR` / `CC_SDK_DIR`) point the check at
 * a copy already on disk, at whatever version it happens to be.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  CLI_PKG,
  PINS,
  ROOT,
  SDK_PKG,
  SKILLS,
  flagValue,
  installPinned,
  packageDir,
  readCliCommands,
  readSdkClients,
  versionOf,
  walkMarkdown,
} from "./lib/packages.mjs";

const ARGV = process.argv.slice(2);
const QUIET = ARGV.includes("--quiet");

/**
 * Things the skills name in order to warn agents off them. Keyed `file::token`
 * rather than by line, so reflowing a paragraph does not invalidate an entry.
 *
 * Every entry is explicit. Inferring a denial from phrasing means a genuine
 * error on a line that happens to read like one gets swallowed.
 */
const KNOWN_ABSENCES = new Set([
  "skills/cloudcannon-dev-server/troubleshooting.md::--source",
  "skills/cloudcannon-sdk/SKILL.md::sites",
  "skills/cloudcannon-sdk/resources.md::sites",
]);

const problems = [];
const warnings = [];
const allowed = [];

function fail(file, line, token, msg) {
  const where = `${relative(ROOT, file)}:${line + 1}`;
  const key = `${relative(ROOT, file)}::${token}`;
  if (KNOWN_ABSENCES.has(key)) allowed.push(`${where} — ${msg}`);
  else problems.push(`${where}\n    ${msg}`);
}

/* --- Locating and reading the packages --- */

const INSTALL_PREFIX = ARGV.includes("--install") ? installPinned() : null;

function findPackage(name, envVar, dirFlag) {
  const override = flagValue(ARGV, dirFlag) ?? process.env[envVar];
  const dir = override ? resolve(override) : packageDir(name, INSTALL_PREFIX ?? ROOT);
  if (dir && existsSync(join(dir, "package.json"))) return dir;
  console.error(
    `check-claims: cannot find ${name}.\n\n` +
      `  npm run check:claims -- --install\n\n` +
      `installs the pinned versions outside this repo and runs the check. ` +
      `To use a copy already on disk, pass --${dirFlag} <path> or set ${envVar}.`,
  );
  process.exit(2);
}

const CLI_DIR = findPackage(CLI_PKG, "CC_CLI_DIR", "cli-dir");
const SDK_DIR = findPackage(SDK_PKG, "CC_SDK_DIR", "sdk-dir");

// A warning, not a failure: `--cli-dir` may point at any version. It is also
// the only thing here that fires on a bump, so it names the diff to run.
for (const [name, dir, flagPrefix] of [
  [CLI_PKG, CLI_DIR, "cli"],
  [SDK_PKG, SDK_DIR, "sdk"],
]) {
  const version = versionOf(dir);
  if (version !== PINS[name]) {
    warnings.push(
      `${name} is ${version}; claims were verified against ${PINS[name]}. ` +
        `Run \`node scripts/diff-surface.mjs --${flagPrefix}-to ${version}\` to see what moved, ` +
        `re-check the claims, then bump documentedPackages in package.json.`,
    );
  }
}

/** Flags `cc-serve.sh` defines for itself, parsed from its own option parser. */
function readServeFlags() {
  const path = join(SKILLS, "cloudcannon-dev-server", "scripts", "cc-serve.sh");
  if (!existsSync(path)) return [];
  const src = readFileSync(path, "utf8");
  return [...src.matchAll(/^\s*--([a-z][a-z0-9-]*)\s*\)/gm)].map((m) => m[1]);
}

const CLI_COMMANDS = readCliCommands(CLI_DIR);

/** Accepted everywhere, so absent from `documentation.json`'s per-command options. */
const CLI_GLOBAL_FLAGS = new Set(["help", "version"]);

const CLI_ALL_FLAGS = new Set([
  ...[...CLI_COMMANDS.values()].flatMap((s) => [...s]),
  ...CLI_GLOBAL_FLAGS,
]);

/** Flags of other tools the skills legitimately invoke. Extend as they appear. */
const NPM_FLAGS = "legacy-peer-deps save-dev no-save no-package-lock global prefix";
const ROSEY_FLAGS = "yes locales dest exclusions default-language-at-root base-url tag";
const NODE_FLAGS = "env-file check test";

const OTHER_TOOL_FLAGS = new Set([
  ...`${NPM_FLAGS} ${ROSEY_FLAGS} ${NODE_FLAGS}`.split(" "),
  ...readServeFlags(),
]);

const SDK_CLIENTS = readSdkClients(SDK_DIR);

/* --- Reading the skills --- */

const FILES = walkMarkdown(SKILLS).sort();

/* --- 1 + 2. CLI flags --- */

/** The longest command path matching the words after `cloudcannon`, or null. */
function matchCommand(words) {
  for (let len = Math.min(3, words.length); len > 0; len--) {
    const candidate = words.slice(0, len).join(" ");
    if (CLI_COMMANDS.has(candidate)) return candidate;
  }
  return null;
}

for (const file of FILES) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      // Link targets are full of `#--anchor-fragments` that read as flags.
      const line = raw.replace(/\]\([^)]*\)/g, "]()");
      const flags = [...line.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
      if (!flags.length || !/cloudcannon/i.test(line)) return;

      const invocation = line.match(/cloudcannon(?:\/cli)?\s+((?:[a-z][a-z0-9-]*\s*){1,3})/);
      const command = invocation ? matchCommand(invocation[1].trim().split(/\s+/)) : null;

      for (const flag of flags) {
        if (CLI_GLOBAL_FLAGS.has(flag) || OTHER_TOOL_FLAGS.has(flag)) continue;

        // 1. On a resolvable invocation, the flag must be on *that* command.
        if (command) {
          if (CLI_COMMANDS.get(command).has(flag)) continue;
          const elsewhere = [...CLI_COMMANDS]
            .filter(([, opts]) => opts.has(flag))
            .map(([name]) => name);
          fail(
            file,
            i,
            `--${flag}`,
            elsewhere.length
              ? `\`cloudcannon ${command}\` has no --${flag}. It is on: ${elsewhere.join(", ")}`
              : `--${flag} does not exist on any command (near \`cloudcannon ${command}\`)`,
          );
          continue;
        }

        // 2. Named away from an invocation: must exist somewhere.
        if (!CLI_ALL_FLAGS.has(flag)) {
          fail(file, i, `--${flag}`, `--${flag} does not exist on any CloudCannon CLI command`);
        }
      }
    });
}

/* --- 3. SDK methods named in prose --- */

/**
 * Prose backticks only — never fenced code. In prose, `site.getFile(path)`
 * unambiguously means the site sub-client. In a code block the same shape is
 * usually a local variable or a path: `file.path`, `org.uuid`, `site.d.ts`.
 * Fenced code carries almost no method reference that prose does not, and most
 * of what it does carry is one of those false matches.
 */
const RECEIVERS = {
  client: "root",
  org: "org",
  site: "site",
  session: "editingSession",
  sessionClient: "editingSession",
  editingSession: "editingSession",
  file: "editingSessionFile",
  editingSessionFile: "editingSessionFile",
  build: "build",
  sync: "sync",
  backup: "backup",
  inbox: "inbox",
  siteInbox: "siteInbox",
};

for (const file of FILES.filter((f) => f.includes("cloudcannon-sdk"))) {
  let inFence = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      for (const [, span] of line.matchAll(/`([^`]+)`/g)) {
        // A trailing `(` is what separates a method from a property.
        for (const m of span.matchAll(/\b([a-zA-Z]\w*)\.([a-zA-Z]\w*)\s*\(/g)) {
          const client = RECEIVERS[m[1]];
          if (!client || SDK_CLIENTS[client].has(m[2])) continue;
          const elsewhere = Object.entries(SDK_CLIENTS)
            .filter(([, s]) => s.has(m[2]))
            .map(([name]) => name);
          fail(
            file,
            i,
            m[2],
            elsewhere.length
              ? `\`${client}\` has no \`${m[2]}()\`. It is on: ${elsewhere.join(", ")}`
              : `\`${m[2]}()\` does not exist on any SDK sub-client (shown on \`${m[1]}\`)`,
          );
        }
      }
    });
}

/* --- Report --- */

for (const w of warnings) console.warn(`check-claims: warning: ${w}`);

if (problems.length) {
  console.error(`\ncheck-claims: ${problems.length} claim(s) no longer true:\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  console.error("Each is a typo in the skill, or a package that moved. Check the package first.\n");
  process.exit(1);
}

if (!QUIET) {
  for (const a of allowed) console.log(`check-claims: documented absence: ${a}`);
  const methods = Object.values(SDK_CLIENTS).reduce((n, s) => n + s.size, 0);
  console.log(
    `check-claims: ${CLI_COMMANDS.size} CLI commands (${CLI_ALL_FLAGS.size} flags), ` +
      `${methods} SDK methods across ${Object.keys(SDK_CLIENTS).length} sub-clients — claims hold.`,
  );
}
