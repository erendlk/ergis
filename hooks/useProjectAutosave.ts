"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveProject } from "@/lib/projects";
import type { ProjectWorkspace } from "@/lib/project-types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type UseProjectAutosaveOptions = {
  projectId: string | null;
  workspace: ProjectWorkspace;
  enabled: boolean;
  delay?: number;
};

export function useProjectAutosave({
  projectId,
  workspace,
  enabled,
  delay = 1200,
}: UseProjectAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const projectIdRef = useRef(projectId);
  const workspaceRef = useRef(workspace);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  projectIdRef.current = projectId;
  workspaceRef.current = workspace;

  const persistLatest = useCallback(async () => {
    const currentProjectId = projectIdRef.current;
    if (!enabled || !currentProjectId || savingRef.current) return;

    savingRef.current = true;
    const versionAtStart = versionRef.current;
    const workspaceAtStart = workspaceRef.current;
    let saved = false;
    setStatus("saving");

    try {
      await saveProject(currentProjectId, workspaceAtStart);
      savedVersionRef.current = versionAtStart;
      saved = true;
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;

      if (
        saved &&
        enabled &&
        projectIdRef.current === currentProjectId &&
        versionRef.current > savedVersionRef.current
      ) {
        void persistLatest();
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !projectId) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("idle");
      return;
    }

    versionRef.current += 1;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persistLatest();
    }, delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [delay, enabled, persistLatest, projectId, workspace]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    versionRef.current += 1;
    await persistLatest();
  }, [persistLatest]);

  return { saveNow, status };
}
