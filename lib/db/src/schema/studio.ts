import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  text,
  json,
  index,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { randomUUID } from "crypto";
import { usersTable } from "./users";

export const studioProjectsTable = mysqlTable(
  "studio_projects",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull().default("Untitled Project"),
    aspectRatio: varchar("aspect_ratio", { length: 20 }).notNull().default("9:16"),
    timelineItems: json("timeline_items").notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    userIdIdx: index("studio_projects_user_id_idx").on(table.userId),
  })
);

export const studioAssetsTable = mysqlTable(
  "studio_assets",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    filePath: text("file_path").notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'image', 'video', 'audio'
    metadata: json("metadata").$type<{ duration?: number; width?: number; height?: number }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("studio_assets_user_id_idx").on(table.userId),
  })
);

export const insertStudioProjectSchema = createInsertSchema(studioProjectsTable);
export type InsertStudioProject = z.infer<typeof insertStudioProjectSchema>;
export type StudioProjectRow = typeof studioProjectsTable.$inferSelect;

export const insertStudioAssetSchema = createInsertSchema(studioAssetsTable);
export type InsertStudioAsset = z.infer<typeof insertStudioAssetSchema>;
export type StudioAssetRow = typeof studioAssetsTable.$inferSelect;
