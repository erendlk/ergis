"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, { type UserMapLayer } from "../components/Map";

// Harici @types/geojson paketi gerektirmeyen GeoJSON tipleri.
type GeoJSONGeometry = {
  type: "Point" | "LineString" | "Polygon" | "MultiPoint" | "MultiLineString" | "MultiPolygon" | "GeometryCollection";
  coordinates?: any;
};
type GeoJSONFeature = {
  type: "Feature";
  geometry: GeoJSONGeometry | null;
  properties?: Record<string, unknown> | null;
};
type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

type StoredLayer = UserMapLayer & {
  sourceName: string;
};

const STORAGE_KEY = "sehirgis-user-layers-v1";
const PROJECTS_KEY = "sehirgis-projects-v1";

type ProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userLayers: StoredLayer[];
};

function createProject(name: string, userLayers: StoredLayer[]): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    name,
    createdAt: now,
    updatedAt: now,
    userLayers,
  };
}

const layers = [
  { id: "base", name: "Temel Harita", icon: "▦" },
  { id: "satellite", name: "Uydu Görüntüsü", icon: "◉" },
  { id: "parcel", name: "Parseller", icon: "▤" },
  { id: "zoning", name: "İmar Planları", icon: "▥" },
  { id: "building", name: "Binalar", icon: "▧" },
  { id: "transport", name: "Ulaşım", icon: "⇄" },
  { id: "green", name: "Yeşil Alanlar", icon: "♧" },
  { id: "education", name: "Eğitim Alanları", icon: "◇" },
  { id: "health", name: "Sağlık Alanları", icon: "+" },
];

const turkishFlag =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600'%3E%3Crect width='900' height='600' fill='%23e30a17'/%3E%3Ccircle cx='380' cy='300' r='155' fill='white'/%3E%3Ccircle cx='425' cy='300' r='125' fill='%23e30a17'/%3E%3Cpolygon points='555,300 575,344 622,348 586,378 596,425 555,400 514,425 524,378 488,348 535,344' fill='white'/%3E%3C/svg%3E";

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function csvToGeoJSON(text: string): GeoJSONFeatureCollection {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new Error("CSV dosyası boş.");

  const delimiter = rows[0].includes(";") ? ";" : ",";
  const headers = rows[0].split(delimiter).map((x) => x.trim().replace(/^"|"$/g, ""));
  const lower = headers.map((x) => x.toLowerCase());

  const latIndex = lower.findIndex((x) => ["lat", "latitude", "y"].includes(x));
  const lonIndex = lower.findIndex((x) => ["lon", "lng", "longitude", "x"].includes(x));

  if (latIndex < 0 || lonIndex < 0) {
    throw new Error("CSV için latitude/longitude veya X/Y sütunları gerekli.");
  }

  const features: GeoJSONFeature[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].split(delimiter).map((x) => x.trim().replace(/^"|"$/g, ""));
    const lat = Number(values[latIndex]);
    const lon = Number(values[lonIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const properties: Record<string, string> = {};
    headers.forEach((header, index) => {
      properties[header] = values[index] ?? "";
    });

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
      properties,
    });
  }

  return { type: "FeatureCollection", features };
}

