# 🎬 ViralCut — Auto Viral Clip Generator

> An AI-powered platform that converts long-form video content into short, viral-ready clips optimised for TikTok, Instagram Reels, and YouTube Shorts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-orange.svg)](https://www.mysql.com/)

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [Features](#-features)
3. [Architecture](#-architecture)
4. [Tech Stack](#-tech-stack)
5. [Project Structure](#-project-structure)
6. [Database Schema](#-database-schema)
7. [API Reference](#-api-reference)
8. [Prerequisites](#-prerequisites)
9. [Installation](#-installation)
10. [Configuration](#-configuration)
11. [Running the Project](#-running-the-project)
12. [How the AI Pipeline Works](#-how-the-ai-pipeline-works)
13. [Frontend Pages](#-frontend-pages)
14. [Security](#-security)
15. [Contributing](#-contributing)
16. [License](#-license)

---

## 🌟 Overview

**ViralCut** is a full-stack SaaS application that uses Google Gemini AI and FFmpeg to automatically:

- Transcribe uploaded video files
- Identify the most engaging segments using a multi-factor viral scoring algorithm
- Render those segments as 9:16 vertical clips (1080×1920) with burned-in captions
- Generate SRT subtitle files and thumbnail images for each clip
- Serve clips through a polished React dashboard

It is built as a **pnpm monorepo** with a clear separation between the API server, frontend, shared libraries, and database layer.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Transcription** | Gemini AI transcribes audio with timestamped word segments |
| 📊 **Viral Scoring** | Multi-factor formula: energy, hook, sentiment, keyword density, speech rate |
| ✂️ **Auto Clip Rendering** | FFmpeg renders top-5 clips at 9:16 with burned-in SRT captions |
| 🖼️ **Thumbnails** | Auto-extracted JPEG thumbnail for every clip |
| ✍️ **Manual Clip Editor** | Browser-based editor to manually define clip start/end and caption |
| 🔐 **JWT Auth** | Access + refresh token system with httpOnly cookies |
| 📂 **Local Storage** | All files stored to disk with path-traversal-safe serving |
| 📈 **Dashboard Stats** | Total videos, clips, average viral score, top clips |
| 🔄 **Job Cancellation** | Stop a running pipeline mid-flight |
| 🔁 **Reprocess** | Re-run the full AI pipeline on any existing video |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                        │
│   Dashboard · Upload · Videos · Editor · Login · Register    │
└─────────────────────┬───────────────────────────────────────┘
                       │ HTTP (Vite dev proxy → :3001)
┌─────────────────────▼───────────────────────────────────────┐
│              Express API Server  (:3001)                      │
│  Routes: /auth  /upload  /videos  /clips  /files  /health    │
│  Middleware: JWT auth · rate-limit · cors · pino logging      │
└──────────┬─────────────────────────────────┬────────────────┘
           │                                 │
┌──────────▼──────────┐          ┌───────────▼──────────────┐
│    MySQL (Drizzle)  │          │  AI Pipeline (in-process) │
│  users · videos     │          │  Gemini transcription     │
│  jobs · clips       │          │  Window scoring           │
│  transcripts        │          │  FFmpeg clip rendering    │
│  refresh_tokens     │          │  SRT + thumbnail gen      │
└─────────────────────┘          └──────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
| Package | Purpose |
|---|---|
| **Express 5** | HTTP server and routing |
| **Drizzle ORM** | Type-safe MySQL queries |
| **MySQL 2** | Database driver |
| **@google/generative-ai** | Gemini AI transcription and scoring |
| **fluent-ffmpeg** | Video/audio processing |
| **ffmpeg-static** | Bundled FFmpeg binary |
| **jsonwebtoken** | JWT access + refresh tokens |
| **bcryptjs** | Password hashing |
| **multer** | Multipart file uploads |
| **pino** | Structured JSON logging |
| **zod** | Runtime schema validation |

### Frontend
| Package | Purpose |
|---|---|
| **React 18 + Vite** | UI framework and dev server |
| **TypeScript** | Type safety |
| **TailwindCSS 4** | Utility-first styling |
| **Radix UI** | Accessible headless components |
| **Framer Motion** | Animations |
| **React Hook Form + Zod** | Form validation |
| **TanStack React Query** | Server state and caching |
| **Wouter** | Client-side routing |
| **Recharts** | Dashboard charts |
| **Sonner** | Toast notifications |

### Database & Tooling
| Tool | Purpose |
|---|---|
| **MySQL 8** | Primary database |
| **Drizzle Kit** | Schema migrations and studio |
| **pnpm workspaces** | Monorepo package management |
| **esbuild** | Fast TypeScript bundling for the server |

---

## 📁 Project Structure

```
Smart-File-Manager/
├── artifacts/
│   ├── api-server/             # Express REST API
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── gemini.ts       # Gemini AI integration
│   │       │   ├── pipeline.ts     # Full AI processing pipeline
│   │       │   ├── localStorage.ts # File storage helpers
│   │       │   ├── queue.ts        # In-memory job queue
│   │       │   └── auth.ts         # JWT helpers
│   │       ├── middlewares/
│   │       │   └── authenticate.ts # JWT auth middleware
│   │       ├── routes/
│   │       │   ├── auth.ts         # POST /auth/register, /login, /refresh, /logout
│   │       │   ├── upload.ts       # POST /upload
│   │       │   ├── videos.ts       # CRUD + pipeline triggers
│   │       │   └── health.ts       # GET /health
│   │       ├── app.ts              # Express app setup
│   │       └── index.ts            # Server entry point
│   │
│   └── viral-clips/            # React frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx   # Stats overview
│           │   ├── upload.tsx      # Drag-and-drop upload
│           │   ├── videos.tsx      # Video library
│           │   ├── video-detail.tsx# Job progress + clip results
│           │   ├── clip-detail.tsx # Individual clip view
│           │   ├── editor.tsx      # Manual clip editor
│           │   ├── projects.tsx    # Project management
│           │   ├── history.tsx     # Processing history
│           │   ├── login.tsx       # Auth login
│           │   └── register.tsx    # Auth register
│           ├── hooks/
│           │   └── useAuth.tsx     # Auth context
│           ├── lib/
│           │   └── apiClient.ts    # Axios API client
│           └── components/
│               ├── Layout.tsx      # App shell + sidebar
│               ├── ClipCard.tsx    # Clip display card
│               └── ProgressPanel.tsx
│
└── lib/
    ├── db/                     # Shared database layer
    │   ├── drizzle.config.ts   # Drizzle Kit config
    │   └── src/
    │       ├── index.ts        # DB connection export
    │       └── schema/
    │           ├── users.ts    # Users + plans
    │           ├── videos.ts   # Videos, jobs, clips, transcripts
    │           └── studio.ts   # Studio config
    ├── api-spec/               # OpenAPI spec
    ├── api-zod/                # Zod request/response schemas
    └── api-client-react/       # React Query hooks
```

---

## 🗄️ Database Schema

### `users`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `email` | VARCHAR(255) UNIQUE | User email |
| `hashed_password` | TEXT | bcrypt hash |
| `plan` | VARCHAR(50) | `free` / `pro` |
| `created_at` | TIMESTAMP | |

### `videos`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | VARCHAR(36) FK | References users |
| `file_name` | VARCHAR(500) | Original filename |
| `file_path` | TEXT | Absolute path on disk |
| `content_type` | VARCHAR(100) | MIME type |
| `size_bytes` | INT | File size |
| `duration_seconds` | DOUBLE | Detected duration |
| `status` | VARCHAR(50) | `pending` / `processing` / `done` / `failed` |

### `jobs`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `video_id` | VARCHAR(36) FK | References videos |
| `status` | VARCHAR(50) | `queued` / `processing` / `done` / `failed` |
| `progress_pct` | INT | 0–100 |
| `stage` | VARCHAR(255) | Current pipeline stage label |
| `error_message` | TEXT | Error details if failed |
| `retries` | INT | Retry count |

### `clips`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `video_id` | VARCHAR(36) FK | References videos |
| `job_id` | VARCHAR(36) FK | References jobs |
| `rank` | INT | 1 = highest viral score |
| `start_sec` / `end_sec` | DOUBLE | Clip window |
| `viral_score` | DOUBLE | Composite score 0–1 |
| `hook_score` | DOUBLE | AI hook rating |
| `energy_score` | DOUBLE | Audio energy |
| `sentiment_score` | DOUBLE | Sentiment (-1 to 1) |
| `caption` | TEXT | AI-generated social caption |
| `hook_line` | TEXT | Opening hook sentence |
| `clip_path` | TEXT | Path to rendered MP4 |
| `thumbnail_path` | TEXT | Path to JPEG thumbnail |
| `srt_path` | TEXT | Path to SRT captions file |

### `transcripts`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `video_id` | VARCHAR(36) FK | References videos |
| `full_text` | TEXT | Full transcript |
| `language` | VARCHAR(10) | Detected language |
| `segments` | JSON | `[{start, end, text}]` timestamped segments |

### `refresh_tokens`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | VARCHAR(36) FK | References users |
| `token` | VARCHAR(512) UNIQUE | Hashed refresh token |
| `expires_at` | TIMESTAMP | Token expiry |

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | ❌ | Create a new account |
| POST | `/auth/login` | ❌ | Login, receive access + refresh tokens |
| POST | `/auth/refresh` | ❌ | Refresh access token using cookie |
| POST | `/auth/logout` | ✅ | Invalidate refresh token |

**Register / Login request body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Login response:**
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "uuid", "email": "user@example.com", "plan": "free" }
}
```

---

### Upload

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/upload` | ✅ | Upload a video file (multipart/form-data) |

**Request:** `Content-Type: multipart/form-data`, field name: `video`

**Response:**
```json
{
  "videoId": "uuid",
  "jobId": "uuid",
  "message": "Upload complete. Processing started."
}
```

---

### Videos

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/videos` | ✅ | List all user videos |
| GET | `/videos/:id` | ✅ | Video detail with latest job and clips |
| DELETE | `/videos/:id` | ✅ | Delete video and all associated files |
| POST | `/videos/:id/reprocess` | ✅ | Re-run the AI pipeline |
| POST | `/videos/:id/stop` | ✅ | Cancel a running pipeline job |
| GET | `/videos/:id/transcript` | ✅ | Get full transcript with segments |
| POST | `/videos/:id/clips/manual` | ✅ | Generate a manual clip |

**Manual clip request body:**
```json
{
  "startSec": 30.5,
  "endSec": 75.0,
  "caption": "This is the most important moment!"
}
```

---

### Clips & Stats

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/clips` | ✅ | All clips for the authenticated user |
| GET | `/stats` | ✅ | Dashboard stats (totals + top clips) |
| GET | `/files/*path` | ✅ | Serve stored MP4, JPG, or SRT files |

**Stats response:**
```json
{
  "totalVideos": 5,
  "totalClips": 23,
  "completedVideos": 4,
  "processingVideos": 1,
  "failedVideos": 0,
  "averageViralScore": 0.72,
  "topClips": [...]
}
```

---

## ✅ Prerequisites

Before running this project you need:

- **Node.js** v20 or higher
- **pnpm** v9 or higher (`npm install -g pnpm`)
- **MySQL** 8.0 or higher, running locally or remotely
- A **Google AI Studio** account with a **Gemini API key** — [Get one here](https://aistudio.google.com/apikey)
- **FFmpeg** — bundled automatically via `ffmpeg-static` (no manual install needed)

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/onoyima/smart-manager.git
cd smart-manager
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your real values (see [Configuration](#-configuration)).

### 4. Create the MySQL database

Log into MySQL and run:

```sql
CREATE DATABASE viralcut CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run database migrations

```bash
cd lib/db
pnpm drizzle-kit push
cd ../..
```

This creates all tables from the schema automatically.

---

## ⚙️ Configuration

All configuration is done through the `.env` file in the project root.

```env
# ── Database (MySQL) ──────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=viralcut

# ── Google Gemini AI ──────────────────────────────
GEMINI_API_KEY=your-gemini-api-key-here

# ── Authentication ────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=change-this-to-a-long-random-secret-at-least-64-chars
JWT_REFRESH_SECRET=change-this-to-another-long-random-secret-at-least-64-chars

# ── Storage ───────────────────────────────────────
# Where uploaded and processed files are saved (relative to api-server/)
STORAGE_DIR=./storage

# ── Server ────────────────────────────────────────
PORT=3001
NODE_ENV=development
```

> ⚠️ **Never commit your real `.env` file.** It is listed in `.gitignore`.

### Generating Secure Secrets

Run this in your terminal to generate a cryptographically secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run it twice — once for `JWT_SECRET` and once for `JWT_REFRESH_SECRET`.

---

## 🚀 Running the Project

The project has two apps that must run in **separate terminals**.

### Terminal 1 — API Server

```bash
cd artifacts/api-server

# Build (required before first run and after code changes)
pnpm build

# Start with file watching (auto-restart on rebuild)
pnpm dev
```

The API will be available at: `http://localhost:3001`

Check it's running: `http://localhost:3001/health`

### Terminal 2 — React Frontend

```bash
cd artifacts/viral-clips
pnpm dev
```

The frontend will be available at: `http://localhost:5173`

The Vite dev server proxies `/api/*` requests to the API server automatically.

---

### Quick Start (Both at once with pnpm)

From the project root:

```bash
# Build server first
pnpm --filter @workspace/api-server build

# Then run both in parallel (requires two terminals or a process manager)
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/viral-clips dev
```

---

## 🤖 How the AI Pipeline Works

When a video is uploaded, a background pipeline runs automatically through these stages:

```
Upload → Extract Audio → Gemini Transcription → Segment Building
       → Gemini Scoring → Viral Formula → Top 5 Selection
       → SRT Generation → FFmpeg Clip Render → Thumbnail Extraction
       → Save to Database → Done
```

### Stage Details

| Stage | What happens |
|---|---|
| **Extract Audio** | FFmpeg extracts 16kHz mono MP3 from the video |
| **Transcription** | Gemini AI returns full text with timestamped segments |
| **Segmentation** | Transcript segments are grouped into 20–60 second candidate windows |
| **Scoring** | Each candidate window is scored by Gemini on: hook quality, energy, sentiment, keyword density, speech rate |
| **Viral Formula** | `ViralScore = (energy×0.30) + (keywords×0.20) + (sentiment×0.15) + (speech_rate×0.10) + (motion×0.10) + (hook×0.15)` |
| **Rendering** | Top 5 windows are rendered as 9:16 1080×1920 H.264 MP4 files |
| **Captions** | SRT files are generated and burned into the video |
| **Thumbnails** | A JPEG frame is extracted at 1 second into each clip |

Job progress is stored in the database and polled by the frontend every 3 seconds.

### Manual Clip Mode

From the video detail or editor page, you can manually define a clip:
1. Set a start and end time
2. Write a custom caption
3. Click **Generate** — the pipeline renders only that segment

---

## 🖥️ Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Stats cards, top clips, quick upload |
| `/upload` | Upload | Drag-and-drop or file picker, upload progress |
| `/videos` | Library | Paginated list of all uploaded videos |
| `/videos/:id` | Video Detail | Processing progress, clip results grid |
| `/clips/:id` | Clip Detail | Single clip preview, scores, captions, download |
| `/editor` | Editor | Manual clip editor with timeline |
| `/projects` | Projects | Saved projects list |
| `/history` | History | Processing job history |
| `/login` | Login | Email + password authentication |
| `/register` | Register | New account creation |

---

## 🔐 Security

- **Passwords** are hashed with `bcryptjs` (cost factor 12) — never stored in plaintext
- **JWT access tokens** expire after 15 minutes
- **Refresh tokens** are stored in the database and expire after 7 days
- **All video/clip queries** filter by `userId` — users cannot access each other's data
- **File serving** validates all paths against a safe storage root (prevents path traversal)
- **Rate limiting** is applied globally via `express-rate-limit`
- **CORS** is configured to restrict allowed origins
- **`.env`** is excluded from version control via `.gitignore`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and commit: `git commit -m "feat: add my feature"`
4. Push to your fork: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow the existing code style. Run `pnpm typecheck` before submitting.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">Built with ❤️ using Google Gemini AI, FFmpeg, Express, and React</p>
