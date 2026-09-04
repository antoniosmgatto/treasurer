CREATE TYPE "public"."entry_kind" AS ENUM('share', 'front', 'payment', 'reimbursement', 'rounding', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('open', 'settled');--> statement-breakpoint
CREATE TABLE "event_participant" (
	"event_id" text NOT NULL,
	"member_id" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"status" "event_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"charges_published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"description" text NOT NULL,
	"payer_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"write_token" text NOT NULL,
	"read_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"event_id" text,
	"expense_id" text,
	"kind" "entry_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"code" integer NOT NULL,
	"is_treasury" boolean DEFAULT false NOT NULL,
	"retired_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"read_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share" (
	"expense_id" text NOT NULL,
	"member_id" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_participant" ADD CONSTRAINT "event_participant_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participant" ADD CONSTRAINT "event_participant_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_payer_id_member_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_participant_idx" ON "event_participant" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "event_participant_event_idx" ON "event_participant" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_one_open_per_group_idx" ON "event" USING btree ("group_id") WHERE "event"."status" = 'open' and "event"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "event_group_idx" ON "event" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "expense_event_idx" ON "expense" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_write_token_idx" ON "group" USING btree ("write_token");--> statement-breakpoint
CREATE UNIQUE INDEX "group_read_token_idx" ON "group" USING btree ("read_token");--> statement-breakpoint
CREATE INDEX "ledger_entry_group_member_idx" ON "ledger_entry" USING btree ("group_id","member_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_event_idx" ON "ledger_entry" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_group_code_idx" ON "member" USING btree ("group_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "member_read_token_idx" ON "member" USING btree ("read_token");--> statement-breakpoint
CREATE UNIQUE INDEX "member_group_treasury_idx" ON "member" USING btree ("group_id") WHERE "member"."is_treasury";--> statement-breakpoint
CREATE INDEX "member_group_idx" ON "member" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_expense_member_idx" ON "share" USING btree ("expense_id","member_id");--> statement-breakpoint
CREATE INDEX "share_expense_idx" ON "share" USING btree ("expense_id");