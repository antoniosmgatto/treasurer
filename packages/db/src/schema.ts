import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Money is stored as integer cents, matching the engine. `integer` tops out around R$21 million,
 * which is several orders of magnitude past what a club moves.
 */
const amountCents = (name: string) => integer(name).notNull();

export const eventStatus = pgEnum('event_status', ['open', 'settled']);

export const entryKind = pgEnum('entry_kind', [
  'share',
  'front',
  'payment',
  'reimbursement',
  'rounding',
  'adjustment',
]);

export const groups = pgTable(
  'group',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** The treasurer's link. Holding it means you can write (D9). */
    writeToken: text('write_token').notNull(),
    /** The members' link. Read-only, safe to paste in the group chat (D9). */
    readToken: text('read_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_write_token_idx').on(table.writeToken),
    uniqueIndex('group_read_token_idx').on(table.readToken),
  ],
);

export const members = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Two-digit identification code, 1–99. */
    code: integer('code').notNull(),
    /** Set when a member leaves. Their code retires with them and is never reissued (D7). */
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    /** Set when the row was a mistake. Hidden everywhere, never removed (D19). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** This member's own read link — it lands them on their own amount (D11). */
    readToken: text('read_token').notNull(),
  },
  (table) => [
    /**
     * Covers retired members too, which is what makes D7 true rather than merely intended:
     * a departed member's code can never be handed to somebody new.
     */
    uniqueIndex('member_group_code_idx').on(table.groupId, table.code),
    uniqueIndex('member_read_token_idx').on(table.readToken),
    index('member_group_idx').on(table.groupId),
  ],
);

export const events = pgTable(
  'event',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The day of the occasion, not of data entry. */
    date: date('date').notNull(),
    status: eventStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /**
     * Until this is set, members see "o rateio ainda está sendo fechado" rather than a partial
     * amount they might pay (D15).
     */
    chargesPublishedAt: timestamp('charges_published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    /**
     * D4: one open event per group. With two open, an incoming R$48,03 from member 03 is
     * ambiguous and the identification scheme quietly stops working — so the database refuses.
     */
    uniqueIndex('event_one_open_per_group_idx')
      .on(table.groupId)
      .where(sql`${table.status} = 'open' and ${table.deletedAt} is null`),
    index('event_group_idx').on(table.groupId),
  ],
);

/**
 * Who came (D12). Every expense defaults to this set; per-expense shares are overrides, so
 * entering a night is a handful of taps rather than one per person per expense.
 */
export const eventParticipants = pgTable(
  'event_participant',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    weight: integer('weight').notNull().default(1),
  },
  (table) => [
    uniqueIndex('event_participant_idx').on(table.eventId, table.memberId),
    index('event_participant_event_idx').on(table.eventId),
  ],
);

export const expenses = pgTable(
  'expense',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    /**
     * Who fronted the money and collects the shares back. NULL means the club paid for it and
     * collects it to the club's key — the club is a label, never a member row (D25).
     */
    payerId: text('payer_id').references(() => members.id),
    /** Where the collector wants the money, typed when the bill is added. Not stored on the
     * member: a key belongs to a bill, not to a profile (D8). */
    collectionKey: text('collection_key'),
    amount: amountCents('amount_cents'),
    /** What the nota says, when that differs from what is being collected. */
    receiptTotalCents: integer('receipt_total_cents'),
    receiptUrl: text('receipt_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('expense_event_idx').on(table.eventId)],
);

export const shares = pgTable(
  'share',
  {
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    /** 0 excludes, 1 is a normal share, 2 covers a guest. */
    weight: integer('weight').notNull().default(1),
  },
  (table) => [
    uniqueIndex('share_expense_member_idx').on(table.expenseId, table.memberId),
    index('share_expense_idx').on(table.expenseId),
  ],
);

/**
 * D3: append-only. Nothing here is ever updated or deleted — a correction is a new entry, which
 * is what makes "who changed this?" unanswerable by construction.
 */
export const ledgerEntries = pgTable(
  'ledger_entry',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    eventId: text('event_id').references(() => events.id, { onDelete: 'cascade' }),
    expenseId: text('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    kind: entryKind('kind').notNull(),
    /** Positive: the group owes the member. Negative: the member owes the group. */
    amount: amountCents('amount_cents'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ledger_entry_group_member_idx').on(table.groupId, table.memberId),
    index('ledger_entry_event_idx').on(table.eventId),
  ],
);

export type GroupRow = typeof groups.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type ShareRow = typeof shares.$inferSelect;
export type EventParticipantRow = typeof eventParticipants.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
