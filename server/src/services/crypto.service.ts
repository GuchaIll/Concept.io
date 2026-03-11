/**
 * crypto.service.ts — AES-256-GCM encryption for sync target tokens.
 *
 * Uses a server-side secret from SYNC_ENCRYPTION_KEY env var.
 * If not set, falls back to a derived key (not production-safe without env var).
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const envKey = process.env.SYNC_ENCRYPTION_KEY;
  if (envKey) {
    // Use SHA-256 to ensure exactly 32 bytes
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Fallback — deterministic but not secure without proper key management
  console.warn('[CryptoService] SYNC_ENCRYPTION_KEY not set — using fallback key');
  return crypto.createHash('sha256').update('concept-io-default-key').digest();
}

/**
 * Encrypt a plaintext string. Returns base64-encoded ciphertext
 * in the format: iv:ciphertext:tag
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted}:${tag.toString('base64')}`;
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = parts[1];
  const tag = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
