/**
 * npm run app:dev — the desktop app in development mode:
 * starts the Vite server and opens an Electron window that takes the interface from it.
 * Code changes show up in the window right away. Close the window — the server stops too.
 */
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5190, open: false } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
console.log(`\n  interface: ${url}\n  opening the app window…\n`);

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NAVI_DEV_URL: url },
});

child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
