import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE = path.join(ROOT, 'private');
fs.mkdirSync(PRIVATE, { recursive: true });
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const config = readJson(path.join(ROOT, 'config.json'));
export function writeJson(file, value) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function log(message) {
  const line = new Date().toISOString() + ' ' + message;
  console.log(line);
  const file = path.join(PRIVATE, 'agent.log');
  if (fs.existsSync(file) && fs.statSync(file).size > 2_000_000) {
    fs.renameSync(file, file + '.previous');
  }
  fs.appendFileSync(file, line + '\n');
}
