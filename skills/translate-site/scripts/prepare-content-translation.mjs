#!/usr/bin/env node

/**
 * Preprocesses split-by-directory content collection files for AI translation.
 *
 * Compares locale content files against the source-language files, identifies
 * which files need translation, extracts translatable frontmatter fields and
 * body content into a task manifest. The AI fills in translations, then
 * merge-content-translation.mjs patches them back.
 *
 * Usage:
 *   node prepare-content-translation.mjs --source-dir src/content/blog --locale-dir src/content/blog_fr --locale fr
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let sourceDir = null;
let localeDir = null;
let locale = null;
let outputPath = null;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--source-dir" && args[i + 1]) {
		sourceDir = args[++i];
	} else if (arg === "--locale-dir" && args[i + 1]) {
		localeDir = args[++i];
	} else if ((arg === "--locale" || arg === "-l") && args[i + 1]) {
		locale = args[++i];
	} else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
		outputPath = args[++i];
	} else if (arg === "--help" || arg === "-h") {
		console.log(
			"Usage: node prepare-content-translation.mjs [options]\n\n" +
				"Preprocess content collection files for AI translation.\n\n" +
				"Options:\n" +
				"  --source-dir <dir>    Source content directory (e.g. src/content/blog)\n" +
				"  --locale-dir <dir>    Locale content directory (e.g. src/content/blog_fr)\n" +
				"  -l, --locale <code>   Locale code (required)\n" +
				"  -o, --output <path>   Task manifest output path\n" +
				"  -h, --help            Show this help\n",
		);
		process.exit(0);
	}
}

if (!locale) {
	console.error("Error: --locale is required");
	process.exit(1);
}
if (!sourceDir) {
	console.error("Error: --source-dir is required");
	process.exit(1);
}
if (!localeDir) {
	console.error("Error: --locale-dir is required");
	process.exit(1);
}
if (!outputPath) {
	outputPath = join(
		dirname(localeDir),
		`.translation-task-${locale}-content.json`,
	);
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

const CONTENT_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

function splitFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { raw: "", body: content, fields: {} };
	return {
		raw: match[1],
		body: match[2],
		fields: parseFrontmatterFields(match[1]),
	};
}

/**
 * Parses YAML frontmatter into flat dot-notation key-value pairs.
 * Only extracts simple scalar string values (not arrays, booleans, dates, etc.).
 */
function parseFrontmatterFields(yaml) {
	const fields = {};
	const lines = yaml.split("\n");
	const indentStack = [{ indent: -1, path: "" }];

	for (const line of lines) {
		if (line.trim() === "" || line.trim().startsWith("#")) continue;
		// Skip array items
		if (line.trim().startsWith("- ")) continue;

		const indentMatch = line.match(/^(\s*)/);
		const indent = indentMatch ? indentMatch[1].length : 0;
		const keyValueMatch = line.match(
			/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/,
		);
		if (!keyValueMatch) continue;

		const key = keyValueMatch[2];
		const rawValue = keyValueMatch[3].trim();

		// Pop indent stack to find parent
		while (
			indentStack.length > 1 &&
			indentStack[indentStack.length - 1].indent >= indent
		) {
			indentStack.pop();
		}

		const parentPath = indentStack[indentStack.length - 1].path;
		const fullPath = parentPath ? `${parentPath}.${key}` : key;

		if (rawValue === "" || rawValue === ">" || rawValue === "|") {
			// Mapping or block scalar — push as parent context
			indentStack.push({ indent, path: fullPath });
		} else {
			fields[fullPath] = rawValue;
			indentStack.push({ indent, path: fullPath });
		}
	}

	return fields;
}

// ---------------------------------------------------------------------------
// Field classification
// ---------------------------------------------------------------------------

