import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/labels';
import { unlock } from './actions';

export const dynamic = 'force-dynamic';

/** Nothing here should be found by looking, and nothing here should be indexed for it. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * D34: the door to the panel where one exists. It lives outside `/painel` on purpose — a screen
 * that asks for the passphrase cannot sit behind the gate that sends people to it.
 *
 * It says nothing about the club or what is behind it, the same instinct as D30: a page a stranger
 * lands on should not tell them what they have found.
 */
export default function GatePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t.gate.title}</h1>
      <ActionForm action={unlock} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="passphrase">{t.gate.passphrase}</Label>
          <Input id="passphrase" name="passphrase" type="password" autoComplete="off" required />
        </div>
        <div>
          <SubmitButton>{t.gate.enter}</SubmitButton>
        </div>
      </ActionForm>
    </main>
  );
}
