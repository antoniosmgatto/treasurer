import Link from 'next/link';
import { t } from '@/lib/labels';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ acesso?: string }>;
}) {
  const { acesso } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t.appName}</h1>
      <p className="text-muted-foreground">
        {acesso === 'invalido'
          ? t.errors.noAccess
          : 'Abra o link que você recebeu para ver a sua parte no rolê.'}
      </p>
      {/* D35: the panel is no longer reached only by holding a link, so it needs somewhere to be
          reached from. It gives away nothing the path `/painel` does not. */}
      <p className="text-muted-foreground text-sm">
        <Link href="/painel" className="underline underline-offset-4">
          {t.club.treasurer}
        </Link>
      </p>
    </main>
  );
}
