"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import Auth from "@/components/Auth";
import Map, {
  type ProjectMapState,
  type SelectedMapFeature,
  type UserMapLayer,
} from "@/components/Map";
import { useProjectAutosave } from "@/hooks/useProjectAutosave";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
} from "@/lib/projects";
import {
  PROJECT_DOCUMENT_VERSION,
  type ProjectSummary,
  type ProjectWorkspace,
} from "@/lib/project-types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type LayerItem = {
  id: string;
  name: string;
  short: string;
  icon: string;
  color: string;
  description: string;
};

const SYSTEM_LAYERS: LayerItem[] = [
  { id: "base", name: "Temel harita", short: "Harita", icon: "▦", color: "#2563eb", description: "OpenStreetMap taban haritası" },
  { id: "satellite", name: "Uydu görüntüsü", short: "Uydu", icon: "◉", color: "#7c3aed", description: "Uydu görüntüsü" },
  { id: "parcels", name: "Parseller", short: "Parsel", icon: "▤", color: "#f59e0b", description: "Kadastro / parsel katmanı" },
  { id: "zoning", name: "İmar planları", short: "İmar", icon: "▧", color: "#ef4444", description: "İmar planı verileri" },
  { id: "buildings", name: "Yapılar", short: "Yapı", icon: "⌂", color: "#64748b", description: "Yapı ve bina verileri" },
  { id: "transport", name: "Ulaşım", short: "Ulaşım", icon: "↔", color: "#0f766e", description: "Yol ve ulaşım ağı" },
  { id: "green", name: "Yeşil alanlar", short: "Yeşil", icon: "◇", color: "#16a34a", description: "Park ve yeşil alanlar" },
  { id: "education", name: "Eğitim alanları", short: "Eğitim", icon: "□", color: "#ca8a04", description: "Eğitim tesisleri" },
  { id: "health", name: "Sağlık alanları", short: "Sağlık", icon: "+", color: "#dc2626", description: "Sağlık tesisleri" },
];

const STORAGE_KEY = "ergis-atlas-ui-v1";

const EMPTY_STATE: ProjectMapState = {
  center: [29.06, 40.19],
  zoom: 6,
  satellite: false,
  scaleDenominator: 1000,
  points: [],
  drawings: [],
  externalServices: [],
};

function iconButtonStyle(active = false): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: active ? "1px solid #111827" : "1px solid #e5e7eb",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#374151",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  };
}

function PanelButton({
  children,
  active,
  onClick,
  danger,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        border: active ? "1px solid #d1d5db" : "1px solid transparent",
        background: active ? "#f8fafc" : "transparent",
        color: danger ? "#b91c1c" : "#111827",
        borderRadius: 10,
        padding: "10px 11px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 13,
        fontWeight: 650,
      }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "#9ca3af",
            fontWeight: 800,
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{title}</div>
    </div>
  );
}

