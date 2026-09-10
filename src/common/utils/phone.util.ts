/** Normalize a phone number or WhatsApp JID to digits used for customer matching. */
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '')
    .replace(/^00/, '');
}

/** Convert a customer phone number to the WhatsApp individual-chat JID format. */
export function phoneToChatId(value: string): string {
  return `${normalizePhone(value)}@c.us`;
}

/** Match local/international representations by their stable trailing digits. */
export function isSamePhone(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const comparableLength = Math.min(9, normalizedLeft.length, normalizedRight.length);
  return comparableLength >= 8 && normalizedLeft.slice(-comparableLength) === normalizedRight.slice(-comparableLength);
}
