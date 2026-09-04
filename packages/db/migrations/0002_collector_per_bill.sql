ALTER TABLE "expense" ALTER COLUMN "payer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "collection_key" text;