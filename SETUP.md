# Embassy WhatsApp Agent

Personal Windows automation for umrajs123@gmail.com. Reads every available message
whose single From address is noreply@diplo.de, including archived, read, spam and
trash messages. It cannot recover permanently deleted messages. Sender address
matching is a filter, not proof of embassy authenticity.

For each email it sends the entire text in numbered chunks, the original .eml
file (preserving HTML, headers, inline content and attachments), and each attachment
separately. Delivery is to the linked WhatsApp account's own chat. It never replies
to an email or marks it read. No paid AI model is needed.

## First-time setup

1. In https://console.cloud.google.com/ create a project and enable the Gmail API.
2. Configure Google Auth Platform with External audience (personal Gmail), add
   umrajs123@gmail.com as a test user, and create an OAuth client of type Desktop app.
   Download its JSON as credentials.json into this project folder.
3. Run Connect-Gmail.cmd. Sign in as umrajs123@gmail.com and grant read-only Gmail
   access. Do not send your password, token or downloaded credentials in chat.
4. Run Start.cmd. On your phone, open WhatsApp > Linked devices > Link a device
   and scan the displayed QR code. Linking authorizes sending to that same account.
   All matching historical emails will begin forwarding immediately.
5. Confirm complete messages and attachments arrived in your own WhatsApp chat.
   Use Status.cmd to inspect incomplete deliveries.
6. Once the live test succeeds, close Start.cmd with Ctrl+C. In PowerShell run:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Startup.ps1
   Start the "Embassy WhatsApp Agent" task in Task Scheduler, or sign out and in.
   The scheduled task runs directly without a console window.

Google OAuth apps in Testing generally receive refresh tokens that expire after
seven days when using Gmail scopes. For ongoing use, change the publishing status
to In production under Audience. Personal-use verification exemptions may apply;
Google may still show an unverified-app warning. Only authorize your own client.
Tokens can still be revoked or expire; rerun Connect-Gmail.cmd if necessary.
Official setup: https://developers.google.com/workspace/gmail/api/quickstart/nodejs
OAuth token limits: https://developers.google.com/identity/protocols/oauth2#expiration

## Everyday operation

The laptop must remain awake and connected, with your Windows user signed in.
Locking the screen is fine. Shutdown, sleep, hibernation and sign-out stop monitoring.
Set Windows power options yourself to keep it awake on AC power if desired; the
installer does not change them. A missed interval is caught up on the next check.
The default check interval is 60 seconds, plus time spent forwarding a backlog.
One minute is not a guaranteed delivery deadline.

Use Status.cmd for the last successful check and delivery counts. Logs are in
private/agent.log; they do not include email bodies, attachments or credentials.
Task Scheduler can stop the agent. Disable or delete the named task to remove
automatic startup. Reconnect WhatsApp interactively if it becomes unlinked.

## Reliability and limits

whatsapp-web.js is unofficial and can break after WhatsApp changes; WhatsApp may
restrict an account using it. There is no guaranteed free unattended delivery.
See https://github.com/wwebjs/whatsapp-web.js .

A sent record means WhatsApp returned a message ID, not proof that your phone
received or displayed it. Watch your Gmail notifications as well during validation.
WhatsApp file/type/size limits may prevent a file from forwarding. Such an email
remains incomplete; the agent does not silently discard or truncate attachments.
The original .eml contains the full email even if text conversion changes layout.

Delivery state is written before and after each send. If a process crashes or a
send fails ambiguously, that part is flagged sending/uncertain and the email is
paused for manual review. Other emails continue. This avoids blindly resending,
but requires intervention for ambiguous failures.

To resolve one paused part:
- Stop the agent in Task Scheduler or with Ctrl+C.
- Find the Gmail message ID and part name with Status.cmd.
- Check your WhatsApp chat to determine whether that part arrived.
- Run the following command, replacing ID and PART with the displayed values:
  C:\laragon\bin\nodejs\node-v22\node.exe review.js ID PART sent
  Or, if it did not arrive, replace sent with retry.
- Restart the agent. Retry explicitly permits resending that part.

Private credentials, browser session and delivery records stay in private/.
The setup restricts this folder to your Windows account and SYSTEM. Do not share
it or delete deliveries.json unless you intend to resend historical messages.
The folder must not be exposed by a web server; this is a local Node program,
not a website. No Git repository or public hosting is configured.

## Development

Node 22+, npm install, npm test. package-lock.json pins the installed dependencies.
The tests cover sender matching, Unicode chunking, resuming attachments, and
ambiguous/crashed delivery handling. Live Gmail/WhatsApp verification requires
your account connections.

## Dependency audit at build time

After updating the Google libraries, npm reported 18 upstream dependency
advisories (7 moderate, 11 high). Compatible audit fixes did not eliminate them.
Do not interpret passing functional tests as a clean security audit. Recheck with
npm audit before deployment; forced downgrades of WhatsApp were not applied.
The agent uses the installed Chrome/Edge executable with a separate profile and
disables Puppeteer's bundled browser downloads.
