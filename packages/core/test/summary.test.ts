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

  it('lists what each member pays and what each fronter receives', () => {
    expect(text).toContain('• Membro 04: R$ 47,53');
    expect(text).toContain('• Membro 02: R$ 111,27');
    expect(text).toContain('• Membro 03: R$ 113,97');
  });

  it('names the rounding instead of hiding it, and says where it goes', () => {
    expect(text).toContain('Arredondamento para cima: R$ 0,10, fica com quem pagou');
  });
});

describe('memberSummary', () => {
  it('shows the lines and the total to pay', () => {
    const text = memberSummary(member('m04'));
    expect(text).toContain('*Membro 04* (código 04)');
    expect(text).toContain('• Carne: R$ 15,50');
    expect(text).toContain('*A pagar: R$ 47,53*');
  });

  it('shows what a member fronted alongside their own share of it', () => {
    const text = memberSummary(member('m02'));
    expect(text).toContain('Mercado (janta): você pagou R$ 158,73');
    expect(text).toContain('*Você recebe: R$ 111,27*');
  });
});
