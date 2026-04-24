import { Readable } from "stream";
import { openai } from "@workspace/integrations-openai-ai-server";
import { toFile } from "openai";
import { db } from "@workspace/db";
import {
  videosTable,
  jobsTable,
  transcriptsTable,
  clipsTable,
  type JobRow,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const objectStorage = new ObjectStorageService();

interface SegmentScore {
  start: number;
  end: number;
  text: string;
  hookScore: number;
  energyScore: number;
  sentimentScore: number;
  keywordDensity: number;
  speechRate: number;
  viralScore: number;
  caption: string;
  hookLine: string;
  rationale: string;
}

interface WhisperSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
}

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

async function downloadVideoBuffer(objectPath: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const contentType =
    (typeof metadata.contentType === "string" && metadata.contentType) ||
    "video/mp4";

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    file
      .createReadStream()
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType }))
      .on("error", reject);
  });
}

function pickFilename(contentType: string): string {
  if (contentType.includes("webm")) return "video.webm";
  if (contentType.includes("mov") || contentType.includes("quicktime"))
    return "video.mov";
  if (contentType.includes("mpeg")) return "video.mpeg";
  if (contentType.includes("wav")) return "audio.wav";
  if (contentType.includes("mp3") || contentType.includes("mpga"))
    return "audio.mp3";
  if (contentType.includes("m4a")) return "audio.m4a";
  return "video.mp4";
}

