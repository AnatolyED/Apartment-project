import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
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

export const apartmentImportModeEnum = pgEnum('apartment_import_mode', ['rules', 'hybrid']);

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

export const apartmentImportBatches = pgTable(
  'apartment_import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorLogin: varchar('actor_login', { length: 100 }).notNull(),
    actorRole: userRoleEnum('actor_role').notNull(),
    fileName: text('file_name').notNull(),
    fileHash: varchar('file_hash', { length: 64 }),
    mode: apartmentImportModeEnum('mode').notNull().default('rules'),
    parserProvider: varchar('parser_provider', { length: 100 }).notNull().default('rules'),
    status: varchar('status', { length: 32 }).notNull(),
    totalRows: integer('total_rows').notNull().default(0),
    submittedRows: integer('submitted_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    warningRows: integer('warning_rows').notNull().default(0),
    createdCities: text('created_cities').array().notNull().default([]),
    createdDistricts: text('created_districts').array().notNull().default([]),
    rollbackStatus: varchar('rollback_status', { length: 32 }).notNull().default('not_started'),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    rolledBackByUserId: uuid('rolled_back_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rolledBackByLogin: varchar('rolled_back_by_login', { length: 100 }),
    rollbackDetails: jsonb('rollback_details'),
    summary: jsonb('summary'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    apartmentImportBatchesCreatedAtIdx: index('apartment_import_batches_created_at_idx').on(
      table.createdAt
    ),
    apartmentImportBatchesFileHashIdx: index('apartment_import_batches_file_hash_idx').on(
      table.fileHash
    ),
    apartmentImportBatchesRollbackStatusIdx: index(
      'apartment_import_batches_rollback_status_idx'
    ).on(table.rollbackStatus),
  })
);

export const apartmentImportRows = pgTable(
  'apartment_import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => apartmentImportBatches.id, { onDelete: 'cascade' }),
    sourceRowId: varchar('source_row_id', { length: 100 }).notNull(),
    rowNumber: integer('row_number'),
    sourcePage: integer('source_page'),
    sourceId: varchar('source_id', { length: 100 }),
    apartmentId: uuid('apartment_id').references(() => apartments.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    cityName: text('city_name'),
    districtName: text('district_name'),
    status: varchar('status', { length: 32 }).notNull(),
    message: text('message'),
    rollbackStatus: varchar('rollback_status', { length: 32 }).notNull().default('not_started'),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    rollbackMessage: text('rollback_message'),
    warnings: jsonb('warnings'),
    errors: jsonb('errors'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    apartmentImportRowsBatchIdx: index('apartment_import_rows_batch_idx').on(table.batchId),
    apartmentImportRowsApartmentIdx: index('apartment_import_rows_apartment_idx').on(
      table.apartmentId
    ),
  })
);

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
  apartmentImportBatches: many(apartmentImportBatches),
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

export const apartmentImportBatchesRelations = relations(
  apartmentImportBatches,
  ({ one, many }) => ({
    actorUser: one(users, {
      fields: [apartmentImportBatches.actorUserId],
      references: [users.id],
    }),
    rolledBackByUser: one(users, {
      fields: [apartmentImportBatches.rolledBackByUserId],
      references: [users.id],
    }),
    rows: many(apartmentImportRows),
  })
);

export const apartmentImportRowsRelations = relations(apartmentImportRows, ({ one }) => ({
  batch: one(apartmentImportBatches, {
    fields: [apartmentImportRows.batchId],
    references: [apartmentImportBatches.id],
  }),
  apartment: one(apartments, {
    fields: [apartmentImportRows.apartmentId],
    references: [apartments.id],
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

export type ApartmentImportBatch = typeof apartmentImportBatches.$inferSelect;
export type NewApartmentImportBatch = typeof apartmentImportBatches.$inferInsert;

export type ApartmentImportRow = typeof apartmentImportRows.$inferSelect;
export type NewApartmentImportRow = typeof apartmentImportRows.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;

export type FinishingType = (typeof finishingEnum.enumValues)[number];
export type ApartmentImportMode = (typeof apartmentImportModeEnum.enumValues)[number];
