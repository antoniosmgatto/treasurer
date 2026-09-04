import { connect, type Db } from '@treasurer/db';

let shared: Promise<Db> | undefined;

/** One connection per server process, reused across requests. */
export function db(): Promise<Db> {
  shared ??= connect();
  return shared;
}
