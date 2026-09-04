#!/usr/bin/env node
/**
 * What changed in the CLI's and SDK's public surface between two versions, and
 * whether the skills already cover it.
 *
 * `check-claims.mjs` runs one direction only: every name the skills mention has
 * to exist in the package. It cannot see the opposite case — surface the package
 * gained that the skills never mention. This is that direction.
 *
 * Neither package ships a CHANGELOG, and their GitHub releases are generated
 * from PR titles, so the shipped surface is the only precise source: the CLI's
 * own `documentation.json`, and the SDK's `.d.ts` files.
 *
 * Usage:
 *   node scripts/diff-surface.mjs                        pinned → latest published
 *   node scripts/diff-surface.mjs --cli-to 0.0.20        one package, one version
 *   node scripts/diff-surface.mjs --cli-from 0.0.17 --cli-to 0.0.19
 *   node scripts/diff-surface.mjs --fail-on-change       exit 1 if anything moved
 *
 * `--fail-on-change` is for a scheduled job: check-claims' version warning
 * only fires once somebody has bumped the pin, so it cannot tell you a release
 * happened. This can.
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import {
  CLI_PKG,
  PINS,
  ROOT,
  SDK_PKG,
  SKILLS,
  flagValue,
  installPackages,
  latestVersion,
  packageDir,
  readCliCommands,
  readSdkClients,
  walkMarkdown,
} from "./lib/packages.mjs";

const ARGV = process.argv.slice(2);
const FAIL_ON_CHANGE = ARGV.includes("--fail-on-change");

if (ARGV.includes("--help") || ARGV.includes("-h")) {
  // The header comment is the usage text; print it without the comment markers.
  const header = readFileSync(new URL(import.meta.url), "utf8").split("*/")[0];
  console.log(
    header
      .replace(/^#!.*\n\/\*\*\n/, "")
      .replace(/^ \* ?/gm, "")
      .trimEnd(),
  );
  process.exit(0);
}

/* --- Which versions --- */

function versions(prefix, pkg) {
  const from = flagValue(ARGV, `${prefix}-from`) ?? PINS[pkg];
  const to = flagValue(ARGV, `${prefix}-to`) ?? "latest";
  return { from, to: to === "latest" ? latestVersion(pkg) : to };
}

/** Each version under its own prefix — one prefix cannot hold two of a package. */
function surfaceDir(pkg, version) {
  const slug = `${pkg.split("/").pop()}-${version}`;
  const prefix = installPackages([`${pkg}@${version}`], `agent-skills-surface/${slug}`);
  const dir = packageDir(pkg, prefix);
  if (!dir) {
    console.error(`diff-surface: ${pkg}@${version} did not install under ${prefix}`);
    process.exit(2);
  }
  return dir;
}

/* --- Where the skills mention a name --- */

const DOCS = walkMarkdown(SKILLS).map((file) => ({
  file: relative(ROOT, file),
  lines: readFileSync(file, "utf8").split("\n"),
}));

/** The first `file:line` in the skills matching `re`, or null. */
function mentioned(re) {
  for (const { file, lines } of DOCS) {
    const i = lines.findIndex((line) => re.test(line));
    if (i !== -1) return `${file}:${i + 1}`;
  }
  return null;
}

const flagMention = (name) => mentioned(new RegExp(`--${name}(?![A-Za-z0-9-])`));
const methodMention = (name) => mentioned(new RegExp(`\\.${name}\\s*\\(`));

/* --- Diffing --- */

const added = [];
const removed = [];

function record(into, label, where) {
  into.push({ label, where });
}

function diffCli() {
  const { from, to } = versions("cli", CLI_PKG);
  console.log(`\n${CLI_PKG}  ${from} → ${to}`);
  if (from === to) return console.log("  no version change");

  const before = readCliCommands(surfaceDir(CLI_PKG, from));
  const after = readCliCommands(surfaceDir(CLI_PKG, to));

  for (const [cmd, flags] of after) {
    if (!before.has(cmd)) {
      record(added, `${cmd} (new command)`, mentioned(new RegExp(`cloudcannon ${cmd}\\b`)));
      continue;
    }
    for (const f of flags)
      if (!before.get(cmd).has(f)) record(added, `${cmd} --${f}`, flagMention(f));
  }

  for (const [cmd, flags] of before) {
    if (!after.has(cmd)) {
      record(removed, `${cmd} (command removed)`, mentioned(new RegExp(`cloudcannon ${cmd}\\b`)));
      continue;
    }
    for (const f of flags)
      if (!after.get(cmd).has(f)) record(removed, `${cmd} --${f}`, flagMention(f));
  }
}

function diffSdk() {
  const { from, to } = versions("sdk", SDK_PKG);
  console.log(`\n${SDK_PKG}  ${from} → ${to}`);
  if (from === to) return console.log("  no version change");

  const before = readSdkClients(surfaceDir(SDK_PKG, from));
  const after = readSdkClients(surfaceDir(SDK_PKG, to));

  for (const [client, methods] of Object.entries(after)) {
    for (const m of methods) {
      if (!before[client]?.has(m)) record(added, `${client}.${m}()`, methodMention(m));
    }
  }
  for (const [client, methods] of Object.entries(before)) {
    for (const m of methods) {
      if (!after[client]?.has(m)) record(removed, `${client}.${m}()`, methodMention(m));
    }
  }
}

diffCli();
diffSdk();

/* --- Report --- */

const width = Math.max(0, ...[...added, ...removed].map((e) => e.label.length));

if (added.length) {
  console.log("\nAdded — check-claims cannot see these:\n");
  for (const { label, where } of added) {
    console.log(`  + ${label.padEnd(width)}  ${where ? `documented at ${where}` : "UNDOCUMENTED"}`);
  }
}

if (removed.length) {
  console.log("\nRemoved — check-claims will fail on any the skills still name:\n");
  for (const { label, where } of removed) {
    console.log(
      `  - ${label.padEnd(width)}  ${where ? `STILL NAMED at ${where}` : "unreferenced"}`,
    );
  }
}

if (!added.length && !removed.length) {
  console.log("\nNo change to either surface.");
  process.exit(0);
}

const undocumented = added.filter((e) => !e.where).length;
const dangling = removed.filter((e) => e.where).length;
console.log(
  `\n${added.length} addition(s), ${undocumented} undocumented. ` +
    `${removed.length} removal(s), ${dangling} still named in the skills.`,
);
console.log("Document what matters, then bump documentedPackages in package.json.");

process.exit(FAIL_ON_CHANGE ? 1 : 0);
