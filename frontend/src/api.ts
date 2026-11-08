import type { Health, Part, Session } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : text || res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const health = () => req<Health>("/api/health");

export const createSession = (vibe_text: string) => req<Session>("/api/sessions", json("POST", { vibe_text }));

export const getSession = (id: string) => req<Session>(`/api/sessions/${id}`);

export const changeVibe = (id: string, vibe_text: string) =>
  req<Session>(`/api/sessions/${id}/vibe`, json("POST", { vibe_text }));

export function addPart(
  id: string,
  wav: Blob,
  o: { kind: string; name?: string; slot?: string; preRoll: number; steps: number },
) {
  const fd = new FormData();
  fd.append("audio", wav, "take.wav");
  fd.append("kind", o.kind);
  if (o.name) fd.append("name", o.name);
  if (o.slot) fd.append("slot", o.slot);
  fd.append("pre_roll", String(o.preRoll));
  fd.append("steps", String(o.steps));
  return req<{ session: Session; part: Part }>(`/api/sessions/${id}/parts`, { method: "POST", body: fd });
}

export const updatePart = (id: string, pid: string, patch: { slot?: string; muted?: boolean; volume?: number }) =>
  req<Session>(`/api/sessions/${id}/parts/${pid}`, json("PATCH", patch));

export const removePart = (id: string, pid: string) =>
  req<Session>(`/api/sessions/${id}/parts/${pid}`, { method: "DELETE" });

export const addBacking = (id: string, style?: string) =>
  req<Session>(`/api/sessions/${id}/backing`, json("POST", { style: style || null }));
