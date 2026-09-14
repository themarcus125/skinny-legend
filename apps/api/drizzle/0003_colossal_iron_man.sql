ALTER TYPE "public"."device_platform" ADD VALUE 'web';--> statement-breakpoint
ALTER TYPE "public"."place_source" ADD VALUE 'osm' BEFORE 'manual';--> statement-breakpoint
CREATE TABLE "place_cache" (
	"cell" text PRIMARY KEY NOT NULL,
	"payload_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
