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
 *
 * Each payer gets their total and, under it, who that total is split between — because with more
 * than one collector the total alone does not tell anybody what to do.
 */
export function chatSummary(event: Event, settlement: Settlement): string {
  const paying = settlement.members.filter((member) => member.owed > 0);
  const receiving = settlement.collectors.filter((collector) => collector.collecting > 0);

  const lines = [
    `*${event.name}* — ${formatDate(event.date)}`,
    `Total: ${formatBRL(settlement.total)}`,
    '',
  ];

  if (paying.length > 0) {
    lines.push('*Quem paga*');
    for (const member of paying) {
      lines.push(`• ${member.name}: ${formatBRL(member.owed)}`);
      if (member.payments.length > 1) {
        const split = member.payments
          .map((payment) => `${payment.name} ${formatBRL(payment.amount)}`)
          .join(' · ');
        lines.push(`   ↳ ${split}`);
      }
    }
    lines.push('');
  }

  if (receiving.length > 0) {
    lines.push('*Quem recebe*');
    for (const collector of receiving) {
      const key = collector.key ? ` — chave ${collector.key}` : '';
      lines.push(`• ${collector.name}: ${formatBRL(collector.collecting)}${key}`);
    }
    lines.push('');
  }

  if (settlement.rounding > 0) {
    lines.push(
      `_Arredondamento para cima: ${formatBRL(settlement.rounding)}, fica com quem pagou_`,
    );
  }

  return lines.join('\n');
}

/**
 * One member's own breakdown. Every expense they took part in appears, including the ones they
 * paid nothing for, and the rounding is named rather than buried (D1).
 */
export function memberSummary(member: MemberSettlement): string {
  const heading =
    member.code === undefined
      ? `*${member.name}*`
      : `*${member.name}* (código ${formatCode(member.code)})`;
  const lines = [heading, ''];

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

  if (member.payments.length > 0) {
    lines.push('*A pagar*');
    for (const payment of member.payments) {
      const key = payment.key ? ` — chave ${payment.key}` : '';
      lines.push(`• ${payment.name}: ${formatBRL(payment.amount)}${key}`);
    }
    lines.push(`*Total: ${formatBRL(member.owed)}*`);
  }

  if (member.receiving > 0) {
    if (member.payments.length > 0) lines.push('');
    lines.push(`*Você recebe: ${formatBRL(member.receiving)}*`);
  }

  if (member.payments.length === 0 && member.receiving === 0) {
    lines.push('*Você está quitado*');
  }

  return lines.join('\n');
}
