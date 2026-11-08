import type { Api } from "./types";

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
    form.append("audio", audio, "take.wav");
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

  fileUrl(path) {
    if (path.startsWith("http") || path.startsWith("blob:")) return path;
    return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  },
};
