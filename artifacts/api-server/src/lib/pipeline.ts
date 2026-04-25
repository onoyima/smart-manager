import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

const ffmpegExe = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe");
const ffprobeExe = path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");

if (fs.existsSync(ffmpegExe)) ffmpeg.setFfmpegPath(ffmpegExe);
if (fs.existsSync(ffprobeExe)) ffmpeg.setFfprobePath(ffprobeExe);

import { db } from "@workspace/db";
import {
  videosTable,
  jobsTable,
  transcriptsTable,
  clipsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { transcribeWithGemini, scoreWindowWithGemini } from "./gemini";
import { getJobProcessedDir, toStoragePath, deleteDir } from "./localStorage";
import { logger } from "./logger";

// ── helpers ──────────────────────────────────────────────────────────────────

async function updateJob(
  jobId: string,
  patch: Partial<{
    status: string;
    progressPct: number;
    stage: string;
    errorMessage: string | null;
    startedAt: Date;
    completedAt: Date;
  }>,
): Promise<void> {
  await db.update(jobsTable).set(patch).where(eq(jobsTable.id, jobId));
}

async function updateVideoStatus(videoId: string, status: string): Promise<void> {
  await db
    .update(videosTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(videosTable.id, videoId));
}

// ── FFmpeg helpers ────────────────────────────────────────────────────────────

function runFFmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on("end", () => resolve()).on("error", reject).run();
  });
}


/** Extract audio to mp3 for Gemini transcription */
async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await runFFmpeg(
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioFrequency(16000)
      .audioChannels(1)
      .output(outputPath),
  );
}

/** Render a clip: trim + scale/pad to 9:16 1080×1920 + H.264 */
async function renderClip(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
  srtPath?: string,
): Promise<void> {
  let filterComplex = [
    "scale=w='if(gt(iw/ih,1080/1920),-1,1080)':h='if(gt(iw/ih,1080/1920),1920,-1)'",
    "crop=1080:1920",
  ];


  const cmd = ffmpeg(inputPath)
    .seekInput(startSec)
    .duration(durationSec)
    .videoCodec("libx264")
    .audioCodec("aac")
    .outputOptions(["-crf 23", "-preset fast", "-movflags +faststart"]);

  if (srtPath && fs.existsSync(srtPath)) {
    // Burn captions — escape Windows path backslashes
    const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filterComplex = [
      ...filterComplex,
      `subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Bold=1,Outline=2,MarginV=60'`,
    ];
  }

  cmd.videoFilter(filterComplex).output(outputPath);
  await runFFmpeg(cmd);
}

/** Extract a JPEG thumbnail at 1s into clip */
async function extractThumbnail(
  clipPath: string,
  thumbPath: string,
): Promise<void> {
  await runFFmpeg(
    ffmpeg(clipPath)
      .seekInput(1)
      .frames(1)
      .output(thumbPath),
  );
}

