import { eventsOf, type EventRow } from '@treasurer/db';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';
import { createEvent } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Every rolê the club has had, and a form to start another. Since D33 a group can hold several
 * open at once, so there is no longer a single current one for this page to be — it lists, and
 * the work happens at `/painel/roles/[eventId]`.
 *
 * Deliberately no total per row: that would mean loading and settling every event on the page
 * that gets opened most, to show a number that is one tap away on the rolê itself.
 */
export default async function PanelPage() {
  const groupId = await requireGroup();
  const events = await eventsOf(await db(), groupId);
  const open = events.filter((event) => event.status === 'open');
  // A settled rolê stops being current without ceasing to exist.
  const past = events.filter((event) => event.status === 'settled');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.appName}</h1>
        <Link href="/painel/membros" className="text-muted-foreground text-sm underline">
          {t.event.members}
        </Link>
      </header>

      <ActionForm action={createEvent} className="flex flex-col gap-3">
        <h2 className="font-medium">{t.event.newEvent}</h2>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="name">{t.event.name}</Label>
            <Input id="name" name="name" placeholder="Churrasco" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">{t.event.date}</Label>
            <Input id="date" name="date" type="date" />
          </div>
        </div>
        <div>
          <SubmitButton>{t.event.create}</SubmitButton>
        </div>
      </ActionForm>

      {events.length === 0 && <p className="text-muted-foreground text-sm">{t.event.noEvents}</p>}

      {open.length > 0 && <RoleList title={t.event.openEvents} events={open} />}
      {past.length > 0 && <RoleList title={t.event.past} events={past} />}
    </main>
  );
}

function RoleList({ title, events }: { title: string; events: readonly EventRow[] }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h2 className="text-muted-foreground text-xs">{title}</h2>
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/painel/roles/${event.id}`}
          className="flex justify-between gap-4 text-sm underline-offset-4 hover:underline"
        >
          <span>{event.name}</span>
          <span className="text-muted-foreground">{event.date}</span>
        </Link>
      ))}
    </section>
  );
}
