import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), name: text('name').notNull(), ownerId: text('owner_id').notNull(),
  createdAt: text('created_at').notNull(),
});
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id'), email: text('email').notNull(), name: text('name').notNull(),
  role: text('role').notNull().default('editor'), color: text('color').notNull().default('#df795c'),
}, t => [uniqueIndex('member_email_workspace').on(t.workspaceId,t.email),index('member_identity').on(t.userId)]);
// Typed domain documents share a transaction and version boundary; tenant and kind are indexed.
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  kind: text('kind').notNull(), data: text('data').notNull(), version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
},t => [index('records_workspace_kind').on(t.workspaceId,t.kind)]);

export const accounts = sqliteTable('accounts', {
 id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),passwordHash:text('password_hash').notNull(),disabled:integer('disabled').notNull().default(0),createdAt:text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
 hash:text('hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),expiresAt:integer('expires_at').notNull(),
},t=>[index('session_account').on(t.accountId)]);
export const accountInvites = sqliteTable('account_invites', {
 hash:text('hash').primaryKey(),workspaceId:text('workspace_id').notNull(),email:text('email').notNull(),name:text('name').notNull(),role:text('role').notNull(),purpose:text('purpose').notNull(),expiresAt:integer('expires_at').notNull(),createdBy:text('created_by').notNull(),
});
export const authThrottle=sqliteTable('auth_throttle',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull()});
export const authSettings=sqliteTable('auth_settings',{key:text('key').primaryKey(),value:text('value').notNull()});
