import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return "0 B";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function buildObjectUrl(objectPath: string): string {
  if (!objectPath) return "";
  const token = localStorage.getItem("accessToken");
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : import.meta.env.BASE_URL + "/";
  let url = `${base}api/files/${objectPath}`;
  if (token) url += `?token=${token}`;
  return url;
}


export function buildClipUrl(videoId: string, clipId: string): string {
  const token = localStorage.getItem("accessToken");
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : import.meta.env.BASE_URL + "/";
  let url = `${base}api/videos/${videoId}/clips/${clipId}/download`;
  if (token) url += `?token=${token}`;
  return url;
}



export function shortenFileName(name: string, maxLength = 25): string {
  if (name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex !== -1 && name.length - extIndex <= 5) {
    const ext = name.slice(extIndex);
    const base = name.slice(0, extIndex);
    return base.slice(0, maxLength - ext.length - 3) + "..." + ext;
  }
  return name.slice(0, maxLength - 3) + "...";
}

