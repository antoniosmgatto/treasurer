'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/labels';

/**
 * The link is meant to be pasted into the group chat, so the button hands the phone's own share
 * sheet a message worth reading and falls back to the clipboard on a desktop that has none.
 *
 * The URL is composed here rather than on the server because only the browser knows which host it
 * was reached on — the same deployment answers on a preview domain and a real one.
 */
export function ShareEvent({ token, name, date }: { token: string; name: string; date: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function share() {
    const url = `${window.location.origin}/r/${token}`;
    const text = `${name} — ${date}. Veja o que você entra: ${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch {
        // Dismissed, or refused by the browser. Fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={share}>
          {state === 'copied' ? t.settlement.copied : t.share.share}
        </Button>
      </div>
      {state === 'failed' && (
        <input
          readOnly
          value={`/r/${token}`}
          aria-label={t.share.link}
          className="border-input w-full rounded-md border bg-transparent p-2 font-mono text-xs"
        />
      )}
    </div>
  );
}
