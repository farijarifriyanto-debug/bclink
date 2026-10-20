// Global flags sit before the command (like Together Link); everything after a tool name passes through.
export function parseArgv(argv) {
  const out = { apiKey: undefined, main: undefined, help: false, version: false, command: undefined, rest: [] };
  const value = (flag, i) => {
    if (argv[i + 1] === undefined) throw new Error(`${flag} butuh nilai`);
    return argv[i + 1];
  };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api-key') { out.apiKey = value(a, i); i++; }
    else if (a.startsWith('--api-key=')) out.apiKey = a.slice('--api-key='.length);
    else if (a === '--main') { out.main = value(a, i); i++; }
    else if (a.startsWith('--main=')) out.main = a.slice('--main='.length);
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a === '-v' || a === '--version') out.version = true;
    else break;
  }
  if (i < argv.length) {
    out.command = argv[i];
    out.rest = argv.slice(i + 1);
  }
  return out;
}

// configure accepts --api-key after the command as well, e.g. `bclink configure --api-key bc_live_...`.
export function takeFlag(rest, name) {
  const idx = rest.indexOf(name);
  if (idx === -1) return { value: undefined, rest };
  if (rest[idx + 1] === undefined) throw new Error(`${name} butuh nilai`);
  return { value: rest[idx + 1], rest: [...rest.slice(0, idx), ...rest.slice(idx + 2)] };
}
