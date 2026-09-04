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

  it('gives each payer a total and shows how it splits between collectors', () => {
    expect(text).toContain('• Membro 04: R$ 47,53');
    expect(text).toContain('↳ Membro 01 R$ 15,50 · Membro 02 R$ 15,88 · Clube R$ 16,15');
  });

  it('lists each collector with what they take in and the key to send it to', () => {
    expect(text).toContain('• Membro 01: R$ 139,50 — chave 41999000001');
    expect(text).toContain('• Clube: R$ 161,50 — chave 41999000099');
  });

  it('names the rounding instead of hiding it, and says where it goes', () => {
    expect(text).toContain('Arredondamento para cima: R$ 0,10, fica com quem pagou');
  });
});

describe('memberSummary', () => {
  it('lists one line per collector and totals them', () => {
    const text = memberSummary(member('m04'));
    expect(text).toContain('*Membro 04* (código 04)');
    expect(text).toContain('• Carne: R$ 15,50');
    expect(text).toContain('• Membro 02: R$ 15,88 — chave 41999000002');
    expect(text).toContain('*Total: R$ 47,53*');
  });

  it('shows both sides for someone who collects a bill and owes on others', () => {
    const text = memberSummary(member('m02'));
    expect(text).toContain('Mercado (janta): você pagou R$ 158,73');
    // Gross: he still pays the other two collectors in full.
    expect(text).toContain('*Total: R$ 31,65*');
    expect(text).toContain('*Você recebe: R$ 142,92*');
  });
});
