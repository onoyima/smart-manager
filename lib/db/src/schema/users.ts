import {
  mysqlTable,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { randomUUID } from "crypto";

export const usersTable = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    email: varchar("email", { length: 255 }).notNull().unique(),
    hashedPassword: varchar("hashed_password", { length: 255 }).notNull(),
    plan: varchar("plan", { length: 20 }).notNull().default("free"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

export const insertUserSchema = z.object({
  email: z.string().email(),
  hashedPassword: z.string(),
  plan: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
