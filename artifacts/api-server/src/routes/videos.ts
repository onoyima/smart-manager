import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  videosTable,
  jobsTable,
  transcriptsTable,
  clipsTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  CreateVideoBody,
  GetStatsResponse,
  ListVideosResponse,
  ListVideoClipsResponse,
  GetVideoResponse,
  GetVideoJobResponse,
  GetVideoTranscriptResponse,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { startPipelineInBackground } from "../lib/pipeline";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function serializeVideo(v: typeof videosTable.$inferSelect) {
  return {
    id: v.id,
    fileName: v.fileName,
    objectPath: v.objectPath,
    contentType: v.contentType,
    sizeBytes: v.sizeBytes,
    durationSeconds: v.durationSeconds,
    status: v.status,
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
  };
}

router.get("/videos", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(videosTable)
    .orderBy(desc(videosTable.createdAt));
  res.json(ListVideosResponse.parse(rows.map(serializeVideo)));
});

router.post("/videos", async (req: Request, res: Response) => {
  const parsed = CreateVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const { fileName, objectPath, contentType, sizeBytes } = parsed.data;

  // Normalize object path through storage helper to ensure consistent format.
  const normalized = objectPath.startsWith("/objects/")
    ? objectPath
    : objectStorage.normalizeObjectEntityPath(objectPath);

  const [video] = await db
    .insert(videosTable)
    .values({
      fileName,
      objectPath: normalized,
      contentType,
      sizeBytes,
      status: "pending",
    })
    .returning();
  if (!video) {
    res.status(500).json({ error: "Failed to create video" });
    return;
  }

  const [job] = await db
    .insert(jobsTable)
    .values({
      videoId: video.id,
      status: "queued",
      stage: "Queued",
      progressPct: 0,
    })
    .returning();
  if (!job) {
    res.status(500).json({ error: "Failed to create job" });
    return;
  }

  startPipelineInBackground(video.id, job.id);

  res.status(201).json({
    video: serializeVideo(video),
    job: serializeJob(job),
  });
});

router.get("/videos/:id", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id));
  if (!video) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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

  const payload = {
    video: serializeVideo(video),
    job: job
      ? serializeJob(job)
      : {
          id: "",
          videoId: id,
          status: "queued",
          progressPct: 0,
          stage: "Queued",
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
        },
    clips: clips.map(serializeClip),
  };
  res.json(GetVideoResponse.parse(payload));
});

router.delete("/videos/:id", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  await db.delete(videosTable).where(eq(videosTable.id, id));
  res.status(204).end();
});

router.get("/videos/:id/job", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.videoId, id))
    .orderBy(desc(jobsTable.createdAt))
    .limit(1);
  if (!job) {
    res.status(404).json({ error: "No job found" });
    return;
  }
  res.json(GetVideoJobResponse.parse(serializeJob(job)));
});

router.get("/videos/:id/clips", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const clips = await db
    .select()
    .from(clipsTable)
    .where(eq(clipsTable.videoId, id))
    .orderBy(clipsTable.rank);
  res.json(ListVideoClipsResponse.parse(clips.map(serializeClip)));
});

router.get("/videos/:id/transcript", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const [transcript] = await db
    .select()
    .from(transcriptsTable)
    .where(eq(transcriptsTable.videoId, id))
    .orderBy(desc(transcriptsTable.createdAt))
    .limit(1);
  if (!transcript) {
    res.status(404).json({ error: "No transcript yet" });
    return;
  }
  res.json(
    GetVideoTranscriptResponse.parse({
      id: transcript.id,
      videoId: transcript.videoId,
      fullText: transcript.fullText,
      language: transcript.language,
      segments: transcript.segments ?? [],
    }),
  );
});

router.post("/videos/:id/reprocess", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id));
  if (!video) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Wipe prior clips + transcripts for a clean re-run.
  await db.delete(clipsTable).where(eq(clipsTable.videoId, id));
  await db.delete(transcriptsTable).where(eq(transcriptsTable.videoId, id));

  const [job] = await db
    .insert(jobsTable)
    .values({
      videoId: id,
      status: "queued",
      stage: "Queued",
      progressPct: 0,
    })
    .returning();
  if (!job) {
    res.status(500).json({ error: "Failed to create job" });
    return;
  }
  await db
    .update(videosTable)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(videosTable.id, id));

  startPipelineInBackground(id, job.id);
  res.status(202).json(serializeJob(job));
});

router.get("/stats", async (_req: Request, res: Response) => {
  const videos = await db.select().from(videosTable);
  const totalVideos = videos.length;
  const completedVideos = videos.filter((v) => v.status === "done").length;
  const processingVideos = videos.filter(
    (v) => v.status === "processing" || v.status === "pending",
  ).length;
  const failedVideos = videos.filter((v) => v.status === "failed").length;

  const allClips = await db
    .select()
    .from(clipsTable)
    .orderBy(desc(clipsTable.viralScore));

  const totalClips = allClips.length;
  const averageViralScore =
    totalClips > 0
      ? allClips.reduce((acc, c) => acc + c.viralScore, 0) / totalClips
      : 0;
  const topClips = allClips.slice(0, 5).map(serializeClip);

  res.json(
    GetStatsResponse.parse({
      totalVideos,
      totalClips,
      completedVideos,
      processingVideos,
      failedVideos,
      averageViralScore,
      topClips,
    }),
  );
  // suppress unused
  void sql;
  void and;
});

export default router;
