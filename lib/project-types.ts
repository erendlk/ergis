import type { ProjectMapState, UserMapLayer } from "@/components/Map";

export const PROJECT_DOCUMENT_VERSION = 1;

export type ProjectWorkspace = {
  version: number;
  activeLayers: string[];
  userLayers: UserMapLayer[];
  mapState: ProjectMapState;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "shared" | "public";
  crs: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredProject = ProjectSummary & {
  workspace: ProjectWorkspace;
};
