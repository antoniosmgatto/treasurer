import { afterEach, describe, expect, it } from 'vitest';
import { connect } from '../src/connect.js';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('refusing the PGlite fallback in a deployment', () => {
  it('throws when DATABASE_URL is missing and the environment claims to be deployed', async () => {
    delete process.env['DATABASE_URL'];
    process.env['VERCEL'] = '1';

    // Silently writing to a serverless filesystem loses the data; failing to boot does not.
    await expect(connect()).rejects.toThrow('DATABASE_URL is not set');
  });

  it('throws under NODE_ENV=production too, for deployments that are not Vercel', async () => {
    delete process.env['DATABASE_URL'];
    delete process.env['VERCEL'];
    process.env['NODE_ENV'] = 'production';

    await expect(connect()).rejects.toThrow('DATABASE_URL is not set');
  });

  it('still falls back to PGlite in development, which is the whole point of it', async () => {
    delete process.env['DATABASE_URL'];
    delete process.env['VERCEL'];
    process.env['NODE_ENV'] = 'test';
    process.env['PGLITE_PATH'] = '.data/connect-test';

    await expect(connect()).resolves.toBeDefined();
  });
});
