import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { logger } from "./logger";
import fs from "fs";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required.");
}

const apiKey = process.env.GEMINI_API_KEY;
export const genAI = new GoogleGenerativeAI(apiKey);
export const fileManager = new GoogleAIFileManager(apiKey);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
}

/**
 * Upload a local file to the Gemini Files API and wait for it to be ready.
 */
async function uploadToGemini(filePath: string, mimeType: string): Promise<string> {
  const log = logger.child({ filePath });
  log.info("Uploading file to Gemini Files API");

  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: filePath.split("/").pop() || "video",
  });

  let file = uploadResult.file;
  // Poll until the file is ACTIVE
  while (file.state === FileState.PROCESSING) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await fileManager.getFile(file.name);
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini file processing failed for: ${filePath}`);
  }

  log.info({ fileUri: file.uri }, "File ready in Gemini");
  return file.uri;
}

/**
 * Transcribe a video/audio file using Gemini 1.5 Pro.
 * Returns transcript text, language, estimated duration, and timed segments.
 */
export async function transcribeWithGemini(
  audioPath: string,
  mimeType: string = "audio/mp3",
): Promise<TranscriptionResult> {
  const fileUri = await uploadToGemini(audioPath, mimeType);

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a speech-to-text transcription engine.
Transcribe the audio/video file accurately.
Return ONLY a valid JSON object with this exact structure:
{
  "language": "<ISO 639-1 language code e.g. en>",
  "duration": <total duration in seconds as a number>,
  "text": "<full transcript as a single string>",
  "segments": [
    { "start": <start time in seconds>, "end": <end time in seconds>, "text": "<segment text>" }
  ]
}
- Transcribe in the ORIGINAL language of the audio. NEVER translate to another language.
- Each segment should be 1-3 sentences, approximately 5-20 seconds long
- Timestamps must be accurate to 0.1 seconds
- Do not include any text outside the JSON object`;


  const result = await withRetry(() => model.generateContent([
    { fileData: { mimeType, fileUri } },
    { text: prompt },
  ]));


  const raw = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: TranscriptionResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ raw }, "Failed to parse Gemini transcription response");
    throw new Error("Gemini returned invalid JSON for transcription");
  }

  return {
    text: parsed.text || "",
    language: parsed.language || "en",
    duration: parsed.duration || 0,
    segments: (parsed.segments || []).map((s: TranscriptSegment) => ({
      start: Number(s.start),
      end: Number(s.end),
      text: String(s.text).trim(),
    })),
  };
}

export interface AIScoreResponse {
  hook: number;
  energy: number;
  sentiment: number;
  keywordDensity: number;
  speechRate: number;
  caption: string;
  hookLine: string;
  rationale: string;
}

/**
 * Helper to run Gemini requests with automatic retry on 429 quota errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      const isQuotaError = err?.message?.includes("429") || err?.status === 429;
      if (isQuotaError && attempt < maxRetries - 1) {
        attempt++;
        const waitMs = attempt * 5000 + Math.random() * 2000;
        logger.warn({ attempt, waitMs }, "Gemini quota exceeded, retrying...");
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded for Gemini API");
}

/**
 * Score a transcript window using Gemini (fast + cheap).
 */
export async function scoreWindowWithGemini(
  text: string,
  durationSec: number,
): Promise<AIScoreResponse> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const wpm = durationSec > 0 ? (wordCount / durationSec) * 60 : 0;

  const prompt = `You are a viral short-form video editor (TikTok, Reels, Shorts).
Analyze this transcript segment and score its viral potential.

Segment duration: ${durationSec.toFixed(1)}s
Word count: ${wordCount}
Speech rate: ${wpm.toFixed(0)} words/min

Transcript:
"""
${text}
"""

Return ONLY a valid JSON object with these exact keys:
{
  "hook": <0-100, strength of opening hook>,
  "energy": <0-100, vocal energy/excitement/urgency>,
  "sentiment": <0-100, emotional intensity — positive OR negative both score high>,
  "keywordDensity": <0-100, density of viral/curiosity/shock/emotional keywords>,
  "speechRate": <0-100, where 100 = optimal ~150-180 wpm>,
  "caption": "<1 punchy sentence under 100 chars for TikTok/Reels>",
  "hookLine": "<the actual opening line of this clip, lightly polished>",
  "rationale": "<one sentence: why this clip will or won't go viral>"
}
Boring filler scores below 30. Only emotionally charged or surprising moments score above 70.`;

  const result = await withRetry(() => model.generateContent(prompt));
  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: Partial<AIScoreResponse> = {};
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = {};
  }

  const clamp = (n: unknown) => {
    const v = typeof n === "number" ? n : Number(n);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  };

  return {
    hook: clamp(parsed.hook),
    energy: clamp(parsed.energy),
    sentiment: clamp(parsed.sentiment),
    keywordDensity: clamp(parsed.keywordDensity),
    speechRate: clamp(parsed.speechRate),
    caption: (parsed.caption ?? text.slice(0, 100)).trim(),
    hookLine: (parsed.hookLine ?? text.split(".")[0] ?? "").trim(),
    rationale: (parsed.rationale ?? "").trim(),
  };
}

