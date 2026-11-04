// `npm run app:test`: pick which copy of NAVI to open, then build and open it.
// Lists every worktree under .claude/worktrees with work not on master (commits or uncommitted edits), newest
// build first, plus the main checkout (master) last. Enter opens the first one, a number picks another, q cancels.
// The chosen copy is opened with its own `npm run app` (vite build + electron), so it is always freshly built.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tryGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return '';
  }
};

const root = path.dirname(path.resolve(git(process.cwd(), 'rev-parse', '--git-common-dir')));
const worktreesDir = path.join(root, '.claude', 'worktrees');

const builtAt = (dir) => {
  const index = path.join(dir, 'dist', 'index.html');
  return existsSync(index) ? statSync(index).mtimeMs : undefined;
};

const when = (ms) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
};

const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const waiting = [];
for (const name of existsSync(worktreesDir) ? readdirSync(worktreesDir) : []) {
  const dir = path.join(worktreesDir, name);
  if (!existsSync(path.join(dir, '.git'))) continue;
  const branch = tryGit(dir, 'branch', '--show-current');
  const ahead = tryGit(dir, 'log', '--format=%s', 'master..HEAD').split('\n').filter(Boolean);
  const dirty = tryGit(dir, 'status', '--porcelain', '--untracked-files=no') !== '';
  if (!ahead.length && !dirty) continue; // already on master: nothing to test there
  waiting.push({
    dir,
    title: (branch || name).replace(/^worktree-/, '').replaceAll('-', ' '),
    detail: ahead.length ? ahead[0] : 'uncommitted edits only',
    built: builtAt(dir),
    commitTime: Number(tryGit(dir, 'log', '-1', '--format=%ct')) * 1000,
  });
}
waiting.sort((a, b) => (b.built ?? -1) - (a.built ?? -1) || b.commitTime - a.commitTime);

const choices = [
  ...waiting,
  { dir: root, title: 'master', detail: 'what is already merged', built: builtAt(root) },
];

console.log('Which NAVI to open?\n');
choices.forEach((c, i) => {
  const built = c.built ? `built ${when(c.built)}` : 'not built yet';
  console.log(`  ${i + 1}) ${c.title} (${built})`);
  console.log(`     ${shorten(c.detail, 100)}`);
});
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });
let pick;
rl.on('close', () => {
  if (!pick) process.exit(0); // q, or the input closed (the Run window stopped): nothing chosen
});
while (!pick) {
  const answer = (await rl.question(`Enter = 1, a number 1-${choices.length}, q = cancel: `)).trim().toLowerCase();
  if (answer === 'q') rl.close();
  const n = answer === '' ? 1 : Number(answer);
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) pick = choices[n - 1];
}
rl.close();

if (!existsSync(path.join(pick.dir, 'node_modules'))) {
  console.error(`No node_modules in ${pick.dir}: run "npm install" there first.`);
  process.exit(1);
}
console.log(`\nBuilding and opening "${pick.title}"\n  ${pick.dir}\n`);
const child = spawn('npm run app', { cwd: pick.dir, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
