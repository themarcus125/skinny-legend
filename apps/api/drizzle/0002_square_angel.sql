CREATE TYPE "public"."user_locale" AS ENUM('vi', 'en');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" "user_locale" DEFAULT 'vi' NOT NULL;