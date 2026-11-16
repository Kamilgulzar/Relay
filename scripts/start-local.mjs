import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import './sites-env.mjs';

const wrangler = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
const envFile = new URL('../.dev.vars', import.meta.url);
const result = spawnSync(process.execPath, [
  fileURLToPath(wrangler), 'dev',
  '--config', 'dist/server/wrangler.json',
  '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--inspector-port', '0',
  ...(existsSync(envFile) ? ['--env-file', fileURLToPath(envFile)] : []),
  ...process.argv.slice(2),
], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
