export const GROUP_COOKIE = 'treasurer_group';

export const groupCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
} as const;

/** D34: proof that this browser answered the passphrase. A digest of it, never the phrase. */
export const GATE_COOKIE = 'treasurer_gate';

/**
 * The group cookie's options, minus most of the year. A gate that outlives the season it was set
 * up for is a passphrase nobody remembers having shared; a month covers a run of rolês and makes
 * changing it something that actually happens.
 */
export const gateCookieOptions = { ...groupCookieOptions, maxAge: 60 * 60 * 24 * 30 } as const;
