import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  datetime,
  double,
  text,
  json,
  index,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { randomUUID } from "crypto";
import { usersTable } from "./users";

export const videosTable = mysqlTable(
  "videos",
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
    durationSeconds: double("duration_seconds"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    userIdIdx: index("videos_user_id_idx").on(table.userId),
    statusIdx: index("videos_status_idx").on(table.status),
    createdAtIdx: index("videos_created_at_idx").on(table.createdAt),
  }),
);

export const jobsTable = mysqlTable(
  "jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    videoId: varchar("video_id", { length: 36 })
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).notNull().default("queued"),
    progressPct: int("progress_pct").notNull().default(0),
    stage: varchar("stage", { length: 255 }).notNull().default("Queued"),
    errorMessage: text("error_message"),
    retries: int("retries").notNull().default(0),
    startedAt: datetime("started_at", { mode: "date" }),
    completedAt: datetime("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("jobs_video_id_idx").on(table.videoId),
    statusIdx: index("jobs_status_idx").on(table.status),
  }),
);

export const transcriptsTable = mysqlTable(
  "transcripts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    videoId: varchar("video_id", { length: 36 })
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    fullText: text("full_text").notNull(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    segments: json("segments").notNull().$type<{ start: number; end: number; text: string }[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("transcripts_video_id_idx").on(table.videoId),
  }),
);

export const clipsTable = mysqlTable(
  "clips",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    videoId: varchar("video_id", { length: 36 })
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    rank: int("rank").notNull(),
    startSec: double("start_sec").notNull(),
    endSec: double("end_sec").notNull(),
    durationSec: double("duration_sec").notNull(),
    viralScore: double("viral_score").notNull(),
    hookScore: double("hook_score").notNull(),
    energyScore: double("energy_score").notNull(),
    sentimentScore: double("sentiment_score").notNull(),
    keywordDensity: double("keyword_density").notNull(),
    speechRate: double("speech_rate").notNull(),
    caption: text("caption").notNull(),
    hookLine: text("hook_line").notNull(),
    transcriptText: text("transcript_text").notNull(),
    rationale: text("rationale").notNull(),
    clipPath: text("clip_path"),
    thumbnailPath: text("thumbnail_path"),
    srtPath: text("srt_path"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("clips_video_id_idx").on(table.videoId),
    jobIdIdx: index("clips_job_id_idx").on(table.jobId),
    viralScoreIdx: index("clips_viral_score_idx").on(table.viralScore),
  }),
);

export const refreshTokensTable = mysqlTable(
  "refresh_tokens",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 512 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
    tokenIdx: index("refresh_tokens_token_idx").on(table.token),
  }),
);

export const insertVideoSchema = z.object({
  userId: z.string().uuid(),
  fileName: z.string(),
  filePath: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  durationSeconds: z.number().nullable().optional(),
  status: z.string().optional(),
});
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type VideoRow = typeof videosTable.$inferSelect;

export const insertJobSchema = z.object({
  videoId: z.string().uuid(),
  status: z.string().optional(),
  progressPct: z.number().optional(),
  stage: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
  retries: z.number().optional(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobRow = typeof jobsTable.$inferSelect;

export const insertTranscriptSchema = z.object({
  videoId: z.string().uuid(),
  fullText: z.string(),
  language: z.string().optional(),
  segments: z.array(z.object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
  })),
});
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type TranscriptRow = typeof transcriptsTable.$inferSelect;

export const insertClipSchema = z.object({
  videoId: z.string().uuid(),
  jobId: z.string().uuid(),
  rank: z.number(),
  startSec: z.number(),
  endSec: z.number(),
  durationSec: z.number(),
  viralScore: z.number(),
  hookScore: z.number(),
  energyScore: z.number(),
  sentimentScore: z.number(),
  keywordDensity: z.number(),
  speechRate: z.number(),
  caption: z.string(),
  hookLine: z.string(),
  transcriptText: z.string(),
  rationale: z.string(),
  clipPath: z.string().nullable().optional(),
  thumbnailPath: z.string().nullable().optional(),
  srtPath: z.string().nullable().optional(),
});
export type InsertClip = z.infer<typeof insertClipSchema>;
export type ClipRow = typeof clipsTable.$inferSelect;