function kmlToGeoJSON(text: string): GeoJSONFeatureCollection {
  const xml = new DOMParser().parseFromString(text, "text/xml");
  if (xml.querySelector("parsererror")) throw new Error("KML okunamadı.");

  const features: GeoJSONFeature[] = [];

  xml.querySelectorAll("Placemark").forEach((placemark) => {
    const name = placemark.querySelector("name")?.textContent?.trim() ?? "KML nesnesi";

    const point = placemark.querySelector("Point coordinates");
    const line = placemark.querySelector("LineString coordinates");
    const polygon = placemark.querySelector("Polygon outerBoundaryIs LinearRing coordinates");

    if (point?.textContent) {
      const c = point.textContent.trim().split(",").map(Number);
      if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        features.push({
          type: "Feature",
          properties: { name },
          geometry: { type: "Point", coordinates: [c[0], c[1]] },
        });
      }
    } else if (line?.textContent) {
      const coordinates = line.textContent.trim().split(/\s+/)
        .map((v) => v.split(",").map(Number))
        .filter((v) => v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))
        .map((v) => [v[0], v[1]] as [number, number]);

      if (coordinates.length >= 2) {
        features.push({
          type: "Feature",
          properties: { name },
          geometry: { type: "LineString", coordinates },
        });
      }
    } else if (polygon?.textContent) {
      const coordinates = polygon.textContent.trim().split(/\s+/)
        .map((v) => v.split(",").map(Number))
        .filter((v) => v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))
        .map((v) => [v[0], v[1]] as [number, number]);

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

async function fileToGeoJSON(file: File): Promise<GeoJSONFeatureCollection> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "geojson" || extension === "json") {
    const parsed = JSON.parse(await file.text());
    if (parsed.type === "FeatureCollection") return parsed;
    if (parsed.type === "Feature") {
      return {
        type: "FeatureCollection",
        features: [parsed],
      };
    }
    throw new Error("GeoJSON Feature veya FeatureCollection bekleniyor.");
  }

  if (extension === "csv") return csvToGeoJSON(await file.text());
  if (extension === "kml") return kmlToGeoJSON(await file.text());

  throw new Error("Şimdilik GeoJSON, JSON, CSV ve KML destekleniyor.");
}

