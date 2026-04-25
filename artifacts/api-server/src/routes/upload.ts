import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { videosTable, jobsTable } from "@workspace/db";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { getUserUploadDir } from "../lib/localStorage";
import { startPipelineInBackground } from "../lib/pipeline";

const router = Router();

// Multer storage — save to user's upload directory with unique name
const storage = multer.diskStorage({
  destination: (req: AuthRequest, _file, cb) => {
    const userId = req.user!.userId;
    cb(null, getUserUploadDir(userId));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/webm", "video/mpeg", "video/x-msvideo"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload MP4, MOV, or WebM."));
    }
  },
});

// POST /upload — multipart video upload, creates video + job, starts pipeline
router.post(
  "/upload",
  authenticate,
  upload.single("video"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    const userId = req.user!.userId;
    const { originalname, mimetype, size, path: filePath } = req.file;

    // Shorten filename for storage/display (max 100 chars, preserving extension)
    let finalFileName = originalname;
    if (originalname.length > 100) {
      const ext = path.extname(originalname);
      finalFileName = originalname.slice(0, 90) + "..." + ext;
    }

    const [video] = await db
      .insert(videosTable)
      .values({
        userId,
        fileName: finalFileName,
        filePath,
        contentType: mimetype,
        sizeBytes: size,
        status: "pending",
      })
      .$returningId();


    if (!video) {
      res.status(500).json({ error: "Failed to create video record" });
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
      .$returningId();

    if (!job) {
      res.status(500).json({ error: "Failed to create job" });
      return;
    }

    startPipelineInBackground(video.id, job.id);

    res.status(201).json({
      videoId: video.id,
      jobId: job.id,
      fileName: originalname,
      sizeBytes: size,
    });
  },
);

export default router;
