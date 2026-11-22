import path from 'node:path';
import net from 'node:net';
import { PRIVATE, readJson, writeJson } from './common.js';
const [id, part, decision] = process.argv.slice(2);
if (!id || !part || !['sent', 'retry'].includes(decision)) {
  console.error('Usage: node review.js GMAIL_ID PART sent|retry');
  process.exit(1);
}
const lock = net.createServer();
await new Promise((resolve, reject) => {
  lock.once('error', reject);
  lock.listen(47639, '127.0.0.1', resolve);
}).catch(() => { console.error('Stop the running agent first.'); process.exit(1); });
try {
  const file = path.join(PRIVATE, 'deliveries.json');
  const state = readJson(file);
  const entry = state.messages[id];
  if (!['sending', 'uncertain'].includes(entry?.parts?.[part]?.status)) {
    throw new Error('That part is not awaiting review.');
  }
  if (decision === 'sent') entry.parts[part] = { status: 'sent', reviewedAt: new Date().toISOString() };
  else delete entry.parts[part];
  delete entry.error;
  writeJson(file, state);
  console.log('Review saved. Restart the agent.');
} finally { lock.close(); }
