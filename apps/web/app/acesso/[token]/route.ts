import { groupByWriteToken } from '@treasurer/db';
import { NextResponse, type NextRequest } from 'next/server';
import { GROUP_COOKIE, groupCookieOptions } from '@/lib/cookie';
import { db } from '@/lib/db';
import { pastGate } from '@/lib/session';

/**
 * The door, as a route handler rather than a page: a cookie can only be set while handling a
 * request, not while rendering one.
 *
 * D14: the write token is spent here and the treasurer is redirected to a clean URL, so the
 * credential never lingers in the address bar, in history, or in a screenshot.
 *
 * D34: the gate is checked by hand rather than inherited. A route handler has no layout above it
 * and never calls `requireGroup` — it is the thing that produces the group — so the one path that
 * hands out write access would have been the one path around the passphrase.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!(await pastGate())) {
    return NextResponse.redirect(new URL('/entrar', request.url));
  }

  const { token } = await params;
  const groupId = await groupByWriteToken(await db(), token);

  if (!groupId) {
    return NextResponse.redirect(new URL('/?acesso=invalido', request.url));
  }

  const response = NextResponse.redirect(new URL('/painel', request.url));
  response.cookies.set(GROUP_COOKIE, groupId, groupCookieOptions);
  return response;
}
