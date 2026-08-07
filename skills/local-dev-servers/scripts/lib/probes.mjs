// Identity probes: ask a port what it is, rather than trusting the number.
//
// Ordered most-specific first — a loose probe placed early will claim every
// server it is tried against.
//
// Add a probe by finding a path unique to that server and a body signature to
// confirm it. Keep `match` strict.

const PROBES = [
	{
		id: "cloudcannon",
		checksBody: true,
		name: "CloudCannon dev server",
		path: "/__api/details",
		match: (res, body) => res.ok && body.includes("outputDir"),
		describe: (body) => {
			try {
				const j = JSON.parse(body);
				return `site "${j.siteName}", output ${j.outputDir}`;
			} catch {
				return null;
			}
		},
	},
	{
		id: "vite",
		checksBody: true,
		name: "Vite (Astro, SvelteKit, etc.)",
		path: "/@vite/client",
		match: (res, body) => res.ok && body.includes("vite"),
	},
	{
		id: "nextjs",
		name: "Next.js",
		// Next.js 16+ serves this by default. Checks content type as well as
		// status: an MCP endpoint answers JSON or an event stream, so a server
		// that returns 200 text/html for every path does not qualify.
		path: "/_next/mcp",
		match: (res) => {
			if (!res.ok && res.status !== 405) return false;
			const type = res.headers.get("content-type") ?? "";
			return type.includes("json") || type.includes("event-stream");
		},
	},
	{
		id: "cdp",
		checksBody: true,
		name: "Chrome DevTools endpoint",
		path: "/json/version",
		match: (res, body) => res.ok && body.includes("webSocketDebuggerUrl"),
		describe: (body) => {
			try {
				return JSON.parse(body).Browser;
			} catch {
				return null;
			}
		},
	},
];

async function tryFetch(url, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
		const body = await res.text().catch(() => "");
		return { res, body };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Asks a port what it is. Returns { id, name, detail } or a generic result when
 * something responds but matches no known signature.
 */
export async function identify(port, { timeoutMs = 1500 } = {}) {
	const base = `http://localhost:${port}`;

	// Some servers answer 200 to every path, which makes "this endpoint exists"
	// meaningless and lets the first probe claim them. Detect that up front by
	// asking for a path nothing should serve.
	const nonsense = await tryFetch(`${base}/__probe-does-not-exist-${Date.now()}`, timeoutMs);
	const answersEverything = Boolean(nonsense?.res.ok);

	for (const probe of PROBES) {
		const hit = await tryFetch(`${base}${probe.path}`, timeoutMs);
		if (!hit) continue;
		// Against a catch-all server, only trust probes that verify something in
		// the body rather than the mere existence of the path.
		if (answersEverything && !probe.checksBody) continue;
		if (probe.match(hit.res, hit.body)) {
			return {
				id: probe.id,
				name: probe.name,
				detail: probe.describe?.(hit.body) ?? null,
			};
		}
	}

	const root = await tryFetch(base, timeoutMs);
	if (!root) return { id: null, name: "not responding to HTTP", detail: null };

	const title = root.body.match(/<title[^>]*>([^<]{1,60})/i)?.[1]?.trim();
	return {
		id: "unknown",
		name: "an HTTP server of unknown type",
		detail: title ? `page title "${title}"` : `HTTP ${root.res.status}`,
	};
}

export const knownProbes = PROBES.map((p) => ({ id: p.id, name: p.name, path: p.path }));
