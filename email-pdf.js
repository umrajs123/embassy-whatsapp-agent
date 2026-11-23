import path from 'node:path';

const escape = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function cleanHtml(html) {
  return String(html || '')
    .replace(/<\/?(?:script|iframe|object|embed|form|input|button|base)(?:\s[^>]*)?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:src|href)\s*=\s*(?:"https?:[^"]*"|'https?:[^']*'|https?:[^\s>]+)/gi, '');
}

function inlineCidImages(html, attachments) {
  let result = html;
  for (const attachment of attachments || []) {
    if (!attachment.contentId || !attachment.content) continue;
    const cid = attachment.contentId.replace(/^<|>$/g, '');
    const source = `data:${attachment.contentType || 'application/octet-stream'};base64,${attachment.content.toString('base64')}`;
    result = result.replaceAll(`cid:${cid}`, source);
  }
  return result;
}

export function emailPdfFilename(parsed, id) {
  const subject = (parsed.subject || 'email').replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  return `German-Embassy - ${subject.slice(0, 100) || id}.pdf`;
}

export async function renderEmailPdf(browser, parsed) {
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    const body = cleanHtml(inlineCidImages(parsed.html || `<pre>${escape(parsed.text || '(No message body)')}</pre>`, parsed.attachments));
    const document = `<!doctype html>
      <html><head><meta charset="utf-8"><style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { color: #202124; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; }
        .mail-header { border-bottom: 1px solid #dadce0; margin-bottom: 18px; padding-bottom: 14px; }
        h1 { font-size: 18pt; font-weight: 500; margin: 0 0 14px; overflow-wrap: anywhere; }
        .field { display: grid; grid-template-columns: 54px 1fr; gap: 8px; margin: 3px 0; overflow-wrap: anywhere; }
        .label { color: #5f6368; }
        .mail-body { overflow-wrap: anywhere; }
        .mail-body img { max-width: 100%; height: auto; }
        .mail-body table { max-width: 100%; }
        pre { white-space: pre-wrap; font-family: Arial, Helvetica, sans-serif; }
      </style></head><body>
        <section class="mail-header">
          <h1>${escape(parsed.subject || '(no subject)')}</h1>
          <div class="field"><span class="label">From</span><span>${escape(parsed.from?.text || '')}</span></div>
          <div class="field"><span class="label">To</span><span>${escape(parsed.to?.text || '')}</span></div>
          <div class="field"><span class="label">Date</span><span>${escape(parsed.date?.toLocaleString() || '')}</span></div>
        </section>
        <main class="mail-body">${body}</main>
      </body></html>`;
    await page.setContent(document, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await page.close().catch(() => {});
  }
}
