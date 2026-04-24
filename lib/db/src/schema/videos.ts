import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  doublePrecision,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videosTable = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    objectPath: text("object_path").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: doublePrecision("duration_seconds"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index("videos_status_idx").on(table.status),
    createdAtIdx: index("videos_created_at_idx").on(table.createdAt),
  }),
);

export const jobsTable = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    progressPct: integer("progress_pct").notNull().default(0),
    stage: text("stage").notNull().default("Queued"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("jobs_video_id_idx").on(table.videoId),
    statusIdx: index("jobs_status_idx").on(table.status),
  }),
);

export const transcriptsTable = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    fullText: text("full_text").notNull(),
    language: text("language").notNull().default("en"),
    segments: jsonb("segments").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("transcripts_video_id_idx").on(table.videoId),
  }),
);

export const clipsTable = pgTable(
  "clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    startSec: doublePrecision("start_sec").notNull(),
    endSec: doublePrecision("end_sec").notNull(),
    durationSec: doublePrecision("duration_sec").notNull(),
    viralScore: doublePrecision("viral_score").notNull(),
    hookScore: doublePrecision("hook_score").notNull(),
    energyScore: doublePrecision("energy_score").notNull(),
    sentimentScore: doublePrecision("sentiment_score").notNull(),
    keywordDensity: doublePrecision("keyword_density").notNull(),
    speechRate: doublePrecision("speech_rate").notNull(),
    caption: text("caption").notNull(),
    hookLine: text("hook_line").notNull(),
    transcriptText: text("transcript_text").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    videoIdIdx: index("clips_video_id_idx").on(table.videoId),
    jobIdIdx: index("clips_job_id_idx").on(table.jobId),
    viralScoreIdx: index("clips_viral_score_idx").on(table.viralScore),
  }),
);

export const insertVideoSchema = createInsertSchema(videosTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type VideoRow = typeof videosTable.$inferSelect;

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobRow = typeof jobsTable.$inferSelect;

export const insertTranscriptSchema = createInsertSchema(transcriptsTable).omit(
  {
    id: true,
    createdAt: true,
  },
);
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type TranscriptRow = typeof transcriptsTable.$inferSelect;

export const insertClipSchema = createInsertSchema(clipsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClip = z.infer<typeof insertClipSchema>;
export type ClipRow = typeof clipsTable.$inferSelect;
