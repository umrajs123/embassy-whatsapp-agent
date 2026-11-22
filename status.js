import fs from 'node:fs';
import path from 'node:path';
import { PRIVATE, readJson } from './common.js';
const file = path.join(PRIVATE, 'deliveries.json');
if (!fs.existsSync(file)) {
  console.log('No delivery records yet.');
} else {
  const state = readJson(file);
  const entries = Object.entries(state.messages);
  console.log('Last successful mailbox check:', state.lastSuccessfulCheck || 'never');
  console.log('Completed emails:', entries.filter(([, item]) => item.complete).length);
  for (const [id, item] of entries) {
    if (item.complete || item.ignored) continue;
    console.log('Incomplete email:', id, 'Error:', item.error?.code || 'none');
    for (const [key, part] of Object.entries(item.parts)) console.log(' ', key, part.status);
  }
  console.log('A sending/uncertain part needs review in WhatsApp before retrying. See SETUP.md.');
}
