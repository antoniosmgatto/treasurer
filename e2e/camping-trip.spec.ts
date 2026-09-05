import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The camping trip, entered the way it happened, through the screens somebody actually taps — from
 * a locked deployment with no clube in it to a member opening the link on their phone.
 *
 * It is the event the project exists for, and it is already a fixture: `examples/acampamento.json`
 * holds the same three bills, and `pnpm cli examples/acampamento.json` prints the same numbers this
 * asserts. That is the point of running it here as well. The engine has been right to the cent
 * since Phase 1; what nothing covered is whether the forms between a treasurer and those numbers
 * hand the engine what he typed.
 *
 * Ten of the fifteen went. Three people fronted bills — two collecting to their own Pix key, one to
 * the clube's — one bill differs from the nota (D28), and Membro 03 brought his own beer and is off
 * the clube's bill (D1, D12).
 */

/**
 * `page.evaluate` runs its callback in the browser, where `navigator.clipboard` exists — but this
 * file is compiled with the Node lib, which does not describe it. Declaring the one method used is
 * narrower than pulling the whole DOM lib into a config the packages share.
 */
declare const navigator: object & { clipboard: { readText(): Promise<string> } };

const PASSPHRASE = 'senha do teste ponta a ponta';

const CLUB = 'Moto Clube';
const EVENT = 'Acampamento';
const EVENT_DATE = '2026-08-28';

/** Fifteen in the clube, each given the next code (D7); the first ten went. */
const CLUB_SIZE = 15;
const WENT = 10;
const memberName = (index: number) => `Membro ${String(index).padStart(2, '0')}`;

/**
 * What `pnpm cli examples/acampamento.json` prints, and therefore what the screens have to agree
 * with. Hard-coded rather than recomputed: a test that derives its expectation from the engine
 * agrees with the engine by construction, and would have nothing to say when both are wrong.
 */
const EXPECTED = {
  total: 'R$ 962,23',
  /** Anyone who was in on all three bills. */
  ordinary: 'R$ 103,44',
  /** Off the clube's bill, so two collectors instead of three. */
  member03: 'R$ 31,38',
  /** Fronted the carne, is in on the other two. */
  member01Receives: 'R$ 139,50',
  member02Receives: 'R$ 142,92',
  clubCollects: 'R$ 648,54',
} as const;

