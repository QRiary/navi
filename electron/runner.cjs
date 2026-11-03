/**
 * RUNNING EXTERNAL PROGRAMS (QMK CLI, git, PowerShell) — only with validated arguments.
 *
 * Safety rules:
 *  • no user strings “as is” on the command line: every argument is checked
 *    against a character allowlist (validateArg), paths separately (validatePath);
 *  • QMK MSYS runs as bash.exe --login -c '<command>' — arguments in single quotes,
 *    a single quote inside an argument is not allowed;
 *  • output goes line by line to the interface; the process can be stopped.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ARG_RE = /^[A-Za-z0-9_./:=+,@%-]{1,300}$/;

function validateArg(arg) {
  if (typeof arg !== 'string' || !ARG_RE.test(arg)) throw new Error(`argument is not allowed: ${String(arg).slice(0, 60)}`);
  return arg;
}

/** Path to a file/folder: normal Windows path characters, no quotes or control characters. */
function validatePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 400 || /['"`$;&|<>\r\n\x00]/.test(p)) throw new Error('path is not allowed');
  return p;
}

/** C:\Users\x → /c/Users/x (for bash in MSYS). */
function toMsysPath(p) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  const m = abs.match(/^([A-Za-z]):\/(.*)$/);
  return m ? `/${m[1].toLowerCase()}/${m[2]}` : abs;
}

function findMsys(configured) {
  const candidates = [configured, 'C:\\QMK_MSYS'].filter(Boolean);
  for (const dir of candidates) {
    const bash = path.join(dir, 'usr', 'bin', 'bash.exe');
    if (fs.existsSync(bash)) return { dir, bash };
  }
  return null;
}

/** Whether a program is in PATH (Windows: also checks .exe/.cmd). */
function findOnPath(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const f = path.join(dir, name + ext);
      try {
        if (fs.statSync(f).isFile()) return f;
      } catch {
        // not there
      }
    }
  }
  return null;
}

let nextJob = 1;
const jobs = new Map();

/**
 * Run a command. onLine(stream, line) — line-by-line output.
 * Returns { id, done: Promise<{ code, signal, output }> }.
 */
function run(command, args, { cwd, env, onLine, timeoutMs } = {}) {
  const id = nextJob++;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    shell: false,
  });
  jobs.set(id, child);
  let output = '';
  const pipe = (stream, name) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      output += chunk;
      if (output.length > 4_000_000) output = output.slice(-2_000_000);
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) onLine?.(name, line);
    });
    stream.on('end', () => {
      if (buf) onLine?.(name, buf);
    });
  };
  pipe(child.stdout, 'stdout');
  pipe(child.stderr, 'stderr');
  let timer = null;
  const done = new Promise((resolve) => {
    child.on('error', (err) => {
      clearTimeout(timer);
      jobs.delete(id);
      resolve({ code: -1, signal: null, output: `${output}\n${err.message}`, error: err.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      jobs.delete(id);
      resolve({ code, signal, output });
    });
  });
  if (timeoutMs) timer = setTimeout(() => killTree(child), timeoutMs);
  return { id, done };
}

/** The process tree (bash → python → make → gcc) is stopped as a whole. sync — wait for it (when the app exits). */
function killTree(child, sync = false) {
  if (process.platform === 'win32' && child.pid) {
    const args = ['/pid', String(child.pid), '/T', '/F'];
    if (sync) spawnSync('taskkill', args, { windowsHide: true, timeout: 5000 });
    else spawn('taskkill', args, { windowsHide: true });
  } else child.kill('SIGTERM');
}

function cancel(id) {
  const child = jobs.get(id);
  if (!child) return false;
  killTree(child);
  return true;
}

/** On app exit: stop every running build and flash. */
function cancelAll() {
  for (const child of jobs.values()) killTree(child, true);
  jobs.clear();
}

/**
 * QMK command: through QMK MSYS (bash --login) or through qmk in PATH.
 * args — already validated arguments (validateArg / validatePath).
 */
function qmkCommand(runner, args) {
  if (runner.kind === 'msys') {
    const quoted = args.map((a) => `'${a}'`).join(' ');
    return {
      command: runner.bash,
      args: ['--login', '-c', `qmk ${quoted}`],
      env: { MSYSTEM: 'MINGW64', CHERE_INVOKING: '1' },
    };
  }
  return { command: runner.qmk, args, env: {} };
}

module.exports = { validateArg, validatePath, toMsysPath, findMsys, findOnPath, run, cancel, cancelAll, qmkCommand };