/** Generate SRT caption file from transcript text and clip window */
function generateSrt(text: string, startSec: number, endSec: number, srtPath: string): void {
  const toSrtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "00")},${String(ms).padStart(3, "0")}`;
  };

  // Split text into ~5 second chunks for caption timing
  const duration = endSec - startSec;
  const words = text.trim().split(/\s+/);
  const chunkSize = Math.ceil(words.length / Math.max(1, Math.ceil(duration / 5)));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }

  const lines: string[] = [];
  const chunkDur = duration / chunks.length;
  chunks.forEach((chunk, i) => {
    const s = startSec + i * chunkDur;
    const e = s + chunkDur - 0.1;
    lines.push(`${i + 1}\n${toSrtTime(s)} --> ${toSrtTime(e)}\n${chunk}\n`);
  });

  fs.writeFileSync(srtPath, lines.join("\n"), "utf-8");
}

// ── Segmentation ──────────────────────────────────────────────────────────────

interface ClipWindow {
  start: number;
  end: number;
  text: string;
}

function buildCandidateWindows(
  segments: { start: number; end: number; text: string }[],
  minSec = 20,
  maxSec = 60,
): ClipWindow[] {
  if (segments.length === 0) return [];
  const windows: ClipWindow[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < segments.length; i++) {
    let acc = "";
    for (let j = i; j < segments.length; j++) {
      const start = segments[i]!.start;
      const end = segments[j]!.end;
      const dur = end - start;
      acc = (acc + " " + segments[j]!.text).trim();

      if (dur >= minSec && dur <= maxSec && !seen.has(i)) {
        windows.push({ start, end, text: acc });
        seen.add(i);
      }
      if (dur > maxSec) break;
    }
  }

  return windows;
}

// ── Viral formula ─────────────────────────────────────────────────────────────

function viralFormula(s: {
  hook: number;
  energy: number;
  sentiment: number;
  keywordDensity: number;
  speechRate: number;
  motionIntensity: number;
}): number {
  return (
    s.energy * 0.30 +
    s.keywordDensity * 0.20 +
    s.sentiment * 0.15 +
    s.speechRate * 0.10 +
    s.motionIntensity * 0.10 +
    s.hook * 0.15
  );
}


// ── Job Tracking ─────────────────────────────────────────────────────────────
const activeJobs = new Map<string, { aborted: boolean }>();

export function stopJob(jobId: string) {
  const job = activeJobs.get(jobId);
  if (job) {
    job.aborted = true;
    logger.info({ jobId }, "Job marked for cancellation");
  }
}

function checkAborted(jobId: string) {
  const job = activeJobs.get(jobId);
  if (job?.aborted) {
    throw new Error("Job cancelled by user");
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPipeline(videoId: string, jobId: string): Promise<void> {
  const log = logger.child({ videoId, jobId });
  const processedDir = getJobProcessedDir(jobId);
  activeJobs.set(jobId, { aborted: false });

  try {
    log.info("Pipeline started");
    checkAborted(jobId);

    await updateJob(jobId, {
      status: "processing",
      stage: "Starting pipeline",
      progressPct: 5,
      startedAt: new Date(),
    });
    await updateVideoStatus(videoId, "processing");


    // ── Step 1: Load video record ───────────────────────────────────────────
    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId));
    if (!video) throw new Error("Video record not found");

    const inputPath = video.filePath;
    if (!fs.existsSync(inputPath)) throw new Error(`Video file not found at: ${inputPath}`);

    // ── Step 2: Extract audio ────────────────────────────────────────────────
    await updateJob(jobId, { stage: "Extracting audio", progressPct: 15 });
    checkAborted(jobId);
    const audioPath = path.join(processedDir, "audio.mp3");
    await extractAudio(inputPath, audioPath);
    log.info("Audio extracted");

    // ── Step 3: Transcribe with Gemini ───────────────────────────────────────
    await updateJob(jobId, { stage: "Transcribing audio with Gemini AI", progressPct: 30 });
    checkAborted(jobId);
    const transcription = await transcribeWithGemini(audioPath, "audio/mp3");
    log.info({ segments: transcription.segments.length, duration: transcription.duration }, "Transcription complete");

    if (transcription.duration > 0) {
      await db
        .update(videosTable)
        .set({ durationSeconds: transcription.duration, updatedAt: new Date() })
        .where(eq(videosTable.id, videoId));
    }

    await db.insert(transcriptsTable).values({
      videoId,
      fullText: transcription.text,
      language: transcription.language,
      segments: transcription.segments,
    });

    // ── Step 4: Build candidate windows ──────────────────────────────────────
    await updateJob(jobId, { stage: "Finding viral clip candidates", progressPct: 50 });
    checkAborted(jobId);
    const windows = buildCandidateWindows(transcription.segments);
    log.info({ candidates: windows.length }, "Candidate windows built");

    if (windows.length === 0) {
      await updateJob(jobId, {
        status: "done",
        stage: "No viable clips found — try a longer video",
        progressPct: 100,
        completedAt: new Date(),
      });
      await updateVideoStatus(videoId, "done");
      return;
    }

    // ── Step 5: Score windows with Gemini ─────────────────────────────────────
    const toScore = windows.slice(0, 20);
    await updateJob(jobId, {
      stage: `Scoring ${toScore.length} candidates with Gemini AI`,
      progressPct: 55,
    });

    const scored: Array<{
      start: number; end: number; text: string;
      hookScore: number; energyScore: number; sentimentScore: number;
      keywordDensity: number; speechRate: number; viralScore: number;
      caption: string; hookLine: string; rationale: string;
    }> = [];

    for (let i = 0; i < toScore.length; i++) {
      checkAborted(jobId);
      const w = toScore[i]!;
      try {
        const motionIntensity = 0.5; // Placeholder for OpenCV motion analysis
        const result = await scoreWindowWithGemini(w.text, w.end - w.start);
        const vs = viralFormula({ ...result, motionIntensity });
        scored.push({
          start: w.start, end: w.end, text: w.text,
          hookScore: result.hook, energyScore: result.energy,
          sentimentScore: result.sentiment, keywordDensity: result.keywordDensity,
          speechRate: result.speechRate, viralScore: vs,
          caption: result.caption, hookLine: result.hookLine, rationale: result.rationale,
        });
      } catch (err) {
        log.warn({ err, idx: i }, "Failed to score window");
      }
      const pct = 55 + Math.floor(((i + 1) / toScore.length) * 25);
      await updateJob(jobId, { progressPct: pct });
      
      // Add a small delay to avoid hitting burst quota limits
      if (i < toScore.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }


    // ── Step 6: Select top 5 ────────────────────────────────────────────────
    await updateJob(jobId, { stage: "Rendering top clips", progressPct: 80 });
    checkAborted(jobId);
    scored.sort((a, b) => b.viralScore - a.viralScore);
    const top5 = scored.slice(0, 5);

    // ── Step 7–12: Render each clip, SRT, thumbnail ──────────────────────────
    const clipRecords: typeof clipsTable.$inferInsert[] = [];

    for (let idx = 0; idx < top5.length; idx++) {
      checkAborted(jobId);
      const s = top5[idx]!;
      const rank = idx + 1;
      const clipFile = path.join(processedDir, `clip-${rank}.mp4`);
      const thumbFile = path.join(processedDir, `thumb-${rank}.jpg`);
      const srtFile = path.join(processedDir, `clip-${rank}.srt`);

      try {
        // Generate SRT
        generateSrt(s.text, s.start, s.end, srtFile);

        // Render clip (9:16, captions burned)
        await renderClip(inputPath, clipFile, s.start, s.end - s.start, srtFile);

        // Extract thumbnail
        if (fs.existsSync(clipFile)) {
          await extractThumbnail(clipFile, thumbFile);
        }

        log.info({ rank }, "Clip rendered");
      } catch (err) {
        log.warn({ err, rank }, "Clip rendering failed — saving metadata only");
      }

      clipRecords.push({
        videoId,
        jobId,
        rank,
        startSec: s.start,
        endSec: s.end,
        durationSec: s.end - s.start,
        viralScore: s.viralScore,
        hookScore: s.hookScore,
        energyScore: s.energyScore,
        sentimentScore: s.sentimentScore,
        keywordDensity: s.keywordDensity,
        speechRate: s.speechRate,
        caption: s.caption,
        hookLine: s.hookLine,
        transcriptText: s.text,
        rationale: s.rationale,
        clipPath: fs.existsSync(clipFile) ? toStoragePath(clipFile) : null,
        thumbnailPath: fs.existsSync(thumbFile) ? toStoragePath(thumbFile) : null,
        srtPath: fs.existsSync(srtFile) ? toStoragePath(srtFile) : null,
      });
    }

    if (clipRecords.length > 0) {
      await db.insert(clipsTable).values(clipRecords);
    }

    // ── Step 13: Cleanup temp audio ──────────────────────────────────────────
    try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

    await updateJob(jobId, {
      status: "done",
      stage: "Complete",
      progressPct: 100,
      completedAt: new Date(),
    });
    await updateVideoStatus(videoId, "done");
    log.info({ clips: clipRecords.length }, "Pipeline complete");

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Pipeline failed");
    await updateJob(jobId, {
      status: message === "Job cancelled by user" ? "failed" : "failed",
      stage: message === "Job cancelled by user" ? "Cancelled" : "Failed",
      errorMessage: message,
      completedAt: new Date(),
    });
    await updateVideoStatus(videoId, message === "Job cancelled by user" ? "failed" : "failed");
  } finally {
    activeJobs.delete(jobId);
  }
}

export function startPipelineInBackground(videoId: string, jobId: string): void {
  void runPipeline(videoId, jobId).catch((err) => {
    logger.error({ err, videoId, jobId }, "Unhandled pipeline error");
  });
}

export async function runManualClipPipeline(
  videoId: string,
  jobId: string,
  config: { startSec: number; endSec: number; caption: string }
): Promise<void> {
  const log = logger.child({ videoId, jobId, manual: true });
  const processedDir = getJobProcessedDir(jobId);

  try {
    log.info("Manual clip pipeline started");

    await updateJob(jobId, {
      status: "processing",
      stage: "Generating manual clip",
      progressPct: 10,
      startedAt: new Date(),
    });

    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId));
    if (!video) throw new Error("Video record not found");

    const inputPath = video.filePath;
    if (!fs.existsSync(inputPath)) throw new Error(`Video file not found at: ${inputPath}`);

    const clipFile = path.join(processedDir, `manual-clip.mp4`);
    const thumbFile = path.join(processedDir, `manual-thumb.jpg`);
    const srtFile = path.join(processedDir, `manual-clip.srt`);

    // 1. Generate a simple SRT for the caption if provided
    await updateJob(jobId, { stage: "Preparing captions", progressPct: 30 });
    generateSrt(config.caption, config.startSec, config.endSec, srtFile);

    // 2. Render clip
    await updateJob(jobId, { stage: "Rendering clip with FFmpeg", progressPct: 50 });
    await renderClip(inputPath, clipFile, config.startSec, config.endSec - config.startSec, srtFile);

    // 3. Thumbnail
    await updateJob(jobId, { stage: "Extracting thumbnail", progressPct: 80 });
    if (fs.existsSync(clipFile)) {
      await extractThumbnail(clipFile, thumbFile);
    }

    // 4. Save to DB
    await db.insert(clipsTable).values({
      videoId,
      jobId,
      rank: 0, // Manual clips get rank 0
      startSec: config.startSec,
      endSec: config.endSec,
      durationSec: config.endSec - config.startSec,
      viralScore: 100, // Manual clips are always "viral" to the user
      hookScore: 100,
      energyScore: 100,
      sentimentScore: 100,
      keywordDensity: 100,
      speechRate: 100,
      caption: config.caption,
      hookLine: config.caption.slice(0, 50),
      transcriptText: config.caption,
      rationale: "Manually selected by user",
      clipPath: fs.existsSync(clipFile) ? toStoragePath(clipFile) : null,
      thumbnailPath: fs.existsSync(thumbFile) ? toStoragePath(thumbFile) : null,
      srtPath: fs.existsSync(srtFile) ? toStoragePath(srtFile) : null,
    });

    await updateJob(jobId, {
      status: "done",
      stage: "Complete",
      progressPct: 100,
      completedAt: new Date(),
    });
    log.info("Manual clip complete");

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Manual clip pipeline failed");
    await updateJob(jobId, {
      status: "failed",
      stage: "Failed",
      errorMessage: message,
      completedAt: new Date(),
    });
  }
}

export function startManualClipPipelineInBackground(
  videoId: string,
  jobId: string,
  config: { startSec: number; endSec: number; caption: string }
): void {
  void runManualClipPipeline(videoId, jobId, config).catch((err) => {
    logger.error({ err, videoId, jobId }, "Unhandled manual pipeline error");
  });
}

