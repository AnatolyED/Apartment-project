import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const finishingEnum = pgEnum('finishing', [
  'Чистовая',
  'Вайт бокс',
  'Без отделки',
]);

export const userRoleEnum = pgEnum('user_role', ['admin', 'moderator']);

export const cities = pgTable('cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const districts = pgTable('districts', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id')
    .notNull()
    .references(() => cities.id, { onDelete: 'no action' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  photos: text('photos').array(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apartments = pgTable('apartments', {
  id: uuid('id').primaryKey().defaultRandom(),
  districtId: uuid('district_id')
    .notNull()
    .references(() => districts.id, { onDelete: 'no action' }),
  name: varchar('name', { length: 255 }).notNull(),
  finishing: finishingEnum('finishing').notNull(),
  rooms: varchar('rooms', { length: 50 }).notNull(),
  area: real('area').notNull(),
  floor: integer('floor').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  photos: text('photos').array(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    login: varchar('login', { length: 100 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('moderator'),
    isProtected: boolean('is_protected').notNull().default(false),
    isBlocked: boolean('is_blocked').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    usersLoginUniqueIdx: uniqueIndex('users_login_unique_idx').on(table.login),
  })
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSessionsTokenHashUniqueIdx: uniqueIndex('user_sessions_token_hash_unique_idx').on(
      table.tokenHash
    ),
  })
);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorLogin: varchar('actor_login', { length: 100 }).notNull(),
  actorRole: userRoleEnum('actor_role').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }),
  entityLabel: text('entity_label'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    login: varchar('login', { length: 100 }).notNull(),
    ipAddress: varchar('ip_address', { length: 128 }).notNull(),
    failedCount: integer('failed_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    loginAttemptsUniqueIdx: uniqueIndex('login_attempts_login_ip_unique_idx').on(
      table.login,
      table.ipAddress
    ),
  })
);

export const citiesRelations = relations(cities, ({ many }) => ({
  districts: many(districts),
}));

export const districtsRelations = relations(districts, ({ one, many }) => ({
  city: one(cities, {
    fields: [districts.cityId],
    references: [cities.id],
  }),
  apartments: many(apartments),
}));

export const apartmentsRelations = relations(apartments, ({ one }) => ({
  district: one(districts, {
    fields: [apartments.districtId],
    references: [districts.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  auditLogs: many(auditLogs),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;

export type District = typeof districts.$inferSelect;
export type NewDistrict = typeof districts.$inferInsert;

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;

export type FinishingType = (typeof finishingEnum.enumValues)[number];