async function transcribe(
  videoBuffer: Buffer,
  contentType: string,
): Promise<{ text: string; language: string; segments: WhisperSegment[]; duration: number }> {
  const file = await toFile(
    Readable.from(videoBuffer),
    pickFilename(contentType),
    { type: contentType },
  );

  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  // verbose_json shape
  const verbose = result as unknown as {
    text: string;
    language?: string;
    duration?: number;
    segments?: WhisperSegment[];
  };

  return {
    text: verbose.text,
    language: verbose.language ?? "en",
    duration: verbose.duration ?? 0,
    segments: (verbose.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}

interface ClipWindow {
  start: number;
  end: number;
  text: string;
  segmentIndices: number[];
}

function buildCandidateWindows(
  segments: WhisperSegment[],
  targetMinSec = 15,
  targetMaxSec = 60,
): ClipWindow[] {
  if (segments.length === 0) return [];
  const windows: ClipWindow[] = [];

  for (let i = 0; i < segments.length; i++) {
    let end = i;
    let acc = "";
    while (end < segments.length) {
      const start = segments[i]!.start;
      const stop = segments[end]!.end;
      const dur = stop - start;
      acc = (acc + " " + segments[end]!.text).trim();
      if (dur >= targetMinSec) {
        if (dur <= targetMaxSec) {
          windows.push({
            start,
            end: stop,
            text: acc,
            segmentIndices: Array.from({ length: end - i + 1 }, (_, k) => i + k),
          });
        }
        if (dur >= targetMaxSec) break;
      }
      end++;
    }
  }

  // Deduplicate overlapping windows: pick at most one per starting segment
  // Keep first valid 30-45s window per starting segment for simplicity
  const seen = new Set<number>();
  const filtered: ClipWindow[] = [];
  for (const w of windows) {
    const key = w.segmentIndices[0]!;
    if (seen.has(key)) continue;
    const dur = w.end - w.start;
    if (dur >= 25 && dur <= 50) {
      filtered.push(w);
      seen.add(key);
    }
  }
  return filtered.length ? filtered : windows;
}

interface AIScoreResponse {
  hook: number;
  energy: number;
  sentiment: number;
  keywordDensity: number;
  speechRate: number;
  caption: string;
  hookLine: string;
  rationale: string;
}

async function scoreWindow(window: ClipWindow): Promise<AIScoreResponse> {
  const dur = window.end - window.start;
  const wordCount = window.text.split(/\s+/).filter(Boolean).length;
  const wpm = dur > 0 ? (wordCount / dur) * 60 : 0;

  const prompt = `You are a viral short-form video editor (TikTok, Reels, Shorts). Analyze this transcript segment and score its viral potential.

Segment duration: ${dur.toFixed(1)}s
Word count: ${wordCount}
Speech rate: ${wpm.toFixed(0)} words/min

Transcript:
"""
${window.text}
"""

Return ONLY a JSON object with these exact keys:
{
  "hook": <0-100, strength of opening hook — does it grab attention immediately?>,
  "energy": <0-100, vocal energy / excitement / urgency conveyed by the language>,
  "sentiment": <0-100, emotional intensity (positive OR negative both score high)>,
  "keywordDensity": <0-100, density of viral / curiosity / shock / emotional keywords>,
  "speechRate": <0-100, where 100 means optimal pace (~150-180 wpm), 0 means too slow or too fast>,
  "caption": "<1 sentence punchy caption (under 100 chars) that would work on TikTok/Reels>",
  "hookLine": "<the actual opening line of this clip, lifted or lightly polished>",
  "rationale": "<one sentence: why this clip will or won't go viral>"
}

Be honest. Boring filler should score low. Only emotionally charged, surprising, or quotable moments score above 70.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: "You return only valid JSON. No prose." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<AIScoreResponse> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    hook: clamp(parsed.hook),
    energy: clamp(parsed.energy),
    sentiment: clamp(parsed.sentiment),
    keywordDensity: clamp(parsed.keywordDensity),
    speechRate: clamp(parsed.speechRate),
    caption: (parsed.caption ?? window.text.slice(0, 100)).trim(),
    hookLine: (parsed.hookLine ?? window.text.split(".")[0] ?? "").trim(),
    rationale: (parsed.rationale ?? "").trim(),
  };
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function viralFormula(s: {
  hook: number;
  energy: number;
  sentiment: number;
  keywordDensity: number;
  speechRate: number;
}): number {
  // Original prompt: energy 0.30, keyword 0.20, sentiment 0.15, speech 0.10, motion 0.10, hook 0.15.
  // Motion not detectable from transcript — redistribute to hook (+0.05) and energy (+0.05).
  return (
    s.energy * 0.35 +
    s.keywordDensity * 0.2 +
    s.sentiment * 0.15 +
    s.speechRate * 0.1 +
    s.hook * 0.2
  );
}

export async function runPipeline(videoId: string, jobId: string): Promise<void> {
  const log = logger.child({ videoId, jobId });
  try {
    log.info("Pipeline started");
    await updateJob(jobId, {
      status: "processing",
      stage: "Downloading video",
      progressPct: 5,
      startedAt: new Date(),
    });
    await updateVideoStatus(videoId, "processing");

    const [video] = await db
      .select()
      .from(videosTable)
      .where(eq(videosTable.id, videoId));
    if (!video) throw new Error("Video not found");

    const { buffer, contentType } = await downloadVideoBuffer(video.objectPath);
    log.info({ bytes: buffer.length }, "Video downloaded");

    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error(
        "File exceeds Whisper's 25MB transcription limit. Please upload a shorter clip (under ~10 minutes at standard quality).",
      );
    }

    await updateJob(jobId, {
      stage: "Transcribing audio",
      progressPct: 25,
    });

    const transcription = await transcribe(buffer, contentType);
    log.info(
      { segments: transcription.segments.length, duration: transcription.duration },
      "Transcription complete",
    );

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

    await updateJob(jobId, {
      stage: "Building clip candidates",
      progressPct: 50,
    });

    const windows = buildCandidateWindows(transcription.segments);
    log.info({ candidates: windows.length }, "Candidate windows built");

    if (windows.length === 0) {
      await updateJob(jobId, {
        status: "done",
        stage: "No viable clips found",
        progressPct: 100,
        completedAt: new Date(),
      });
      await updateVideoStatus(videoId, "done");
      return;
    }

    await updateJob(jobId, {
      stage: `Scoring ${windows.length} candidates with AI`,
      progressPct: 60,
    });

    // Cap to avoid runaway cost on long videos
    const toScore = windows.slice(0, 24);
    const scored: SegmentScore[] = [];
    for (let i = 0; i < toScore.length; i++) {
      const w = toScore[i]!;
      try {
        const result = await scoreWindow(w);
        const viralScore = viralFormula(result);
        scored.push({
          start: w.start,
          end: w.end,
          text: w.text,
          hookScore: result.hook,
          energyScore: result.energy,
          sentimentScore: result.sentiment,
          keywordDensity: result.keywordDensity,
          speechRate: result.speechRate,
          viralScore,
          caption: result.caption,
          hookLine: result.hookLine,
          rationale: result.rationale,
        });
      } catch (err) {
        log.warn({ err, idx: i }, "Failed to score window");
      }
      const pct = 60 + Math.floor(((i + 1) / toScore.length) * 30);
      await updateJob(jobId, { progressPct: pct });
    }

    await updateJob(jobId, {
      stage: "Selecting top clips",
      progressPct: 92,
    });

    scored.sort((a, b) => b.viralScore - a.viralScore);
    const top = scored.slice(0, 5);

    if (top.length > 0) {
      await db.insert(clipsTable).values(
        top.map((s, idx) => ({
          videoId,
          jobId,
          rank: idx + 1,
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
        })),
      );
    }

    await updateJob(jobId, {
      status: "done",
      stage: "Complete",
      progressPct: 100,
      completedAt: new Date(),
    });
    await updateVideoStatus(videoId, "done");
    log.info({ clips: top.length }, "Pipeline complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Pipeline failed");
    await updateJob(jobId, {
      status: "failed",
      stage: "Failed",
      errorMessage: message,
      completedAt: new Date(),
    });
    await updateVideoStatus(videoId, "failed");
  }
}

export function startPipelineInBackground(videoId: string, jobId: string): void {
  // Fire and forget; pipeline updates DB rows
  void runPipeline(videoId, jobId).catch((err) => {
    logger.error({ err, videoId, jobId }, "Unhandled pipeline error");
  });
}

export type { JobRow };
