CREATE TYPE "public"."cap_period" AS ENUM('day', 'week');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('exercise', 'meal', 'group');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('ai', 'user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."place_source" AS ENUM('poi', 'geocode', 'manual', 'none');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "ai_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"model" text NOT NULL,
	"categories_json" jsonb NOT NULL,
	"healthy" boolean,
	"confidence" double precision,
	"reason" text,
	"raw_response" text,
	"latency_ms" integer,
	"failed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"diff_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"streak_points" integer DEFAULT 5 NOT NULL,
	"streak_length" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"photo_key" text NOT NULL,
	"thumb_key" text,
	"taken_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"status" "entry_status" DEFAULT 'pending' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"place_name" text,
	"place_source" "place_source" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_categories" (
	"entry_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"source" "category_source" NOT NULL,
	CONSTRAINT "entry_categories_entry_id_category_pk" PRIMARY KEY("entry_id","category")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"screenshot_key" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"points" integer NOT NULL,
	"cap_count" integer NOT NULL,
	"cap_period" "cap_period" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_key" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_verdicts" ADD CONSTRAINT "ai_verdicts_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_categories" ADD CONSTRAINT "entry_categories_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rules" ADD CONSTRAINT "scoring_rules_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "entries_status_created_idx" ON "entries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_rules_challenge_category_idx" ON "scoring_rules" USING btree ("challenge_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "users_firebase_uid_idx" ON "users" USING btree ("firebase_uid");