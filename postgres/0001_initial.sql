BEGIN;
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"color" text DEFAULT '#df795c' NOT NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX "member_email_workspace" ON "members" ("workspace_id","email");
CREATE INDEX "member_identity" ON "members" ("user_id");
CREATE TABLE "records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON UPDATE no action ON DELETE no action
);

CREATE INDEX "records_workspace_kind" ON "records" ("workspace_id","kind");


CREATE TABLE "account_invites" (
	"hash" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_by" text NOT NULL
);

CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"disabled" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);

CREATE UNIQUE INDEX "accounts_email_unique" ON "accounts" ("email");
CREATE TABLE "auth_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" bigint NOT NULL
);

CREATE TABLE "sessions" (
	"hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON UPDATE no action ON DELETE no action
);

CREATE INDEX "session_account" ON "sessions" ("account_id");
COMMIT;
