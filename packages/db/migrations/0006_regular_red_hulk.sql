CREATE TABLE IF NOT EXISTS "budget_alert_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_alert_notifications_user_id_category_id_scope_unique" UNIQUE("user_id","category_id","scope")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_alert_notifications" ADD CONSTRAINT "budget_alert_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_alert_notifications" ADD CONSTRAINT "budget_alert_notifications_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
