import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, senderMatches, deliverParts } from './delivery.js';

test('exact sender validation rejects lookalike addresses and multiple senders', () => {
  const parsed = addresses => ({ from: { value: addresses.map(address => ({ address })) } });
  assert.equal(senderMatches(parsed(['NOREPLY@diplo.de']), 'noreply@diplo.de'), true);
  assert.equal(senderMatches(parsed(['noreply@diplo.de.attacker.test']), 'noreply@diplo.de'), false);
  assert.equal(senderMatches(parsed(['noreply@diplo.de', 'other@test.com']), 'noreply@diplo.de'), false);
});
test('long Unicode email survives splitting without content loss', () => {
  const text = 'Hello 😀 سلام\n'.repeat(2000);
  const result = chunks(text);
  assert.equal(result.join(''), text);
  assert.ok(result.every(part => Array.from(part).length <= 3000));
  assert.ok(result.every(part => !/[\uD800-\uDBFF]$/.test(part)));
});
test('completed parts are not sent again after restart', async () => {
  const entry = { parts: { body: { status: 'sent', whatsappId: 'old' } } };
  const sent = [];
  await deliverParts(entry, [{ key: 'body' }, { key: 'attachment' }], () => {}, async part => {
    sent.push(part.key);
    return { id: { _serialized: 'new' } };
  });
  assert.deepEqual(sent, ['attachment']);
  assert.equal(entry.complete, true);
});
test('failed send is uncertain and is not automatically duplicated', async () => {
  const entry = {};
  let sends = 0;
  const send = async () => { sends++; throw new Error('connection lost'); };
  await assert.rejects(deliverParts(entry, [{ key: 'body' }], () => {}, send));
  assert.equal(entry.parts.body.status, 'uncertain');
  await assert.rejects(deliverParts(entry, [{ key: 'body' }], () => {}, send), /DELIVERY_REVIEW_REQUIRED/);
  assert.equal(sends, 1);
  assert.notEqual(entry.complete, true);
});
test('crash during send requires review before retry', async () => {
  const entry = { parts: { body: { status: 'sending' } } };
  await assert.rejects(deliverParts(entry, [{ key: 'body' }], () => {}, () => {
    throw new Error('must not send');
  }), /DELIVERY_REVIEW_REQUIRED/);
});
