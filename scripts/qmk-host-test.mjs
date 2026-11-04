// npm run test:qmk — the QMK host tests (tests/qmk-host/README.md): writes the generated keymap files, then builds
// and runs them in QMK's unit test framework. On Windows the build runs in WSL (NAVI_WSL_DISTRO picks the distro).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'navi-qmk-host-'));
const run = (cmd, args, env = process.env) => spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env, shell: false }).status ?? 1;
const wslPath = (p) => p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');

let status = run(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/qmk-host/fixture.test.ts'], { ...process.env, NAVI_QMK_OUT: out });
if (status === 0) {
  const script = join(root, 'tests/qmk-host/run.sh');
  const extra = process.argv.slice(2);
  if (process.platform === 'win32') {
    const distro = process.env.NAVI_WSL_DISTRO ? ['-d', process.env.NAVI_WSL_DISTRO] : [];
    status = run('wsl.exe', [...distro, '--', 'bash', '-l', wslPath(script), wslPath(out), ...extra]);
  } else {
    status = run('bash', [script, out, ...extra]);
  }
}
rmSync(out, { recursive: true, force: true });
process.exit(status);
