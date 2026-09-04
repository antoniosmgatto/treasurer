import { formatCode } from './codes.js';
import { formatBRL } from './money.js';
import type { MemberSettlement, Settlement } from './settlement.js';
import type { Event } from './types.js';

/** Labels are pt-BR: this text is pasted straight into the group chat. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * The message the treasurer pastes into the group. Everyone sees the same list, which is what
 * makes the ledger public and stops the thread from becoming the record.
 */
export function chatSummary(event: Event, settlement: Settlement): string {
  const receiving = settlement.members.filter((member) => member.net > 0);
  const paying = settlement.members.filter((member) => member.charged !== null);

  const lines = [
    `*${event.name}* — ${formatDate(event.date)}`,
    `Total: ${formatBRL(settlement.total)}`,
    '',
  ];

  if (paying.length > 0) {
    lines.push('*Quem paga* (o valor exato identifica você — não arredonde)');
    for (const member of paying) {
      lines.push(`• ${member.name}: ${formatBRL(member.charged!)}`);
    }
    lines.push('');
  }

  if (receiving.length > 0) {
    lines.push('*Quem recebe*');
    for (const member of receiving) {
      lines.push(`• ${member.name}: ${formatBRL(member.net)}`);
    }
    lines.push('');
  }

  lines.push(`_Arredondamento para o caixa: ${formatBRL(settlement.treasurySurplus)}_`);
  return lines.join('\n');
}

/**
 * One member's own breakdown. Every expense they took part in appears, including the ones they
 * paid nothing for, and the rounding is named rather than buried (D1).
 */
export function memberSummary(member: MemberSettlement): string {
  const lines = [`*${member.name}* (código ${formatCode(member.code)})`, ''];

  for (const line of member.lines) {
    if (line.fronted > 0) {
      lines.push(`• ${line.description}: você pagou ${formatBRL(line.fronted)}`);
    }
    lines.push(
      line.excluded
        ? `• ${line.description}: ${formatBRL(line.amount)} (você trouxe a sua)`
        : `• ${line.description}: ${formatBRL(line.amount)}`,
    );
  }

  lines.push('');
  if (member.charged !== null) {
    lines.push(`Sua parte: ${formatBRL(member.owed)}`);
    lines.push(`Arredondamento (vai pro caixa): ${formatBRL(member.surplus)}`);
    lines.push(`*A pagar: ${formatBRL(member.charged)}*`);
  } else if (member.net > 0) {
    lines.push(`*Você recebe: ${formatBRL(member.net)}*`);
  } else {
    lines.push('*Você está quitado*');
  }

  return lines.join('\n');
}