export default function Home() {
  const [selectedLayer, setSelectedLayer] = useState("base");
  const [userLayers, setUserLayers] = useState<StoredLayer[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectNameOpen, setProjectNameOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchRequest, setSearchRequest] = useState<{ query: string; id: number } | undefined>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setUserLayers(JSON.parse(saved));

      const savedProjects = localStorage.getItem(PROJECTS_KEY);
      if (savedProjects) setProjects(JSON.parse(savedProjects));
    } catch {
      setUserLayers([]);
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userLayers));
    } catch {
      showMessage("⚠ Veri tarayıcı depolama sınırını aştı.");
    }
  }, [userLayers, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      showMessage("⚠ Projeler tarayıcı depolama sınırını aştı.");
    }
  }, [projects, storageLoaded]);

  // Aktif proje açıkken değişiklikleri 10 dakikada bir otomatik kaydet.
  useEffect(() => {
    if (!storageLoaded || !activeProjectId) return;

    const autosave = () => {
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                userLayers,
                updatedAt: new Date().toISOString(),
              }
            : project,
        ),
      );
    };

    const timer = window.setInterval(autosave, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, storageLoaded, userLayers]);

  const mapLayers = useMemo<UserMapLayer[]>(
    () => userLayers.map(({ sourceName, ...layer }) => layer),
    [userLayers],
  );

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  }

  async function importFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    for (const file of fileArray) {
      try {
        const data = await fileToGeoJSON(file);
        const layer: StoredLayer = {
          id: randomId(),
          name: file.name.replace(/\.[^.]+$/, ""),
          sourceName: file.name,
          visible: true,
          data,
          color: "#2563eb",
          opacity: 1,
        };

        setUserLayers((current) => [...current, layer]);
        showMessage(`✓ ${file.name} haritaya eklendi`);
      } catch (error) {
        showMessage(`⚠ ${file.name}: ${error instanceof Error ? error.message : "Dosya okunamadı"}`);
      }
    }

    setUploadOpen(false);
  }

  function toggleLayer(id: string) {
    setUserLayers((current) =>
      current.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer,
      ),
    );
  }

  function renameLayer(id: string) {
    const layer = userLayers.find((item) => item.id === id);
    if (!layer) return;

    const name = window.prompt("Yeni katman adı:", layer.name);
    if (!name?.trim()) return;

    setUserLayers((current) =>
      current.map((item) =>
        item.id === id ? { ...item, name: name.trim() } : item,
      ),
    );
  }

  function deleteLayer(id: string) {
    setUserLayers((current) => current.filter((layer) => layer.id !== id));
  }

  function openProjects() {
    setProjectsOpen(true);
  }

  function startNewProject() {
    setProjectName("");
    setProjectNameOpen(true);
  }

  function confirmNewProject() {
    const name = projectName.trim();
    if (!name) {
      showMessage("⚠ Proje adı gir.");
      return;
    }

    const project = createProject(name, userLayers);
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setProjectNameOpen(false);
    setProjectsOpen(false);
    showMessage(`✓ ${project.name} oluşturuldu`);
  }

  function openProject(project: ProjectRecord) {
    setUserLayers(project.userLayers ?? []);
    setActiveProjectId(project.id);
    setProjectsOpen(false);
    showMessage(`✓ ${project.name} açıldı`);
  }

  function renameProject(project: ProjectRecord) {
    const name = window.prompt("Yeni proje adı:", project.name);
    if (!name?.trim()) return;

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  function deleteProject(project: ProjectRecord) {
    if (!window.confirm(`"${project.name}" projesi silinsin mi?`)) return;

    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (activeProjectId === project.id) setActiveProjectId(null);
    showMessage("✓ Proje silindi");
  }

  function saveActiveProjectNow() {
    if (!activeProjectId) {
      showMessage("⚠ Önce bir proje aç.");
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId
          ? {
              ...project,
              userLayers,
              updatedAt: new Date().toISOString(),
            }
          : project,
      ),
    );
    showMessage("✓ Proje kaydedildi");
  }

  const panelStyle = {
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.84), rgba(255,255,255,0.84)),
      url("${turkishFlag}")
    `,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importFiles(event.dataTransfer.files);
      }}
    >
      <header className="h-16 border-b border-slate-200 bg-white flex items-center px-5">
        <div className="flex items-center gap-3 w-64">
          <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
            E
          </div>
          <div>
            <div className="text-lg font-bold">ERGIS</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              Urban Intelligence
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-2xl">
          <form
            className="mx-auto flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              const query = searchText.trim();
              if (!query) return;
              setSearchRequest({ query, id: Date.now() });
            }}
          >
            <button
              type="submit"
              aria-label="Konum ara"
              className="mr-3 text-slate-400 hover:text-slate-700"
            >
              ⌕
            </button>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="İl, ilçe, mahalle, adres veya parsel ara..."
              className="w-full bg-transparent text-sm outline-none"
            />
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500">
              ENTER
            </span>
          </form>
        </div>

        <div className="mx-5 flex h-10 min-w-[260px] items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-bold text-white">
          APO PİÇTİR PİÇ KALACAK
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={openProjects}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Projelerim
          </button>
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Yardım
          </button>
          <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center font-semibold">
            E
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        <aside className="relative w-72 shrink-0 overflow-y-auto border-r border-slate-200" style={panelStyle}>
          <div className="relative z-10">
            <div className="border-b border-slate-200 bg-white/75 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Harita
              </div>
              <div className="mt-1 text-base font-bold">Katmanlar</div>
            </div>

            <div className="p-3">
              {layers.map((layer) => {
                const active = selectedLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setSelectedLayer(layer.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                      active
                        ? "bg-white/90 text-slate-900 shadow-sm"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-md text-sm ${
                      active ? "bg-slate-900 text-white" : "bg-white/70 text-slate-400"
                    }`}>
                      {layer.icon}
                    </span>
                    <span className="flex-1 text-sm font-medium">{layer.name}</span>
                    <span className={`h-2 w-2 rounded-full ${
                      active ? "bg-emerald-500" : "bg-slate-200"
                    }`} />
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Verilerim
                </div>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                >
                  + Veri Ekle
                </button>
              </div>

              {userLayers.length === 0 ? (
                <div
                  className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center text-xs text-slate-500"
                  onClick={() => setUploadOpen(true)}
                >
                  Henüz veri yok.
                  <br />
                  Dosyanı buraya sürükleyebilirsin.
                </div>
              ) : (
                <div className="space-y-1">
                  {userLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center gap-2 rounded-lg bg-white/75 px-2 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => toggleLayer(layer.id)}
                        className="w-6 text-center"
                        title={layer.visible ? "Gizle" : "Göster"}
                      >
                        {layer.visible ? "👁" : "○"}
                      </button>
                      <button
                        type="button"
                        onClick={() => renameLayer(layer.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700"
                        title="Yeniden adlandır"
                      >
                        {layer.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLayer(layer.id)}
                        className="text-xs text-red-500"
                        title="Katmanı sil"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-slate-200/70 pt-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Araçlar
                </div>
                <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-600 hover:bg-white/70">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">◇</span>
                  Mekânsal Analiz
                </button>
                <button type="button" className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-600 hover:bg-white/70">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-600">✦</span>
                  Yapay Zekâ
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="relative flex-1 overflow-hidden">
          <Map
            userLayers={mapLayers}
            onUserLayersChange={(nextLayers) => {
              setUserLayers((current) =>
                current.map((layer) => {
                  const next = nextLayers.find((item) => item.id === layer.id);
                  return next
                    ? { ...layer, data: next.data, color: next.color, opacity: next.opacity, visible: next.visible }
                    : layer;
                }),
              );
            }}
            searchRequest={searchRequest}
          />

          {dragging && (
            <div className="pointer-events-none absolute inset-5 z-[300] flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-500 bg-white/80 backdrop-blur-sm">
              <div className="rounded-xl bg-slate-900 px-8 py-5 text-center text-white shadow-xl">
                <div className="text-3xl">📂</div>
                <div className="mt-2 text-lg font-bold">Veriyi buraya bırak</div>
                <div className="mt-1 text-xs text-slate-300">
                  GeoJSON · CSV · KML
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="relative w-80 shrink-0 overflow-y-auto border-l border-slate-200" style={panelStyle}>
          <div className="relative z-10">
            <div className="border-b border-slate-200 bg-white/75 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Bilgi
              </div>
              <div className="mt-1 text-base font-bold">Özellikler</div>
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/75 p-6 text-center">
                <div className="text-2xl">⌖</div>
                <div className="mt-3 text-sm font-semibold">
                  Haritadan bir nesne seçin
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Parsel, bina, imar planı veya yüklediğiniz verilerden bir
                  nesneyi seçtiğinizde detayları burada görüntülenecek.
                </p>
              </div>

              <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                ✦ Yapay Zekâ ile Analiz Et
              </button>
            </div>
          </div>
        </aside>
      </div>

      {projectsOpen && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm"
          onClick={() => setProjectsOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-xl font-bold text-slate-900">Projelerim</div>
                <div className="mt-1 text-xs text-slate-400">
                  Projelerini aç, kaldığın yerden devam et.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setProjectsOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {projects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="text-4xl">🗺️</div>
                  <div className="mt-3 text-base font-bold">Henüz projen yok</div>
                  <div className="mt-1 text-sm text-slate-400">
                    İlk projenizi oluşturup çalışmaya başlayabilirsin.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className={`flex items-center gap-3 rounded-xl border p-4 ${
                        activeProjectId === project.id
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openProject(project)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-bold text-slate-900">
                          {project.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Son kayıt: {new Date(project.updatedAt).toLocaleString("tr-TR")}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => renameProject(project)}
                        className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
                      >
                        Düzenle
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteProject(project)}
                        className="rounded-lg px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={saveActiveProjectNow}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Şimdi Kaydet
              </button>

              <button
                type="button"
                onClick={startNewProject}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + Yeni Proje Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {projectNameOpen && (
        <div
          className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"
          onClick={() => setProjectNameOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-lg font-bold">Yeni Proje</div>
            <div className="mt-1 text-xs text-slate-400">
              Projene bir isim ver.
            </div>

            <input
              autoFocus
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmNewProject();
              }}
              placeholder="Örn. Bursa 1/5000 Planı"
              className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProjectNameOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmNewProject}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">Veri Ekle</div>
                <div className="mt-1 text-xs text-slate-400">
                  Verini yükle, ŞehirGIS haritaya katman olarak eklesin.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              className="mt-6 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 hover:border-indigo-400 hover:bg-indigo-50/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl">📂</div>
              <div className="mt-3 text-base font-bold text-slate-800">
                Dosya seç
              </div>
              <div className="mt-1 text-xs text-slate-500">
                GeoJSON, JSON, CSV veya KML
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,.csv,.kml"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void importFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["🗺️", "GeoJSON", "Nokta, çizgi, alan"],
                ["📊", "CSV", "X/Y veya lat/lon"],
                ["🌍", "KML", "Google Earth verisi"],
              ].map(([icon, title, description]) => (
                <div key={title} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xl">{icon}</div>
                  <div className="mt-2 text-xs font-bold">{title}</div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-400">
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="fixed bottom-6 left-1/2 z-[600] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {message}
        </div>
      )}
    </main>
  );
}