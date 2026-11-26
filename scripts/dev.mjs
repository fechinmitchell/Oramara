// oramara/scripts/dev.mjs
// One command for local development: starts Docker and the database,
// runs the migration, then runs the backend and frontend together.
// Run from the Oramara folder with: npm run dev   (Ctrl+C stops everything)

import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_CONTAINER = 'oramara-db';
const DB_USER = 'oramara';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ok(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(label, check, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (check()) return;
    if (i === 0) console.log(`Waiting for ${label}...`);
    await sleep(1000);
  }
  console.error(`${label} did not start in ${seconds} seconds.`);
  process.exit(1);
}

// 1. Docker Desktop
if (!ok('docker info')) {
  console.log('Opening Docker Desktop...');
  ok('open -a Docker');
  await waitFor('Docker', () => ok('docker info'), 90);
}

// 2. Database container
if (!ok(`docker start ${DB_CONTAINER}`)) {
  console.error(`Could not find the ${DB_CONTAINER} container. Create it with the docker run command from step 4.`);
  process.exit(1);
}
await waitFor('the database', () => ok(`docker exec ${DB_CONTAINER} pg_isready -U ${DB_USER}`), 60);
console.log('Database is ready');

// 3. Migration
try {
  execSync('npm run migrate', { cwd: path.join(root, 'backend'), stdio: 'inherit' });
} catch {
  process.exit(1);
}

// 4. Backend and frontend side by side, with coloured labels
const COLOURS = { backend: '\x1b[36m', frontend: '\x1b[35m' };
const RESET = '\x1b[0m';
const children = [];

function run(name, folder) {
  const child = spawn('npm', ['run', 'dev'], { cwd: path.join(root, folder), env: { ...process.env, FORCE_COLOR: '1' } });
  const label = `${COLOURS[name]}[${name}]${RESET} `;
  const print = (stream) => (data) =>
    data
      .toString()
      .split('\n')
      .filter((line) => line.trim())
      .forEach((line) => stream.write(label + line + '\n'));
  child.stdout.on('data', print(process.stdout));
  child.stderr.on('data', print(process.stderr));
  child.on('exit', (code) => {
    console.log(`${label}stopped${code ? ` (code ${code})` : ''}`);
    stopAll();
  });
  children.push(child);
}

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGINT');
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

run('backend', 'backend');
run('frontend', 'frontend');
console.log('\nOramara is running: website http://localhost:5173  admin http://localhost:5173/admin\n');
