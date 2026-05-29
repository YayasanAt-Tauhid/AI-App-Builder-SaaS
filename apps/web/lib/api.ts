/**
 * api.ts — Typed client for the Hono API (PRD §12).
 *
 * Centralizes the API base URL, auth headers, JSON helpers, and — most
 * importantly — the SSE generation client. Generation uses POST with a body,
 * which EventSource can't do, so we stream the fetch() response body and parse
 * SSE frames by hand, invoking typed callbacks for each event.
 */

import type {
  CreditsResponse,
  DiffFile,
  ModelInfo,
  PlanResponse,
  Project,
  ProjectFile,
  Version,
  VersionManifest,
} from "@aiab/shared";
import { authHeaders } from "./auth";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as any).message || (detail as any).error || `HTTP ${res.status}`);
  }
  // Some endpoints (DELETE) may return empty bodies.
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  // Models
  models: () => request<{ models: ModelInfo[] }>("/api/models"),

  // Projects
  listProjects: (q = "") =>
    request<{ projects: Project[]; total: number }>(`/api/projects${q ? `?search=${encodeURIComponent(q)}` : ""}`),
  getProject: (id: string) =>
    request<{ project: Project; currentManifest: VersionManifest | null }>(`/api/projects/${id}`),
  createProject: (name: string, defaultModel?: string) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, defaultModel }) }),
  renameProject: (id: string, name: string) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  duplicateProject: (id: string) =>
    request<Project>(`/api/projects/${id}/duplicate`, { method: "POST" }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),

  // Versions
  listVersions: (id: string) => request<{ versions: Version[] }>(`/api/projects/${id}/versions`),
  getVersion: (id: string, vid: string) =>
    request<{ version: Version; manifest: VersionManifest | null }>(`/api/projects/${id}/versions/${vid}`),
  diff: (id: string, from: string, to: string) =>
    request<{ from: string; to: string; files: DiffFile[] }>(
      `/api/projects/${id}/diff?from=${from}&to=${to}`
    ),
  restore: (id: string, vid: string) =>
    request<{ version: Version }>(`/api/projects/${id}/versions/${vid}/restore`, { method: "POST" }),
  saveEdits: (id: string, files: ProjectFile[], template: string, entry: string) =>
    request<{ version: Version }>(`/api/projects/${id}/save`, {
      method: "POST",
      body: JSON.stringify({ files, template, entry }),
    }),

  // Export
  exportProject: (id: string, versionId?: string) =>
    request<{ downloadUrl: string }>(`/api/projects/${id}/export`, {
      method: "POST",
      body: JSON.stringify({ versionId }),
    }),

  // Billing
  credits: () => request<CreditsResponse>("/api/credits"),
  plan: () => request<PlanResponse>("/api/billing/plan"),
  checkout: () => request<{ url: string; mode: string }>("/api/billing/checkout", { method: "POST" }),
  mockUpgrade: () => request<{ ok: boolean; plan: string }>("/api/billing/mock-upgrade", { method: "POST" }),
};

/** SWR fetcher: pass a path string as the key. */
export const swrFetcher = <T>(path: string): Promise<T> => request<T>(path);

/**
 * Download an export zip as a Blob. We can't just navigate to the URL because
 * the download endpoint requires the auth header, which a plain link can't add,
 * so we fetch with headers and hand back a Blob for the caller to save.
 */
export async function downloadExportBlob(downloadUrl: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${downloadUrl}`, { headers: { ...(await authHeaders()) } });
  if (!res.ok) throw new Error("Export download failed");
  return res.blob();
}

// ---- Generation streaming ----------------------------------------------

export interface GenerateBody {
  projectId?: string;
  prompt: string;
  model: string;
  context?: { files?: ProjectFile[] };
}

export interface GenerateHandlers {
  onStart?: (generationId: string) => void;
  onToken?: (delta: string) => void;
  onFile?: (path: string, status: "start" | "complete") => void;
  onDone?: (data: {
    projectId: string;
    versionId: string;
    generationId: string;
    creditsCost: number;
    fromCache: boolean;
  }) => void;
  onError?: (code: string, message: string) => void;
}

/**
 * Stream a generation. Returns an AbortController so the caller can cancel,
 * which both aborts the fetch and tells the server to refund (via the start
 * event's generationId + /generate/abort).
 */
export function streamGenerate(body: GenerateBody, handlers: GenerateHandlers, skipDedup = false): AbortController {
  const controller = new AbortController();
  let generationId: string | null = null;

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
          ...(skipDedup ? { "X-Skip-Dedup": "true" } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({}));
        handlers.onError?.("http_error", (detail as any).message ?? `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          const dataStr = dataLines.join("\n");
          if (event === "ping") continue;
          const data = dataStr ? JSON.parse(dataStr) : {};
          switch (event) {
            case "start":
              generationId = data.generationId;
              handlers.onStart?.(data.generationId);
              break;
            case "token":
              handlers.onToken?.(data.delta);
              break;
            case "file":
              handlers.onFile?.(data.path, data.status);
              break;
            case "done":
              handlers.onDone?.(data);
              break;
            case "error":
              handlers.onError?.(data.code, data.message);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.("stream_error", (err as Error).message);
      }
    }
  })();

  // When aborted locally, also notify the server so it can refund/release.
  controller.signal.addEventListener("abort", () => {
    if (!generationId) return;
    void (async () => {
      fetch(`${API_BASE}/api/generate/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ generationId }),
        keepalive: true,
      }).catch(() => {});
    })();
  });

  return controller;
}
