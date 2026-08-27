#!/usr/bin/env node

/**
 * Preprocesses a Rosey locale file for AI translation.
 *
 * Classifies entries as untranslated/stale/current, auto-applies translations
 * from a built-in translation memory (identical originals that are already
 * translated), and writes a slim task file containing only the entries that
 * still need AI work — plus tone/register examples from existing translations.
 *
 * Usage:
 *   node prepare-translation.mjs --locale fr [--source rosey] [--output path] [--examples 5]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let locale = null;
let sourceDir = "rosey";
let outputPath = null;
let exampleCount = 5;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if ((arg === "--locale" || arg === "-l") && args[i + 1]) {
		locale = args[++i];
	} else if ((arg === "--source" || arg === "-s") && args[i + 1]) {
		sourceDir = args[++i];
	} else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
		outputPath = args[++i];
	} else if ((arg === "--examples" || arg === "-e") && args[i + 1]) {
		exampleCount = parseInt(args[++i], 10);
	} else if (arg === "--help" || arg === "-h") {
		console.log(
			"Usage: node prepare-translation.mjs --locale <code> [options]\n\n" +
				"Preprocess a Rosey locale file for AI translation.\n\n" +
				"Options:\n" +
				"  -l, --locale <code>   Locale code (required)\n" +
				"  -s, --source <dir>    Rosey directory (default: rosey)\n" +
				"  -o, --output <path>   Task file output path\n" +
				"  -e, --examples <n>    Number of tone examples (default: 5)\n" +
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
if (!outputPath) {
	outputPath = join(sourceDir, "locales", `.translation-task-${locale}.json`);
}

// ---------------------------------------------------------------------------
// Read locale file
// ---------------------------------------------------------------------------

let localeData;
try {
	localeData = JSON.parse(readFileSync(localeFilePath, "utf-8"));
} catch (err) {
	console.error(`Error: Could not read ${localeFilePath}: ${err.message}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Classify entries
// ---------------------------------------------------------------------------

const untranslated = {};
const stale = {};
const current = {};

for (const [key, entry] of Object.entries(localeData)) {
	const { original, value, _base_original } = entry;

	if (_base_original !== undefined && original !== _base_original) {
		stale[key] = entry;
	} else if (value === original) {
		untranslated[key] = entry;
	} else {
		current[key] = entry;
	}
}

// ---------------------------------------------------------------------------
// Translation memory: map original text -> translated value from current entries
// ---------------------------------------------------------------------------

const memory = new Map();
for (const [, entry] of Object.entries(current)) {
	if (!memory.has(entry.original)) {
		memory.set(entry.original, entry.value);
	}
}

// ---------------------------------------------------------------------------
// Auto-apply translation memory to untranslated entries
// ---------------------------------------------------------------------------

const autoApplied = {};
const needsAI = {};

for (const [key, entry] of Object.entries(untranslated)) {
	const memorized = memory.get(entry.original);
	if (memorized && memorized !== entry.original) {
		autoApplied[key] = { ...entry, value: memorized };
	} else {
		needsAI[key] = entry;
	}
}

// Write auto-applied translations back to the locale data
for (const [key, entry] of Object.entries(autoApplied)) {
	localeData[key] = entry;
}

// If there were auto-applied entries, persist them to the locale file now
if (Object.keys(autoApplied).length > 0) {
	const sorted = Object.fromEntries(
		Object.entries(localeData).sort(([a], [b]) => a.localeCompare(b)),
	);
	mkdirSync(dirname(localeFilePath), { recursive: true });
	writeFileSync(localeFilePath, JSON.stringify(sorted, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Pick tone/register examples from current translations
// ---------------------------------------------------------------------------

function pickExamples(currentEntries, count) {
	const entries = Object.entries(currentEntries);
	if (entries.length === 0) return [];

	// Prefer entries with meaningful text (not just brand names / single words)
	const scored = entries
		.map(([key, entry]) => {
			const textLen = entry.original.replace(/<[^>]*>/g, "").trim().length;
			return { key, original: entry.original, value: entry.value, textLen };
		})
		.filter((e) => e.textLen > 3 && e.original !== e.value)
		.sort((a, b) => {
			// Prefer medium-length strings (10-80 chars) as they show tone best
			const aScore = a.textLen >= 10 && a.textLen <= 80 ? 1 : 0;
			const bScore = b.textLen >= 10 && b.textLen <= 80 ? 1 : 0;
			return bScore - aScore || a.key.localeCompare(b.key);
		});

	// Pick from diverse namespace prefixes
	const seen = new Set();
	const picked = [];
	for (const entry of scored) {
		const prefix = entry.key.split(":")[0];
		if (!seen.has(prefix) && picked.length < count) {
			seen.add(prefix);
			picked.push({
				key: entry.key,
				original: entry.original,
				value: entry.value,
			});
		}
	}

	// Fill remaining slots if we didn't get enough from distinct prefixes
	for (const entry of scored) {
		if (picked.length >= count) break;
		if (!picked.some((p) => p.key === entry.key)) {
			picked.push({
				key: entry.key,
				original: entry.original,
				value: entry.value,
			});
		}
	}

	return picked.slice(0, count);
}

const toneExamples = pickExamples(current, exampleCount);

// ---------------------------------------------------------------------------
// Build task file
// ---------------------------------------------------------------------------

const taskUntranslated = {};
for (const [key, entry] of Object.entries(needsAI)) {
	taskUntranslated[key] = { original: entry.original };
}

const taskStale = {};
for (const [key, entry] of Object.entries(stale)) {
	taskStale[key] = {
		old_original: entry.original,
		new_original: entry._base_original,
		old_value: entry.value,
	};
}

const task = {
	_meta: {
		locale,
		source_file: localeFilePath,
		auto_applied: Object.keys(autoApplied).length,
		tone_examples: toneExamples,
	},
	untranslated: taskUntranslated,
	stale: taskStale,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(task, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const totalKeys = Object.keys(localeData).length;
const currentCount = Object.keys(current).length;
const untranslatedCount = Object.keys(untranslated).length;
const staleCount = Object.keys(stale).length;
const autoAppliedCount = Object.keys(autoApplied).length;
const needsAICount = Object.keys(needsAI).length;

console.log(`Locale: ${locale} (${totalKeys} total keys)`);
console.log(`  Current (skip):        ${currentCount}`);
console.log(`  Untranslated:          ${untranslatedCount}`);
console.log(`    Auto-applied (TM):   ${autoAppliedCount}`);
console.log(`    Needs AI:            ${needsAICount}`);
console.log(`  Stale:                 ${staleCount}`);
console.log(`  Total for AI:          ${needsAICount + staleCount}`);
console.log("");

if (autoAppliedCount > 0) {
	console.log(
		`Translation memory applied ${autoAppliedCount} entries and updated ${localeFilePath}`,
	);
}

if (needsAICount + staleCount === 0) {
	console.log("Nothing to translate — all entries are current.");
} else {
	console.log(`Task file written to ${outputPath}`);
}
