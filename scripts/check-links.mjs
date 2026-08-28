#!/usr/bin/env node
/**
 * Validates the cross-reference graph that holds the skills together.
 *
 * Checks, in order of how quietly they break:
 *   1. Every relative link resolves to a file or directory that exists.
 *   2. Every `#anchor` on a link resolves to a real heading in the target file.
 *      Most internal links carry one, and they break silently when a heading is
 *      reworded — nothing else in CI notices.
 *   3. Every SKILL.md has `name` and `description` frontmatter, and `name`
 *      matches its directory (the plugin loader keys off the directory; agents
 *      key off `name`, so a mismatch routes to a skill that appears missing).
 *
 * Usage: node scripts/check-links.mjs [--quiet]
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import GithubSlugger from "github-slugger";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRS = new Set(["node_modules", ".git", ".github"]);
const QUIET = process.argv.includes("--quiet");
const SENTINEL = "\u0000";

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === ".md") out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * Blanks out fenced code blocks while preserving line numbering, so a bash
 * comment like `# v1` is never mistaken for a heading and a link inside a
 * sample snippet is never checked.
 */
function stripFences(lines) {
  let fence = null;
  return lines.map((line) => {
    const marker = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (marker && marker[1].startsWith(fence[0]) && marker[1].length >= fence.length) fence = null;
      return "";
    }
    if (marker) {
      fence = marker[1];
      return "";
    }
    return line;
  });
}

const stripInlineCode = (line) => line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

/**
 * Reduces a heading's markdown to the plain text GitHub renders, which is what
 * the slugger then operates on. Code spans are parked first so a heading like
 * `<head>` keeps its literal text instead of being stripped as an HTML tag.
 */
function headingText(raw) {
  const spans = [];
  let text = raw.replace(/`([^`]*)`/g, (_, inner) => SENTINEL + (spans.push(inner) - 1) + SENTINEL);

  text = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    // Asterisks only: underscores are literal here (`key_values`, `_uuid`).
    .replace(/\*{1,3}/g, "");

  return text
    .replace(new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g"), (_, i) => spans[Number(i)])
    .trim();
}

const anchorCache = new Map();

/** Slug rules come from github-slugger — the same implementation GitHub uses. */
function anchorsFor(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);

  const slugger = new GithubSlugger();
  const anchors = new Set();

  for (const line of stripFences(readFileSync(file, "utf8").split("\n"))) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (!heading) continue;

    const text = headingText(heading[1]);
    // Called for every heading in order: the slugger tracks repeats to append
    // the -1, -2 suffixes GitHub uses, so skipping one would shift the rest.
    if (text) anchors.add(slugger.slug(text));
  }

  anchorCache.set(file, anchors);
  return anchors;
}

function frontmatter(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  if (lines[0].trim() !== "---") return null;

  const end = lines.indexOf("---", 1);
  if (end === -1) return null;

  const keys = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) keys[m[1]] = m[2].trim();
  }
  return keys;
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

const errors = [];
const files = walk(ROOT);
let linkCount = 0;
let anchorCount = 0;

const report = (file, line, message) =>
  errors.push(`${relative(ROOT, file)}:${line}  ${message}`);

for (const file of files) {
  const lines = stripFences(readFileSync(file, "utf8").split("\n"));

  lines.forEach((raw, i) => {
    const line = stripInlineCode(raw);
    const lineNo = i + 1;

    for (const [, target] of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^(https?:|mailto:|tel:|data:)/i.test(target)) continue;

      const [path, anchor] = target.split("#");
      linkCount++;

      // Same-file anchor, e.g. [Chunking](#chunking-large-migrations)
      if (path === "") {
        if (!anchor) continue;
        anchorCount++;
        if (!anchorsFor(file).has(anchor)) {
          report(file, lineNo, `anchor #${anchor} not found in this file`);
        }
        continue;
      }

      const resolved = resolve(dirname(file), decodeURIComponent(path));
      if (!existsSync(resolved)) {
        report(file, lineNo, `broken link -> ${target}`);
        continue;
      }

      if (!anchor) continue;
      anchorCount++;

      if (statSync(resolved).isDirectory() || extname(resolved) !== ".md") {
        report(file, lineNo, `anchor #${anchor} on a non-markdown target -> ${target}`);
        continue;
      }

      if (!anchorsFor(resolved).has(anchor)) {
        report(file, lineNo, `anchor #${anchor} not found in ${path}`);
      }
    }
  });
}

// SKILL.md frontmatter contract
const skillFiles = files.filter((f) => basename(f) === "SKILL.md");

for (const file of skillFiles) {
  const fm = frontmatter(file);
  if (!fm) {
    report(file, 1, "missing YAML frontmatter");
    continue;
  }

  const dir = basename(dirname(file));
  if (!fm.name) report(file, 1, "frontmatter missing `name`");
  else if (fm.name !== dir) {
    report(file, 1, `frontmatter name "${fm.name}" does not match directory "${dir}"`);
  }

  // A folded scalar (`description: >-`) leaves the value on following lines.
  if (!("description" in fm)) report(file, 1, "frontmatter missing `description`");
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found:\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error(
    `\nChecked ${linkCount} relative links (${anchorCount} with anchors) across ${files.length} files, plus ${skillFiles.length} SKILL.md files.\n`,
  );
  process.exit(1);
}

if (!QUIET) {
  console.log(
    `check-links: ${linkCount} relative links (${anchorCount} with anchors) across ${files.length} files, plus ${skillFiles.length} SKILL.md files — all resolve.`,
  );
}
