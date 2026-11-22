import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simpleParser } from 'mailparser';
import puppeteer from 'puppeteer';
import whatsapp from 'whatsapp-web.js';
import { google } from 'googleapis';
import { senderMatches, emailText } from './delivery.js';

test('installed clients expose the APIs used by the agent', () => {
  assert.equal(typeof whatsapp.Client, 'function');
  assert.equal(typeof whatsapp.LocalAuth, 'function');
  assert.equal(typeof google.gmail, 'function');
});
test('MIME parser preserves HTML-only content and attachment bytes', async () => {
  const raw = Buffer.from([
    'From: German Embassy <noreply@diplo.de>',
    'To: recipient@example.com',
    'Subject: Appointment',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="test"',
    '', '--test',
    'Content-Type: text/html; charset=utf-8',
    '', '<p>Appointment <b>confirmed</b>.</p>',
    '--test',
    'Content-Type: application/pdf',
    'Content-Disposition: attachment; filename="appointment.pdf"',
    'Content-Transfer-Encoding: base64',
    '', Buffer.from('%PDF-test bytes').toString('base64'),
    '--test--', ''
  ].join('\r\n'));
  const parsed = await simpleParser(raw);
  assert.equal(senderMatches(parsed, 'noreply@diplo.de'), true);
  assert.match(emailText(parsed), /Appointment/);
  assert.match(parsed.html, /confirmed/);
  assert.equal(parsed.attachments[0].filename, 'appointment.pdf');
  assert.equal(parsed.attachments[0].content.toString(), '%PDF-test bytes');
});
test('installed browser starts with a separate temporary profile', { timeout: 30000 }, async () => {
  const executablePath = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Agent browser test</title>');
    assert.equal(await page.title(), 'Agent browser test');
  } finally { await browser.close(); }
});
