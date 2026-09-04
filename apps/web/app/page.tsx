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
    </main>
  );
}
