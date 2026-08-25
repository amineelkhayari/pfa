import { EditedMessage, IncomingMessage, MessageContact } from '../interfaces/whatsapp-engine.interface';

/**
 * Project an engine-neutral message base into the public edit-event contract. Keeping this projection
 * shared prevents the two adapters from drifting on identity, direction, group, type, or filter fields.
 */
export function buildEditedMessage(message: IncomingMessage, hasMedia: boolean): EditedMessage {
  return {
    messageId: message.id,
    chatId: message.chatId,
    body: message.body,
    senderId: message.author ?? message.from,
    from: message.from,
    to: message.to,
    fromMe: message.fromMe,
    isGroup: message.isGroup,
    type: message.type,
    hasMedia,
    ...(message.author ? { author: message.author } : {}),
    ...(message.mentionedIds ? { mentionedIds: message.mentionedIds } : {}),
    timestamp: message.timestamp,
  };
}

/**
 * The subset of whatsapp-web.js `Contact` properties we read synchronously (already on the resolved
 * contact, no network call). Declared explicitly so {@link mapContactFields} is unit-testable without a
 * full wwebjs `Contact`, and so the async getters stay out by construction.
 */
export interface RawContactFields {
  id?: { _serialized?: string };
  number?: string;
  name?: string;
  pushname?: string;
  shortName?: string;
  type?: string;
  isMyContact?: boolean;
  isWAContact?: boolean;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  verifiedName?: string;
  verifiedLevel?: number;
  isBlocked?: boolean;
  labels?: string[];
}

/**
 * Map the synchronous fields of a wwebjs `Contact` to a {@link MessageContact}, copying only the values
 * that are set. No network calls, which on a per-message path would risk rate-limiting.
 *
 * With `full` false (the default) it returns just `name`/`pushName`, the long-standing payload. With
 * `full` true (operator opt-in via `WEBHOOK_CONTACT_DETAILS`) it returns the complete field set.
 */
export function mapContactFields(contact: RawContactFields, full = false): MessageContact {
  const out: MessageContact = {};
  if (contact.name) out.name = contact.name;
  if (contact.pushname) out.pushName = contact.pushname;
  if (!full) return out;
  const id = contact.id?._serialized;
  if (id) out.id = id;
  if (contact.number) out.number = contact.number;
  if (contact.shortName) out.shortName = contact.shortName;
  if (contact.type) out.type = contact.type;
  if (contact.isMyContact !== undefined) out.isMyContact = contact.isMyContact;
  if (contact.isWAContact !== undefined) out.isWAContact = contact.isWAContact;
  if (contact.isBusiness !== undefined) out.isBusiness = contact.isBusiness;
  if (contact.isEnterprise !== undefined) out.isEnterprise = contact.isEnterprise;
  if (contact.verifiedName) out.verifiedName = contact.verifiedName;
  if (contact.verifiedLevel !== undefined) out.verifiedLevel = contact.verifiedLevel;
  if (contact.isBlocked !== undefined) out.isBlocked = contact.isBlocked;
  if (contact.labels && contact.labels.length > 0) out.labels = contact.labels;
  return out;
}
