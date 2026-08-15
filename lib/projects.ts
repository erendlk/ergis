import { supabase } from "@/lib/supabase";
import type {
  ProjectSummary,
  ProjectWorkspace,
  StoredProject,
} from "@/lib/project-types";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "shared" | "public";
  crs: string;
  project_data: ProjectWorkspace;
  created_at: string;
  updated_at: string;
};

function getClient() {
  if (!supabase) {
    throw new Error("Supabase yapılandırması bulunamadı.");
  }

  return supabase;
}

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    crs: row.crs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await getClient()
    .from("projects")
    .select("id, name, description, visibility, crs, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data as Omit<ProjectRow, "project_data">[]).map((row) =>
    toSummary({ ...row, project_data: {} as ProjectWorkspace }),
  );
}

export async function createProject(
  name: string,
  workspace: ProjectWorkspace,
): Promise<StoredProject> {
  const { data, error } = await getClient()
    .from("projects")
    .insert({
      name,
      crs: "EPSG:4326",
      project_data: workspace,
      map_state: workspace.mapState,
    })
    .select("id, name, description, visibility, crs, project_data, created_at, updated_at")
    .single();

  if (error) throw error;

  const row = data as ProjectRow;
  return { ...toSummary(row), workspace: row.project_data };
}

export async function getProject(id: string): Promise<StoredProject> {
  const { data, error } = await getClient()
    .from("projects")
    .select("id, name, description, visibility, crs, project_data, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;

  const row = data as ProjectRow;
  return { ...toSummary(row), workspace: row.project_data };
}

export async function saveProject(
  id: string,
  workspace: ProjectWorkspace,
): Promise<void> {
  const { error } = await getClient()
    .from("projects")
    .update({
      project_data: workspace,
      map_state: workspace.mapState,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { error } = await getClient()
    .from("projects")
    .update({ name })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await getClient().from("projects").delete().eq("id", id);

  if (error) throw error;
}
