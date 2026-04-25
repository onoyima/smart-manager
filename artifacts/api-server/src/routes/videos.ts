import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  videosTable,
  jobsTable,
  transcriptsTable,
  clipsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { startPipelineInBackground, startManualClipPipelineInBackground } from "../lib/pipeline";
import { fromStoragePath, isSafeStoragePath, deleteDir, PROCESSED_DIR, toStoragePath } from "../lib/localStorage";
import path from "path";
import fs from "fs";

const router = Router();

function serializeVideo(v: typeof videosTable.$inferSelect) {
  return {
    id: v.id,
    fileName: v.fileName,
    contentType: v.contentType,
    sizeBytes: v.sizeBytes,
    durationSeconds: v.durationSeconds,
    status: v.status,
    objectPath: toStoragePath(v.filePath),
    createdAt: v.createdAt.toISOString(),
  };
}



function serializeJob(j: typeof jobsTable.$inferSelect) {
  return {
    id: j.id,
    videoId: j.videoId,
    status: j.status,
    progressPct: j.progressPct,
    stage: j.stage,
    errorMessage: j.errorMessage,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    createdAt: j.createdAt.toISOString(),
  };
}

function serializeClip(c: typeof clipsTable.$inferSelect) {
  return {
    id: c.id,
    videoId: c.videoId,
    jobId: c.jobId,
    rank: c.rank,
    startSec: c.startSec,
    endSec: c.endSec,
    durationSec: c.durationSec,
    viralScore: c.viralScore,
    hookScore: c.hookScore,
    energyScore: c.energyScore,
    sentimentScore: c.sentimentScore,
    keywordDensity: c.keywordDensity,
    speechRate: c.speechRate,
    caption: c.caption,
    hookLine: c.hookLine,
    transcriptText: c.transcriptText,
    rationale: c.rationale,
    clipUrl: c.clipPath ? `/api/files/${c.clipPath}` : null,
    thumbnailUrl: c.thumbnailPath ? `/api/files/${c.thumbnailPath}` : null,
    srtUrl: c.srtPath ? `/api/files/${c.srtPath}` : null,
  };
}

// GET /videos — list user's videos
router.get("/videos", authenticate, async (req: AuthRequest, res: Response) => {
  const rows = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.userId, req.user!.userId))
    .orderBy(desc(videosTable.createdAt));
  res.json(rows.map(serializeVideo));
});

// GET /videos/:id — video detail with job and clips
router.get("/videos/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const [video] = await db
    .select()
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));

  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.videoId, id))
    .orderBy(desc(jobsTable.createdAt))
    .limit(1);

  const clips = await db
    .select()
    .from(clipsTable)
    .where(eq(clipsTable.videoId, id))
    .orderBy(clipsTable.rank);

  res.json({
    video: serializeVideo(video),
    job: job
      ? serializeJob(job)
      : { id: "", videoId: id, status: "queued", progressPct: 0, stage: "Queued", errorMessage: null, startedAt: null, completedAt: null, createdAt: new Date().toISOString() },
    clips: clips.map(serializeClip),
  });
});

// DELETE /videos/:id
router.delete("/videos/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const [video] = await db
    .select()
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  // Delete original file
  try { fs.unlinkSync(video.filePath); } catch { /* ignore */ }

  // Delete all processed job folders
  const jobs = await db.select().from(jobsTable).where(eq(jobsTable.videoId, id));
  for (const job of jobs) {
    await deleteDir(path.join(PROCESSED_DIR, job.id));
  }

  await db.delete(videosTable).where(eq(videosTable.id, id));
  res.status(204).end();
});

// POST /videos/:id/reprocess
router.post("/videos/:id/reprocess", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const [video] = await db
    .select()
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(clipsTable).where(eq(clipsTable.videoId, id));
  await db.delete(transcriptsTable).where(eq(transcriptsTable.videoId, id));

  const [job] = await db
    .insert(jobsTable)
    .values({ videoId: id, status: "queued", stage: "Queued", progressPct: 0 })
    .$returningId();

  if (!job) { res.status(500).json({ error: "Failed to create job" }); return; }

  await db.update(videosTable).set({ status: "pending", updatedAt: new Date() }).where(eq(videosTable.id, id));

  startPipelineInBackground(id, job.id);
  res.status(202).json({ jobId: job.id });
});

