ALTER TABLE "member" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "guest_of_event_id" text;