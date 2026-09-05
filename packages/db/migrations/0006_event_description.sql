-- The `share_token` line drizzle-kit also emitted here is a no-op: 0005 already set it NOT NULL
-- by hand, and only the snapshot had drifted. Replaying it would be harmless but misleading.
ALTER TABLE "event" ADD COLUMN "description" text;
