import { randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/**
 * The link is the credential (D9), so the token has to be unguessable: 128 bits, url-safe.
 * Short enough to paste into a chat, long enough that nobody enumerates it.
 */
export function newToken(): string {
  return randomBytes(16).toString('base64url');
}