test('the camping trip, from a locked panel to a member opening the link', async ({
  page,
  browser,
}) => {
  /**
   * Headless Chromium advertises a share sheet it has no way of opening: `navigator.share` exists
   * over http on localhost and resolves without doing anything, so the component would hand the
   * link to a sheet nobody sees and return. Shadowing it takes the desktop path — the clipboard,
   * and the visible input behind that — which is the branch a browser can actually be asked about.
   */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  await test.step('the gate turns a stranger away (D34)', async () => {
    await page.goto('/painel');
    await expect(page).toHaveURL(/\/entrar$/);

    await page.getByLabel('Senha').fill('não é essa');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Not `getByRole('alert')`: Next's own route announcer is one of those too.
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await expect(page).toHaveURL(/\/entrar$/);

    await page.getByLabel('Senha').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Past the gate but holding no clube, so the picker rather than the panel (D35).
    await expect(page).toHaveURL(/\/painel\/clubes$/);
  });

  await test.step('a clube is created from the panel, and filled in (D35)', async () => {
    await page.getByLabel('Nome do clube').fill(CLUB);
    await page.getByRole('button', { name: 'Criar clube' }).click();

    // Straight to the roster: a clube with nobody in it settles every rolê to zero.
    await expect(page).toHaveURL(/\/painel\/membros$/);

    for (let index = 1; index <= CLUB_SIZE; index++) {
      await page.getByLabel('Nome', { exact: true }).fill(memberName(index));
      await page.getByRole('button', { name: 'Adicionar membro' }).click();
      await expect(page.getByText(memberName(index))).toBeVisible();
    }
  });

  await test.step('the rolê is opened', async () => {
    await page.getByRole('link', { name: 'Despesas' }).click();
    await page.getByLabel('Nome do rolê').fill(EVENT);
    await page.getByLabel('Data').fill(EVENT_DATE);
    await page.getByRole('button', { name: 'Criar rolê' }).click();

    // Creating a rolê lands on the rolê, not on the list it was created from (D33).
    await expect(page).toHaveURL(/\/painel\/roles\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: EVENT })).toBeVisible();
  });

  await test.step('ten of the fifteen went (D12)', async () => {
    for (let index = WENT + 1; index <= CLUB_SIZE; index++) {
      await rosterForm(page)
        .locator('label', { hasText: memberName(index) })
        .getByRole('checkbox')
        .uncheck();
    }
    await page.getByRole('button', { name: 'Salvar quem foi' }).click();

    // Every bill defaults to the roster, so the add form now offers ten names rather than fifteen.
    await expect(billForm(page).getByRole('checkbox')).toHaveCount(WENT);
  });

  await test.step('the carne, which the nota disagrees with (D28)', async () => {
    await addBill(page, {
      description: 'Carne',
      amount: '155,00',
      receiptTotal: '161,47',
      payer: memberName(1),
      key: '41 90000-0001',
    });

    // Both numbers are true and both are shown; only the charged one is split.
    await expect(page.getByText('R$ 155,00').first()).toBeVisible();
    await expect(page.getByText('R$ 161,47').first()).toBeVisible();
  });

  await test.step('the janta, collected by whoever cooked it', async () => {
    await addBill(page, {
      description: 'Janta (anfitrião)',
      amount: '158,73',
      payer: memberName(2),
      key: '41 90000-0002',
    });
  });

  await test.step("the clube's bill, without the man who brought his own beer (D1)", async () => {
    await addBill(page, {
      description: 'Compras do clube (com cerveja)',
      amount: '648,50',
      // D25: the clube is a label with a key of its own, never a member row.
      payer: 'Caixa do clube',
      key: 'clube@exemplo.com.br',
      without: memberName(3),
    });

    // An exclusion is stated on the bill rather than left for somebody to notice.
    await expect(page.getByText(`sem ${memberName(3)}`)).toBeVisible();
  });

  await test.step('the rateio matches what the engine prints for this event', async () => {
    await expect(page.getByText(EXPECTED.total).first()).toBeVisible();

    // The man who skipped the beer owes two collectors; everybody else owes three.
    await expect(settlementRow(page, 3)).toContainText(EXPECTED.member03);
    await expect(settlementRow(page, 4)).toContainText(EXPECTED.ordinary);
    await expect(settlementRow(page, 10)).toContainText(EXPECTED.ordinary);

    // Whoever fronted a bill is owed, net of their own share of the others.
    await expect(settlementRow(page, 1)).toContainText(EXPECTED.member01Receives);
    await expect(settlementRow(page, 2)).toContainText(EXPECTED.member02Receives);
    await expect(page.getByText(EXPECTED.clubCollects).first()).toBeVisible();
  });

  const link = await test.step('closing the rateio is what produces the link (D15)', async () => {
    await page.getByRole('button', { name: 'Fechar rateio e liberar os valores' }).click();
    await expect(page.getByText('Valores liberados para os membros')).toBeVisible();

    /**
     * A headless browser has no share sheet, so this takes the desktop path: the clipboard, and
     * failing that the input the component shows so the URL is never simply lost. Both are read
     * here rather than one asserted, because which of them runs is a fact about the browser and
     * not about the app — and the app's promise is that the link comes out either way.
     */
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const copied = page.getByRole('button', { name: 'Copiado!' });
    const shown = page.getByLabel('Link do rolê');

    /**
     * Retried, because this is the first thing in the whole journey that needs client JavaScript.
     * Every form before it is a server action, which posts and works whether React has attached or
     * not — so a click here can land on a button the browser has painted and React has not yet
     * adopted, and nothing happens at all.
     */
    await expect(async () => {
      await page.getByRole('button', { name: 'Compartilhar no zap' }).click();
      await expect(copied.or(shown).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    if (await copied.isVisible()) return page.evaluate(() => navigator.clipboard.readText());
    return new URL(await shown.inputValue(), page.url()).toString();
  });

  await test.step('a member opens it on a phone that has never seen this app', async () => {
    // `newToken` is base64url, not hex — the 32-character hex ones belong to rolês whose token
    // was backfilled by migration 0005.
    expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{16,}$/);

    // A fresh context: no gate cookie, no clube cookie, nothing. This is the whole point of the
    // link, and the reason the gate deliberately does not cover `/r` (D34).
    const phone = await browser.newContext();
    const member = await phone.newPage();
    await member.goto(link);

    await expect(member.getByRole('heading', { name: EVENT })).toBeVisible();
    await expect(member.getByText(EXPECTED.total).first()).toBeVisible();

    // D32: the whole table is public, and your own line is one tap away.
    await member.getByRole('link', { name: new RegExp(memberName(3)) }).click();
    await expect(member.getByRole('heading', { name: memberName(3) })).toBeVisible();
    await expect(member.getByText(EXPECTED.member03).first()).toBeVisible();

    // He is on two bills and off the third, and the page says so rather than dropping the line.
    await expect(member.getByText('Carne')).toBeVisible();
    await expect(member.getByText('Janta (anfitrião)')).toBeVisible();
    await expect(member.getByText('você trouxe a sua')).toBeVisible();

    // The identification scheme lives in the centavos, so the exact amount is the instruction.
    await expect(member.getByText('Pague o valor exato, sem arredondar.')).toBeVisible();

    await phone.close();
  });
});

/** The form that saves who came, told apart from the one that adds a bill. */
function rosterForm(page: Page): Locator {
  return page.locator('form', { has: page.getByRole('button', { name: 'Salvar quem foi' }) });
}

/** The add-bill form, told apart from the per-bill correction forms by its `novo` field ids. */
function billForm(page: Page): Locator {
  return page.locator('form', { has: page.locator('#description-novo') });
}

/**
 * A row of the rateio table, found by the code and name it opens with.
 *
 * Anchored, because a plain name matches almost every row: whoever fronted a bill is named again
 * on each debtor's line as one of the people they owe, which is the whole point of collecting per
 * collector rather than per event.
 */
function settlementRow(page: Page, index: number): Locator {
  const code = String(index).padStart(2, '0');
  return page
    .getByRole('row')
    .filter({ hasText: new RegExp(`^\\s*${code}\\s+${memberName(index)}`) });
}

async function addBill(
  page: Page,
  bill: {
    description: string;
    amount: string;
    receiptTotal?: string;
    payer: string;
    key: string;
    /** Somebody on the roster who is not in on this one — stored at weight 0, never dropped. */
    without?: string;
  },
): Promise<void> {
  const form = billForm(page);
  await form.locator('#description-novo').fill(bill.description);
  // D20: amounts are typed the way a Brazilian keyboard types them, and parsed, never coerced.
  await form.locator('#amount-novo').fill(bill.amount);
  if (bill.receiptTotal) await form.locator('#receiptTotal-novo').fill(bill.receiptTotal);
  await form.locator('#payerId-novo').selectOption({ label: bill.payer });
  await form.locator('#collectionKey-novo').fill(bill.key);

  if (bill.without) {
    await form.locator('label', { hasText: bill.without }).getByRole('checkbox').uncheck();
  }

  await form.getByRole('button', { name: 'Adicionar despesa' }).click();
  await expect(page.getByText(bill.description).first()).toBeVisible();
}
