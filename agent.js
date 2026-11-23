import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import whatsapp from 'whatsapp-web.js';
import qr from 'qrcode-terminal';
import { PRIVATE, config, readJson, writeJson, log, sleep } from './common.js';
import { chunks, senderMatches, deliverParts, emailText } from './delivery.js';

const { Client, LocalAuth, MessageMedia } = whatsapp;
const tokenPath = path.join(PRIVATE, 'gmail-token.json');
if (!fs.existsSync(tokenPath)) {
  console.error('Connect Gmail first: run Connect-Gmail.cmd. See SETUP.md.');
  process.exit(1);
}
if (!Number.isFinite(config.pollSeconds) || config.pollSeconds < 30) throw new Error('pollSeconds must be at least 30.');
// An OS-owned loopback socket prevents two copies from sending simultaneously;
// it is automatically released even if the process crashes.
const lock = net.createServer(socket => socket.destroy());
await new Promise((resolve, reject) => {
  lock.once('error', reject);
  lock.listen(47639, '127.0.0.1', resolve);
}).catch(() => {
  console.error('Another agent is running, or local port 47639 is occupied.');
  process.exit(1);
});

const auth = google.auth.fromJSON(readJson(tokenPath));
const gmail = google.gmail({ version: 'v1', auth });
google.options({ timeout: 30000 });
const profile = await gmail.users.getProfile({ userId: 'me' }).catch(error => {
  log('Gmail connection failed (' + String(error.code || error.name || 'Error') + '). Run Connect-Gmail.cmd if authorization expired.');
  process.exit(1);
});
if (profile.data.emailAddress.toLowerCase() !== config.gmailAccount.toLowerCase()) {
  throw new Error('Connected Gmail account does not match config.json.');
}
const statePath = path.join(PRIVATE, 'deliveries.json');
const state = fs.existsSync(statePath) ? readJson(statePath) : { messages: {} };
const persist = () => writeJson(statePath, state);
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(candidate => fs.existsSync(candidate));
if (!browserPath) throw new Error('Install Chrome or Edge before starting the agent.');
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(PRIVATE, 'whatsapp-session') }),
  // Set WHATSAPP_VISIBLE=1 only for the initial QR pairing. Normal starts
  // remain hidden so the unattended worker does not interrupt the desktop.
  puppeteer: { headless: process.env.WHATSAPP_VISIBLE !== '1', executablePath: browserPath }
});
let ready = false;
let stopping = false;
client.on('qr', code => {
  log('WhatsApp connection required. Open WhatsApp > Linked devices > Link a device.');
  qr.generate(code, { small: true });
});
client.on('auth_failure', () => {
  log('WhatsApp authentication failed. Run Start.cmd interactively to reconnect.');
  process.exitCode = 1;
  void shutdown();
});
client.on('disconnected', () => {
  ready = false;
  log('WhatsApp disconnected. Restart and reconnect if needed.');
  process.exitCode = 1;
  void shutdown();
});
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await client.destroy().catch(() => {});
  lock.close();
  process.exit(process.exitCode || 0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.once('ready', async () => {
  ready = true;
  const self = client.info.wid._serialized;
  log('WhatsApp connected. Sending only to the linked account itself.');
  while (ready && !stopping) {
    try {
      let pageToken;
      const ids = [];
      do {
        const { data } = await gmail.users.messages.list({
          userId: 'me', q: 'from:' + config.sender,
          includeSpamTrash: true, maxResults: 500, pageToken
        });
        ids.push(...(data.messages || []).map(message => message.id));
        pageToken = data.nextPageToken;
      } while (pageToken);
      for (const id of ids.reverse()) {
        if (!ready || stopping) break;
        if (state.messages[id]?.complete || state.messages[id]?.ignored) continue;
        const entry = state.messages[id] ||= { parts: {} };
        if (Object.values(entry.parts).some(part => ['sending', 'uncertain'].includes(part.status))) {
          continue; // status command exposes these; do not flood or silently retry.
        }
        try {
          const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'raw' });
          const raw = Buffer.from(data.raw, 'base64url');
          const parsed = await simpleParser(raw);
          if (!senderMatches(parsed, config.sender)) {
            entry.ignored = true;
            persist();
            continue;
          }
          const header = [
            'German Embassy email',
            'From: ' + (parsed.from?.text || config.sender),
            'To: ' + (parsed.to?.text || config.gmailAccount),
            'Subject: ' + (parsed.subject || '(no subject)'),
            'Date: ' + (parsed.date?.toISOString() || 'Not supplied'),
            'Gmail: https://mail.google.com/mail/u/0/#all/' + id
          ].join('\n');
          const body = emailText(parsed);
          const textParts = chunks(header + '\n\n' + body);
          const parts = textParts.map((text, index) => ({
            key: 'text-' + index,
            text: textParts.length > 1 ? '[' + (index + 1) + '/' + textParts.length + ']\n' + text : text
          }));
          parts.push({
            key: 'original', data: raw, mime: 'message/rfc822',
            filename: 'embassy-' + id + '.eml'
          });
          parsed.attachments.forEach((attachment, index) => parts.push({
            key: 'attachment-' + index, data: attachment.content,
            mime: attachment.contentType || 'application/octet-stream',
            filename: path.basename((attachment.filename || 'attachment-' + (index + 1)).replaceAll('\\', '/'))
          }));
          await deliverParts(entry, parts, persist, async part => {
            if (!ready) throw new Error('DISCONNECTED');
            const payload = part.text ?? new MessageMedia(
              part.mime, part.data.toString('base64'), part.filename
            );
            const result = await client.sendMessage(self, payload, part.text ? {} : { sendMediaAsDocument: true });
            if (!result?.id?._serialized) throw new Error('No WhatsApp message ID returned.');
            await sleep(Math.max(1, config.sendDelaySeconds || 3) * 1000);
            return result;
          });
          log('Forwarded Gmail message ' + id + ' (' + parts.length + ' parts).');
          delete entry.error;
        } catch (error) {
          entry.error = { at: new Date().toISOString(), code: String(error.code || error.name || 'Error') };
          persist();
          log('Message ' + id + ' not complete. Run Status.cmd to inspect delivery progress.');
        }
      }
      state.lastSuccessfulCheck = new Date().toISOString();
      persist();
      log('Mailbox check complete; ' + ids.length + ' matching search results.');
    } catch (error) {
      log('Mailbox check failed (' + String(error.code || error.name || 'Error') + '). Retrying next minute; reconnect Gmail if authorization expired.');
    }
    await sleep(config.pollSeconds * 1000);
  }
});
await client.initialize();
