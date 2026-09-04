-- The caixa row itself goes before its flag does: with the column dropped it would otherwise
-- linger as an ordinary member, taking shares and holding a read link nobody uses. Soft deleted
-- rather than removed (D19), so past events keep whatever it fronted.
UPDATE "member" SET "deleted_at" = now() WHERE "is_treasury";--> statement-breakpoint
DROP INDEX "member_group_treasury_idx";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "is_treasury";
