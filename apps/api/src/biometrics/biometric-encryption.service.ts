import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const MAGIC = Buffer.from('MCB1', 'ascii');
const VERSION = 1;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + NONCE_LENGTH + TAG_LENGTH;

@Injectable()
export class BiometricEncryptionService implements OnModuleDestroy {
  private readonly key: Buffer;

  constructor() {
    const configuredKey = process.env.BIOMETRIC_ENCRYPTION_KEY;
    if (!configuredKey) {
      throw new InternalServerErrorException(
        'BIOMETRIC_ENCRYPTION_KEY debe estar configurada',
      );
    }

    const key = Buffer.from(configuredKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== configuredKey) {
      key.fill(0);
      throw new InternalServerErrorException(
        'BIOMETRIC_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes',
      );
    }

    this.key = key;
  }

  encrypt(plaintext: Buffer, context: string): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, {
      authTagLength: TAG_LENGTH,
    });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([
      MAGIC,
      Buffer.from([VERSION]),
      nonce,
      tag,
      ciphertext,
    ]);
  }

  decrypt(envelope: Uint8Array, context: string): Buffer {
    const stored = Buffer.from(envelope);
    if (
      stored.length <= HEADER_LENGTH ||
      !stored.subarray(0, MAGIC.length).equals(MAGIC) ||
      stored[MAGIC.length] !== VERSION
    ) {
      throw new Error('Formato biometrico cifrado no reconocido');
    }

    const nonceStart = MAGIC.length + 1;
    const tagStart = nonceStart + NONCE_LENGTH;
    const ciphertextStart = tagStart + TAG_LENGTH;
    const nonce = stored.subarray(nonceStart, tagStart);
    const tag = stored.subarray(tagStart, ciphertextStart);
    const ciphertext = stored.subarray(ciphertextStart);
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  onModuleDestroy() {
    this.key.fill(0);
  }

  static createContext(
    enrollmentId: string,
    fingerPosition: string,
    templateFormat: string,
  ): string {
    return `${enrollmentId}\u0000${fingerPosition}\u0000${templateFormat}`;
  }
}
