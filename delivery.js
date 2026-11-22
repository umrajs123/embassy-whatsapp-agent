import { convert } from 'html-to-text';
export function emailText(parsed) {
  if (parsed.text) return parsed.text;
  if (parsed.html) return convert(parsed.html, { wordwrap: false });
  return '(No text body. Open the original .eml file for the complete email.)';
}
export function chunks(text, limit = 3000) {
  const chars = Array.from(text);
  const result = [];
  for (let i = 0; i < chars.length; i += limit) result.push(chars.slice(i, i + limit).join(''));
  return result;
}

export function senderMatches(parsed, sender) {
  const addresses = parsed.from?.value || [];
  return addresses.length === 1 && addresses[0].address?.toLowerCase() === sender.toLowerCase();
}

// Persist "sending" before contacting WhatsApp. A crash or ambiguous failure
// leaves this part for manual review instead of blindly sending a duplicate.
export async function deliverParts(entry, parts, persist, send) {
  entry.parts ||= {};
  for (const part of parts) {
    const previous = entry.parts[part.key];
    if (previous?.status === 'sent') continue;
    if (previous?.status === 'sending' || previous?.status === 'uncertain') {
      throw new Error('DELIVERY_REVIEW_REQUIRED');
    }
    entry.parts[part.key] = { status: 'sending' };
    persist();
    try {
      const message = await send(part);
      entry.parts[part.key] = { status: 'sent', whatsappId: message.id._serialized };
      persist();
    } catch (error) {
      entry.parts[part.key] = { status: 'uncertain' };
      persist();
      throw error;
    }
  }
  entry.complete = true;
  persist();
}
