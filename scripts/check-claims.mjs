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
 *   4. Stated counts still match — a warning. They are descriptive, and a
 *      drifted count misleads nobody.
 *
 * The packages are read, never executed: no engine constraint, no dependencies.
 * They are NOT dependencies of this repo — install them outside it, because
 * installing into it re-resolves this repo's own devDependencies:
 *
 *   npm install --prefix /tmp/cc @cloudcannon/cli @cloudcannon/sdk
 *   CC_CLI_DIR=/tmp/cc/node_modules/@cloudcannon/cli \
 *   CC_SDK_DIR=/tmp/cc/node_modules/@cloudcannon/sdk npm run check:claims
 *
 * Usage: node scripts/check-claims.mjs [--quiet]
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "skills");
const QUIET = process.argv.includes("--quiet");

/** The versions the claims were verified against. A mismatch is a warning. */
const VERIFIED_AGAINST = { "@cloudcannon/cli": "0.0.19", "@cloudcannon/sdk": "0.0.13" };

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

function findPackage(name, envVar) {
  const candidates = process.env[envVar]
    ? [resolve(process.env[envVar])]
    : [
        join(ROOT, "node_modules", ...name.split("/")),
        join(ROOT, "..", "venture-skills-copy", "node_modules", ...name.split("/")),
      ];
  for (const dir of candidates) if (existsSync(join(dir, "package.json"))) return dir;
  console.error(
    `check-claims: cannot find ${name}.\n\n` +
      `  npm install --prefix /tmp/cc ${name}\n\n` +
      `then set ${envVar} to /tmp/cc/node_modules/${name}.`,
  );
  process.exit(2);
}

const CLI_DIR = findPackage("@cloudcannon/cli", "CC_CLI_DIR");
const SDK_DIR = findPackage("@cloudcannon/sdk", "CC_SDK_DIR");

for (const [name, dir] of Object.entries({
  "@cloudcannon/cli": CLI_DIR,
  "@cloudcannon/sdk": SDK_DIR,
})) {
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (version !== VERIFIED_AGAINST[name]) {
    warnings.push(
      `${name} is ${version}; claims were verified against ${VERIFIED_AGAINST[name]}. ` +
        `Re-check them, then update VERIFIED_AGAINST.`,
    );
  }
}

/** Every leaf CLI command, keyed by its path without the `cloudcannon ` prefix. */
function readCliCommands() {
  const doc = JSON.parse(readFileSync(join(CLI_DIR, "dist", "documentation.json"), "utf8"));
  const byPath = new Map();
  const walk = (arr) => {
    for (const c of arr || []) {
      if (c.subCommands?.length) walk(c.subCommands);
      else
        byPath.set(
          c.fullName.replace(/^cloudcannon\s+/, ""),
          new Set((c.options || []).map((o) => o.name)),
        );
    }
  };
  walk(doc.subCommands);
  return byPath;
}

/** Method names declared on a sub-client, read from its generated `.d.ts`. */
function readSdkMethods(file) {
  const src = readFileSync(join(SDK_DIR, "dist", file), "utf8");
  // `[<(]` catches a generic method: `fetch<const U ...>(` has nested angle
  // brackets, so nothing can match across to its closing `>`.
  const names = new Set(
    [...src.matchAll(/^ {4}(?:readonly\s+)?([a-zA-Z_]\w*)\s*[<(]/gm)].map((m) => m[1]),
  );
  names.delete("constructor");
  return names;
}

/** Flags `cc-serve.sh` defines for itself, parsed from its own option parser. */
function readServeFlags() {
  const path = join(SKILLS, "cloudcannon-dev-server", "scripts", "cc-serve.sh");
  if (!existsSync(path)) return [];
  const src = readFileSync(path, "utf8");
  return [...src.matchAll(/^\s*--([a-z][a-z0-9-]*)\s*\)/gm)].map((m) => m[1]);
}

const CLI_COMMANDS = readCliCommands();

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

const SDK_CLIENTS = {
  root: readSdkMethods("index.d.ts"),
  org: readSdkMethods("src/org.d.ts"),
  site: readSdkMethods("src/site.d.ts"),
  editingSession: readSdkMethods("src/editing-session.d.ts"),
  editingSessionFile: readSdkMethods("src/editing-session-file.d.ts"),
  build: readSdkMethods("src/build.d.ts"),
  sync: readSdkMethods("src/sync.d.ts"),
  backup: readSdkMethods("src/backup.d.ts"),
  inbox: readSdkMethods("src/inbox.d.ts"),
  siteInbox: readSdkMethods("src/site-inbox.d.ts"),
};

/* --- Reading the skills --- */

function walkMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkMarkdown(full, out);
    else if (extname(full) === ".md") out.push(full);
  }
  return out;
}

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

/* --- 4. Stated counts — warnings only --- */

const schema = readFileSync(join(SDK_DIR, "dist", "schema.d.ts"), "utf8");
const count = (src, re) => [...src.matchAll(re)].length;

const COUNTS = [
  ["35 CLI commands", "cloudcannon-cli/commands.md", CLI_COMMANDS.size, 35],
  [
    "62 documented SDK methods",
    "cloudcannon-sdk/api-surface.md",
    count(readFileSync(join(SDK_DIR, "README.md"), "utf8"), /^#### /gm),
    62,
  ],
  ["29 site methods", "cloudcannon-sdk/api-surface.md", SDK_CLIENTS.site.size, 29],
  [
    "168 API paths",
    "cloudcannon-sdk/api-surface.md",
    count(schema, /^ {4}'\/api\/v0[^']*':/gm),
    168,
  ],
];

for (const [claim, statedIn, actual, expected] of COUNTS) {
  if (actual !== expected) warnings.push(`${statedIn} states ${claim}; package has ${actual}`);
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
