#!/usr/bin/env node

/**
 * Opens a file in the CloudCannon Visual Editor.
 *
 * The app routes on the URL hash, so this navigates straight to the editor —
 * no clicking through the file browser.
 *
 *   #sites/<id>/collections/<collection>:/edit
 *     ?collection=<collection>&path=<source path>&editor=visual&url=<site url>
 *
 * Usage:
 *   node ve-open.mjs --path src/pages/index.md --collection pages --url /en/
 *   node ve-open.mjs --path src/pages/index.md --collection pages --editor content
 */

import { parseArgs, handleHelp, fail } from "./lib/args.mjs";
import { connect, waitForSiteFrame } from "./lib/session.mjs";
import { baseUrl } from "./lib/devserver.mjs";

const USAGE = `
ve-open.mjs — open a file in the Visual Editor

  node ve-open.mjs --path <source file> --collection <name> [--url <site path>]

Flags:
  --path         Source file to edit, repo-relative (e.g. src/pages/index.md)
  --collection   Collection key from cloudcannon.config.yml (e.g. pages)
  --url          Site URL the editor previews (e.g. /en/). Optional but the
                 editor may show a blank preview without it.
  --schema       Schema name (default: default)
  --editor       visual | content (default: visual)
  --site-id      Override the auto-detected site id
  --port         Dev server port (default 10101)
  --timeout      Milliseconds to wait for the site frame (default 45000)
`;

const { flags } = parseArgs();
handleHelp(flags, USAGE);

if (typeof flags.path !== "string") fail("--path is required");
if (typeof flags.collection !== "string") fail("--collection is required");

const { browser, page } = await connect();

// Boot the app first so the site id can be read from its own nav rather than
// hardcoded — it is not always 7.
await page.goto(`${baseUrl(flags)}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

let siteId = flags["site-id"];
if (!siteId) {
	for (let i = 0; i < 20 && !siteId; i++) {
		siteId = await page.evaluate(
			() =>
				document.querySelector('a[href^="#sites/"]')?.getAttribute("href")?.match(/#sites\/(\d+)/)?.[1] ??
				null,
		);
		if (!siteId) await page.waitForTimeout(500);
	}
}
if (!siteId) fail("could not determine the site id — is the dev server serving this site?");

const sourcePath = flags.path.startsWith("/") ? flags.path : `/${flags.path}`;
const params = new URLSearchParams({
	collection: flags.collection,
	path: sourcePath,
	schema: flags.schema ?? "default",
	editor: flags.editor ?? "visual",
});
if (typeof flags.url === "string") params.set("url", flags.url);

const target = `${baseUrl(flags)}/#sites/${siteId}/collections/${flags.collection}:/edit?${params}`;

await page.goto(target, { waitUntil: "domcontentloaded" });

const frame = await waitForSiteFrame(page, { timeoutMs: Number(flags.timeout ?? 45000) });
const count = await frame.evaluate(() => document.querySelectorAll("[data-editable]").length);

console.log(`opened ${flags.path} (site ${siteId})`);
console.log(`url: ${target}`);
console.log(`site frame ready — ${count} editable region(s) present`);

// Detaches the CDP connection without closing the browser, which the next
// script reattaches to. Without this the socket keeps the event loop alive and
// the script never exits.
await browser.close();
