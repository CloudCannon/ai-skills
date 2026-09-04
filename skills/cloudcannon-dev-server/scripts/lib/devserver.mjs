// HTTP client for the `cloudcannon dev` server API.
// Every route here is unauthenticated — `cloudcannon dev` never touches the SDK.

export const DEFAULT_PORT = 10101;

export function baseUrl(flags = {}) {
	const port = flags.port ?? process.env.CC_DEV_PORT ?? DEFAULT_PORT;
	return `http://localhost:${port}`;
}

async function req(url, init) {
	let res;
	try {
		res = await fetch(url, init);
	} catch (err) {
		throw new Error(
			`cannot reach the dev server at ${url} — is \`cloudcannon dev\` running? (${err.message})`,
		);
	}
	return res;
}

/** { sourceFiles, outputDir, siteName, userName } */
export async function details(flags) {
	const res = await req(`${baseUrl(flags)}/__api/details`);
	if (!res.ok) throw new Error(`/__api/details returned ${res.status}`);
	return res.json();
}

/**
 * Percent-encodes each segment of a source path, separators kept.
 *
 * `#` and `?` in a filename are a fragment and a query to a URL parser, so a
 * raw path addresses a shorter one: a POST to `notes#draft.md` returns 200 and
 * writes `notes`. The server decodes escapes, and /__api/details hands out such
 * names.
 */
function encodePath(path) {
	return stripLeadingSlash(path).split("/").map(encodeURIComponent).join("/");
}

/** { content, file_size, last_modified } for a source-relative path. */
export async function fileInfo(path, flags) {
	const res = await req(`${baseUrl(flags)}/__api/file/${encodePath(path)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`/__api/file returned ${res.status}`);
	return res.json();
}

/** Writes a file to disk exactly as the CMS would. */
export async function upload(path, content, flags) {
	const res = await req(`${baseUrl(flags)}/__api/upload/${encodePath(path)}`, {
		method: "POST",
		body: content,
	});
	if (res.status === 403) {
		throw new Error("app sync is disabled — restart the dev server without --no-app-sync");
	}
	if (!res.ok) throw new Error(`/__api/upload returned ${res.status}`);
	return true;
}

/**
 * Fetches a URL from the served output. Returns { status, body, resolved }.
 *
 * The dev server serves files, not directories — it has no index resolution, so
 * a request for `/en/` fails with 500 (EISDIR bubbling up), NOT 404. A directory
 * path is retried as `<path>index.html` so callers can use natural site URLs.
 */
export async function fetchOutput(path, flags) {
	const url = path.startsWith("/") ? path : `/${path}`;
	const res = await req(`${baseUrl(flags)}${url}`);
	if (res.ok) return { status: res.status, body: await res.text(), resolved: url };

	if (url.endsWith("/")) {
		const indexUrl = `${url}index.html`;
		const retry = await req(`${baseUrl(flags)}${indexUrl}`);
		if (retry.ok) return { status: retry.status, body: await retry.text(), resolved: indexUrl };
	}

	return { status: res.status, body: "", resolved: url };
}

/**
 * Subscribes to the SSE event stream, invoking onEvent({ event, data }).
 * Events: output-change, file-create, file-edit, file-delete (200ms debounced).
 * Resolves when `timeoutMs` elapses or onEvent returns true.
 */
export async function watchEvents({ timeoutMs = 15000, onEvent, flags = {} }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	const res = await req(`${baseUrl(flags)}/__api/events`, {
		signal: controller.signal,
		headers: { Accept: "text/event-stream" },
	});

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// SSE frames are separated by a blank line.
			const frames = buffer.split("\n\n");
			buffer = frames.pop() ?? "";

			for (const frame of frames) {
				const event = frame.match(/^event: (.*)$/m)?.[1];
				const raw = frame.match(/^data: (.*)$/m)?.[1];
				if (!event) continue;
				let data;
				try {
					data = raw ? JSON.parse(raw) : null;
				} catch {
					data = raw;
				}
				if (onEvent({ event, data }) === true) return;
			}
		}
	} catch (err) {
		if (err.name !== "AbortError") throw err;
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

function stripLeadingSlash(p) {
	return p.replace(/^\/+/, "");
}
