import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * D34's arithmetic, kept apart from the request it usually runs inside. Nothing here reads a
 * cookie or redirects, which is what makes it testable without a server — and a shared secret
 * compared by hand is exactly the code that should have a test.
 */

/**
 * The switch, and the only one. `PANEL_PASSPHRASE` is set on the deployment and nowhere else, so
 * `next dev` has no gate — a login screen between you and every reload is friction that gets
 * worked around rather than lived with.
 *
 * Deliberately not `NODE_ENV`: a local `next build && next start` is production by that measure.
 * An empty value counts as unset, because a hosting dashboard will happily save one.
 */
export function passphrase(): string | undefined {
  return process.env['PANEL_PASSPHRASE'] || undefined;
}

/**
 * What a browser that has answered holds. Never the phrase itself: it is said out loud in a group
 * chat and it will be reused somewhere that matters more than this.
 *
 * Rotating `PANEL_PASSPHRASE` changes what this returns, so everybody is logged out for free.
 */
export function gateDigest(secret: string): string {
  return createHash('sha256').update(`treasurer-gate:${secret}`).digest('base64url');
}

/**
 * Constant-time, and length-blind because both sides are hashed first: `timingSafeEqual` throws on
 * a length mismatch, and a comparison that throws on the wrong length has answered a question.
 */
export function sameSecret(typed: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(gateDigest(typed)), Buffer.from(gateDigest(expected)));
}

/** Whether a cookie value is the answer to this passphrase. A wrong length is a forgery. */
export function holdsGate(cookie: string | undefined, secret: string): boolean {
  const held = Buffer.from(cookie ?? '');
  const expected = Buffer.from(gateDigest(secret));
  return held.length === expected.length && timingSafeEqual(held, expected);
}
