'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/**
 * The only client component in the app. Server actions on bad rural signal take a visible moment,
 * and a button that does not acknowledge the tap gets tapped again.
 */
export function SubmitButton({
  children,
  variant,
  size,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size}>
      {children}
    </Button>
  );
}
