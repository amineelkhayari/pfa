import { isSamePhone, normalizePhone, phoneToChatId } from './phone.util';

describe('phone utilities', () => {
  it('normalizes formatted phone numbers and WhatsApp device JIDs', () => {
    expect(normalizePhone('+212 6 12-34-56-78')).toBe('212612345678');
    expect(normalizePhone('00212612345678')).toBe('212612345678');
    expect(normalizePhone('212612345678:4@c.us')).toBe('212612345678');
  });

  it('creates an individual WhatsApp chat id', () => {
    expect(phoneToChatId('+212 612 345 678')).toBe('212612345678@c.us');
  });

  it('matches international and local representations safely', () => {
    expect(isSamePhone('+212 612 345 678', '0612345678')).toBe(true);
    expect(isSamePhone('1234567', '1234567')).toBe(true);
    expect(isSamePhone('1234567', '991234567')).toBe(false);
    expect(isSamePhone('', undefined)).toBe(false);
  });
});
