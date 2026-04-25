const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

function setToken(token: string): void {
  localStorage.setItem("accessToken", token);
}

function clearToken(): void {
  localStorage.removeItem("accessToken");
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data = (await res.json()) as { accessToken: string };
    setToken(data.accessToken);
    return data.accessToken;
  } catch {
    clearToken();
    return null;
  }
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let token = getToken();

  const makeRequest = async (t: string | null) => {
    const headers = new Headers(options.headers as HeadersInit);
    if (t) headers.set("Authorization", `Bearer ${t}`);
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  };

  let res = await makeRequest(token);

  // Auto-refresh on 401
  if (res.status === 401) {
    token = await refreshAccessToken();
    if (!token) {
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    res = await makeRequest(token);
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = (await res.json()) as { error?: string };
      if (errData.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
}

export async function apiRegister(email: string, password: string): Promise<{ accessToken: string; user: AuthUser }> {
  const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.accessToken);
  return data;
}

export async function apiLogin(email: string, password: string): Promise<{ accessToken: string; user: AuthUser }> {
  const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.accessToken);
  return data;
}

export async function apiLogout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}

// ── Videos ────────────────────────────────────────────────────────────────────

export interface VideoItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: string;
  objectPath: string;
  createdAt: string;
}


export interface JobItem {
  id: string;
  videoId: string;
  status: string;
  progressPct: number;
  stage: string;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ClipItem {
  id: string;
  videoId: string;
  rank: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  viralScore: number;
  hookScore: number;
  energyScore: number;
  sentimentScore: number;
  keywordDensity: number;
  speechRate: number;
  caption: string;
  hookLine: string;
  transcriptText: string;
  rationale: string;
  clipUrl: string | null;
  thumbnailUrl: string | null;
  srtUrl: string | null;
}

export interface VideoDetail {
  video: VideoItem;
  job: JobItem;
  clips: ClipItem[];
}

export interface StatsResponse {
  totalVideos: number;
  totalClips: number;
  completedVideos: number;
  processingVideos: number;
  failedVideos: number;
  averageViralScore: number;
  topClips: ClipItem[];
}

export const apiListVideos = () => apiFetch<VideoItem[]>("/videos");
export const apiListClips = () => apiFetch<ClipItem[]>("/clips");
export const apiGetVideo = (id: string) => apiFetch<VideoDetail>(`/videos/${id}`);

export const apiGetStats = () => apiFetch<StatsResponse>("/stats");
export const apiDeleteVideo = (id: string) => apiFetch<void>(`/videos/${id}`, { method: "DELETE" });
export const apiReprocessVideo = (id: string) => apiFetch<{ jobId: string }>(`/videos/${id}/reprocess`, { method: "POST" });
export const apiStopVideo = (id: string) => apiFetch<void>(`/videos/${id}/stop`, { method: "POST" });


export async function apiGetTranscript(id: string) {
  return apiFetch<{ id: string; videoId: string; fullText: string; language: string; segments: { start: number; end: number; text: string }[] }>(
    `/videos/${id}/transcript`,
  );
}

export const apiCreateManualClip = (videoId: string, startSec: number, endSec: number, caption: string) =>
  apiFetch<{ jobId: string }>(`/videos/${videoId}/clips/manual`, {
    method: "POST",
    body: JSON.stringify({ startSec, endSec, caption }),
  });


// ── Upload ────────────────────────────────────────────────────────────────────

export async function apiUploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ videoId: string; jobId: string; fileName: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(err.error ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export { getToken, setToken, clearToken };
