'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/labels';

/**
 * The group chat is where this club actually settles up, so the app's job is to produce a message
 * worth pasting rather than a page worth visiting. The text is built on the server; this only
 * moves it to the clipboard.
 */
export function CopySummary({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // Clipboard access needs a secure context and a permission the browser can refuse.
      // Falling back to the raw text means the treasurer can still select and copy it by hand.
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {state === 'copied' ? t.settlement.copied : t.settlement.copy}
        </Button>
      </div>
      {state === 'failed' && (
        <textarea
          readOnly
          value={text}
          rows={8}
          aria-label={t.settlement.copy}
          className="border-input w-full rounded-md border bg-transparent p-3 font-mono text-xs"
        />
      )}
    </div>
  );
}
