CREATE TABLE IF NOT EXISTS "blocked_numbers" (
	"whatsapp_number" text PRIMARY KEY NOT NULL,
	"reason" text,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