export default function Page() {
  const [activeLayers, setActiveLayers] = useState<string[]>(["base"]);
  const [userLayers, setUserLayers] = useState<UserMapLayer[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchRequest, setSearchRequest] = useState<{ query: string; id: number }>();
  const [selectedFeature, setSelectedFeature] = useState<SelectedMapFeature | null>(null);
  const [projectState, setProjectState] = useState<ProjectMapState>(EMPTY_STATE);
  const [restoreToken, setRestoreToken] = useState(0);
  const [projectName, setProjectName] = useState("Yeni çalışma");
  const [layerSearch, setLayerSearch] = useState("");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [serviceOpenRequest, setServiceOpenRequest] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [remoteProjects, setRemoteProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectNotice, setProjectNotice] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        projectName?: string;
        activeLayers?: string[];
        userLayers?: UserMapLayer[];
        projectState?: ProjectMapState;
      };
      if (parsed.projectName) setProjectName(parsed.projectName);
      if (parsed.activeLayers?.length) setActiveLayers(parsed.activeLayers);
      if (parsed.userLayers) setUserLayers(parsed.userLayers);
      if (parsed.projectState) setProjectState(parsed.projectState);
    } catch {
      // Yerel kayıt bozuksa uygulama varsayılanlarla açılır.
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const workspace = useMemo<ProjectWorkspace>(
    () => ({
      version: PROJECT_DOCUMENT_VERSION,
      activeLayers,
      userLayers,
      mapState: projectState,
    }),
    [activeLayers, projectState, userLayers],
  );

  const { saveNow: saveRemoteNow, status: remoteSaveStatus } = useProjectAutosave({
    projectId: activeProjectId,
    workspace,
    enabled: workspaceReady && Boolean(user),
  });

  useEffect(() => {
    if (!user) {
      setRemoteProjects([]);
      setActiveProjectId(null);
      return;
    }

    void refreshRemoteProjects();
  }, [user]);

  function makeLayerFromGeoJSON(
    name: string,
    data: UserMapLayer["data"],
  ): UserMapLayer {
    const firstGeometry = data.features.find((feature) => feature.geometry)?.geometry;
    const geometryType =
      firstGeometry?.type === "Point" || firstGeometry?.type === "MultiPoint"
        ? "Point"
        : firstGeometry?.type === "LineString" || firstGeometry?.type === "MultiLineString"
          ? "LineString"
          : "Polygon";

    return {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      visible: true,
      data,
      color: "#2563eb",
      opacity: 1,
      geometryType,
    };
  }

  function csvToGeoJSON(text: string): UserMapLayer["data"] {
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      throw new Error("CSV dosyasında veri bulunamadı.");
    }

    const headers = rows[0].split(",").map((value) => value.trim().toLowerCase());
    const latIndex = headers.findIndex((value) => ["lat", "latitude", "enlem", "y"].includes(value));
    const lonIndex = headers.findIndex((value) => ["lon", "lng", "longitude", "boylam", "x"].includes(value));

    if (latIndex < 0 || lonIndex < 0) {
      throw new Error("CSV için lat/lon veya enlem/boylam sütunları gerekli.");
    }

    const features = rows.slice(1).flatMap((row) => {
      const values = row.split(",").map((value) => value.trim());
      const lat = Number(values[latIndex]);
      const lon = Number(values[lonIndex]);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

      const properties: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) properties[header] = values[index] ?? "";
      });

      return [{
        type: "Feature" as const,
        properties,
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      }];
    });

    return { type: "FeatureCollection", features };
  }

  async function fileToGeoJSON(file: File): Promise<UserMapLayer["data"]> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "geojson" || extension === "json") {
      const parsed = JSON.parse(await file.text());
      if (parsed?.type === "FeatureCollection") return parsed;
      if (parsed?.type === "Feature") {
        return { type: "FeatureCollection", features: [parsed] };
      }
      throw new Error("GeoJSON Feature veya FeatureCollection bekleniyor.");
    }

    if (extension === "csv") {
      return csvToGeoJSON(await file.text());
    }

    if (extension === "kml") {
      const xml = new DOMParser().parseFromString(await file.text(), "text/xml");
      const features: UserMapLayer["data"]["features"] = [];

      xml.querySelectorAll("Placemark").forEach((placemark) => {
        const name = placemark.querySelector("name")?.textContent?.trim() ?? "KML nesnesi";
        const point = placemark.querySelector("Point coordinates")?.textContent?.trim();
        const line = placemark.querySelector("LineString coordinates")?.textContent?.trim();
        const polygon = placemark.querySelector("Polygon outerBoundaryIs LinearRing coordinates")?.textContent?.trim();

        if (point) {
          const values = point.split(",").map(Number);
          if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
            features.push({
              type: "Feature",
              properties: { name },
              geometry: { type: "Point", coordinates: [values[0], values[1]] },
            });
          }
        } else if (line) {
          const coordinates = line.split(/\s+/).map((value) => value.split(",").map(Number))
            .filter((value) => value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]))
            .map((value) => [value[0], value[1]] as [number, number]);
          if (coordinates.length >= 2) {
            features.push({
              type: "Feature",
              properties: { name },
              geometry: { type: "LineString", coordinates },
            });
          }
        } else if (polygon) {
          const coordinates = polygon.split(/\s+/).map((value) => value.split(",").map(Number))
            .filter((value) => value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]))
            .map((value) => [value[0], value[1]] as [number, number]);
          if (coordinates.length >= 3) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
            features.push({
              type: "Feature",
              properties: { name },
              geometry: { type: "Polygon", coordinates: [coordinates] },
            });
          }
        }
      });

      return { type: "FeatureCollection", features };
    }

    throw new Error("Desteklenen formatlar: GeoJSON, JSON, CSV ve KML.");
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const imported: UserMapLayer[] = [];

    for (const file of Array.from(fileList)) {
      try {
        const data = await fileToGeoJSON(file);
        imported.push(makeLayerFromGeoJSON(file.name.replace(/\.[^.]+$/, ""), data));
      } catch (error) {
        window.alert(`${file.name}: ${error instanceof Error ? error.message : "Dosya okunamadı."}`);
      }
    }

    if (imported.length) {
      setUserLayers((current) => [...current, ...imported]);
    }

    setUploadOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function refreshRemoteProjects() {
    if (!user) return;

    setProjectsLoading(true);
    try {
      setRemoteProjects(await listProjects());
      setProjectNotice("");
    } catch {
      setProjectNotice("Projeler yüklenemedi. Supabase migration'ının uygulandığını kontrol edin.");
    } finally {
      setProjectsLoading(false);
    }
  }

  function openProjects() {
    setProjectMenuOpen(false);
    setProjectsOpen(true);
    if (user) void refreshRemoteProjects();
  }

  function handleServiceOpen() {
    setServiceOpenRequest((value) => value + 1);
  }

  function handleSearch() {
    const query = searchText.trim();
    if (!query) return;
    setSearchRequest({ query, id: Date.now() });
  }

  function toggleLayer(id: string) {
    setActiveLayers((current) => {
      if (id === "base") {
        return current.includes("base") ? current : ["base", ...current];
      }
      return current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
    });
  }

  function saveLocalWorkspace(
    nextWorkspace = workspace,
    nextProjectName = projectName,
  ) {
    const payload = {
      projectName: nextProjectName,
      activeLayers: nextWorkspace.activeLayers,
      userLayers: nextWorkspace.userLayers,
      projectState: nextWorkspace.mapState,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  async function saveWorkspace() {
    saveLocalWorkspace();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);

    if (!user) {
      setProjectNotice("Yerel olarak kaydedildi. Buluta kaydetmek için giriş yapın.");
      return;
    }

    try {
      if (!activeProjectId) {
        const project = await createProject(projectName, workspace);
        setActiveProjectId(project.id);
        setRemoteProjects((current) => [project, ...current]);
        setProjectNotice("Proje Supabase'e kaydedildi.");
        return;
      }

      await saveRemoteNow();
      setProjectNotice("Proje buluta kaydedildi.");
      void refreshRemoteProjects();
    } catch {
      setProjectNotice("Kaydetme başarısız. Bağlantıyı ve Supabase ayarlarını kontrol edin.");
    }
  }

  function applyWorkspace(nextWorkspace: ProjectWorkspace) {
    setActiveLayers(nextWorkspace.activeLayers?.length ? nextWorkspace.activeLayers : ["base"]);
    setUserLayers(nextWorkspace.userLayers ?? []);
    setProjectState(nextWorkspace.mapState ?? EMPTY_STATE);
    setSelectedFeature(null);
    setRestoreToken((value) => value + 1);
  }

  async function createRemoteProject() {
    if (!user) {
      setAuthOpen(true);
      return;
    }

    const name = window.prompt("Yeni projenin adını girin:", "Yeni proje");
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setProjectNotice("Proje adı boş bırakılamaz.");
      return;
    }

    const nextWorkspace: ProjectWorkspace = {
      version: PROJECT_DOCUMENT_VERSION,
      activeLayers: ["base"],
      userLayers: [],
      mapState: EMPTY_STATE,
    };

    try {
      const project = await createProject(trimmedName, nextWorkspace);
      setProjectName(project.name);
      setActiveProjectId(project.id);
      applyWorkspace(nextWorkspace);
      saveLocalWorkspace(nextWorkspace, project.name);
      setRemoteProjects((current) => [project, ...current]);
      setProjectNotice("Yeni proje oluşturuldu.");
    } catch {
      setProjectNotice("Proje oluşturulamadı. Supabase migration'ını kontrol edin.");
    }
  }

  async function openRemoteProject(id: string) {
    try {
      const project = await getProject(id);
      setProjectName(project.name);
      setActiveProjectId(project.id);
      applyWorkspace(project.workspace);
      setProjectsOpen(false);
      setProjectNotice("Proje açıldı.");
    } catch {
      setProjectNotice("Proje açılamadı.");
    }
  }

  async function renameRemoteProject(id: string, currentName: string) {
    const name = window.prompt("Proje adını girin:", currentName);
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    try {
      await renameProject(id, trimmedName);
      if (id === activeProjectId) setProjectName(trimmedName);
      setRemoteProjects((current) => current.map((project) =>
        project.id === id ? { ...project, name: trimmedName } : project,
      ));
      setProjectNotice("Proje yeniden adlandırıldı.");
    } catch {
      setProjectNotice("Proje yeniden adlandırılamadı.");
    }
  }

  async function removeRemoteProject(id: string, name: string) {
    if (!window.confirm(`“${name}” projesi silinsin mi? Bu işlem geri alınamaz.`)) return;

    try {
      await deleteProject(id);
      setRemoteProjects((current) => current.filter((project) => project.id !== id));
      if (id === activeProjectId) setActiveProjectId(null);
      setProjectNotice("Proje silindi. Yerel çalışma alanınız korunuyor.");
    } catch {
      setProjectNotice("Proje silinemedi.");
    }
  }

  async function migrateLocalWorkspace() {
    if (!user) {
      setAuthOpen(true);
      return;
    }

    try {
      const project = await createProject(projectName, workspace);
      setActiveProjectId(project.id);
      setRemoteProjects((current) => [project, ...current]);
      setProjectNotice("Yerel çalışma alanı buluta aktarıldı. Yerel kopya korunuyor.");
    } catch {
      setProjectNotice("Yerel çalışma alanı buluta aktarılamadı.");
    }
  }

  function newWorkspace() {
  const name = window.prompt("Yeni çalışmanın adını girin:", "Yeni çalışma");

  if (name === null) return;

  const trimmedName = name.trim();

  if (!trimmedName) {
    window.alert("Çalışma adı boş bırakılamaz.");
    return;
  }

  setProjectName(trimmedName);
  setActiveLayers(["base"]);
  setUserLayers([]);
  setProjectState(EMPTY_STATE);
  setSelectedFeature(null);
  setActiveProjectId(null);
  setRestoreToken((value) => value + 1);
  setProjectMenuOpen(false);
  setProjectsOpen(false);
  localStorage.removeItem(STORAGE_KEY);
}

  const filteredLayers = useMemo(() => {
    const q = layerSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return SYSTEM_LAYERS;
    return SYSTEM_LAYERS.filter(
      (layer) =>
        layer.name.toLocaleLowerCase("tr-TR").includes(q) ||
        layer.description.toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [layerSearch]);

  const mapRestore = useMemo(
    () => ({ state: projectState, token: restoreToken }),
    [projectState, restoreToken]
  );

  return (
    <main
      style={{
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        background: "#f3f4f6",
        color: "#111827",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <Map
          activeLayers={activeLayers}
          userLayers={userLayers}
          onUserLayersChange={setUserLayers}
          searchRequest={searchRequest}
          onProjectStateChange={setProjectState}
          onFeatureSelect={setSelectedFeature}
          restoreProject={mapRestore}
          serviceOpenRequest={serviceOpenRequest}
        />
      </div>

      {/* ÜST PROFESYONEL HEADER */}
      <header
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          height: 58,
          zIndex: 500,
          display: "flex",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            height: 58,
            minWidth: 216,
            padding: "0 16px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #e5e7eb",
            boxShadow: "0 6px 22px rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 11,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "#111827",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
              fontWeight: 850,
            }}
          >
            E
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 850, letterSpacing: "-0.03em" }}>ERGIS</div>
            <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.18em", fontWeight: 800 }}>
              URBAN INTELLIGENCE
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            maxWidth: 690,
            height: 48,
            margin: "0 auto",
            borderRadius: 14,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #e5e7eb",
            boxShadow: "0 6px 22px rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 7px 0 15px",
            pointerEvents: "auto",
          }}
        >
          <span style={{ color: "#9ca3af", fontSize: 17, marginRight: 9 }}>⌕</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch();
            }}
            placeholder="İl, ilçe, mahalle, adres veya parsel ara"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: "transparent",
              fontSize: 13,
              color: "#111827",
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            style={{
              height: 34,
              padding: "0 13px",
              borderRadius: 9,
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
              color: "#374151",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Ara
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setProjectMenuOpen((value) => !value)}
            style={{
              height: 42,
              padding: "0 13px",
              borderRadius: 11,
              border: "1px solid #e5e7eb",
              background: "rgba(255,255,255,0.96)",
              color: "#374151",
              cursor: "pointer",
              fontWeight: 750,
              fontSize: 12,
              boxShadow: "0 6px 22px rgba(15,23,42,0.07)",
            }}
          >
            {projectName} ▾
          </button>

          <button
            type="button"
            onClick={saveWorkspace}
            style={{
              height: 42,
              padding: "0 14px",
              borderRadius: 11,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
              boxShadow: "0 6px 22px rgba(15,23,42,0.14)",
            }}
          >
            {remoteSaveStatus === "saving"
              ? "Kaydediliyor..."
              : remoteSaveStatus === "saved"
                ? "✓ Kaydedildi"
                : remoteSaveStatus === "error"
                  ? "Kaydetme başarısız"
                  : saved
                    ? "✓ Kaydedildi"
                    : "Kaydet"}
          </button>

          <button
            type="button"
            onClick={() => setAccountMenuOpen((value) => !value)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "rgba(255,255,255,0.96)",
              color: "#111827",
              cursor: "pointer",
              fontWeight: 850,
              fontSize: 13,
              boxShadow: "0 6px 22px rgba(15,23,42,0.07)",
            }}
          >
            E
          </button>
        </div>
      </header>

      {/* PROJE MENÜSÜ */}
      {projectMenuOpen && (
        <div
          style={{
            position: "absolute",
            top: 78,
            right: 118,
            width: 220,
            zIndex: 520,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(15,23,42,0.16)",
            padding: 8,
          }}
        >
          <PanelButton onClick={newWorkspace}>
            <span>＋</span>
            <span>Yeni çalışma</span>
          </PanelButton>
          <PanelButton onClick={() => void createRemoteProject()}>
            <span>☁</span>
            <span>Yeni bulut projesi</span>
          </PanelButton>
          <PanelButton onClick={saveWorkspace}>
            <span>▣</span>
            <span>Çalışmayı kaydet</span>
          </PanelButton>
          <PanelButton onClick={openProjects}>
            <span>⌁</span>
            <span>Projelerim</span>
          </PanelButton>
        </div>
      )}

      {accountMenuOpen && (
        <div
          style={{
            position: "absolute",
            top: 78,
            right: 12,
            width: 220,
            zIndex: 520,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(15,23,42,0.16)",
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>ERGIS hesabı</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, overflowWrap: "anywhere" }}>
            {user ? user.email : "Yerel çalışma alanı"}
          </div>
          <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0" }} />
          {user ? (
            <>
              <PanelButton onClick={openProjects}>
                <span>⌁</span>
                <span>Bulut projelerim</span>
              </PanelButton>
              <PanelButton
                onClick={() => {
                  void supabase?.auth.signOut();
                  setAccountMenuOpen(false);
                }}
                danger
              >
                <span>↪</span>
                <span>Çıkış yap</span>
              </PanelButton>
            </>
          ) : (
            <PanelButton
              onClick={() => {
                setAuthOpen(true);
                setAccountMenuOpen(false);
              }}
            >
              <span>↪</span>
              <span>Giriş yap / kayıt ol</span>
            </PanelButton>
          )}
          <PanelButton onClick={() => setAccountMenuOpen(false)} danger>
            <span>↪</span>
            <span>Menüyü kapat</span>
          </PanelButton>
        </div>
      )}

      {/* SOL KATMAN PANELİ */}
      <aside
        style={{
          position: "absolute",
          left: 12,
          top: 82,
          bottom: 18,
          width: leftOpen ? 292 : 50,
          zIndex: 450,
          transition: "width 180ms ease",
          background: "rgba(255,255,255,0.97)",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
          overflow: "hidden",
        }}
      >
        {!leftOpen ? (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            style={{ ...iconButtonStyle(), margin: 7 }}
          >
            ›
          </button>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "17px 16px 13px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SectionTitle eyebrow="Çalışma alanı" title="Katmanlar" />
                <button
                  type="button"
                  onClick={() => setLeftOpen(false)}
                  style={iconButtonStyle()}
                  title="Paneli daralt"
                >
                  ‹
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLayerSearch("");
                  setUploadOpen(true);
                }}
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  color: "#374151",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 750,
                  textAlign: "left",
                  padding: "0 11px",
                }}
              >
                ＋ Katman ekle
              </button>

              <div
                style={{
                  marginTop: 9,
                  height: 36,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  background: "#fff",
                }}
              >
                <span style={{ color: "#9ca3af", marginRight: 7 }}>⌕</span>
                <input
                  value={layerSearch}
                  onChange={(event) => setLayerSearch(event.target.value)}
                  placeholder="Katman ara"
                  style={{
                    flex: 1,
                    border: 0,
                    outline: 0,
                    fontSize: 11,
                    minWidth: 0,
                    background: "transparent",
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px 90px" }}>
              <div
                style={{
                  fontSize: 9,
                  color: "#9ca3af",
                  fontWeight: 850,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "3px 7px 7px",
                }}
              >
                Sistem katmanları
              </div>

              {filteredLayers.map((layer) => {
                const active = activeLayers.includes(layer.id);
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => toggleLayer(layer.id)}
                    style={{
                      width: "100%",
                      minHeight: 52,
                      border: active ? "1px solid #d1d5db" : "1px solid transparent",
                      background: active ? "#f8fafc" : "#fff",
                      borderRadius: 11,
                      marginBottom: 5,
                      padding: "8px 9px",
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: `${layer.color}12`,
                        color: layer.color,
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 850,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {layer.icon}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 750,
                          color: "#1f2937",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {layer.name}
                      </span>
                      <span style={{ display: "block", fontSize: 9, color: "#9ca3af", marginTop: 2 }}>
                        {layer.description}
                      </span>
                    </span>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: active ? "#22c55e" : "#d1d5db",
                        flexShrink: 0,
                      }}
                    />
                  </button>
                );
              })}

              {userLayers.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#9ca3af",
                      fontWeight: 850,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "15px 7px 7px",
                    }}
                  >
                    Benim katmanlarım
                  </div>

                  {userLayers.map((layer) => (
                    <div
                      key={layer.id}
                      style={{
                        minHeight: 48,
                        border: "1px solid #eef2f7",
                        borderRadius: 11,
                        marginBottom: 5,
                        padding: "8px 9px",
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                      }}
                    >
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 7,
                          background: layer.color,
                          opacity: layer.opacity,
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 11, fontWeight: 750 }}>{layer.name}</span>
                        <span style={{ display: "block", fontSize: 9, color: "#9ca3af" }}>
                          {layer.data.features.length} obje
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setUserLayers((layers) =>
                            layers.map((item) =>
                              item.id === layer.id ? { ...item, visible: !item.visible } : item
                            )
                          )
                        }
                        style={iconButtonStyle(layer.visible)}
                      >
                        {layer.visible ? "●" : "○"}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* SAĞ ÖZELLİKLER PANELİ */}
      <aside
        style={{
          position: "absolute",
          right: 12,
          top: 82,
          bottom: 18,
          width: rightOpen ? 306 : 50,
          zIndex: 450,
          transition: "width 180ms ease",
          background: "rgba(255,255,255,0.97)",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
          overflow: "hidden",
        }}
      >
        {!rightOpen ? (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            style={{ ...iconButtonStyle(), margin: 7 }}
          >
            ‹
          </button>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "17px 16px 13px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <SectionTitle eyebrow="Seçim" title="Özellikler" />
                <button
                  type="button"
                  onClick={() => setRightOpen(false)}
                  style={iconButtonStyle()}
                  title="Paneli daralt"
                >
                  ›
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {selectedFeature ? (
                <div>
                  <div
                    style={{
                      borderRadius: 12,
                      background: "#111827",
                      color: "#fff",
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      Seçili obje
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                      {selectedFeature.layerName}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>
                      {selectedFeature.feature.geometry?.type ?? "Geometri yok"}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    {Object.entries(selectedFeature.feature.properties ?? {}).map(([key, value]) => (
                      <div
                        key={key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "42% 58%",
                          borderBottom: "1px solid #f1f5f9",
                          minHeight: 42,
                        }}
                      >
                        <div style={{ padding: "10px 9px", fontSize: 10, color: "#9ca3af", fontWeight: 750 }}>
                          {key}
                        </div>
                        <div style={{ padding: "10px 9px", fontSize: 11, color: "#374151", wordBreak: "break-word" }}>
                          {String(value ?? "")}
                        </div>
                      </div>
                    ))}
                    {Object.keys(selectedFeature.feature.properties ?? {}).length === 0 && (
                      <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
                        Bu objede öznitelik bulunmuyor.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      border: "1px dashed #d1d5db",
                      borderRadius: 14,
                      padding: "28px 16px",
                      textAlign: "center",
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: "#f3f4f6",
                        margin: "0 auto 12px",
                        display: "grid",
                        placeItems: "center",
                        color: "#9ca3af",
                        fontSize: 17,
                      }}
                    >
                      ⊙
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#374151" }}>
                      Haritadan bir nesne seç
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginTop: 6 }}>
                      Kendi verilerinden bir objeye tıkla; geometri ve öznitelik bilgileri burada görünsün.
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <SectionTitle eyebrow="Çalışma" title={projectName} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                      <div style={{ padding: 10, background: "#f8fafc", borderRadius: 10 }}>
                        <div style={{ fontSize: 9, color: "#9ca3af" }}>Katman</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>
                          {userLayers.length}
                        </div>
                      </div>
                      <div style={{ padding: 10, background: "#f8fafc", borderRadius: 10 }}>
                        <div style={{ fontSize: 9, color: "#9ca3af" }}>Aktif</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>
                          {activeLayers.length}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      borderRadius: 14,
                      background: "#111827",
                      color: "#fff",
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: "#1f2937",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        ✦
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>Yapay zekâ</div>
                        <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>
                          Mekânsal analiz asistanı
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        height: 36,
                        marginTop: 12,
                        border: 0,
                        borderRadius: 9,
                        background: "#fff",
                        color: "#111827",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Analiz alanını aç
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <SectionTitle eyebrow="Veri" title="Veri ekle" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                      <button
                        type="button"
                        onClick={openFilePicker}
                        style={{
                          height: 72,
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 16 }}>▣</div>
                        <div style={{ fontSize: 11, fontWeight: 800, marginTop: 7 }}>Dosya</div>
                        <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 2 }}>GeoJSON / CSV / KML</div>
                      </button>
                      <button
                        type="button"
                        onClick={handleServiceOpen}
                        style={{
                          height: 72,
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 16 }}>◎</div>
                        <div style={{ fontSize: 11, fontWeight: 800, marginTop: 7 }}>Servis</div>
                        <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 2 }}>WMS / WFS / WMTS</div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.csv,.kml"
        multiple
        onChange={(event) => {
          void handleFiles(event.target.files);
        }}
        style={{ display: "none" }}
      />

      {authOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 820,
            display: "grid",
            placeItems: "center",
            padding: 14,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setAuthOpen(false)}
        >
          <div
            style={{
              width: 420,
              maxWidth: "100%",
              padding: 20,
              borderRadius: 16,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(15,23,42,0.24)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Giriş penceresini kapat"
                style={{ width: 30, height: 30, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 17 }}
              >
                ×
              </button>
            </div>
            {isSupabaseConfigured ? (
              <Auth
                embedded
                onAuthenticated={() => {
                  setAuthOpen(false);
                  setProjectNotice("Giriş yapıldı. Yerel çalışmanızı isterseniz buluta aktarabilirsiniz.");
                }}
              />
            ) : (
              <div style={{ padding: "16px 0", color: "#b91c1c", fontSize: 13 }}>
                Supabase bağlantı ayarları bulunamadı. Yerel çalışma alanı kullanılmaya devam edebilir.
              </div>
            )}
          </div>
        </div>
      )}

      {uploadOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 800,
            display: "grid",
            placeItems: "center",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setUploadOpen(false)}
        >
          <div
            style={{
              width: 420,
              maxWidth: "calc(100% - 28px)",
              padding: 18,
              borderRadius: 16,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(15,23,42,0.24)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 850, color: "#111827" }}>Veri ekle</div>
            <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
              GeoJSON, JSON, CSV veya KML dosyanı haritaya katman olarak ekle.
            </div>
            <button
              type="button"
              onClick={openFilePicker}
              style={{
                width: "100%",
                marginTop: 16,
                padding: "14px 12px",
                borderRadius: 12,
                border: "1px dashed #94a3b8",
                background: "#f8fafc",
                cursor: "pointer",
                fontWeight: 800,
                color: "#334155",
              }}
            >
              Dosya seç
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: 10,
                border: 0,
                background: "transparent",
                cursor: "pointer",
                color: "#64748b",
              }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {projectsOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 810,
            display: "grid",
            placeItems: "center",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setProjectsOpen(false)}
        >
          <div
            style={{
              width: 460,
              maxWidth: "calc(100% - 28px)",
              padding: 18,
              borderRadius: 16,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(15,23,42,0.24)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 850 }}>Projelerim</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
                  {user ? "Supabase hesabınıza ait projeler." : "Yerel çalışma alanınız giriş yapmadan da kullanılabilir."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProjectsOpen(false)}
                style={{ border: 0, background: "#f1f5f9", borderRadius: 9, width: 32, height: 32, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {projectNotice && (
              <div style={{ marginTop: 12, padding: "9px 10px", borderRadius: 9, background: "#f8fafc", color: "#475569", fontSize: 11 }}>
                {projectNotice}
              </div>
            )}

            {user ? (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => void createRemoteProject()}
                    style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 11 }}
                  >
                    ＋ Yeni proje
                  </button>
                  {!activeProjectId && (
                    <button
                      type="button"
                      onClick={() => void migrateLocalWorkspace()}
                      style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", cursor: "pointer", fontWeight: 800, fontSize: 11 }}
                    >
                      ☁ Yereli buluta aktar
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 15, fontSize: 10, fontWeight: 850, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
                  Bulut projeleri
                </div>
                {projectsLoading ? (
                  <div style={{ marginTop: 9, fontSize: 11, color: "#64748b" }}>Projeler yükleniyor...</div>
                ) : remoteProjects.length === 0 ? (
                  <div style={{ marginTop: 9, padding: 12, borderRadius: 10, background: "#f8fafc", color: "#64748b", fontSize: 11 }}>
                    Henüz bulut projesi yok.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 7, marginTop: 9, maxHeight: 220, overflowY: "auto" }}>
                    {remoteProjects.map((project) => (
                      <div key={project.id} style={{ padding: 10, border: activeProjectId === project.id ? "1px solid #111827" : "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button type="button" onClick={() => void openRemoteProject(project.id)} style={{ flex: 1, border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>{project.name}</div>
                            <div style={{ marginTop: 3, fontSize: 9, color: "#9ca3af" }}>Son güncelleme: {new Date(project.updatedAt).toLocaleString("tr-TR")}</div>
                          </button>
                          <button type="button" onClick={() => void renameRemoteProject(project.id, project.name)} title="Yeniden adlandır" style={{ width: 27, height: 27, border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer" }}>✎</button>
                          <button type="button" onClick={() => void removeRemoteProject(project.id, project.name)} title="Sil" style={{ width: 27, height: 27, border: "1px solid #fecaca", borderRadius: 7, background: "#fff1f2", color: "#b91c1c", cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: "pointer", fontWeight: 800 }}
              >
                Bulut projeleri için giriş yap
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                setProjectsOpen(false);
                setSaved(true);
                window.setTimeout(() => setSaved(false), 1200);
              }}
              style={{
                width: "100%",
                marginTop: 16,
                padding: 13,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800 }}>{projectName}</div>
              <div style={{ marginTop: 4, fontSize: 10, color: "#9ca3af" }}>
                Yerel çalışma kaydı
              </div>
            </button>

            <button
              type="button"
              onClick={saveWorkspace}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 11,
                borderRadius: 10,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Şimdi kaydet
            </button>
          </div>
        </div>
      )}

      {/* PANEL DURUM ROZETİ */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 102,
          transform: "translateX(-50%)",
          zIndex: 430,
          display: "flex",
          gap: 6,
          padding: 5,
          borderRadius: 12,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #e5e7eb",
          boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
        }}
      >
        <button type="button" onClick={() => setLeftOpen((value) => !value)} style={{ ...iconButtonStyle(leftOpen) }}>
          ☰
        </button>
        <button type="button" onClick={() => setRightOpen((value) => !value)} style={{ ...iconButtonStyle(rightOpen) }}>
          ⊞
        </button>
        <div style={{ width: 1, background: "#e5e7eb", margin: "4px 2px" }} />
        <div style={{ display: "flex", alignItems: "center", padding: "0 9px", fontSize: 10, color: "#6b7280", fontWeight: 750 }}>
          Ölçek&nbsp; <strong style={{ color: "#111827" }}>1:{projectState.scaleDenominator.toLocaleString("tr-TR")}</strong>
        </div>
      </div>
    </main>
  );
}
