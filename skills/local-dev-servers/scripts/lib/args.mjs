// Shared argv parsing. Deliberately duplicated rather than shared with other
// skills: a skill must work when installed on its own.

export function parseArgs(argv = process.argv.slice(2)) {
	const flags = {};
	const positional = [];

	const set = (key, value) => {
		if (key in flags) flags[key] = [].concat(flags[key], value);
		else flags[key] = value;
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
		if (next === undefined || next.startsWith("-")) set(name, true);
		else {
			set(name, next);
			i++;
		}
	}

	return { flags, positional };
}

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

export function relTime(iso) {
	const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (secs < 60) return `${secs}s ago`;
	if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
	return `${Math.round(secs / 3600)}h ago`;
}