// POST /videos/:id/clips/manual — generate a manual clip
router.post("/videos/:id/clips/manual", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { startSec, endSec, caption } = req.body;

  if (typeof startSec !== "number" || typeof endSec !== "number" || !caption) {
    res.status(400).json({ error: "startSec, endSec (numbers) and caption (string) are required" });
    return;
  }

  const [video] = await db
    .select()
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const [job] = await db
    .insert(jobsTable)
    .values({ videoId: id, status: "queued", stage: "Queued (Manual Clip)", progressPct: 0 })
    .$returningId();

  if (!job) { res.status(500).json({ error: "Failed to create job" }); return; }

  startManualClipPipelineInBackground(id, job.id, { startSec, endSec, caption });
  res.status(202).json({ jobId: job.id });
});


// POST /videos/:id/stop
router.post("/videos/:id/stop", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const [video] = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.videoId, id))
    .orderBy(desc(jobsTable.createdAt))
    .limit(1);

  if (job && (job.status === "queued" || job.status === "processing")) {
    const { stopJob } = await import("../lib/pipeline");
    stopJob(job.id);
    res.json({ message: "Job cancellation requested" });
  } else {
    res.status(400).json({ error: "No active job to stop" });
  }
});

// GET /videos/:id/transcript
router.get("/videos/:id/transcript", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const [video] = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(and(eq(videosTable.id, id), eq(videosTable.userId, req.user!.userId)));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const [transcript] = await db
    .select()
    .from(transcriptsTable)
    .where(eq(transcriptsTable.videoId, id))
    .orderBy(desc(transcriptsTable.createdAt))
    .limit(1);

  if (!transcript) { res.status(404).json({ error: "No transcript yet" }); return; }
  res.json({
    id: transcript.id,
    videoId: transcript.videoId,
    fullText: transcript.fullText,
    language: transcript.language,
    segments: transcript.segments ?? [],
  });
});

// GET /clips — list all clips for user
router.get("/clips", authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const videos = await db.select({ id: videosTable.id }).from(videosTable).where(eq(videosTable.userId, userId));
  const videoIds = videos.map((v) => v.id);

  if (videoIds.length === 0) {
    res.json([]);
    return;
  }

  const { inArray } = await import("drizzle-orm");
  const clips = await db
    .select()
    .from(clipsTable)
    .where(inArray(clipsTable.videoId, videoIds))
    .orderBy(desc(clipsTable.createdAt));

  res.json(clips.map(serializeClip));
});

// GET /stats
router.get("/stats", authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const videos = await db.select().from(videosTable).where(eq(videosTable.userId, userId));
  const totalVideos = videos.length;
  const completedVideos = videos.filter((v) => v.status === "done").length;
  const processingVideos = videos.filter((v) => v.status === "processing" || v.status === "pending").length;
  const failedVideos = videos.filter((v) => v.status === "failed").length;

  const videoIds = videos.map((v) => v.id);
  let allClips: typeof clipsTable.$inferSelect[] = [];
  if (videoIds.length > 0) {
    allClips = await db
      .select()
      .from(clipsTable)
      .where(eq(clipsTable.videoId, videoIds[0]!)) // simplified — full version below
      .orderBy(desc(clipsTable.viralScore));
  }

  // Proper multi-video clip query
  if (videoIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    allClips = await db
      .select()
      .from(clipsTable)
      .where(inArray(clipsTable.videoId, videoIds))
      .orderBy(desc(clipsTable.viralScore));
  }

  const totalClips = allClips.length;
  const averageViralScore =
    totalClips > 0 ? allClips.reduce((acc, c) => acc + c.viralScore, 0) / totalClips : 0;
  const topClips = allClips.slice(0, 5).map(serializeClip);

  res.json({ totalVideos, totalClips, completedVideos, processingVideos, failedVideos, averageViralScore, topClips });
});

// GET /files/* — serve local storage files
router.get("/files/*filePath", authenticate, (req: AuthRequest, res: Response) => {
  const raw = req.params.filePath as string;
  const storagePath = Array.isArray(raw) ? raw.join("/") : raw;

  if (!isSafeStoragePath(storagePath)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const absPath = fromStoragePath(storagePath);
  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.sendFile(absPath);
});

export default router;
