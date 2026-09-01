#!/usr/bin/env node

/**
 * Merges AI-translated content back into locale collection MDX/MD files.
 *
 * Reads the task manifest produced by prepare-content-translation.mjs (with
 * translated frontmatter fields and body filled in by the AI), patches the
 * translations into the locale files, and validates structural integrity.
 *
 * Usage:
 *   node merge-content-translation.mjs --input .translation-task-fr-content.json [--dry-run]
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let inputPath = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if ((arg === "--input" || arg === "-i") && args[i + 1]) {
		inputPath = args[++i];
	} else if (arg === "--dry-run") {
		dryRun = true;
	} else if (arg === "--help" || arg === "-h") {
		console.log(
			"Usage: node merge-content-translation.mjs --input <path> [--dry-run]\n\n" +
				"Merge AI translations from task manifest into content files.\n\n" +
				"Options:\n" +
				"  -i, --input <path>    Task manifest path (required)\n" +
				"  --dry-run             Print changes without writing\n" +
				"  -h, --help            Show this help\n",
		);
		process.exit(0);
	}
}

if (!inputPath) {
	console.error("Error: --input is required");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Read manifest
// ---------------------------------------------------------------------------

let manifest;
try {
	manifest = JSON.parse(readFileSync(inputPath, "utf-8"));
} catch (err) {
	console.error(`Error: Could not read manifest ${inputPath}: ${err.message}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Frontmatter patching
// ---------------------------------------------------------------------------

/**
 * Replaces a frontmatter field value in raw YAML text using dot-notation path.
 *
 * For a path like "seo.page_description", finds the `page_description:` line
 * nested under `seo:` at the correct indentation and replaces its value.
 */
function patchFrontmatterField(yaml, dottedPath, newValue) {
	const segments = dottedPath.split(".");
	const lines = yaml.split("\n");
	const result = [];
	let targetIndent = 0;
	let segmentIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const indentMatch = line.match(/^(\s*)/);
		const indent = indentMatch ? indentMatch[1].length : 0;
		const keyMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:(.*)/);

		if (keyMatch && segmentIndex < segments.length) {
			const lineIndent = keyMatch[1].length;
			const lineKey = keyMatch[2];
			const lineRest = keyMatch[3];

			if (lineKey === segments[segmentIndex] && lineIndent === targetIndent) {
				if (segmentIndex === segments.length - 1) {
					// This is the target field — replace its value
					const escapedValue = escapeYamlValue(newValue);
					result.push(`${keyMatch[1]}${lineKey}: ${escapedValue}`);
					segmentIndex++; // done
					continue;
				} else {
					// Intermediate parent — advance to next segment
					segmentIndex++;
					targetIndent = lineIndent + 2;
				}
			}
		}

		result.push(line);
	}

	if (segmentIndex < segments.length) {
		return { yaml, patched: false };
	}

	return { yaml: result.join("\n"), patched: true };
}

function escapeYamlValue(value) {
	if (
		value.includes(":") ||
		value.includes("#") ||
		value.includes("'") ||
		value.includes('"') ||
		value.includes("\n") ||
		value.startsWith(" ") ||
		value.endsWith(" ") ||
		value.startsWith("{") ||
		value.startsWith("[")
	) {
		// Use double-quoted YAML string with escaped inner quotes
		const escaped = value
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\n/g, "\\n");
		return `"${escaped}"`;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Process files
// ---------------------------------------------------------------------------

const warnings = [];
let patchedCount = 0;
let skippedCount = 0;

for (const [filename, entry] of Object.entries(manifest.files)) {
	if (entry.status !== "untranslated") continue;

	const hasTranslatedFrontmatter =
		entry.translated_frontmatter &&
		Object.keys(entry.translated_frontmatter).length > 0;
	const hasTranslatedBody = typeof entry.translated_body === "string";

	if (!hasTranslatedFrontmatter && !hasTranslatedBody) {
		skippedCount++;
		continue;
	}

	const localePath = entry.locale_path;
	let content;
	try {
		content = readFileSync(localePath, "utf-8");
	} catch (err) {
		warnings.push(`${filename}: Could not read ${localePath}: ${err.message}`);
		skippedCount++;
		continue;
	}

	// Split into frontmatter + body
	const fmMatch = content.match(
		/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/,
	);
	if (!fmMatch) {
		warnings.push(`${filename}: Could not parse frontmatter`);
		skippedCount++;
		continue;
	}

	let frontmatterYaml = fmMatch[2];
	let body = fmMatch[4];

	// Patch frontmatter fields
	if (hasTranslatedFrontmatter) {
		for (const [path, translatedValue] of Object.entries(
			entry.translated_frontmatter,
		)) {
			const result = patchFrontmatterField(
				frontmatterYaml,
				path,
				translatedValue,
			);
			if (result.patched) {
				frontmatterYaml = result.yaml;
			} else {
				warnings.push(
					`${filename}: Could not patch field "${path}" — field not found in YAML`,
				);
			}
		}
	}

	// Replace body
	if (hasTranslatedBody) {
		body = entry.translated_body;
		if (!body.endsWith("\n")) body += "\n";
	}

	const output = `${fmMatch[1]}${frontmatterYaml}${fmMatch[3]}${body}`;

	// Validate: frontmatter still has opening and closing ---
	if (!output.startsWith("---") || !output.includes("\n---\n")) {
		warnings.push(
			`${filename}: Output appears to have broken frontmatter structure`,
		);
	}

	if (dryRun) {
		console.log(`\n--- ${filename} ---`);
		console.log(output);
	} else {
		writeFileSync(localePath, output);
	}

	patchedCount++;
}

// Clean up manifest
if (!dryRun && patchedCount > 0) {
	try {
		unlinkSync(inputPath);
		console.log(`Removed task manifest ${inputPath}`);
	} catch {
		// Already removed
	}
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
console.log(`Patched:  ${patchedCount} files`);
if (skippedCount > 0) {
	console.log(`Skipped:  ${skippedCount} (no translations provided)`);
}

if (warnings.length > 0) {
	console.log(`\nWarnings (${warnings.length}):`);
	for (const w of warnings) {
		console.log(`  ⚠ ${w}`);
	}
}
