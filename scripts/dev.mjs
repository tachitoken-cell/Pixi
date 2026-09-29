import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
// --watch also watches the env file, and crashes when it is missing, so only pass it when it exists
const envFile = existsSync('.env.local') ? ['--env-file=.env.local'] : [];
const children = [spawn(process.execPath, [...envFile, '--watch', 'server.mjs'], {stdio:'inherit'}), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {stdio:'inherit'})];
let closing = false;
function close(code = 0) { if (closing) return; closing = true; for (const child of children) child.kill(); process.exit(code); }
for (const child of children) child.on('exit', code => close(code ?? 0));
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