const STRUCTURAL_FIELD_NAMES = new Set([
	"_schema",
	"_name",
	"_uuid",
	"_bookshop_name",
	"date",
	"publish_date",
	"created_date",
	"updated_date",
	"tags",
	"categories",
	"author",
	"authors",
	"image",
	"thumb_image_path",
	"featured_image",
	"canonical_url",
	"href",
	"url",
	"slug",
	"full_slug",
	"open_graph_type",
	"author_twitter_handle",
	"no_index",
	"draft",
	"published",
	"layout",
	"permalink",
]);

function isStructuralField(dottedPath, value) {
	const leaf = dottedPath.split(".").pop();

	if (leaf.startsWith("_")) return true;
	if (STRUCTURAL_FIELD_NAMES.has(leaf)) return true;
	if (STRUCTURAL_FIELD_NAMES.has(dottedPath)) return true;

	// Path-like values
	if (typeof value === "string") {
		if (value.startsWith("/") || value.startsWith("http")) return true;
		// Booleans
		if (value === "true" || value === "false") return true;
		// ISO dates
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
		// Numbers
		if (/^\d+(\.\d+)?$/.test(value)) return true;
	}

	return false;
}

function isTranslatableField(dottedPath, value) {
	if (isStructuralField(dottedPath, value)) return false;
	// Must be a non-empty string
	if (typeof value !== "string" || value.trim() === "") return false;
	return true;
}

// ---------------------------------------------------------------------------
// Scan files
// ---------------------------------------------------------------------------

function listContentFiles(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => CONTENT_EXTENSIONS.has(extname(f).toLowerCase()))
		.sort();
}

const sourceFiles = listContentFiles(sourceDir);
const localeFiles = listContentFiles(localeDir);

const manifest = {
	_meta: {
		locale,
		source_dir: sourceDir,
		locale_dir: localeDir,
	},
	files: {},
};

let untranslatedCount = 0;
let translatedCount = 0;
let noSourceCount = 0;

for (const filename of localeFiles) {
	const localePath = join(localeDir, filename);
	const sourcePath = join(sourceDir, filename);

	if (!existsSync(sourcePath)) {
		manifest.files[filename] = { status: "no_source" };
		noSourceCount++;
		continue;
	}

	const sourceContent = readFileSync(sourcePath, "utf-8");
	const localeContent = readFileSync(localePath, "utf-8");

	const sourceParsed = splitFrontmatter(sourceContent);
	const localeParsed = splitFrontmatter(localeContent);

	// Find translatable frontmatter fields that still match the source
	const translatableFields = {};
	let hasUntranslatedFields = false;

	for (const [path, sourceValue] of Object.entries(sourceParsed.fields)) {
		if (!isTranslatableField(path, sourceValue)) continue;

		const localeValue = localeParsed.fields[path];
		if (localeValue === sourceValue) {
			translatableFields[path] = sourceValue;
			hasUntranslatedFields = true;
		}
	}

	const bodyIdentical =
		sourceParsed.body.trim() !== "" &&
		localeParsed.body.trim() === sourceParsed.body.trim();

	if (!hasUntranslatedFields && !bodyIdentical) {
		manifest.files[filename] = { status: "already_translated" };
		translatedCount++;
		continue;
	}

	const entry = {
		status: "untranslated",
		locale_path: localePath,
		source_path: sourcePath,
		translatable_frontmatter: translatableFields,
	};

	if (bodyIdentical) {
		entry.body = sourceParsed.body;
	}

	manifest.files[filename] = entry;
	untranslatedCount++;
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const total = localeFiles.length;
console.log(`Content collection: ${localeDir} (${total} files)`);
console.log(`  Already translated:  ${translatedCount}`);
console.log(`  Needs translation:   ${untranslatedCount}`);
if (noSourceCount > 0) {
	console.log(`  No source file:      ${noSourceCount}`);
}
console.log("");

if (untranslatedCount === 0) {
	console.log("Nothing to translate — all files are already translated.");
} else {
	console.log(`Task manifest written to ${outputPath}`);
}
