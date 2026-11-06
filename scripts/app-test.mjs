// `npm run app:test`: builds and opens the copy of NAVI with the newest commit among the worktrees under
// .claude/worktrees that have commits not on master (by commit date of HEAD; uncommitted edits don't count),
// or the main checkout when none has. `--dry-run` only prints the pick.
// A worktree without node_modules gets a junction to the main checkout's when their package-lock.json match,
// otherwise its own `npm install`.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const root = path.dirname(path.resolve(git(process.cwd(), 'rev-parse', '--git-common-dir')));
const worktreesDir = path.join(root, '.claude', 'worktrees');
const dirs = [
  root,
  ...(existsSync(worktreesDir) ? readdirSync(worktreesDir).map((name) => path.join(worktreesDir, name)) : []),
].filter((dir) => existsSync(path.join(dir, '.git')));

// Only copies with commits not on master compete; master itself (or a worktree already merged) only when none has.
// Otherwise every landing (even a tooling commit) makes master the newest and hides the change waiting for a test.
const waiting = dirs.filter((dir) => dir !== root && Number(git(dir, 'rev-list', '--count', 'master..HEAD')) > 0);
let best;
for (const dir of waiting.length ? waiting : [root]) {
  const time = Number(git(dir, 'log', '-1', '--format=%ct')) * 1000;
  if (time && (!best || time > best.time)) best = { dir, time };
}
if (!best) {
  console.error('No NAVI checkout with a commit found.');
  process.exit(1);
}

const branch = git(best.dir, 'branch', '--show-current') || git(best.dir, 'rev-parse', '--short', 'HEAD');
console.log(`Opening "${branch.replace(/^worktree-/, '')}" (committed ${new Date(best.time).toLocaleString()})`);
console.log(`  ${git(best.dir, 'log', '-1', '--format=%s')}`);
console.log(`  ${best.dir}\n`);
if (process.argv.includes('--dry-run')) process.exit(0);

if (!existsSync(path.join(best.dir, 'node_modules'))) {
  const lock = (dir) => {
    const file = path.join(dir, 'package-lock.json');
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };
  if (existsSync(path.join(root, 'node_modules')) && lock(best.dir) === lock(root)) {
    symlinkSync(path.join(root, 'node_modules'), path.join(best.dir, 'node_modules'), 'junction');
  } else if (spawnSync('npm install', { cwd: best.dir, stdio: 'inherit', shell: true }).status !== 0) {
    process.exit(1);
  }
}

const child = spawn('npm run app', { cwd: best.dir, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
