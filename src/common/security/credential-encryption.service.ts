import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class CredentialEncryptionService {
  private readonly prefix = 'enc:v1:';

  encrypt(value: string): string {
    if (value.startsWith(this.prefix)) return value;
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${this.prefix}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(this.prefix)) return value;
    const [iv, tag, encrypted] = value.slice(this.prefix.length).split(':');
    if (!iv || !tag || !encrypted) throw new InternalServerErrorException('Invalid encrypted credential.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  protectSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const result = { ...settings };
    for (const field of ['clientSecret', 'accessToken']) {
      const value = result[field];
      if (typeof value === 'string' && value) result[field] = this.encrypt(value);
    }
    return result;
  }

  revealSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const result = { ...settings };
    for (const field of ['clientSecret', 'accessToken']) {
      const value = result[field];
      if (typeof value === 'string' && value) result[field] = this.decrypt(value);
    }
    return result;
  }

  private key(): Buffer {
    const secret = process.env.SHOPIFY_CREDENTIALS_ENCRYPTION_KEY?.trim() ?? "121218huhud77dys7GATFTA^6y77y7y72ygYGYGT7878hUHHHGgtgtgt%%";
    if (!secret) {
      throw new InternalServerErrorException('SHOPIFY_CREDENTIALS_ENCRYPTION_KEY is required for Shopify credentials.');
    }
    return createHash('sha256').update(secret).digest();
  }
}
