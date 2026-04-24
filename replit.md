# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Currently hosts the **Auto Viral Clip Generator** ("ViralCut") web app, which uploads long-form videos, transcribes them with Whisper, scores transcript windows with GPT, and surfaces the top viral clips with timestamps, captions and per-metric scores.

## Stack

- **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9
- **API server**: Express 5 (`artifacts/api-server`)
- **Web client**: React + Vite + wouter + TanStack Query + shadcn/ui + Tailwind (`artifacts/viral-clips`)
- **DB**: PostgreSQL + Drizzle ORM (schema in `lib/db/src/schema/videos.ts`)
- **API contract**: OpenAPI spec at `lib/api-spec/openapi.yaml`, codegen via Orval into `lib/api-client-react` (TanStack Query hooks) and `lib/api-zod` (Zod schemas)
- **AI**: OpenAI via Replit AI Integrations proxy (`lib/integrations-openai-ai-server`); models used: `whisper-1` (transcription), `gpt-5.4` (segment scoring + captioning)
- **Storage**: Replit Object Storage (GCS-backed) via `artifacts/api-server/src/lib/objectStorage.ts` and `lib/object-storage-web` for client uploads (presigned PUT)

## Pipeline (in `artifacts/api-server/src/lib/pipeline.ts`)

1. Client uploads video directly to object storage via presigned URL
2. Client calls `POST /api/videos` to register the video and start a job
3. Background pipeline:
   - Downloads video bytes from object storage (must be ≤25 MB — Whisper limit)
   - Transcribes with Whisper (`response_format: verbose_json` to get segments)
   - Persists transcript + segments
   - Builds 25–50s sliding candidate windows from segments
   - Calls GPT for each window to score hook / energy / sentiment / keyword density / speech rate, plus a caption + hook line + rationale
   - Combined viral score = `0.35*energy + 0.20*keyword + 0.15*sentiment + 0.10*speechRate + 0.20*hook`
     (Original prompt called for a `motion` term that we cannot derive from the transcript alone, so its weight is split between hook and energy.)
   - Inserts top 5 clips ranked by viral score
4. Frontend HTML5 `<video>` plays the original file and seeks to clip timestamps — no FFmpeg rendering on free tier.

Job/video progress is exposed via `GET /api/videos/:id` and polled every 2.5s by the detail page until status is `done` or `failed`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Required environment variables

- `DATABASE_URL` (Postgres) — provisioned via the database tool
- `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` — provisioned via the OpenAI AI integration
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` — provisioned via the object storage tool
- `SESSION_SECRET` — already provisioned (currently unused; reserved for future auth)

## Frontend routes (`artifacts/viral-clips/src/pages`)

- `/` — Dashboard: stats cards, top viral clips, recent uploads, hero CTA
- `/upload` — drag-and-drop video upload (uses `useUpload` hook + presigned PUT)
- `/videos` — all videos list with status badges + delete
- `/videos/:id` — video detail: HTML5 player, live job progress, transcript viewer, ranked clip cards (with subscore bars), reprocess + delete
- `/clips/:videoId/:clipId` — single clip view: looped playback, large caption, copy/share

## Notes for future work

- For larger uploads we'd need to chunk the video into ≤25 MB pieces before sending to Whisper, or move transcription to a different service.
- Auth is intentionally skipped for MVP (single demo user). When adding auth, gate `/api/storage/objects/*` and the videos routes by user id; the `videos` table currently has no `userId` column.
- Real clip rendering (cut + caption-burned mp4 export) would require FFmpeg, which is out of scope for the free tier MVP.
