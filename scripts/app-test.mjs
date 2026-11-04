// `npm run app:test`: opens the NAVI build that is waiting for a test.
// Looks at the main checkout and every worktree under .claude/worktrees, picks the one whose dist/ was
// built last (changes are built right before they are handed over for a test) and runs `npm run app` there.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const commonDir = path.resolve(git(process.cwd(), 'rev-parse', '--git-common-dir'));
const root = path.dirname(commonDir);
const worktrees = path.join(root, '.claude', 'worktrees');
const candidates = [root, ...(existsSync(worktrees) ? readdirSync(worktrees).map((name) => path.join(worktrees, name)) : [])];

let best;
for (const dir of candidates) {
  const built = path.join(dir, 'dist', 'index.html');
  if (!existsSync(built)) continue;
  const time = statSync(built).mtimeMs;
  if (!best || time > best.time) best = { dir, time };
}
if (!best) {
  console.error('No built NAVI found (no dist/index.html in the main checkout or any worktree).');
  process.exit(1);
}

const branch = git(best.dir, 'branch', '--show-current') || git(best.dir, 'rev-parse', '--short', 'HEAD');
console.log(`Opening NAVI from branch ${branch} (built ${new Date(best.time).toLocaleString()})\n  ${best.dir}`);
const child = spawn('npm run app', { cwd: best.dir, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
