#!/usr/bin/env node

/**
 * Runs arbitrary JavaScript inside a frame of the Visual Editor and prints the
 * JSON result.
 *
 * This is the escape hatch. Every other ve-* script is a convenience wrapper
 * over this — when a page is shaped in a way the other scripts do not cover,
 * come here rather than adding a flag.
 *
 * Usage:
 *   node ve-eval.mjs --expr "document.querySelectorAll('[data-rosey]').length"
 *   node ve-eval.mjs --file ./query.js --frame app
 */

import { readFileSync } from "node:fs";
import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, resolveFrame } from "./lib/session.mjs";

const USAGE = `
ve-eval.mjs — run JS inside the editor and print the JSON result

  node ve-eval.mjs --expr "<javascript>" [--frame site|app|host]
  node ve-eval.mjs --file <path.js>      [--frame site|app|host]

Flags:
  --expr    Expression to evaluate. Wrap multi-statement code in an IIFE.
  --file    Read the expression from a file instead.
  --frame   site (default, the page being edited), app (the CC chrome),
            or host (the editor.html shim between them).

The result must be JSON-serialisable — return plain data, not DOM nodes.
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

const source =
	typeof flags.file === "string"
		? readFileSync(flags.file, "utf-8")
		: typeof flags.expr === "string"
			? flags.expr
			: null;

if (!source) fail("one of --expr or --file is required");

const { browser, page } = await connect();
const frame = await resolveFrame(page, flags.frame ?? "site");

try {
	const result = await frame.evaluate(`(() => (${source}))()`);
	console.log(JSON.stringify(result, null, 1));
} catch (err) {
	// A bare statement (rather than an expression) fails the wrapper above;
	// retry as a function body so `const x = ...; return x` also works.
	try {
		const result = await frame.evaluate(`(() => { ${source} })()`);
		console.log(JSON.stringify(result, null, 1));
	} catch (err2) {
		await browser.close();
		fail(`evaluation failed: ${err2.message.split("\n")[0]}`);
	}
}

await browser.close();
