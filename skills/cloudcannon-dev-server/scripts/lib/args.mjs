// Shared argv parsing and --help handling for the dev-server scripts.

/**
 * Parses `--flag value`, `--flag=value`, `--bool`, and positionals.
 * Values are always strings; callers coerce.
 */
export function parseArgs(argv = process.argv.slice(2)) {
	const flags = {};
	const positional = [];

	// A repeated flag accumulates into an array rather than overwriting, so
	// `--check /en/ --check /fr/` keeps both.
	const set = (key, value) => {
		if (key in flags) {
			flags[key] = [].concat(flags[key], value);
		} else {
			flags[key] = value;
		}
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("-")) {
			positional.push(arg);
			continue;
		}
		const name = arg.replace(/^--?/, "");
		if (name.includes("=")) {
			const [k, ...rest] = name.split("=");
			set(k, rest.join("="));
			continue;
		}
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("-")) {
			set(name, true);
		} else {
			set(name, next);
			i++;
		}
	}

	return { flags, positional };
}

/** Prints usage and exits 0 when --help/-h is present. */
export function handleHelp(flags, usage) {
	if (flags.help || flags.h) {
		console.log(usage.trim());
		process.exit(0);
	}
}

export function fail(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}

/** Pretty-print JSON unless --json was passed, in which case emit it compactly. */
export function output(value, flags) {
	console.log(JSON.stringify(value, null, flags.json ? 0 : 1));
}
