import fs from 'node:fs';
import path from 'node:path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { ROOT, PRIVATE, config, readJson, writeJson } from './common.js';

const credentialsPath = path.join(ROOT, 'credentials.json');
if (!fs.existsSync(credentialsPath)) {
  console.error('Missing credentials.json. Follow SETUP.md to create a Google Desktop app OAuth client.');
  process.exit(1);
}
const auth = await authenticate({
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  keyfilePath: credentialsPath
});
// local-auth should provide an access token after the browser callback.  Ask
// the client for one explicitly so a malformed or incomplete callback never
// reaches the Gmail API as an anonymous request.
const accessToken = await auth.getAccessToken();
if (!accessToken?.token) {
  throw new Error('Google authorization completed without an access token. Run Connect-Gmail.cmd again.');
}
const gmail = google.gmail({ version: 'v1', auth });
const { data } = await gmail.users.getProfile({ userId: 'me' });
if (data.emailAddress.toLowerCase() !== config.gmailAccount.toLowerCase()) {
  throw new Error('Wrong Google account selected. Select the configured Gmail account.');
}
if (!auth.credentials.refresh_token) {
  throw new Error('Google did not return a refresh token. Revoke this app in your Google account and reconnect.');
}
const credentials = readJson(credentialsPath);
const client = credentials.installed;
if (!client) throw new Error('Use Desktop app credentials.');
writeJson(path.join(PRIVATE, 'gmail-token.json'), {
  type: 'authorized_user', client_id: client.client_id,
  client_secret: client.client_secret, refresh_token: auth.credentials.refresh_token
});
console.log('Gmail connected with read-only access. Next: run Start.cmd and scan the WhatsApp QR code.');
