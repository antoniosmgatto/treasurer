ALTER TABLE "event" ADD COLUMN "share_token" text;--> statement-breakpoint
-- Events that already exist get a link too, or they would be the only ones nobody can open.
UPDATE "event" SET "share_token" = replace(gen_random_uuid()::text, '-', '') WHERE "share_token" IS NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "share_token" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_share_token_idx" ON "event" USING btree ("share_token");
