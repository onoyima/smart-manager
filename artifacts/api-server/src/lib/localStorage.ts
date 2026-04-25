import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve("storage");

export const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
export const PROCESSED_DIR = path.join(STORAGE_DIR, "processed");

/**
 * Ensure all required storage directories exist on startup.
 */
export function ensureStorageDirs(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

/**
 * Get the path for a user's upload directory, creating it if needed.
 */
export function getUserUploadDir(userId: string): string {
  const dir = path.join(UPLOADS_DIR, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get the path for a job's processed output directory, creating it if needed.
 */
export function getJobProcessedDir(jobId: string): string {
  const dir = path.join(PROCESSED_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Generate a unique upload path for a file.
 */
export function getUploadPath(userId: string, originalName: string): string {
  const ext = path.extname(originalName) || ".mp4";
  const fileId = randomUUID();
  const dir = getUserUploadDir(userId);
  return path.join(dir, `${fileId}${ext}`);
}

/**
 * Convert a local absolute file path to a relative storage path
 * for safe URL routing (strips the STORAGE_DIR prefix).
 */
export function toStoragePath(absolutePath: string): string {
  return path.relative(STORAGE_DIR, absolutePath).replace(/\\/g, "/");
}

/**
 * Convert a storage-relative path back to an absolute file path.
 */
export function fromStoragePath(storagePath: string): string {
  return path.join(STORAGE_DIR, storagePath);
}

/**
 * Check if a storage path is safe (no directory traversal).
 */
export function isSafeStoragePath(storagePath: string): boolean {
  const abs = path.resolve(STORAGE_DIR, storagePath);
  return abs.startsWith(STORAGE_DIR);
}

/**
 * Delete a file safely, ignoring not-found errors.
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Delete an entire directory recursively, ignoring not-found errors.
 */
export async function deleteDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
