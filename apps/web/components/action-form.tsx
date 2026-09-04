'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ServerAction } from '@/lib/action-result';

/**
 * A form whose server action can answer back, and which gives the person their typing back when
 * it does. React resets an uncontrolled form once its action resolves, so a rejected amount would
 * otherwise wipe the description and the payer too — punishing the whole entry for one bad field.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: ServerAction;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<Record<string, string>>({});

  function remember(event: React.FormEvent<HTMLFormElement>) {
    const entries = new FormData(event.currentTarget).entries();
    submitted.current = Object.fromEntries(
      [...entries].filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  useEffect(() => {
    if (!state.error || !form.current) return;
    for (const [name, value] of Object.entries(submitted.current)) {
      const field = form.current.elements.namedItem(name);
      if (field instanceof HTMLInputElement && field.type !== 'checkbox') field.value = value;
      if (field instanceof HTMLSelectElement) field.value = value;
    }
  }, [state]);

  return (
    <form ref={form} action={formAction} onSubmit={remember} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
