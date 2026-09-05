-- D32: the rolê's link replaces the member's own. Nothing reads this column any more, and a
-- credential nobody checks is a liability rather than a record — so it goes rather than lingering.
--
-- Irreversible: the tokens are not recoverable. Any /e/<token> link somebody still holds stops
-- resolving, which is the point.
DROP INDEX "member_read_token_idx";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "read_token";
