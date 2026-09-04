import { describe, expect, it } from 'vitest';
import { settle } from '../src/settlement.js';
import { chatSummary, memberSummary } from '../src/summary.js';
import { acampamento, members } from './fixture.js';

const settlement = settle(acampamento, members);
const member = (id: string) => settlement.members.find((m) => m.memberId === id)!;

describe('chatSummary', () => {
  const text = chatSummary(acampamento, settlement);

  it('leads with the event and its total', () => {
    expect(text).toContain('*Acampamento* — 28/08/2026');
    expect(text).toContain('Total: R$ 475,20');
  });

  it('warns against rounding, because rounding destroys the identification', () => {
    expect(text).toContain('o valor exato identifica você — não arredonde');
  });

  it('lists payers with their coded amounts and receivers with their net', () => {
    expect(text).toContain('• Membro 03: R$ 48,03');
    expect(text).toContain('• Membro 02: R$ 111,19');
    expect(text).toContain('• Caixa do Clube: R$ 161,40');
  });

  it('names the rounding instead of hiding it', () => {
    expect(text).toContain('Arredondamento para o caixa: R$ 4,44');
  });
});

describe('memberSummary', () => {
  it('shows the share, the rounding, and the total to pay separately', () => {
    const text = memberSummary(member('m03'));
    expect(text).toContain('*Membro 03* (código 03)');
    expect(text).toContain('Sua parte: R$ 47,51');
    expect(text).toContain('Arredondamento (vai pro caixa): R$ 0,52');
    expect(text).toContain('*A pagar: R$ 48,03*');
  });

  it('shows what a member fronted alongside their own share of it', () => {
    const text = memberSummary(member('m02'));
    expect(text).toContain('Mercado (janta): você pagou R$ 158,73');
    expect(text).toContain('*Você recebe: R$ 111,19*');
  });
});
