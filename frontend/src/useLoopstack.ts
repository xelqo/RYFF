import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Session, Version } from "./types";

const POLL_MS = 1500;

export type Building = { baseline: number; label: string; heard?: string } | null;

export function useLoopstack(onReady: (version: Version, session: Session) => void, onFailed: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [building, setBuilding] = useState<Building>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  sessionRef.current = session;
  const sessionId = session?.id;

  useEffect(() => {
    if (!building || !sessionId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.getSession(sessionId);
        if (cancelled) return;
        setSession(fresh);
        if (fresh.versions.length > building.baseline) {
          cancelled = true;
          setBuilding(null);
          onReadyRef.current(fresh.versions[fresh.versions.length - 1], fresh);
        } else if (fresh.status === "error") {
          cancelled = true;
          const message = fresh.error ?? "couldn't make that version";
          setBuilding(null);
          setError(message);
          onFailedRef.current(message);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [building, sessionId]);

  const watch = useCallback((label: string, heard?: string) => {
    setBuilding({ baseline: sessionRef.current?.versions.length ?? 0, label, heard });
  }, []);

  const setVibe = useCallback(
    async (vibeText: string) => {
      setError(null);
      const current = sessionRef.current;
      if (current) {
        await api.changeVibe(current.id, vibeText);
        setSession({ ...current, vibe: { ...current.vibe, text: vibeText } });
        watch(`Switching to ${vibeText}`);
        return;
      }
      const created = await api.createSession(vibeText);
      sessionRef.current = created;
      setSession(created);
      if (created.versions.length > 0 && created.status !== "building") {
        onReadyRef.current(created.versions[created.versions.length - 1], created);
      } else {
        setBuilding({ baseline: 0, label: `Cooking up ${vibeText}` });
      }
    },
    [watch],
  );

  return { session, building, watch, setVibe, error, setError, sessionRef };
}
