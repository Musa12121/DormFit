import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

// Do not start a new frontend against an old process already occupying the API port.
const probe = createServer();
try {
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(3001, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
} catch {
  console.error('Port 3001 is busy. Stop the previous DormFit backend with Ctrl+C, then run npm run dev.');
  process.exit(1);
}

// Start both parts with one command, without another package or shell-specific syntax.
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)], {
    stdio: 'inherit',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32' && child.pid) {
      // The watcher has its own child. Stop only this launcher's process trees.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true,
      });
    } else child.kill();
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
