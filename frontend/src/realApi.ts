import type { Api } from "./types";

// File name the backend sees; keep the real format so ffmpeg reads it correctly
function fileName(audio: Blob, stem: string) {
  if (audio instanceof File && audio.name) return audio.name;
  const t = audio.type;
  const ext = t.includes("wav") ? "wav" : t.includes("mp4") || t.includes("m4a") || t.includes("aac") ? "m4a"
    : t.includes("ogg") ? "ogg" : t.includes("mpeg") ? "mp3" : "webm";
  return `${stem}.${ext}`;
}

const BASE = "http://localhost:8000";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

export const realApi: Api = {
  async createSession(vibeText) {
    return json(
      await fetch(`${BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe_text: vibeText }),
      }),
    );
  },

  async changeVibe(sessionId, vibeText) {
    return json(
      await fetch(`${BASE}/sessions/${sessionId}/vibe`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe_text: vibeText }),
      }),
    );
  },

  async addPart(sessionId, audio, kind, fromVersion) {
    const form = new FormData();
    form.append("audio", audio, fileName(audio, "take"));
    form.append("kind", kind);
    if (fromVersion !== undefined) form.append("from_version", String(fromVersion));
    const response = await fetch(`${BASE}/sessions/${sessionId}/parts`, { method: "POST", body: form });
    if (response.status >= 400 && response.status < 500) {
      const body = await response.json().catch(() => ({}));
      return { error: body.error ?? body.detail ?? "too quiet" };
    }
    return json(response);
  },

  async getSession(sessionId) {
    return json(await fetch(`${BASE}/sessions/${sessionId}`));
  },

  async agentToken() {
    try {
      const body = await json<{ token: string }>(await fetch(`${BASE}/agent-token`));
      return body.token;
    } catch {
      return null;
    }
  },

  async transcribe(audio) {
    const form = new FormData();
    form.append("audio", audio, fileName(audio, "vibe"));
    const body = await json<{ text: string }>(await fetch(`${BASE}/transcribe`, { method: "POST", body: form }));
    return body.text;
  },

  fileUrl(path) {
    if (path.startsWith("http") || path.startsWith("blob:")) return path;
    return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  },
};
