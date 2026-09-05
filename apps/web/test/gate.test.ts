import { afterEach, describe, expect, it } from 'vitest';
import { gateDigest, holdsGate, passphrase, sameSecret } from '@/lib/gate';

const VARIABLE = 'PANEL_PASSPHRASE';
const SECRET = 'quatro palavras bem aleatorias';

afterEach(() => {
  delete process.env[VARIABLE];
});

describe('the switch (D34)', () => {
  it('is off when the variable is absent, which is what makes local development unchanged', () => {
    expect(passphrase()).toBeUndefined();
  });

  it('is off when the variable is empty, because a dashboard will happily save one', () => {
    process.env[VARIABLE] = '';
    expect(passphrase()).toBeUndefined();
  });

  it('is on the moment the variable holds something', () => {
    process.env[VARIABLE] = SECRET;
    expect(passphrase()).toBe(SECRET);
  });
});

describe('the passphrase', () => {
  it('accepts the phrase and refuses everything else', () => {
    expect(sameSecret(SECRET, SECRET)).toBe(true);
    expect(sameSecret('quatro palavras bem aleatoria', SECRET)).toBe(false);
    expect(sameSecret('', SECRET)).toBe(false);
    // A near miss is not nearer than a wild guess: both sides are hashed before comparison.
    expect(sameSecret('x', SECRET)).toBe(false);
  });

  it('never stores the phrase in the cookie', () => {
    const digest = gateDigest(SECRET);
    expect(digest).not.toContain(SECRET);
    expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('the cookie', () => {
  it('lets a browser holding the digest through', () => {
    expect(holdsGate(gateDigest(SECRET), SECRET)).toBe(true);
  });

  it('refuses an absent, empty or wrong-length one rather than throwing', () => {
    expect(holdsGate(undefined, SECRET)).toBe(false);
    expect(holdsGate('', SECRET)).toBe(false);
    expect(holdsGate('curta', SECRET)).toBe(false);
    expect(holdsGate(`${gateDigest(SECRET)}x`, SECRET)).toBe(false);
  });

  it('refuses the phrase itself, in case somebody ever writes it there', () => {
    expect(holdsGate(SECRET, SECRET)).toBe(false);
  });

  /** Rotating the variable has to log everybody out, or a leaked phrase is unrevokable. */
  it('stops matching once the passphrase changes', () => {
    const held = gateDigest(SECRET);
    expect(holdsGate(held, 'outra senha completamente diferente')).toBe(false);
  });
});
