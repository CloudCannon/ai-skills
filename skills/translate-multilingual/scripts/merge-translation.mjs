#!/usr/bin/env node

/**
 * Merges AI-translated entries from a task file back into the full locale file.
 *
 * Reads the task file produced by prepare-translation.mjs (with `value` fields
 * filled in by the AI), applies translations to the locale file, validates HTML
 * structure, and cleans up the task file.
 *
 * Usage:
 *   node merge-translation.mjs --locale fr [--source rosey] [--input path] [--dry-run]
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let locale = null;
let sourceDir = "rosey";
let inputPath = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if ((arg === "--locale" || arg === "-l") && args[i + 1]) {
		locale = args[++i];
	} else if ((arg === "--source" || arg === "-s") && args[i + 1]) {
		sourceDir = args[++i];
	} else if ((arg === "--input" || arg === "-i") && args[i + 1]) {
		inputPath = args[++i];
	} else if (arg === "--dry-run") {
		dryRun = true;
	} else if (arg === "--help" || arg === "-h") {
		console.log(
			"Usage: node merge-translation.mjs --locale <code> [options]\n\n" +
				"Merge AI translations from task file back into locale file.\n\n" +
				"Options:\n" +
				"  -l, --locale <code>   Locale code (required)\n" +
				"  -s, --source <dir>    Rosey directory (default: rosey)\n" +
				"  -i, --input <path>    Task file path\n" +
				"  --dry-run             Print changes without writing\n" +
				"  -h, --help            Show this help\n",
		);
		process.exit(0);
	}
}

if (!locale) {
	console.error("Error: --locale is required");
	process.exit(1);
}

const localeFilePath = join(sourceDir, "locales", `${locale}.json`);
if (!inputPath) {
	inputPath = join(sourceDir, "locales", `.translation-task-${locale}.json`);
}

// ---------------------------------------------------------------------------
// Read files
// ---------------------------------------------------------------------------

let localeData;
try {
	localeData = JSON.parse(readFileSync(localeFilePath, "utf-8"));
} catch (err) {
	console.error(`Error: Could not read ${localeFilePath}: ${err.message}`);
	process.exit(1);
}

let task;
try {
	task = JSON.parse(readFileSync(inputPath, "utf-8"));
} catch (err) {
	console.error(`Error: Could not read task file ${inputPath}: ${err.message}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// HTML tag validation
// ---------------------------------------------------------------------------

function extractTags(html) {
	const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
	const tags = [];
	let match;
	while ((match = tagPattern.exec(html)) !== null) {
		tags.push(match[0]);
	}
	return tags;
}

function extractTagNames(html) {
	const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)/g;
	const names = [];
	let match;
	while ((match = tagPattern.exec(html)) !== null) {
		names.push(match[1].toLowerCase());
	}
	return names.sort();
}

function validateHtml(key, original, translated) {
	const origNames = extractTagNames(original);
	const transNames = extractTagNames(translated);

	if (origNames.length !== transNames.length) {
		return `Tag count mismatch: original has ${origNames.length} tags, translation has ${transNames.length}`;
	}

	for (let i = 0; i < origNames.length; i++) {
		if (origNames[i] !== transNames[i]) {
			return `Tag mismatch at position ${i}: expected <${origNames[i]}>, got <${transNames[i]}>`;
		}
	}

	// Check that <a> href values are preserved
	const hrefPattern = /<a\s[^>]*href="([^"]*)"[^>]*>/g;
	const origHrefs = [];
	const transHrefs = [];
	let m;
	while ((m = hrefPattern.exec(original)) !== null) origHrefs.push(m[1]);
	hrefPattern.lastIndex = 0;
	while ((m = hrefPattern.exec(translated)) !== null) transHrefs.push(m[1]);

	if (origHrefs.length === transHrefs.length) {
		for (let i = 0; i < origHrefs.length; i++) {
			if (origHrefs[i] !== transHrefs[i]) {
				return `Link href changed: "${origHrefs[i]}" → "${transHrefs[i]}"`;
			}
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Merge untranslated entries
// ---------------------------------------------------------------------------

const warnings = [];
let mergedCount = 0;
let skippedCount = 0;

for (const [key, taskEntry] of Object.entries(task.untranslated || {})) {
	if (!taskEntry.value) {
		skippedCount++;
		continue;
	}

	if (!localeData[key]) {
		warnings.push(`Key "${key}" not found in locale file — skipping`);
		skippedCount++;
		continue;
	}

	const issue = validateHtml(key, taskEntry.original, taskEntry.value);
	if (issue) {
		warnings.push(`${key}: ${issue}`);
	}

	localeData[key].value = taskEntry.value;
	mergedCount++;
}

// ---------------------------------------------------------------------------
// Merge stale entries
// ---------------------------------------------------------------------------

let staleResolvedCount = 0;

for (const [key, taskEntry] of Object.entries(task.stale || {})) {
	if (!taskEntry.value) {
		skippedCount++;
		continue;
	}

	if (!localeData[key]) {
		warnings.push(`Key "${key}" not found in locale file — skipping`);
		skippedCount++;
		continue;
	}

	const issue = validateHtml(key, taskEntry.new_original, taskEntry.value);
	if (issue) {
		warnings.push(`${key}: ${issue}`);
	}

	localeData[key].value = taskEntry.value;
	localeData[key].original = localeData[key]._base_original;
	staleResolvedCount++;
	mergedCount++;
}

// ---------------------------------------------------------------------------
// Sort and write
// ---------------------------------------------------------------------------

const sorted = Object.fromEntries(
	Object.entries(localeData).sort(([a], [b]) => a.localeCompare(b)),
);

const output = JSON.stringify(sorted, null, 2) + "\n";

if (dryRun) {
	console.log("DRY RUN — would write:\n");
	console.log(output);
} else {
	writeFileSync(localeFilePath, output);
	console.log(`Updated ${localeFilePath}`);

	// Clean up task file
	try {
		unlinkSync(inputPath);
		console.log(`Removed task file ${inputPath}`);
	} catch {
		// Task file may have already been removed
	}
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
console.log(`Merged:           ${mergedCount}`);
if (staleResolvedCount > 0) {
	console.log(`  Stale resolved: ${staleResolvedCount}`);
}
if (skippedCount > 0) {
	console.log(`Skipped:          ${skippedCount} (no value provided)`);
}

if (warnings.length > 0) {
	console.log(`\nWarnings (${warnings.length}):`);
	for (const w of warnings) {
		console.log(`  ⚠ ${w}`);
	}
}

if (mergedCount === 0 && skippedCount > 0) {
	console.log(
		"\nNo translations were merged. Did the AI fill in `value` fields in the task file?",
	);
}
