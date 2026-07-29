CREATE TABLE IF NOT EXISTS "processed_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
