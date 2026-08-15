
"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import * as turf from "@turf/turf";
import "maplibre-gl/dist/maplibre-gl.css";

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

type Coordinate = [number, number];
type DrawMode = "none" | "point" | "line" | "polygon";
type LineStyle = "solid" | "dashed" | "dotted";

interface LandUseItem {
  id: string;
  name: string;
  code: string;
  color: string;
  group: "Konut" | "Ticaret ve Çalışma" | "Sosyal Donatı" | "Yeşil Alan" | "Ulaşım" | "Teknik Altyapı";
}

const LAND_USE_ITEMS: LandUseItem[] = [
  { id: "konut", name: "Konut Alanı", code: "K", color: "#F4B183", group: "Konut" },
  { id: "ticaret", name: "Ticaret Alanı", code: "T", color: "#E6B8AF", group: "Ticaret ve Çalışma" },
  { id: "ticaret-konut", name: "Ticaret + Konut Alanı", code: "T+K", color: "#F6D5A8", group: "Ticaret ve Çalışma" },
  { id: "sanayi", name: "Sanayi Alanı", code: "SAN", color: "#B7B7B7", group: "Ticaret ve Çalışma" },
  { id: "egitim", name: "Eğitim Alanı", code: "E", color: "#FFD966", group: "Sosyal Donatı" },
  { id: "saglik", name: "Sağlık Alanı", code: "S", color: "#EA9999", group: "Sosyal Donatı" },
  { id: "sosyal", name: "Sosyal Tesis Alanı", code: "ST", color: "#D9B3E6", group: "Sosyal Donatı" },
  { id: "dini", name: "Dini Tesis Alanı", code: "D", color: "#C9DAF8", group: "Sosyal Donatı" },
  { id: "spor", name: "Spor Alanı", code: "SP", color: "#B6D7A8", group: "Sosyal Donatı" },
  { id: "park", name: "Park Alanı", code: "P", color: "#93C47D", group: "Yeşil Alan" },
  { id: "rekreasyon", name: "Rekreasyon Alanı", code: "R", color: "#76A5AF", group: "Yeşil Alan" },
  { id: "agaclandirma", name: "Ağaçlandırılacak Alan", code: "A", color: "#6AA84F", group: "Yeşil Alan" },
  { id: "yol", name: "Taşıt Yolu", code: "Y", color: "#D9D9D9", group: "Ulaşım" },
  { id: "yaya", name: "Yaya Yolu", code: "YY", color: "#FCE5CD", group: "Ulaşım" },
  { id: "otopark", name: "Otopark Alanı", code: "O", color: "#999999", group: "Ulaşım" },
  { id: "teknik", name: "Teknik Altyapı Alanı", code: "TA", color: "#A4C2F4", group: "Teknik Altyapı" },
  { id: "trafo", name: "Trafo Alanı", code: "TR", color: "#8EAADB", group: "Teknik Altyapı" },
];


interface DrawingStyle {
  color: string;
  width: number;
  lineStyle: LineStyle;
}

interface PointFeature {
  id: number;
  coordinate: Coordinate;
  color: string;
  size: number;
}

interface DrawingFeature {
  id: number;
  type: "line" | "polygon";
  coordinates: Coordinate[];
  style: DrawingStyle;
  landUse?: {
    id: string;
    name: string;
    code: string;
  };
}

interface ScreenPoint {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
}

interface ScreenDrawing {
  id: number;
  type: "line" | "polygon";
  points: string;
  style: DrawingStyle;
}

export interface UserMapLayer {
  id: string;
  name: string;
  visible: boolean;
  data: GeoJSONFeatureCollection;
  color: string;
  opacity: number;
  geometryType?: "Point" | "LineString" | "Polygon";
}

export interface SelectedMapFeature {
  layerId: string;
  layerName: string;
  feature: GeoJSONFeature;
}

export interface ProjectMapState {
  center: Coordinate;
  zoom: number;
  satellite: boolean;
  scaleDenominator: number;
  points: PointFeature[];
  drawings: DrawingFeature[];
  externalServices?: ExternalMapService[];
}

interface ExternalMapService {
  id: string;
  name: string;
  type: "WMS" | "WFS" | "WMTS";
  url: string;
  layer?: string;
  visible: boolean;
  opacity: number;
}

interface MapProps {
  activeLayers?: string[];
  userLayers?: UserMapLayer[];
  onUserLayersChange?: (layers: UserMapLayer[]) => void;
  searchRequest?: { query: string; id: number };
  onProjectStateChange?: (state: ProjectMapState) => void;
  onFeatureSelect?: (feature: SelectedMapFeature | null) => void;
  restoreProject?: { state: ProjectMapState; token: number };
  serviceOpenRequest?: number;
}

/* ---------------------------------------------------------
   ÖLÇÜM FONKSİYONLARI
   Harici kütüphane gerekmez.
--------------------------------------------------------- */

function haversineDistance(a: Coordinate, b: Coordinate): number {
  const R = 6371008.8;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function lineLength(coords: Coordinate[]): number {
  let total = 0;

  for (let i = 1; i < coords.length; i += 1) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }

  return total;
}

/* Küresel yüzeyde yaklaşık alan hesabı. Küçük/orta ölçekli
   öğrenci çizimleri için yeterlidir. Sonuç m² döner. */
function polygonArea(coords: Coordinate[]): number {
  if (coords.length < 3) return 0;

  const R = 6371008.8;
  let area = 0;

  for (let i = 0; i < coords.length; i += 1) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];

    const lon1 = (p1[0] * Math.PI) / 180;
    const lon2 = (p2[0] * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((area * R * R) / 2);
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(1)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatArea(m2: number): string {
  if (m2 < 10000) return `${m2.toFixed(0)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}

function lineDash(style: LineStyle): string | undefined {
  if (style === "dashed") return "10 7";
  if (style === "dotted") return "2 7";
  return undefined;
}

function centroid(coords: Coordinate[]): Coordinate | null {
  if (!coords.length) return null;

  let x = 0;
  let y = 0;

  for (const c of coords) {
    x += c[0];
    y += c[1];
  }

  return [x / coords.length, y / coords.length];
}

function pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function makeGeodesicCircle(center: Coordinate, radiusMeters: number, steps = 72): Coordinate[] {
  const result: Coordinate[] = [];
  const earthRadius = 6371008.8;
  const angularDistance = radiusMeters / earthRadius;
  const lat1 = (center[1] * Math.PI) / 180;
  const lon1 = (center[0] * Math.PI) / 180;

  for (let i = 0; i < steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
      );

    result.push([
      (lon2 * 180) / Math.PI,
      (lat2 * 180) / Math.PI,
    ]);
  }

  result.push(result[0]);
  return result;
}


function projectCoordinate(
  map: MapLibreMap,
  coordinate: unknown,
): [number, number] | null {
  if (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    typeof coordinate[0] === "number" &&
    typeof coordinate[1] === "number"
  ) {
    const projected = map.project([coordinate[0], coordinate[1]]);
    return [projected.x, projected.y];
  }

  return null;
}

function geoJsonPolygonPath(
  map: MapLibreMap,
  coordinates: any,
): string {
  const rings = Array.isArray(coordinates) ? coordinates : [];
  return rings
    .map((ring: any) => {
      const points = Array.isArray(ring)
        ? ring
            .map((coord: any) => projectCoordinate(map, coord))
            .filter(Boolean) as Array<[number, number]>
        : [];

      if (points.length < 2) return "";

      return (
        `M ${points[0][0]} ${points[0][1]} ` +
        points
          .slice(1)
          .map(([x, y]) => `L ${x} ${y}`)
          .join(" ") +
        " Z"
      );
    })
    .filter(Boolean)
    .join(" ");
}

function geoJsonLinePath(
  map: MapLibreMap,
  coordinates: any,
): string {
  const points = Array.isArray(coordinates)
    ? coordinates
        .map((coord: any) => projectCoordinate(map, coord))
        .filter(Boolean) as Array<[number, number]>
    : [];

  if (points.length < 2) return "";

  return (
    `M ${points[0][0]} ${points[0][1]} ` +
    points
      .slice(1)
      .map(([x, y]) => `L ${x} ${y}`)
      .join(" ")
  );
}

function renderGeoJsonGeometry(
  map: MapLibreMap,
  geometry: GeoJSONGeometry | null,
  keyPrefix: string,
  color: string,
  opacity: number,
) {
  if (!geometry) return null;

  const common = {
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (geometry.type === "Polygon") {
    const d = geoJsonPolygonPath(map, geometry.coordinates);
    if (!d) return null;

    return (
      <path
        key={keyPrefix}
        d={d}
        fill={color}
        fillOpacity={Math.max(0, Math.min(1, opacity * 0.28))}
        stroke={color}
        strokeOpacity={Math.max(0, Math.min(1, opacity))}
        strokeWidth={2}
        {...common}
      />
    );
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];

    return polygons.map((polygon: any, index: number) => {
      const d = geoJsonPolygonPath(map, polygon);
      if (!d) return null;

      return (
        <path
          key={`${keyPrefix}-${index}`}
          d={d}
          fill={color}
          fillOpacity={Math.max(0, Math.min(1, opacity * 0.28))}
          stroke={color}
          strokeOpacity={Math.max(0, Math.min(1, opacity))}
          strokeWidth={2}
          {...common}
        />
      );
    });
  }

  if (geometry.type === "LineString") {
    const d = geoJsonLinePath(map, geometry.coordinates);
    if (!d) return null;

    return (
      <path
        key={keyPrefix}
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity={Math.max(0, Math.min(1, opacity))}
        strokeWidth={3}
        {...common}
      />
    );
  }

  if (geometry.type === "MultiLineString") {
    const lines = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];

    return lines.map((line: any, index: number) => {
      const d = geoJsonLinePath(map, line);
      if (!d) return null;

      return (
        <path
          key={`${keyPrefix}-${index}`}
          d={d}
          fill="none"
          stroke={color}
          strokeOpacity={Math.max(0, Math.min(1, opacity))}
          strokeWidth={3}
          {...common}
        />
      );
    });
  }

  if (geometry.type === "Point") {
    const point = projectCoordinate(map, geometry.coordinates);
    if (!point) return null;

    return (
      <circle
        key={keyPrefix}
        cx={point[0]}
        cy={point[1]}
        r={6}
        fill={color}
        fillOpacity={Math.max(0, Math.min(1, opacity))}
        stroke="#ffffff"
        strokeWidth={1.5}
        {...common}
      />
    );
  }

  if (geometry.type === "MultiPoint") {
    const points = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];

    return points.map((coord: any, index: number) => {
      const point = projectCoordinate(map, coord);
      if (!point) return null;

      return (
        <circle
          key={`${keyPrefix}-${index}`}
          cx={point[0]}
          cy={point[1]}
          r={6}
          fill={color}
          fillOpacity={Math.max(0, Math.min(1, opacity))}
          stroke="#ffffff"
          strokeWidth={1.5}
          {...common}
        />
      );
    });
  }

  return null;
}

export default function Map({
  activeLayers = ["base"],
  userLayers = [],
  onUserLayersChange,
  searchRequest,
  onProjectStateChange,
  onFeatureSelect,
  restoreProject,
  serviceOpenRequest,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userLayersRef = useRef<UserMapLayer[]>(userLayers);
  const previousUserLayerIdsRef = useRef<Set<string>>(new Set());

  userLayersRef.current = userLayers;

  const nextId = useRef(1);

  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const drawModeRef = useRef<DrawMode>("none");

  const [points, setPoints] = useState<PointFeature[]>([]);
  const pointsRef = useRef<PointFeature[]>([]);

  const [drawings, setDrawings] = useState<DrawingFeature[]>([]);
  const drawingsRef = useRef<DrawingFeature[]>([]);

  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinate[]>([]);
  const currentCoordinatesRef = useRef<Coordinate[]>([]);

  const cursorCoordinateRef = useRef<Coordinate | null>(null);

  const [screenPoints, setScreenPoints] = useState<ScreenPoint[]>([]);
  const [screenDrawings, setScreenDrawings] = useState<ScreenDrawing[]>([]);

  const [satellite, setSatellite] = useState(false);
  const satelliteRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const [drawingColor, setDrawingColor] = useState("#2563eb");
  const [drawingWidth, setDrawingWidth] = useState(5);
  const [drawingLineStyle, setDrawingLineStyle] = useState<LineStyle>("solid");
  const [pointSize, setPointSize] = useState(22);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selectedLandUseId, setSelectedLandUseId] = useState("konut");

  const selectedLandUse =
    LAND_USE_ITEMS.find((item) => item.id === selectedLandUseId) ??
    LAND_USE_ITEMS[0];

  const [cbsToolOpen, setCbsToolOpen] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [createLayerOpen, setCreateLayerOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerGeometry, setNewLayerGeometry] = useState<"Point" | "LineString" | "Polygon">("Polygon");
  const [newLayerColor, setNewLayerColor] = useState("#2563eb");
  const [newLayerOpacity, setNewLayerOpacity] = useState(0.45);
  const [activeUserLayerId, setActiveUserLayerId] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState<"none" | "distance">("none");
  const [servicesPanelOpen, setServicesPanelOpen] = useState(false);
  const [serviceType, setServiceType] = useState<"WMS" | "WFS" | "WMTS">("WMS");
  const [serviceName, setServiceName] = useState("");
  const [serviceUrl, setServiceUrl] = useState("");
  const [serviceLayer, setServiceLayer] = useState("");
  const [externalServices, setExternalServices] = useState<ExternalMapService[]>([]);
  const externalServicesRef = useRef<ExternalMapService[]>([]);

  useEffect(() => {
    if (!serviceOpenRequest) return;

    setServicesPanelOpen(true);
    setCbsToolOpen(false);
    setLayerPanelOpen(false);
    setLegendOpen(false);
    setStylePanelOpen(false);
    setAttributeTableOpen(false);
  }, [serviceOpenRequest]);

  const [message, setMessage] = useState("");
  const messageTimer = useRef<number | null>(null);

  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(
    null,
  );

  const [analysisSelectionIds, setAnalysisSelectionIds] = useState<number[]>([]);

  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);

  // Öznitelik tablosu
  const [attributeTableOpen, setAttributeTableOpen] = useState(false);
  const [attributeLayerId, setAttributeLayerId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number">("text");
  const [attributeSearch, setAttributeSearch] = useState("");
  const [attributeSortKey, setAttributeSortKey] = useState<string | null>(null);
  const [attributeSortDirection, setAttributeSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedAttributeFeatureId, setSelectedAttributeFeatureId] = useState<string | null>(null);
  const [newFeatureGeometry, setNewFeatureGeometry] = useState<"Point" | "LineString" | "Polygon">("Polygon");
  const layerEditModeRef = useRef(false);

  // Kullanıcı katmanındaki mevcut geometrinin vertex düzenleme durumu.
  const [geometryEdit, setGeometryEdit] = useState<{ layerId: string; featureIndex: number } | null>(null);
  const geometryEditRef = useRef<{ layerId: string; featureIndex: number } | null>(null);
  const draggingVertexRef = useRef<number | null>(null);

  // 3. adım: hassas çizim / snap / grid / açı / uzunluk ayarları.
  const [precisionPanelOpen, setPrecisionPanelOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(14);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSizeMeters, setGridSizeMeters] = useState(10);
  const [angleLockEnabled, setAngleLockEnabled] = useState(false);
  const [lengthConstraintInput, setLengthConstraintInput] = useState("");
  const [coordinateLngInput, setCoordinateLngInput] = useState("");
  const [coordinateLatInput, setCoordinateLatInput] = useState("");
  const [precisionStatus, setPrecisionStatus] = useState("");
  const precisionRef = useRef({
    snapEnabled: true, snapTolerance: 14, gridEnabled: false, gridSizeMeters: 10,
    angleLockEnabled: false, lengthConstraintInput: "",
  });

  geometryEditRef.current = geometryEdit;
  precisionRef.current = { snapEnabled, snapTolerance, gridEnabled, gridSizeMeters, angleLockEnabled, lengthConstraintInput };

  const [status, setStatus] = useState<{
    title: string;
    value: string;
  } | null>(null);

  const [mousePosition, setMousePosition] = useState<Coordinate | null>(null);
  const [, setMapRenderTick] = useState(0);

  function showMessage(text: string) {
    setMessage(text);

    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }

    messageTimer.current = window.setTimeout(() => {
      setMessage("");
    }, 1800);
  }

  function updateScreenCoordinates() {
    const map = mapRef.current;
    if (!map) return;

    const projectedPoints = pointsRef.current.map((point) => {
      const projected = map.project(point.coordinate);

      return {
        id: point.id,
        x: projected.x,
        y: projected.y,
        color: point.color,
        size: point.size,
      };
    });

    setScreenPoints(projectedPoints);

    const projectedDrawings = drawingsRef.current.map((drawing) => {
      const projected = drawing.coordinates.map((coordinate) => {
        const p = map.project(coordinate);
        return `${p.x},${p.y}`;
      });

      return {
        id: drawing.id,
        type: drawing.type,
        points: projected.join(" "),
        style: drawing.style,
      };
    });

    /* Geçici çizimin sonuna mouse konumu eklenir. */
    const temporaryCoordinates = [...currentCoordinatesRef.current];

    if (
      (drawModeRef.current === "line" ||
        drawModeRef.current === "polygon") &&
      cursorCoordinateRef.current
    ) {
      temporaryCoordinates.push(cursorCoordinateRef.current);
    }

    if (temporaryCoordinates.length > 0) {
      const projected = temporaryCoordinates.map((coordinate) => {
        const p = map.project(coordinate);
        return `${p.x},${p.y}`;
      });

      projectedDrawings.push({
        id: -999,
        type: drawModeRef.current === "polygon" ? "polygon" : "line",
        points: projected.join(" "),
        style: {
          color: drawingColor,
          width: drawingWidth,
          lineStyle: drawingLineStyle,
        },
      });
    }

    setScreenDrawings(projectedDrawings);
    setMapRenderTick((tick) => (tick + 1) % 1000000);
  }

  function openCreateLayer() {
    setLayerPanelOpen(false);
    setCreateLayerOpen(true);
    setNewLayerName("");
    setNewLayerGeometry("Polygon");
    setNewLayerColor("#2563eb");
    setNewLayerOpacity(0.45);
  }

  function createUserLayer() {
    const name = newLayerName.trim();

    if (!name) {
      showMessage("Katman adı gir");
      return;
    }

    if (!onUserLayersChange) {
      showMessage("Katman oluşturma için proje katman yönetimi etkin değil");
      return;
    }

    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newLayer: UserMapLayer = {
      id,
      name,
      visible: true,
      color: newLayerColor,
      opacity: newLayerOpacity,
      geometryType: newLayerGeometry,
      data: {
        type: "FeatureCollection",
        features: [],
      },
    };

    onUserLayersChange([...userLayers, newLayer]);
    setActiveUserLayerId(id);
    setCreateLayerOpen(false);
    setLayerPanelOpen(true);
    showMessage(`✓ ${name} katmanı oluşturuldu`);
  }

  function activateDistanceMeasure() {
    setCbsToolOpen(false);
    setLayerPanelOpen(false);
    setMeasureMode("distance");
    activateMode("line");
    showMessage("📏 Mesafe ölçmek için haritada noktaları seç");
  }

  function createCentroidFromSelection() {
    const drawing = drawingsRef.current.find((item) => item.id === selectedDrawingId);

    if (!drawing || drawing.type !== "polygon") {
      showMessage("Merkez noktası için bir alan seç");
      return;
    }

    const center = centroid(drawing.coordinates);
    if (!center) {
      showMessage("Merkez noktası hesaplanamadı");
      return;
    }

    const point: PointFeature = {
      id: nextId.current++,
      coordinate: center,
      color: drawing.style?.color ?? "#2563eb",
      size: 22,
    };

    pointsRef.current = [...pointsRef.current, point];
    setPoints(pointsRef.current);
    setSelectedPointId(point.id);
    setSelectedDrawingId(null);
    setStatus({
      title: "Merkez Noktası",
      value: `${center[1].toFixed(6)}, ${center[0].toFixed(6)}`,
    });
    updateScreenCoordinates();
    setCbsToolOpen(false);
    showMessage("✓ Merkez noktası oluşturuldu");
  }

  function createBuffer() {
    const radiusText = window.prompt("Tampon mesafesi (metre):", "100");
    if (radiusText === null) return;

    const radius = Number(radiusText.replace(",", "."));
    if (!Number.isFinite(radius) || radius <= 0) {
      showMessage("⚠ Geçerli bir metre değeri gir");
      return;
    }

    let source: any = null;

    if (selectedPointId !== null) {
      const point = pointsRef.current.find((item) => item.id === selectedPointId);
      if (point) source = turf.point(point.coordinate);
    } else if (selectedDrawingId !== null) {
      const drawing = drawingsRef.current.find((item) => item.id === selectedDrawingId);
      if (drawing?.type === "line") {
        source = turf.lineString(drawing.coordinates);
      } else if (drawing?.type === "polygon") {
        source = turf.polygon([closeRing(drawing.coordinates)]);
      }
    }

    if (!source) {
      showMessage("Tampon için önce bir nokta, çizgi veya alan seç");
      return;
    }

    const buffered = turf.buffer(source, radius, { units: "meters", steps: 32 });
    if (!buffered) {
      showMessage("⚠ Tampon oluşturulamadı");
      return;
    }

   const bufferedFeature = buffered as any;

if (
  !bufferedFeature?.geometry ||
  (bufferedFeature.geometry.type !== "Polygon" &&
    bufferedFeature.geometry.type !== "MultiPolygon")
) {
  showMessage(
    "⚠ Tampon sonucu desteklenmeyen bir geometri türü oluşturdu"
  );
  return;
}

const coordinates =
  bufferedFeature.geometry.type === "Polygon"
    ? bufferedFeature.geometry.coordinates[0]
    : bufferedFeature.geometry.coordinates[0]?.[0];

if (!coordinates || coordinates.length < 3) {
  showMessage("⚠ Tampon geometrisi oluşturulamadı");
  return;
}

const feature: DrawingFeature = {
  id: nextId.current++,
  type: "polygon",
  coordinates: coordinates as Coordinate[],
  style: {
    color: "#7c3aed",
    width: 3,
    lineStyle: "solid",
  },
  landUse: {
    id: "buffer",
    name: `Tampon Bölge (${radius.toLocaleString("tr-TR")} m)`,
    code: "BUF",
  },
};
    drawingsRef.current = [...drawingsRef.current, feature];
    setDrawings(drawingsRef.current);
    setSelectedDrawingId(feature.id);
    setSelectedPointId(null);
    setStatus({ title: "Tampon Bölge", value: `${radius.toLocaleString("tr-TR")} m` });
    updateScreenCoordinates();
    setCbsToolOpen(false);
    showMessage(`✓ ${radius.toLocaleString("tr-TR")} m gerçek tampon oluşturuldu`);
  }

  function clipActiveLayer() {
    const boundary = drawingsRef.current.find(
      (drawing) => drawing.id === selectedDrawingId && drawing.type === "polygon",
    );

    if (!boundary) {
      showMessage("Kırpmak için önce bir alan sınırı seç");
      return;
    }

    if (!activeUserLayerId || !onUserLayersChange) {
      showMessage("Önce Katman aracından bir kullanıcı katmanı seç");
      return;
    }

    const layer = userLayers.find((item) => item.id === activeUserLayerId);
    if (!layer) {
      showMessage("Aktif katman bulunamadı");
      return;
    }

    const clipPolygon: any = turf.polygon([closeRing(boundary.coordinates)]);
    const clippedFeatures: GeoJSONFeature[] = [];

    for (const feature of layer.data.features) {
      if (!feature.geometry) continue;

      try {
        if (feature.geometry.type === "Point") {
          const point = turf.point(feature.geometry.coordinates as Coordinate);
          if (turf.booleanPointInPolygon(point, clipPolygon)) clippedFeatures.push(feature);
          continue;
        }

        if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
          const result = turf.intersect(turf.featureCollection([feature as any, clipPolygon]));
          if (result) {
            clippedFeatures.push({ ...feature, geometry: result.geometry as any });
          }
          continue;
        }

        if (feature.geometry.type === "LineString") {
          const line: any = feature as any;
          const pieces = turf.lineSplit(line, clipPolygon as any);
          const inside = pieces.features.filter((piece: any) => {
            const midpoint = turf.pointOnFeature(piece);
            return turf.booleanPointInPolygon(midpoint, clipPolygon);
          });
          for (const piece of inside) {
            clippedFeatures.push({ ...feature, geometry: piece.geometry as any });
          }
          continue;
        }

        if (feature.geometry.type === "MultiLineString") {
          const lines = turf.multiLineString(feature.geometry.coordinates as Coordinate[][]);
          const pieces = turf.lineSplit(lines as any, clipPolygon as any);
          const inside = pieces.features.filter((piece: any) => {
            const midpoint = turf.pointOnFeature(piece);
            return turf.booleanPointInPolygon(midpoint, clipPolygon);
          });
          for (const piece of inside) {
            clippedFeatures.push({ ...feature, geometry: piece.geometry as any });
          }
        }
      } catch (error) {
        console.warn("Kırpma sırasında geometri atlandı:", error);
      }
    }

    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features: clippedFeatures } }
          : item,
      ),
    );

    setCbsToolOpen(false);
    showMessage(`✓ Katman kırpıldı · ${clippedFeatures.length} obje kaldı`);
  }

  function closeRing(coords: Coordinate[]): Coordinate[] {
    if (!coords.length) return [];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return [...coords];
    return [...coords, first];
  }

  function segmentIntersects(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
    const cross = (p: Coordinate, q: Coordinate, r: Coordinate) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const onSegment = (p: Coordinate, q: Coordinate, r: Coordinate) =>
      Math.min(p[0], r[0]) - 1e-10 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-10 &&
      Math.min(p[1], r[1]) - 1e-10 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-10;
    const c1 = cross(a, b, c);
    const c2 = cross(a, b, d);
    const c3 = cross(c, d, a);
    const c4 = cross(c, d, b);
    if (((c1 > 0 && c2 < 0) || (c1 < 0 && c2 > 0)) && ((c3 > 0 && c4 < 0) || (c3 < 0 && c4 > 0))) return true;
    if (Math.abs(c1) < 1e-10 && onSegment(a, c, b)) return true;
    if (Math.abs(c2) < 1e-10 && onSegment(a, d, b)) return true;
    if (Math.abs(c3) < 1e-10 && onSegment(c, a, d)) return true;
    if (Math.abs(c4) < 1e-10 && onSegment(c, b, d)) return true;
    return false;
  }

  function drawingsIntersect(a: DrawingFeature, b: DrawingFeature): boolean {
    const aPts = a.coordinates;
    const bPts = b.coordinates;
    const aEdges = a.type === "polygon" ? aPts.map((p, i) => [p, aPts[(i + 1) % aPts.length]] as [Coordinate, Coordinate]) : aPts.slice(0, -1).map((p, i) => [p, aPts[i + 1]] as [Coordinate, Coordinate]);
    const bEdges = b.type === "polygon" ? bPts.map((p, i) => [p, bPts[(i + 1) % bPts.length]] as [Coordinate, Coordinate]) : bPts.slice(0, -1).map((p, i) => [p, bPts[i + 1]] as [Coordinate, Coordinate]);
    if (a.type === "polygon" && b.type === "polygon") {
      if (aPts.some((p) => pointInPolygon(p, bPts)) || bPts.some((p) => pointInPolygon(p, aPts))) return true;
    }
    if (a.type === "polygon" && bPts.length && pointInPolygon(bPts[0], aPts)) return true;
    if (b.type === "polygon" && aPts.length && pointInPolygon(aPts[0], bPts)) return true;
    return aEdges.some(([a1, a2]) => bEdges.some(([b1, b2]) => segmentIntersects(a1, a2, b1, b2)));
  }

  function clipPolygonByLine(polygon: Coordinate[], a: Coordinate, b: Coordinate, keepLeft: boolean): Coordinate[] {
    if (polygon.length < 3) return [];
    const side = (p: Coordinate) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inside = (p: Coordinate) => keepLeft ? side(p) >= -1e-10 : side(p) <= 1e-10;
    const intersection = (p1: Coordinate, p2: Coordinate): Coordinate => {
      const s1 = side(p1); const s2 = side(p2);
      const t = s1 / (s1 - s2 || 1e-12);
      return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
    };
    const input = closeRing(polygon).slice(0, -1);
    const output: Coordinate[] = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside !== previousInside) output.push(intersection(previous, current));
      if (currentInside) output.push(current);
    }
    return output.length >= 3 ? closeRing(output) : [];
  }

  function requireAnalysisSelection(count = 2): DrawingFeature[] | null {
    const selected = analysisSelectionIds.map((id) => drawingsRef.current.find((drawing) => drawing.id === id) ?? null).filter(Boolean) as DrawingFeature[];
    if (selected.length !== count) {
      showMessage(`Bu araç için tam ${count} çizim seç. Ctrl/Shift ile ikinci çizimi seçebilirsin.`);
      return null;
    }
    return selected;
  }

  function mergeSelectedDrawings() {
    const selected = requireAnalysisSelection(2);
    if (!selected) return;

    if (selected.some((item) => item.type !== "polygon")) {
      showMessage("Birleştirme için iki poligon seçmelisin");
      return;
    }

    if (!activeUserLayerId || !onUserLayersChange) {
      showMessage("Birleştirme sonucu için önce bir kullanıcı katmanı oluştur ve aktif et");
      return;
    }

    const layer = userLayers.find((item) => item.id === activeUserLayerId);
    if (!layer) {
      showMessage("Aktif katman bulunamadı");
      return;
    }

    const polygons = selected.map((item) => turf.polygon([closeRing(item.coordinates)]));
    const unionResult = turf.union(turf.featureCollection(polygons));

    if (!unionResult) {
      showMessage("⚠ Poligonlar birleştirilemedi");
      return;
    }

    const feature: GeoJSONFeature = {
      type: "Feature",
      geometry: unionResult.geometry as any,
      properties: { ISLEM: "UNION", PARCA_SAYISI: selected.length },
    };

    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features: [...item.data.features, feature] } }
          : item,
      ),
    );

    setAnalysisSelectionIds([]);
    setSelectedDrawingId(null);
    setCbsToolOpen(false);
    showMessage("✓ Poligonlar gerçek UNION işlemiyle birleştirildi");
  }

  function splitSelectedDrawing() {
    const selected = requireAnalysisSelection(2); if (!selected) return;
    const polygon = selected.find((item) => item.type === "polygon");
    const line = selected.find((item) => item.type === "line");
    if (!polygon || !line || line.coordinates.length < 2) { showMessage("Bölmek için bir poligon ve onu kesecek bir çizgi seçmelisin"); return; }
    const left = clipPolygonByLine(polygon.coordinates, line.coordinates[0], line.coordinates[line.coordinates.length - 1], true);
    const right = clipPolygonByLine(polygon.coordinates, line.coordinates[0], line.coordinates[line.coordinates.length - 1], false);
    if (left.length < 4 || right.length < 4) { showMessage("Seçilen çizgi poligonu iki parçaya bölemedi"); return; }
    const baseStyle = polygon.style ?? { color: "#16a34a", width: 4, lineStyle: "solid" as LineStyle };
    const pieces: DrawingFeature[] = [
      { ...polygon, id: nextId.current++, coordinates: left, style: baseStyle },
      { ...polygon, id: nextId.current++, coordinates: right, style: baseStyle },
    ];
    drawingsRef.current = [...drawingsRef.current.filter((item) => item.id !== polygon.id), ...pieces];
    setDrawings(drawingsRef.current); setSelectedDrawingId(pieces[0].id); setAnalysisSelectionIds([]); updateScreenCoordinates(); setCbsToolOpen(false);
    showMessage("✓ Poligon iki parçaya bölündü");
  }

  function checkSelectedIntersection() {
    const selected = requireAnalysisSelection(2);
    if (!selected) return;

    const toFeature = (drawing: DrawingFeature): any =>
      drawing.type === "line"
        ? turf.lineString(drawing.coordinates)
        : turf.polygon([closeRing(drawing.coordinates)]);

    const intersects = turf.booleanIntersects(
      toFeature(selected[0]),
      toFeature(selected[1]),
    );

    setCbsToolOpen(false);
    setStatus({
      title: "Kesişim kontrolü",
      value: intersects ? "Kesişiyor" : "Kesişmiyor",
    });
    showMessage(intersects ? "🔴 Seçilen geometriler kesişiyor" : "🟢 Seçilen geometriler kesişmiyor");
  }

  function serviceRequestUrl(service: ExternalMapService): string {
    if (service.type === "WFS") {
      const separator = service.url.includes("?") ? "&" : "?";
      if (!service.layer) return service.url;
      return `${service.url}${separator}service=WFS&request=GetFeature&version=2.0.0&typeNames=${encodeURIComponent(service.layer)}&outputFormat=application/json&srsName=EPSG:4326`;
    }
    return service.url;
  }

  function buildWmsTileUrl(url: string, layer: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}service=WMS&request=GetMap&version=1.1.1&layers=${encodeURIComponent(layer)}&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
  }

  function normalizeWmtsUrl(url: string): string {
    if (url.includes("{z}") && url.includes("{x}") && url.includes("{y}")) return url;
    return url.replace(/\{TileMatrix\}/g, "{z}").replace(/\{TileCol\}/g, "{x}").replace(/\{TileRow\}/g, "{y}");
  }

  function removeExternalService(id: string) {
    const map = mapRef.current;
    const sourceId = `external-${id}`;
    if (map) {
      for (const suffix of ["fill", "line", "point", "raster"]) {
        const layerId = `${sourceId}-${suffix}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
    externalServicesRef.current = externalServicesRef.current.filter((item) => item.id !== id);
    setExternalServices(externalServicesRef.current);
    showMessage("✓ Harici servis kaldırıldı");
  }

  function toggleExternalService(id: string) {
    const map = mapRef.current;
    if (!map) return;
    const next = externalServices.map((item) => item.id === id ? { ...item, visible: !item.visible } : item);
    externalServicesRef.current = next;
    setExternalServices(next);
    const item = next.find((service) => service.id === id);
    if (!item) return;
    const visibility = item.visible ? "visible" : "none";
    for (const suffix of ["fill", "line", "point", "raster"]) {
      const layerId = `external-${id}-${suffix}`;
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }

  function setExternalServiceOpacity(id: string, opacity: number) {
    const map = mapRef.current;
    const next = externalServicesRef.current.map((item) => item.id === id ? { ...item, opacity } : item);
    externalServicesRef.current = next;
    setExternalServices(next);
    if (!map) return;
    const sourceId = `external-${id}`;
    if (map.getLayer(`${sourceId}-raster`)) map.setPaintProperty(`${sourceId}-raster`, "raster-opacity", opacity);
    if (map.getLayer(`${sourceId}-fill`)) map.setPaintProperty(`${sourceId}-fill`, "fill-opacity", opacity * 0.35);
    if (map.getLayer(`${sourceId}-line`)) map.setPaintProperty(`${sourceId}-line`, "line-opacity", opacity);
    if (map.getLayer(`${sourceId}-point`)) map.setPaintProperty(`${sourceId}-point`, "circle-opacity", opacity);
  }

  async function addExternalService() {
    const map = mapRef.current;
    const url = serviceUrl.trim();
    const name = serviceName.trim() || `${serviceType} Servisi`;
    const layer = serviceLayer.trim();
    if (!map || !url) {
      showMessage("⚠ Servis adresini gir");
      return;
    }
    if ((serviceType === "WMS" || serviceType === "WFS") && !layer) {
      showMessage("⚠ Katman adını gir");
      return;
    }

    const id = `svc-${Date.now()}`;
    const service: ExternalMapService = { id, name, type: serviceType, url, layer: layer || undefined, visible: true, opacity: 0.85 };
    const sourceId = `external-${id}`;

    try {
      if (serviceType === "WMS") {
        map.addSource(sourceId, { type: "raster", tiles: [buildWmsTileUrl(url, layer)], tileSize: 256 } as any);
        map.addLayer({ id: `${sourceId}-raster`, type: "raster", source: sourceId, paint: { "raster-opacity": service.opacity } });
      } else if (serviceType === "WMTS") {
        const tiles = normalizeWmtsUrl(url);
        map.addSource(sourceId, { type: "raster", tiles: [tiles], tileSize: 256 } as any);
        map.addLayer({ id: `${sourceId}-raster`, type: "raster", source: sourceId, paint: { "raster-opacity": service.opacity } });
      } else {
        const response = await fetch(serviceRequestUrl(service), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`WFS ${response.status}`);
        const data = await response.json();
        if (!data || data.type !== "FeatureCollection") throw new Error("WFS yanıtı GeoJSON FeatureCollection değil");
        map.addSource(sourceId, { type: "geojson", data } as any);
        map.addLayer({ id: `${sourceId}-fill`, type: "fill", source: sourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2563eb", "fill-opacity": service.opacity * 0.35 } } as any);
        map.addLayer({ id: `${sourceId}-line`, type: "line", source: sourceId, filter: ["in", ["geometry-type"], "LineString", "MultiLineString", "Polygon", "MultiPolygon"], paint: { "line-color": "#1d4ed8", "line-width": 2, "line-opacity": service.opacity } } as any);
        map.addLayer({ id: `${sourceId}-point`, type: "circle", source: sourceId, filter: ["in", ["geometry-type"], "Point", "MultiPoint"], paint: { "circle-color": "#1d4ed8", "circle-radius": 5, "circle-opacity": service.opacity, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } } as any);
      }

      externalServicesRef.current = [...externalServicesRef.current, service];
      setExternalServices(externalServicesRef.current);
      setServiceName("");
      setServiceUrl("");
      setServiceLayer("");
      showMessage(`✓ ${name} eklendi`);
    } catch (error) {
      console.error("Harici servis ekleme hatası:", error);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      showMessage("⚠ Servis eklenemedi. URL, katman adı ve CORS ayarını kontrol et.");
    }
  }

  function restoreExternalServices(services: ExternalMapService[] | undefined) {
    if (!services?.length) return;
    externalServicesRef.current = services;
    setExternalServices(services);
    showMessage(`${services.length} harici servis proje durumundan geri yüklendi`);
  }

  function selectLandUse(item: LandUseItem) {
    setSelectedLandUseId(item.id);
    setDrawingColor(item.color);
    setLegendOpen(false);
    setStylePanelOpen(false);
    activateMode("polygon");
    showMessage(`✓ ${item.name} seçildi — haritada alan çiz`);
  }

  function flattenGeometryCoordinates(geometry: GeoJSONGeometry | null | undefined): Coordinate[] {
    if (!geometry) return [];
    const result: Coordinate[] = [];
    const visit = (value: any) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        result.push([value[0], value[1]]);
        return;
      }
      value.forEach(visit);
    };
    visit(geometry.coordinates);
    return result;
  }

  function geometrySegments(geometry: GeoJSONGeometry | null | undefined): Array<[Coordinate, Coordinate]> {
    if (!geometry) return [];
    const segments: Array<[Coordinate, Coordinate]> = [];
    const addRing = (ring: any[]) => {
      const coords = ring.filter((v) => Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") as Coordinate[];
      for (let i = 0; i < coords.length - 1; i += 1) segments.push([coords[i], coords[i + 1]]);
      if (geometry.type === "Polygon" && coords.length > 2) segments.push([coords[coords.length - 1], coords[0]]);
    };
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) addRing(geometry.coordinates);
    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) geometry.coordinates.forEach(addRing);
    if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) geometry.coordinates.forEach(addRing);
    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) geometry.coordinates.forEach((polygon: any[]) => polygon.forEach(addRing));
    return segments;
  }

  function closestPointOnScreenSegment(map: MapLibreMap, screen: { x: number; y: number }, a: Coordinate, b: Coordinate): { coordinate: Coordinate; distance: number } | null {
    const pa = projectCoordinate(map, a);
    const pb = projectCoordinate(map, b);
    if (!pa || !pb) return null;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((screen.x - pa[0]) * dx + (screen.y - pa[1]) * dy) / lengthSquared));
    const point: [number, number] = [pa[0] + t * dx, pa[1] + t * dy];
    const distance = Math.hypot(screen.x - point[0], screen.y - point[1]);
    const lngLat = map.unproject(point);
    return { coordinate: [lngLat.lng, lngLat.lat], distance };
  }

  function bearingBetween(a: Coordinate, b: Coordinate): number {
    const lat1 = (a[1] * Math.PI) / 180;
    const lat2 = (b[1] * Math.PI) / 180;
    const dLon = ((b[0] - a[0]) * Math.PI) / 180;
    return Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon));
  }

  function destinationPoint(start: Coordinate, distanceMeters: number, bearingRadians: number): Coordinate {
    const R = 6371008.8;
    const angularDistance = distanceMeters / R;
    const lat1 = (start[1] * Math.PI) / 180;
    const lon1 = (start[0] * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians));
    const lon2 = lon1 + Math.atan2(Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  function snapToGrid(coordinate: Coordinate): Coordinate {
    const size = Math.max(0.1, precisionRef.current.gridSizeMeters);
    const latMeters = 111320;
    const lonMeters = Math.max(1000, 111320 * Math.cos((coordinate[1] * Math.PI) / 180));
    return [Math.round((coordinate[0] * lonMeters) / size) * size / lonMeters, Math.round((coordinate[1] * latMeters) / size) * size / latMeters];
  }

  function getPrecisionCoordinate(raw: Coordinate, screen: { x: number; y: number }, shiftKey = false, exclude?: { layerId?: string; featureIndex?: number; vertexIndex?: number }): { coordinate: Coordinate; snapLabel: string } {
    const map = mapRef.current;
    if (!map) return { coordinate: raw, snapLabel: "" };
    const settings = precisionRef.current;
    let candidate = raw;
    let snapLabel = "";

    if (settings.snapEnabled) {
      let bestVertex: { coordinate: Coordinate; distance: number; label: string } | null = null;
      const considerVertex = (coordinate: Coordinate, label: string, excluded = false) => {
        if (excluded) return;
        const projected = projectCoordinate(map, coordinate);
        if (!projected) return;
        const distance = Math.hypot(screen.x - projected[0], screen.y - projected[1]);
        if (distance <= settings.snapTolerance && (!bestVertex || distance < bestVertex.distance)) bestVertex = { coordinate, distance, label };
      };
      userLayersRef.current.forEach((layer) => {
        if (!layer.visible) return;
        layer.data.features.forEach((feature, featureIndex) => {
          const excludedFeature = exclude?.layerId === layer.id && exclude.featureIndex === featureIndex;
          flattenGeometryCoordinates(feature.geometry).forEach((coordinate, vertexIndex) => considerVertex(coordinate, "Köşe", excludedFeature && exclude?.vertexIndex === vertexIndex));
        });
      });
      drawingsRef.current.forEach((drawing) => drawing.coordinates.forEach((coordinate) => considerVertex(coordinate, "Köşe")));
      pointsRef.current.forEach((point) => considerVertex(point.coordinate, "Nokta"));
      currentCoordinatesRef.current.forEach((coordinate) => considerVertex(coordinate, "Çizim köşesi"));

      if (bestVertex) {
        const snappedVertex = bestVertex as { coordinate: Coordinate; distance: number; label: string };
        candidate = snappedVertex.coordinate;
        snapLabel = `Snap: ${snappedVertex.label}`;
      } else {
        let bestSegment: { coordinate: Coordinate; distance: number } | null = null;
        userLayersRef.current.forEach((layer) => {
          if (!layer.visible) return;
          layer.data.features.forEach((feature, featureIndex) => {
            if (exclude?.layerId === layer.id && exclude.featureIndex === featureIndex) return;
            geometrySegments(feature.geometry).forEach(([a, b]) => {
              const result = closestPointOnScreenSegment(map, screen, a, b);
              if (result && result.distance <= settings.snapTolerance && (!bestSegment || result.distance < bestSegment.distance)) bestSegment = result;
            });
          });
        });
        drawingsRef.current.forEach((drawing) => {
          const geometry: GeoJSONGeometry = drawing.type === "polygon" ? { type: "Polygon", coordinates: [[...drawing.coordinates, drawing.coordinates[0]]] } : { type: "LineString", coordinates: drawing.coordinates };
          geometrySegments(geometry).forEach(([a, b]) => {
            const result = closestPointOnScreenSegment(map, screen, a, b);
            if (result && result.distance <= settings.snapTolerance && (!bestSegment || result.distance < bestSegment.distance)) bestSegment = result;
          });
        });
        if (bestSegment) {
          const snappedSegment = bestSegment as { coordinate: Coordinate; distance: number };
          candidate = snappedSegment.coordinate;
          snapLabel = "Snap: Çizgi";
        }
      }
    }

    if (!snapLabel && settings.gridEnabled) {
      candidate = snapToGrid(candidate);
      snapLabel = `Grid: ${settings.gridSizeMeters} m`;
    }

    const previous = currentCoordinatesRef.current[currentCoordinatesRef.current.length - 1];
    if ((settings.angleLockEnabled || shiftKey) && previous) {
      const previousScreen = projectCoordinate(map, previous);
      const candidateScreen = projectCoordinate(map, candidate);
      if (previousScreen && candidateScreen) {
        const dx = candidateScreen[0] - previousScreen[0];
        const dy = candidateScreen[1] - previousScreen[1];
        const pixelDistance = Math.hypot(dx, dy);
        if (pixelDistance > 1) {
          const angle = Math.atan2(dy, dx);
          const lockedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const lockedScreen: [number, number] = [previousScreen[0] + Math.cos(lockedAngle) * pixelDistance, previousScreen[1] + Math.sin(lockedAngle) * pixelDistance];
          const locked = map.unproject(lockedScreen);
          candidate = [locked.lng, locked.lat];
          snapLabel = snapLabel ? `${snapLabel} · Açı 45°` : "Açı kilidi: 45°";
        }
      }
    }

    const lengthMeters = Number(settings.lengthConstraintInput.replace(",", "."));
    if (previous && Number.isFinite(lengthMeters) && lengthMeters > 0) {
      candidate = destinationPoint(previous, lengthMeters, bearingBetween(previous, candidate));
      snapLabel = snapLabel ? `${snapLabel} · ${formatDistance(lengthMeters)}` : `Uzunluk: ${formatDistance(lengthMeters)}`;
    }

    return { coordinate: candidate, snapLabel };
  }

  function addCoordinateVertexFromInputs() {
    const lng = Number(coordinateLngInput.replace(",", "."));
    const lat = Number(coordinateLatInput.replace(",", "."));
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) { showMessage("Geçerli boylam/enlem gir"); return; }
    const coordinate: Coordinate = [lng, lat];
    if (drawModeRef.current === "point") addPoint(coordinate);
    else if (drawModeRef.current === "line" || drawModeRef.current === "polygon") {
      const next = [...currentCoordinatesRef.current, coordinate];
      currentCoordinatesRef.current = next; setCurrentCoordinates(next); updateScreenCoordinates(); showMessage("✓ Koordinat çizime eklendi");
    } else if (mapRef.current) { mapRef.current.easeTo({ center: coordinate, duration: 500 }); showMessage("📍 Koordinata gidildi"); }
  }

  function applyOffsetToSelectedFeature() {
    const raw = window.prompt("Offset / öteleme mesafesi (metre):", "10");
    if (raw === null) return;
    const distance = Number(raw.replace(",", "."));
    if (!Number.isFinite(distance) || distance === 0) return;
    if (!attributeLayerId || !onUserLayersChange || !selectedAttributeFeatureId) { showMessage("Offset için öznitelik tablosundan bir nesne seç"); return; }
    const layer = userLayersRef.current.find((item) => item.id === attributeLayerId);
    if (!layer) return;
    const index = selectedAttributeFeatureId.startsWith("row-") ? Number(selectedAttributeFeatureId.slice(4)) : -1;
    const feature = layer.data.features[index];
    if (!feature?.geometry) return;
    const coords = flattenGeometryCoordinates(feature.geometry);
    if (!coords.length) return;
    const center = centroid(coords) ?? coords[0];
    const shifted = coords.map((coordinate) => {
      const dx = coordinate[0] - center[0]; const dy = coordinate[1] - center[1]; const length = Math.hypot(dx, dy) || 1;
      const latScale = 111320; const lonScale = Math.max(1000, 111320 * Math.cos((center[1] * Math.PI) / 180));
      return [coordinate[0] + ((-dy / length) * distance) / lonScale, coordinate[1] + ((dx / length) * distance) / latScale] as Coordinate;
    });
    let geometry: GeoJSONGeometry = feature.geometry;
    if (feature.geometry.type === "Point") geometry = { type: "Point", coordinates: shifted[0] };
    if (feature.geometry.type === "LineString") geometry = { type: "LineString", coordinates: shifted };
    if (feature.geometry.type === "Polygon") geometry = { type: "Polygon", coordinates: [shifted.concat([shifted[0]])] };
    const features = layer.data.features.map((item, i) => i === index ? { ...item, geometry } : item);
    onUserLayersChange(userLayersRef.current.map((item) => item.id === layer.id ? { ...item, data: { ...item.data, features } } : item));
    showMessage(`✓ Offset ${distance > 0 ? "+" : ""}${distance} m uygulandı`);
  }

  function activateMode(mode: DrawMode) {
    drawModeRef.current = mode;
    setDrawMode(mode);

    currentCoordinatesRef.current = [];
    setCurrentCoordinates([]);

    cursorCoordinateRef.current = null;

    setSelectedDrawingId(null);
    setSelectedPointId(null);
    setStatus(null);

    updateScreenCoordinates();

    if (mode === "point") {
      showMessage("📍 Haritada istediğin yere tıkla");
    } else if (mode === "line") {
      showMessage("📏 Çizgi için noktalara tıkla, ENTER ile bitir");
    } else if (mode === "polygon") {
      showMessage("⬡ Alan için köşelere tıkla, ENTER ile bitir");
    }
  }

  function cancelDrawing() {
    currentCoordinatesRef.current = [];
    setCurrentCoordinates([]);

    cursorCoordinateRef.current = null;

    drawModeRef.current = "none";
    setDrawMode("none");

    updateScreenCoordinates();
    showMessage("Çizim iptal edildi");
  }

  function undoLastVertex() {
    if (currentCoordinatesRef.current.length === 0) {
      showMessage("Geri alınacak nokta yok");
      return;
    }

    const next = currentCoordinatesRef.current.slice(0, -1);
    currentCoordinatesRef.current = next;
    setCurrentCoordinates(next);

    updateScreenCoordinates();
    showMessage("↶ Son nokta geri alındı");
  }

  function finishDrawing() {
    const coordinates = currentCoordinatesRef.current;
    const mode = drawModeRef.current;

    if (layerEditModeRef.current && (mode === "line" || mode === "polygon")) {
      if (mode === "line" && coordinates.length < 2) {
        showMessage("Çizgi için en az 2 nokta gerekli");
        return;
      }
      if (mode === "polygon" && coordinates.length < 3) {
        showMessage("Alan için en az 3 nokta gerekli");
        return;
      }

      const geometry: GeoJSONGeometry = mode === "line"
        ? { type: "LineString", coordinates: [...coordinates] }
        : {
            type: "Polygon",
            coordinates: [[...coordinates, coordinates[0]]],
          };
      const properties: Record<string, unknown> =
        mode === "polygon"
          ? { landUseName: selectedLandUse.name, landUseCode: selectedLandUse.code }
          : {};

      const saved = addFeatureToActiveLayer({ type: "Feature", geometry, properties });
      layerEditModeRef.current = false;
      currentCoordinatesRef.current = [];
      setCurrentCoordinates([]);
      cursorCoordinateRef.current = null;
      drawModeRef.current = "none";
      setDrawMode("none");
      updateScreenCoordinates();
      if (saved) {
        setAttributeTableOpen(true);
        showMessage("✓ Yeni nesne katmana eklendi");
      }
      return;
    }

    if (mode === "line") {
      if (coordinates.length < 2) {
        showMessage("Çizgi için en az 2 nokta gerekli");
        return;
      }

      if (measureMode === "distance") {
        const length = lineLength(coordinates);
        setStatus({
          title: "Mesafe",
          value: formatDistance(length),
        });
        currentCoordinatesRef.current = [];
        setCurrentCoordinates([]);
        drawModeRef.current = "none";
        setDrawMode("none");
        setMeasureMode("none");
        updateScreenCoordinates();
        showMessage("✓ Mesafe ölçüldü");
        return;
      }

      const feature: DrawingFeature = {
        id: nextId.current++,
        type: "line",
        coordinates: [...coordinates],
        style: {
          color: drawingColor,
          width: drawingWidth,
          lineStyle: drawingLineStyle,
        },
      };

      drawingsRef.current = [...drawingsRef.current, feature];
      setDrawings(drawingsRef.current);

      const length = lineLength(feature.coordinates);

      setSelectedDrawingId(feature.id);
      setStatus({
        title: "Çizgi uzunluğu",
        value: formatDistance(length),
      });

      showMessage("✓ Çizgi tamamlandı");
    }

    if (mode === "polygon") {
      if (coordinates.length < 3) {
        showMessage("Alan için en az 3 nokta gerekli");
        return;
      }

      const feature: DrawingFeature = {
        id: nextId.current++,
        type: "polygon",
        coordinates: [...coordinates],
        style: {
          color: selectedLandUse.color,
          width: drawingWidth,
          lineStyle: drawingLineStyle,
        },
        landUse: {
          id: selectedLandUse.id,
          name: selectedLandUse.name,
          code: selectedLandUse.code,
        },
      };

      drawingsRef.current = [...drawingsRef.current, feature];
      setDrawings(drawingsRef.current);

      const area = polygonArea(feature.coordinates);

      setSelectedDrawingId(feature.id);
      setStatus({
        title: "Alan",
        value: formatArea(area),
      });

      showMessage("✓ Alan tamamlandı");
    }

    currentCoordinatesRef.current = [];
    setCurrentCoordinates([]);

    cursorCoordinateRef.current = null;

    drawModeRef.current = "none";
    setDrawMode("none");

    updateScreenCoordinates();
  }

  function addPoint(coordinate: Coordinate) {
    if (layerEditModeRef.current) {
      const saved = addFeatureToActiveLayer({
        type: "Feature",
        geometry: { type: "Point", coordinates: coordinate },
        properties: {},
      });
      layerEditModeRef.current = false;
      drawModeRef.current = "none";
      setDrawMode("none");
      if (saved) {
        setAttributeTableOpen(true);
        showMessage("✓ Yeni nokta katmana eklendi");
      }
      return;
    }

    const newPoint: PointFeature = {
      id: nextId.current++,
      coordinate,
      color: drawingColor,
      size: pointSize,
    };

    pointsRef.current = [...pointsRef.current, newPoint];
    setPoints(pointsRef.current);

    setSelectedPointId(newPoint.id);
    setSelectedDrawingId(null);

    setStatus({
      title: "Koordinat",
      value: `${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)}`,
    });

    updateScreenCoordinates();
    showMessage("📍 Nokta eklendi");
  }

  function clearAll() {
    pointsRef.current = [];
    drawingsRef.current = [];
    currentCoordinatesRef.current = [];

    setPoints([]);
    setDrawings([]);
    setCurrentCoordinates([]);
    setScreenPoints([]);
    setScreenDrawings([]);

    setSelectedDrawingId(null);
    setSelectedPointId(null);
    setStatus(null);

    cursorCoordinateRef.current = null;

    drawModeRef.current = "none";
    setDrawMode("none");

    showMessage("🗑️ Tüm çizimler temizlendi");
  }

  function deleteSelected() {
    if (selectedPointId !== null) {
      pointsRef.current = pointsRef.current.filter(
        (point) => point.id !== selectedPointId,
      );

      setPoints(pointsRef.current);
      setSelectedPointId(null);
      setStatus(null);
      updateScreenCoordinates();
      showMessage("🗑️ Nokta silindi");
      return;
    }

    if (selectedDrawingId !== null) {
      drawingsRef.current = drawingsRef.current.filter(
        (drawing) => drawing.id !== selectedDrawingId,
      );

      setDrawings(drawingsRef.current);
      setSelectedDrawingId(null);
      setStatus(null);
      updateScreenCoordinates();
      showMessage("🗑️ Çizim silindi");
      return;
    }

    showMessage("Silmek için önce bir çizim seç");
  }

  function updateSelectedDrawingStyle(partial: Partial<DrawingStyle>) {
    if (selectedDrawingId === null) return;

    const current = drawingsRef.current.find((drawing) => drawing.id === selectedDrawingId);
    if (!current) return;

    const nextDrawing: DrawingFeature = {
      ...current,
      style: {
        color: current.style?.color ?? (current.type === "line" ? "#2563eb" : "#16a34a"),
        width: current.style?.width ?? (current.type === "line" ? 5 : 4),
        lineStyle: current.style?.lineStyle ?? "solid",
        ...partial,
      },
    };

    drawingsRef.current = drawingsRef.current.map((drawing) =>
      drawing.id === selectedDrawingId ? nextDrawing : drawing,
    );
    setDrawings(drawingsRef.current);
    updateScreenCoordinates();
  }

  function updateSelectedPointStyle(partial: Partial<Pick<PointFeature, "color" | "size">>) {
    if (selectedPointId === null) return;

    pointsRef.current = pointsRef.current.map((point) =>
      point.id === selectedPointId ? { ...point, ...partial } : point,
    );
    setPoints(pointsRef.current);
    updateScreenCoordinates();
  }

  function selectDrawing(drawing: DrawingFeature, event?: ReactMouseEvent) {
    const multi = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    if (multi) {
      setAnalysisSelectionIds((current) => current.includes(drawing.id) ? current.filter((id) => id !== drawing.id) : [...current, drawing.id].slice(-6));
    } else {
      setAnalysisSelectionIds([drawing.id]);
    }
    setSelectedDrawingId(drawing.id);
    setDrawingColor(drawing.style?.color ?? (drawing.type === "line" ? "#2563eb" : "#16a34a"));
    setDrawingWidth(drawing.style?.width ?? (drawing.type === "line" ? 5 : 4));
    setDrawingLineStyle(drawing.style?.lineStyle ?? "solid");
    setSelectedPointId(null);

    if (drawing.type === "line") {
      setStatus({
        title: "Çizgi uzunluğu",
        value: formatDistance(lineLength(drawing.coordinates)),
      });
    } else {
      setStatus({
        title: "Alan",
        value: formatArea(polygonArea(drawing.coordinates)),
      });
    }
  }

  function selectPoint(point: PointFeature) {
    setSelectedPointId(point.id);
    setDrawingColor(point.color ?? "#2563eb");
    setPointSize(point.size ?? 22);
    setSelectedDrawingId(null);

    setStatus({
      title: "Koordinat",
      value: `${point.coordinate[1].toFixed(5)}, ${point.coordinate[0].toFixed(5)}`,
    });
  }

  function openAttributeTable() {
    setCbsToolOpen(false);
    setLayerPanelOpen(false);
    setLegendOpen(false);
    setStylePanelOpen(false);
    setCreateLayerOpen(false);

    const firstLayer = userLayers[0]?.id ?? null;
    const targetLayerId = attributeLayerId ?? firstLayer;
    setAttributeLayerId(targetLayerId);
    if (targetLayerId) {
      setActiveUserLayerId(targetLayerId);
      const targetLayer = userLayers.find((layer) => layer.id === targetLayerId);
      if (targetLayer?.geometryType) setNewFeatureGeometry(targetLayer.geometryType);
    }
    setSelectedAttributeFeatureId(null);
    setAttributeTableOpen(true);
  }

  function closeAttributeTable() {
    setAttributeTableOpen(false);
  }

  function attributeFeatureKey(index: number): string {
    return `row-${index}`;
  }

  function findFeatureIndex(layer: UserMapLayer, feature: GeoJSONFeature): number {
    const incomingId = feature.properties?.__ergis_id;
    if (incomingId !== undefined && incomingId !== null) {
      const byId = layer.data.features.findIndex(
        (item) => String(item.properties?.__ergis_id ?? "") === String(incomingId),
      );
      if (byId >= 0) return byId;
    }

    const incomingGeometry = JSON.stringify(feature.geometry ?? null);
    const incomingProperties = JSON.stringify(feature.properties ?? null);
    const exact = layer.data.features.findIndex(
      (item) =>
        JSON.stringify(item.geometry ?? null) === incomingGeometry &&
        JSON.stringify(item.properties ?? null) === incomingProperties,
    );
    if (exact >= 0) return exact;

    const geometryOnly = layer.data.features.findIndex(
      (item) => JSON.stringify(item.geometry ?? null) === incomingGeometry,
    );
    return geometryOnly;
  }

  function selectAttributeFeatureFromMap(layer: UserMapLayer, feature: GeoJSONFeature) {
    const currentLayer = userLayersRef.current.find((item) => item.id === layer.id) ?? layer;
    const index = findFeatureIndex(currentLayer, feature);
    if (index < 0) return;

    setAttributeLayerId(layer.id);
    setActiveUserLayerId(layer.id);
    setSelectedAttributeFeatureId(attributeFeatureKey(index));
    setAttributeTableOpen(true);
    setCbsToolOpen(false);
    setLayerPanelOpen(false);
    setLegendOpen(false);
    setStylePanelOpen(false);
  }

  function toggleAttributeSort(key: string) {
    if (attributeSortKey === key) {
      setAttributeSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setAttributeSortKey(key);
      setAttributeSortDirection("asc");
    }
  }

  function deleteAttributeFeature(sourceIndex: number) {
    if (!attributeLayerId || !onUserLayersChange) return;
    const layer = userLayers.find((item) => item.id === attributeLayerId);
    if (!layer) return;

    const feature = layer.data.features[sourceIndex];
    if (!feature) return;

    if (!window.confirm(`${sourceIndex + 1}. nesneyi silmek istediğine emin misin?`)) return;

    const features = layer.data.features.filter((_, index) => index !== sourceIndex);
    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id ? { ...item, data: { ...item.data, features } } : item,
      ),
    );
    setSelectedAttributeFeatureId(null);
    showMessage("🗑️ Nesne silindi");
  }

  function getEditableVertices(feature: GeoJSONFeature): Coordinate[] {
    const geometry = feature.geometry;
    if (!geometry) return [];

    if (geometry.type === "Point") {
      return [geometry.coordinates as Coordinate];
    }

    if (geometry.type === "LineString") {
      return Array.isArray(geometry.coordinates) ? geometry.coordinates as Coordinate[] : [];
    }

    if (geometry.type === "Polygon") {
      const ring = Array.isArray(geometry.coordinates?.[0])
        ? geometry.coordinates[0] as Coordinate[]
        : [];
      if (ring.length > 1) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        const isClosed = first?.[0] === last?.[0] && first?.[1] === last?.[1];
        return isClosed ? ring.slice(0, -1) : ring;
      }
      return ring;
    }

    return [];
  }

  function startSelectedGeometryEdit() {
    const layerId = attributeLayerId ?? activeUserLayerId ?? userLayersRef.current[0]?.id;
    if (!layerId) {
      showMessage("Önce bir kullanıcı katmanı oluştur veya seç");
      return;
    }

    const layer = userLayersRef.current.find((item) => item.id === layerId);
    if (!layer) {
      showMessage("Düzenlenecek katman bulunamadı");
      return;
    }

    let featureIndex = -1;
    if (selectedAttributeFeatureId?.startsWith("row-")) {
      const parsed = Number(selectedAttributeFeatureId.slice(4));
      if (Number.isInteger(parsed) && parsed >= 0 && parsed < layer.data.features.length) {
        featureIndex = parsed;
      }
    }

    if (featureIndex < 0 && layer.data.features.length === 1) featureIndex = 0;

    if (featureIndex < 0) {
      // Düzenle butonu tabloyu açmamalı. Önce bir geometri seçilmesini bekle.
      setAttributeLayerId(layer.id);
      setActiveUserLayerId(layer.id);
      setAttributeTableOpen(false);
      setLayerPanelOpen(false);
      setCbsToolOpen(false);
      setLegendOpen(false);
      setStylePanelOpen(false);
      showMessage("Önce haritadaki bir nesneye tıkla veya Öznitelik tablosundan bir nesne seç");
      return;
    }

    startGeometryEdit(layer.id, featureIndex);
  }

  function startGeometryEdit(layerId: string, featureIndex: number) {
    const layer = userLayersRef.current.find((item) => item.id === layerId);
    const feature = layer?.data.features[featureIndex];

    if (!layer || !feature?.geometry) {
      showMessage("Düzenlenecek geometri bulunamadı");
      return;
    }

    if (!["Point", "LineString", "Polygon"].includes(feature.geometry.type)) {
      showMessage("Bu geometri tipi için düzenleme henüz desteklenmiyor");
      return;
    }

    const vertices = getEditableVertices(feature);
    if (!vertices.length) {
      showMessage("Geometri köşeleri bulunamadı");
      return;
    }

    setActiveUserLayerId(layerId);
    setAttributeLayerId(layerId);
    setSelectedAttributeFeatureId(attributeFeatureKey(featureIndex));
    setGeometryEdit({ layerId, featureIndex });
    setAttributeTableOpen(false);
    setLayerPanelOpen(false);
    setCbsToolOpen(false);
    setLegendOpen(false);
    setStylePanelOpen(false);
    showMessage("✏️ Düzenleme modu: köşeleri sürükleyerek geometriyi değiştir");
  }

  function stopGeometryEdit(showNotice = true) {
    draggingVertexRef.current = null;
    setGeometryEdit(null);
    if (showNotice) showMessage("✓ Geometri düzenlemesi tamamlandı");
  }

  function updateGeometryVertex(vertexIndex: number, coordinate: Coordinate) {
    const edit = geometryEditRef.current;
    if (!edit || !onUserLayersChange) return;

    const layer = userLayersRef.current.find((item) => item.id === edit.layerId);
    if (!layer) return;

    const feature = layer.data.features[edit.featureIndex];
    if (!feature?.geometry) return;

    let nextGeometry: GeoJSONGeometry = feature.geometry;

    if (feature.geometry.type === "Point") {
      nextGeometry = { type: "Point", coordinates: coordinate };
    } else if (feature.geometry.type === "LineString") {
      const coordinates = [...(feature.geometry.coordinates as Coordinate[])];
      if (!coordinates[vertexIndex]) return;
      coordinates[vertexIndex] = coordinate;
      nextGeometry = { type: "LineString", coordinates };
    } else if (feature.geometry.type === "Polygon") {
      const sourceRing = Array.isArray(feature.geometry.coordinates?.[0])
        ? [...(feature.geometry.coordinates[0] as Coordinate[])]
        : [];
      if (!sourceRing[vertexIndex]) return;
      sourceRing[vertexIndex] = coordinate;
      if (sourceRing.length > 1) {
        const lastIndex = sourceRing.length - 1;
        const first = sourceRing[0];
        const last = sourceRing[lastIndex];
        if (last?.[0] === last?.[0] && last?.[1] === last?.[1]) {
          sourceRing[lastIndex] = first;
        }
      }
      nextGeometry = { type: "Polygon", coordinates: [sourceRing] };
    }

    const nextFeatures = layer.data.features.map((item, index) =>
      index === edit.featureIndex ? { ...item, geometry: nextGeometry } : item,
    );

    onUserLayersChange(
      userLayersRef.current.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features: nextFeatures } }
          : item,
      ),
    );
  }

  function deleteGeometryVertex(vertexIndex: number) {
    const edit = geometryEditRef.current;
    if (!edit || !onUserLayersChange) return;

    const layer = userLayersRef.current.find((item) => item.id === edit.layerId);
    const feature = layer?.data.features[edit.featureIndex];
    if (!layer || !feature?.geometry) return;

    if (feature.geometry.type === "Point") {
      showMessage("Nokta geometrisinin tek köşesi silinemez; nesneyi tablodan silebilirsin");
      return;
    }

    const minimum = feature.geometry.type === "Polygon" ? 3 : 2;
    const vertices = getEditableVertices(feature);
    if (vertices.length <= minimum) {
      showMessage(`Bu geometri için en az ${minimum} köşe gerekli`);
      return;
    }

    const nextVertices = vertices.filter((_, index) => index !== vertexIndex);
    let nextGeometry: GeoJSONGeometry;

    if (feature.geometry.type === "LineString") {
      nextGeometry = { type: "LineString", coordinates: nextVertices };
    } else {
      nextGeometry = {
        type: "Polygon",
        coordinates: [[...nextVertices, nextVertices[0]]],
      };
    }

    const nextFeatures = layer.data.features.map((item, index) =>
      index === edit.featureIndex ? { ...item, geometry: nextGeometry } : item,
    );

    onUserLayersChange(
      userLayersRef.current.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features: nextFeatures } }
          : item,
      ),
    );
    showMessage("✓ Köşe silindi");
  }

  function addGeometryVertexAtPointer(event: ReactMouseEvent<SVGPathElement>) {
    const edit = geometryEditRef.current;
    if (!edit || !mapRef.current || !mapContainer.current || !onUserLayersChange) return;
    event.preventDefault(); event.stopPropagation();
    const layer = userLayersRef.current.find((item) => item.id === edit.layerId);
    const feature = layer?.data.features[edit.featureIndex];
    if (!layer || !feature?.geometry || feature.geometry.type === "Point") return;
    const rect = mapContainer.current.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    let best: { coordinate: Coordinate; distance: number; segmentIndex: number } | null = null;
    const segments = geometrySegments(feature.geometry);
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const [a, b] = segments[segmentIndex];
      const result = closestPointOnScreenSegment(mapRef.current!, screen, a, b);
      if (result && (!best || result.distance < best.distance)) {
        best = { ...result, segmentIndex };
      }
    }
    if (!best) { showMessage("Köşe eklemek için çizgiye yakın çift tıkla"); return; }
    if (best.distance > 24) { showMessage("Köşe eklemek için çizgiye yakın çift tıkla"); return; }
    const chosenSegment = best;
    const vertices = getEditableVertices(feature);
    const insertAt = Math.min(vertices.length, chosenSegment.segmentIndex + 1);
    const nextVertices = [...vertices.slice(0, insertAt), chosenSegment.coordinate, ...vertices.slice(insertAt)];
    const geometry: GeoJSONGeometry = feature.geometry.type === "LineString" ? { type: "LineString", coordinates: nextVertices } : { type: "Polygon", coordinates: [[...nextVertices, nextVertices[0]]] };
    const features = layer.data.features.map((item, index) => index === edit.featureIndex ? { ...item, geometry } : item);
    onUserLayersChange(userLayersRef.current.map((item) => item.id === layer.id ? { ...item, data: { ...item.data, features } } : item));
    showMessage("＋ Yeni köşe eklendi");
  }

  function vertexPointerDown(event: ReactPointerEvent<SVGCircleElement>, vertexIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    draggingVertexRef.current = vertexIndex;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleGeometryPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const vertexIndex = draggingVertexRef.current;
    if (vertexIndex === null || !mapRef.current || !mapContainer.current) return;

    const rect = mapContainer.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const lngLat = mapRef.current.unproject([x, y]);
    const precise = getPrecisionCoordinate([lngLat.lng, lngLat.lat], { x, y }, Boolean(event.shiftKey), geometryEditRef.current ? { ...geometryEditRef.current, vertexIndex } : undefined);
    updateGeometryVertex(vertexIndex, precise.coordinate);
    setPrecisionStatus(precise.snapLabel);
  }

  function handleGeometryPointerUp() {
    draggingVertexRef.current = null;
  }

  function startNewLayerFeature() {
    if (!attributeLayerId || !onUserLayersChange) {
      showMessage("Önce bir kullanıcı katmanı seç");
      return;
    }

    const layer = userLayers.find((item) => item.id === attributeLayerId);
    if (!layer) return;

    const geometry = layer.geometryType ?? newFeatureGeometry;
    setNewFeatureGeometry(geometry);
    setActiveUserLayerId(layer.id);
    layerEditModeRef.current = true;
    setAttributeTableOpen(false);
    setLayerPanelOpen(false);
    activateMode(geometry === "Point" ? "point" : geometry === "LineString" ? "line" : "polygon");
    showMessage(`✏️ ${layer.name} katmanına yeni ${geometry} ekle`);
  }

  function addFeatureToActiveLayer(feature: GeoJSONFeature) {
    const layerId = activeUserLayerId;
    if (!layerId || !onUserLayersChange) return false;

    const layer = userLayersRef.current.find((item) => item.id === layerId);
    if (!layer) return false;

    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextFeature: GeoJSONFeature = {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        __ergis_id: id,
      },
    };

    const nextLayers = userLayersRef.current.map((item) =>
      item.id === layerId
        ? { ...item, data: { ...item.data, features: [...item.data.features, nextFeature] } }
        : item,
    );

    onUserLayersChange(nextLayers);
    setAttributeLayerId(layerId);
    setSelectedAttributeFeatureId(attributeFeatureKey(layer.data.features.length));
    return true;
  }

  function exportAttributeCsv(layer: UserMapLayer) {
    const features = layer.data.features ?? [];
    const keys = Array.from(new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))))
      .filter((key) => key !== "__ergis_id");
    const rows = [
      ["#", "Geometri", ...keys],
      ...features.map((feature, index) => [
        String(index + 1),
        feature.geometry?.type ?? "",
        ...keys.map((key) => String(feature.properties?.[key] ?? "")),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `ergis-${layer.name}-oznitellik.csv`);
    showMessage("📊 Öznitelik CSV indirildi");
  }

  function exportAttributeExcel(layer: UserMapLayer) {
    const features = layer.data.features ?? [];
    const keys = Array.from(new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))))
      .filter((key) => key !== "__ergis_id");
    const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const header = ["#", "Geometri", ...keys].map((key) => `<th>${esc(key)}</th>`).join("");
    const body = features.map((feature, index) =>
      `<tr><td>${index + 1}</td><td>${esc(feature.geometry?.type)}</td>${keys.map((key) => `<td>${esc(feature.properties?.[key])}</td>`).join("")}</tr>`,
    ).join("");
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), `ergis-${layer.name}-oznitellik.xls`);
    showMessage("📗 Excel tablosu indirildi");
  }

  function updateFeatureProperty(featureId: string, key: string, value: string) {
    if (!attributeLayerId || !onUserLayersChange) return;

    const layer = userLayers.find((item) => item.id === attributeLayerId);
    if (!layer) return;

    const rowIndex = featureId.startsWith("row-") ? Number(featureId.slice(4)) : -1;
    const nextFeatures = layer.data.features.map((feature, index) => {
      const currentId = String(feature.properties?.__ergis_id ?? "");
      const matches = rowIndex >= 0 ? index === rowIndex : currentId === featureId;
      if (!matches) return feature;

      const properties = { ...(feature.properties ?? {}) };
      if (value === "") {
        delete properties[key];
      } else {
        properties[key] = value;
      }

      return { ...feature, properties };
    });

    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features: nextFeatures } }
          : item,
      ),
    );
  }

  function addAttributeField() {
    const key = newFieldName.trim();
    if (!attributeLayerId || !onUserLayersChange || !key) {
      showMessage("Alan adı gir");
      return;
    }

    const layer = userLayers.find((item) => item.id === attributeLayerId);
    if (!layer) return;

    const exists = layer.data.features.some((feature) =>
      Object.prototype.hasOwnProperty.call(feature.properties ?? {}, key),
    );

    if (exists) {
      showMessage("Bu alan zaten var");
      return;
    }

    const features = layer.data.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        [key]: newFieldType === "number" ? 0 : "",
      },
    }));

    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id
          ? { ...item, data: { ...item.data, features } }
          : item,
      ),
    );

    setNewFieldName("");
    showMessage(`✓ ${key} alanı eklendi`);
  }

  function zoomToAttributeFeature(feature: GeoJSONFeature) {
    const map = mapRef.current;
    if (!map || !feature.geometry) return;

    const geometry = feature.geometry;
    let coordinates: Coordinate[] = [];

    if (geometry.type === "Point") {
      coordinates = [geometry.coordinates as Coordinate];
    } else if (geometry.type === "LineString") {
      coordinates = geometry.coordinates as Coordinate[];
    } else if (geometry.type === "Polygon") {
      coordinates = (geometry.coordinates?.[0] ?? []) as Coordinate[];
    }

    if (!coordinates.length) return;

    const lngs = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    if (geometry.type === "Point") {
      map.flyTo({ center: coordinates[0], zoom: Math.max(map.getZoom(), 16), duration: 500 });
    } else {
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 90, maxZoom: 18, duration: 500 },
      );
    }
  }

  function toggleSatellite() {
    const map = mapRef.current;
    if (!map) return;

    const newValue = !satellite;
    satelliteRef.current = newValue;
    setSatellite(newValue);

    if (map.getLayer("osm")) {
      map.setLayoutProperty(
        "osm",
        "visibility",
        newValue ? "none" : "visible",
      );
    }

    if (map.getLayer("satellite")) {
      map.setLayoutProperty(
        "satellite",
        "visibility",
        newValue ? "visible" : "none",
      );
    }

    showMessage(
      newValue ? "🛰️ Uydu görüntüsü açıldı" : "🗺️ Temel harita açıldı",
    );
  }

  function goToTurkey() {
    mapRef.current?.flyTo({
      center: [29.06, 40.19],
      zoom: 6,
      duration: 700,
    });
  }

  // Üst arama kutusundan gelen şehir / ilçe / adresi Nominatim ile bulur
  // ve haritayı bulunan konuma götürür.
  useEffect(() => {
    const query = searchRequest?.query?.trim();
    if (!query || !mapReady) return;

    let cancelled = false;

    async function searchPlace() {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("limit", "1");
        url.searchParams.set("accept-language", "tr");
        url.searchParams.set("q", query ?? "");

        const response = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) throw new Error("Arama servisine ulaşılamadı.");

        const results = (await response.json()) as Array<{
          lat: string;
          lon: string;
          display_name?: string;
          boundingbox?: [string, string, string, string];
        }>;

        if (cancelled) return;

        const result = results[0];
        const map = mapRef.current;
        if (!result || !map) {
          showMessage(`🔎 "${query}" bulunamadı`);
          return;
        }

        const lat = Number(result.lat);
        const lon = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          showMessage("📍 Konum koordinatı alınamadı");
          return;
        }

        if (result.boundingbox?.length === 4) {
          const [south, north, west, east] = result.boundingbox.map(Number);
          if ([south, north, west, east].every(Number.isFinite)) {
            map.fitBounds(
              [[west, south], [east, north]],
              { padding: 90, maxZoom: 15, duration: 900 },
            );
          } else {
            map.flyTo({ center: [lon, lat], zoom: 14, duration: 900 });
          }
        } else {
          map.flyTo({ center: [lon, lat], zoom: 14, duration: 900 });
        }

        showMessage(`📍 ${result.display_name ?? query}`);
      } catch (error) {
        if (cancelled) return;
        console.error("Konum arama hatası:", error);
        showMessage("⚠ Konum aranırken bir hata oluştu");
      }
    }

    void searchPlace();

    return () => {
      cancelled = true;
    };
  }, [searchRequest, mapReady]);

  const [saveFormatOpen, setSaveFormatOpen] = useState(false);
  const [scaleInput, setScaleInput] = useState("1000");
  const [activeScaleDenominator, setActiveScaleDenominator] = useState(1000);
  const scaleDenominatorRef = useRef(1000);
  function updateScaleFromZoom(map: MapLibreMap) {
  const canvas = map.getCanvas();

  if (!canvas || !canvas.width || !canvas.height) return;

  const pageWidthPt = 841.89;
  const pageHeightPt = 595.28;
  const marginPt = 18;

  const maxWidthPt = pageWidthPt - marginPt * 2;
  const maxHeightPt = pageHeightPt - marginPt * 2;

  const imageRatio = canvas.width / canvas.height;

  const placedWidthPt = Math.min(
    maxWidthPt,
    maxHeightPt * imageRatio,
  );

  const placedWidthMm = (placedWidthPt / 72) * 25.4;

  const latitude = map.getCenter().lat;
  const earthCircumference = 40075016.68557849;
  const tileSize = 256;
  const zoom = map.getZoom();

  const metersPerPixel =
    (Math.cos((latitude * Math.PI) / 180) * earthCircumference) /
    (tileSize * Math.pow(2, zoom));

  const groundWidthMeters = metersPerPixel * canvas.width;

  const scaleDenominator = Math.max(
    1,
    Math.round((groundWidthMeters * 1000) / placedWidthMm),
  );

  scaleDenominatorRef.current = scaleDenominator;
  setActiveScaleDenominator(scaleDenominator);
  setScaleInput(String(scaleDenominator));
}

  function emitProjectState() {
    const map = mapRef.current;
    if (!map || !onProjectStateChange) return;

    const center = map.getCenter();
    onProjectStateChange({
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      satellite: satelliteRef.current,
      scaleDenominator: scaleDenominatorRef.current,
      points: pointsRef.current,
      drawings: drawingsRef.current,
      externalServices: externalServicesRef.current,
    });
  }

  /**
   * Girilen kartografik ölçeği ekrandaki harita görünümüne uygular.
   *
   * 1:N ölçeğinde, çıktıdaki 1 mm = N mm arazi kabul edilir.
   * PDF A4 yatay çıktıya sığdırıldığı için önce kullanılabilir baskı
   * genişliğini hesaplıyor, sonra bu genişliğin haritada karşılık
   * gelmesi gereken gerçek mesafeye göre MapLibre zoom seviyesini buluyoruz.
   * Böylece sadece "1:100000" yazısı değil, haritanın görünümü de ölçeğe göre değişir.
   */
  function applyPrintScale(): boolean {
    const map = mapRef.current;
    const parsed = Number(String(scaleInput ?? "").replace(/[^0-9.]/g, ""));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      showMessage("Geçerli bir ölçek girin. Örn: 1000 veya 100000");
      return false;
    }

    const scaleDenominator = Math.round(parsed);
    const canvas = map?.getCanvas();

    if (!map || !canvas || !canvas.width || !canvas.height) {
      showMessage("Harita henüz hazır değil");
      return false;
    }

    const pageWidthPt = 841.89; // A4 yatay
    const pageHeightPt = 595.28;
    const marginPt = 18;
    const maxWidthPt = pageWidthPt - marginPt * 2;
    const maxHeightPt = pageHeightPt - marginPt * 2;
    const imageRatio = canvas.width / canvas.height;

    // PDF'te haritanın gerçekten kaplayacağı fiziksel genişlik.
    const placedWidthPt = Math.min(maxWidthPt, maxHeightPt * imageRatio);
    const placedWidthMm = (placedWidthPt / 72) * 25.4;

    // 1:N => haritanın çıktı genişliğinin arazi karşılığı.
    const targetGroundWidthMeters = (placedWidthMm * scaleDenominator) / 1000;
    const targetMetersPerPixel = targetGroundWidthMeters / canvas.width;

    const latitude = map.getCenter().lat;
    const earthCircumference = 40075016.68557849;
    const tileSize = 256;

    const zoom = Math.log2(
      (Math.cos((latitude * Math.PI) / 180) * earthCircumference) /
        (tileSize * targetMetersPerPixel),
    );

    const clampedZoom = Math.max(3, Math.min(19, zoom));

    setActiveScaleDenominator(scaleDenominator);
    scaleDenominatorRef.current = scaleDenominator;

    // Kullanıcının mevcut merkezini koruyarak sadece ölçeğe bağlı zoom'u değiştir.
    map.jumpTo({ zoom: clampedZoom });
    map.triggerRepaint();
    window.setTimeout(emitProjectState, 0);

    showMessage(`📐 Ölçek 1:${scaleDenominator.toLocaleString("tr-TR")} uygulandı`);
    return true;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function captureMapAsJpegBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const map = mapRef.current;

      if (!map) {
        resolve(null);
        return;
      }

      try {
        // Son frame'i garanti ediyoruz; preserveDrawingBuffer sayesinde
        // WebGL harita canvası boş/siyah olarak gelmez.
        map.triggerRepaint();

        const capture = () => {
          try {
            const mapCanvas = map.getCanvas();
            const width = mapCanvas.width;
            const height = mapCanvas.height;

            if (!width || !height) {
              resolve(null);
              return;
            }

            const output = document.createElement("canvas");
            output.width = width;
            output.height = height;

            const context = output.getContext("2d");
            if (!context) {
              resolve(null);
              return;
            }

            // SADECE HARİTA ÇERÇEVESİNİ alıyoruz.
            // WebGL canvasını önce JPEG'e çevirip 2D canvas'a çiziyoruz.
            // Bu, bazı Chromium sürümlerinde drawImage(WebGLCanvas) ile oluşan siyah görüntüyü önler.
            const mapDataUrl = mapCanvas.toDataURL("image/png");
            const mapImage = new Image();
            const rect = mapCanvas.getBoundingClientRect();
            const scaleX = rect.width ? width / rect.width : 1;
            const scaleY = rect.height ? height / rect.height : 1;

            mapImage.onload = () => {
              context.drawImage(mapImage, 0, 0, width, height);

              context.save();
              context.scale(scaleX, scaleY);

              // Çizgi ve alanlar.
              for (const drawing of drawingsRef.current) {
                if (drawing.coordinates.length < 2) continue;

                const projected = drawing.coordinates.map((coordinate) => {
                  const point = map.project(coordinate);
                  return { x: point.x, y: point.y };
                });

                const style = drawing.style ?? {
                  color: "#2563eb",
                  width: 5,
                  lineStyle: "solid" as LineStyle,
                };

                context.beginPath();
                context.moveTo(projected[0].x, projected[0].y);

                for (let i = 1; i < projected.length; i += 1) {
                  context.lineTo(projected[i].x, projected[i].y);
                }

                if (drawing.type === "polygon") {
                  context.closePath();
                  context.globalAlpha = 0.16;
                  context.fillStyle = style.color;
                  context.fill();
                  context.globalAlpha = 1;
                }

                context.strokeStyle = style.color;
                context.lineWidth = style.width;
                context.lineCap = "round";
                context.lineJoin = "round";
                context.setLineDash(
                  style.lineStyle === "dashed"
                    ? [10, 7]
                    : style.lineStyle === "dotted"
                      ? [2, 7]
                      : [],
                );
                context.stroke();
              }

              // Noktalar.
              for (const point of pointsRef.current) {
                const projected = map.project(point.coordinate);

                context.beginPath();
                context.arc(
                  projected.x,
                  projected.y,
                  point.size / 2,
                  0,
                  Math.PI * 2,
                );
                context.fillStyle = point.color;
                context.fill();
                context.lineWidth = 3;
                context.strokeStyle = "#ffffff";
                context.stroke();
              }

              context.restore();

              // Çıktıda seçilen ölçeği açıkça göster.
              context.save();
              const scaleText = `Ölçek 1:${scaleDenominatorRef.current.toLocaleString("tr-TR")}`;
              context.font = "600 16px Arial, sans-serif";
              const textMetrics = context.measureText(scaleText);
              const boxWidth = textMetrics.width + 24;
              const boxHeight = 34;
              const boxX = 18;
              const boxY = height - boxHeight - 18;

              context.fillStyle = "rgba(255,255,255,0.94)";
              context.strokeStyle = "rgba(15,23,42,0.25)";
              context.lineWidth = 1;
              context.beginPath();
              context.roundRect(boxX, boxY, boxWidth, boxHeight, 7);
              context.fill();
              context.stroke();

              context.fillStyle = "#0f172a";
              context.fillText(scaleText, boxX + 12, boxY + 22);
              context.restore();

              output.toBlob(
                (blob) => resolve(blob),
                "image/jpeg",
                0.95,
              );
            };

            mapImage.onerror = () => resolve(null);
            mapImage.src = mapDataUrl;

            return;

          } catch (error) {
            console.error("Harita görüntüsü oluşturulamadı:", error);
            resolve(null);
          }
        };

        // Önce haritanın bütün tile'ları ve WebGL frame'i hazır olsun.
        // idle zaten gerçekleşmişse kısa bir frame beklemek yeterli.
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          capture();
        };

        map.once("idle", finish);
        window.setTimeout(finish, 500);
      } catch (error) {
        console.error("Harita yakalama hatası:", error);
        resolve(null);
      }
    });
  }

  async function saveAsJpeg() {
    if (!applyPrintScale()) return;
    setSaveFormatOpen(false);

    const blob = await captureMapAsJpegBlob();

    if (!blob) {
      showMessage("JPEG oluşturulamadı");
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `sehirgis-harita-${date}.jpg`);
    showMessage("🖼️ JPEG indirildi");
  }

  function jpegToPdfBlob(jpegBlob: Blob): Promise<Blob | null> {
    return new Promise((resolve) => {
      jpegBlob.arrayBuffer().then((buffer) => {
        try {
          const bytes = new Uint8Array(buffer);

          // JPEG boyutunu SOF marker'ından bul.
          let width = 0;
          let height = 0;
          let i = 2;

          while (i < bytes.length - 9) {
            if (bytes[i] !== 0xff) {
              i += 1;
              continue;
            }

            const marker = bytes[i + 1];

            // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
            const isSof =
              marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
              marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
              marker === 0xc9 || marker === 0xca || marker === 0xcb ||
              marker === 0xcd || marker === 0xce || marker === 0xcf;

            if (isSof) {
              height = (bytes[i + 5] << 8) | bytes[i + 6];
              width = (bytes[i + 7] << 8) | bytes[i + 8];
              break;
            }

            if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
              i += 2;
            } else {
              const segmentLength = (bytes[i + 2] << 8) | bytes[i + 3];
              i += 2 + segmentLength;
            }
          }

          if (!width || !height) {
            resolve(null);
            return;
          }

          // A4 yatay sayfa. Harita görüntüsü oranı korunarak sayfaya sığdırılır.
          const pageWidth = 841.89;
          const pageHeight = 595.28;
          const margin = 18;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;
          const scale = Math.min(maxWidth / width, maxHeight / height);
          const imageWidth = width * scale;
          const imageHeight = height * scale;
          const imageX = (pageWidth - imageWidth) / 2;
          const imageY = (pageHeight - imageHeight) / 2;

          const encoder = new TextEncoder();
          const chunks: Uint8Array[] = [];
          const offsets: number[] = [0];
          let position = 0;

          const pushText = (text: string) => {
            const chunk = encoder.encode(text);
            chunks.push(chunk);
            position += chunk.length;
          };

          const pushBytes = (chunk: Uint8Array) => {
            chunks.push(chunk);
            position += chunk.length;
          };

          pushText('%PDF-1.4\n%\xff\xff\xff\xff\n');

          const beginObject = (id: number) => {
            offsets[id] = position;
            pushText(`${id} 0 obj\n`);
          };

          // 1: Catalog
          beginObject(1);
          pushText('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

          // 2: Pages
          beginObject(2);
          pushText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

          // 3: Page
          beginObject(3);
          pushText(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] ` +
            `/Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> ` +
            `/Contents 5 0 R >>\nendobj\n`,
          );

          // 4: JPEG image object
          beginObject(4);
          pushText(
            `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
            `/Length ${bytes.length} >>\nstream\n`,
          );
          pushBytes(bytes);
          pushText('\nendstream\nendobj\n');

          // 5: PDF çizim komutu
          beginObject(5);
          const content =
            `q\n${imageWidth.toFixed(2)} 0 0 ${imageHeight.toFixed(2)} ${imageX.toFixed(2)} ${imageY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
          const contentBytes = encoder.encode(content);
          pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
          pushBytes(contentBytes);
          pushText('endstream\nendobj\n');

          const xrefOffset = position;
          pushText('xref\n0 6\n');
          pushText('0000000000 65535 f \n');

          for (let id = 1; id <= 5; id += 1) {
            pushText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
          }

          pushText('trailer\n<< /Size 6 /Root 1 0 R >>\n');
          pushText(`startxref\n${xrefOffset}\n%%EOF\n`);

          resolve(new Blob(chunks as BlobPart[], { type: 'application/pdf' }));
        } catch (error) {
          console.error('PDF oluşturma hatası:', error);
          resolve(null);
        }
      }).catch((error) => {
        console.error('JPEG okunamadı:', error);
        resolve(null);
      });
    });
  }

  async function saveAsPdf() {
    if (!applyPrintScale()) return;
    setSaveFormatOpen(false);

    const jpegBlob = await captureMapAsJpegBlob();

    if (!jpegBlob) {
      showMessage('PDF için harita görüntüsü oluşturulamadı');
      return;
    }

    // Tarayıcının yazdırma ekranını KULLANMIYORUZ.
    // JPEG'i doğrudan gerçek bir PDF dosyasına gömüp indiriyoruz.
    const pdfBlob = await jpegToPdfBlob(jpegBlob);

    if (!pdfBlob) {
      showMessage('PDF oluşturulamadı');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(pdfBlob, `sehirgis-harita-${date}.pdf`);
    showMessage('📄 PDF indirildi');
  }

  async function saveAsPng() {
    if (!applyPrintScale()) return;
    setSaveFormatOpen(false);

    const jpegBlob = await captureMapAsJpegBlob();
    if (!jpegBlob) {
      showMessage("PNG oluşturulamadı");
      return;
    }

    try {
      const url = URL.createObjectURL(jpegBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(url);
          showMessage("PNG oluşturulamadı");
          return;
        }
        context.drawImage(image, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            showMessage("PNG oluşturulamadı");
            return;
          }
          const date = new Date().toISOString().slice(0, 10);
          downloadBlob(blob, `sehirgis-harita-${date}.png`);
          showMessage("🖼️ PNG indirildi");
        }, "image/png");
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        showMessage("PNG oluşturulamadı");
      };
      image.src = url;
    } catch (error) {
      console.error("PNG oluşturma hatası:", error);
      showMessage("PNG oluşturulamadı");
    }
  }

  function buildExportFeatureCollection(): GeoJSONFeatureCollection {
    const features: GeoJSONFeature[] = [];

    for (const layer of userLayersRef.current) {
      for (const feature of layer.data.features ?? []) {
        features.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...(feature.properties ?? {}),
            _ergis_layer: layer.name,
          },
        });
      }
    }

    for (const point of pointsRef.current) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point.coordinate },
        properties: {
          _ergis_type: "point",
          id: point.id,
          color: point.color,
          size: point.size,
        },
      });
    }

    for (const drawing of drawingsRef.current) {
      const coordinates =
        drawing.type === "polygon"
          ? (() => {
              const ring = [...drawing.coordinates];
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
                ring.push(first);
              }
              return [ring];
            })()
          : drawing.coordinates;

      features.push({
        type: "Feature",
        geometry: {
          type: drawing.type === "polygon" ? "Polygon" : "LineString",
          coordinates,
        },
        properties: {
          _ergis_type: drawing.type,
          id: drawing.id,
          color: drawing.style.color,
          width: drawing.style.width,
          lineStyle: drawing.style.lineStyle,
          ...(drawing.landUse
            ? {
                landUseId: drawing.landUse.id,
                landUseName: drawing.landUse.name,
                landUseCode: drawing.landUse.code,
              }
            : {}),
        },
      });
    }

    return { type: "FeatureCollection", features };
  }

  function saveAsGeoJson() {
    setSaveFormatOpen(false);
    const data = buildExportFeatureCollection();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/geo+json;charset=utf-8",
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `ergis-veri-${date}.geojson`);
    showMessage("🗺️ GeoJSON indirildi");
  }

  function escapeXml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function kmlPlacemark(name: string, geometry: GeoJSONGeometry): string {
    const title = escapeXml(name);

    if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      return `<Placemark><name>${title}</name><Point><coordinates>${geometry.coordinates.join(",")}</coordinates></Point></Placemark>`;
    }

    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
      const coords = geometry.coordinates.map((c: number[]) => c.join(",")).join(" ");
      return `<Placemark><name>${title}</name><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`;
    }

    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
      const rings = geometry.coordinates as number[][][];
      const outer = rings[0] ?? [];
      const outerCoords = outer.map((c) => c.join(",")).join(" ");
      const holes = rings
        .slice(1)
        .map(
          (ring) =>
            `<innerBoundaryIs><LinearRing><coordinates>${ring
              .map((c) => c.join(","))
              .join(" ")}</coordinates></LinearRing></innerBoundaryIs>`,
        )
        .join("");
      return `<Placemark><name>${title}</name><Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${outerCoords}</coordinates></LinearRing></outerBoundaryIs>${holes}</Polygon></Placemark>`;
    }

    return "";
  }

  function saveAsKml() {
    setSaveFormatOpen(false);
    const data = buildExportFeatureCollection();
    const placemarks = data.features
      .map((feature, index) =>
        kmlPlacemark(
          String(
            feature.properties?.landUseName ??
              feature.properties?._ergis_layer ??
              `ERGIS ${index + 1}`,
          ),
          feature.geometry ?? { type: "Point", coordinates: [0, 0] },
        ),
      )
      .filter(Boolean)
      .join("\n");

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
    const blob = new Blob([kml], {
      type: "application/vnd.google-earth.kml+xml;charset=utf-8",
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `ergis-veri-${date}.kml`);
    showMessage("🌍 KML indirildi");
  }

  function saveAsCsv() {
    setSaveFormatOpen(false);
    const rows: string[][] = [
      [
        "tip",
        "id",
        "katman",
        "ad",
        "longitude",
        "latitude",
        "geometri",
        "renk",
        "genislik",
        "cizgiStili",
      ],
    ];

    for (const layer of userLayersRef.current) {
      for (const feature of layer.data.features ?? []) {
        const geometry = feature.geometry;
        rows.push([
          "katman",
          "",
          layer.name,
          String(feature.properties?.name ?? ""),
          geometry?.type === "Point" ? String(geometry.coordinates?.[0] ?? "") : "",
          geometry?.type === "Point" ? String(geometry.coordinates?.[1] ?? "") : "",
          JSON.stringify(geometry?.coordinates ?? ""),
          layer.color,
          "",
          "",
        ]);
      }
    }

    for (const point of pointsRef.current) {
      rows.push([
        "nokta",
        String(point.id),
        "",
        "",
        String(point.coordinate[0]),
        String(point.coordinate[1]),
        JSON.stringify(point.coordinate),
        point.color,
        String(point.size),
        "",
      ]);
    }

    for (const drawing of drawingsRef.current) {
      rows.push([
        drawing.type === "polygon" ? "alan" : "cizgi",
        String(drawing.id),
        "",
        drawing.landUse?.name ?? "",
        "",
        "",
        JSON.stringify(drawing.coordinates),
        drawing.style.color,
        String(drawing.style.width),
        drawing.style.lineStyle,
      ]);
    }

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `ergis-veri-${date}.csv`);
    showMessage("📊 CSV indirildi");
  }

  useEffect(() => {
    let cancelled = false;

    // Sağ fare tuşu ile GIS/CAD tarzı pan.
    // Orta tuş davranışına dokunmuyoruz; sağ tuşu özel olarak pan için kullanıyoruz.
    let rightCanvas: HTMLCanvasElement | null = null;
    let rightDragging = false;
    let rightLast: { x: number; y: number } | null = null;

    const onRightDown = (event: MouseEvent) => {
      if (event.button !== 2 || !rightCanvas) return;

      event.preventDefault();
      event.stopPropagation();

      rightDragging = true;
      rightLast = { x: event.clientX, y: event.clientY };
      rightCanvas.style.cursor = "grabbing";
    };

    const onRightMove = (event: MouseEvent) => {
      if (!rightDragging || !rightLast || !mapRef.current) return;

      const dx = event.clientX - rightLast.x;
      const dy = event.clientY - rightLast.y;
      rightLast = { x: event.clientX, y: event.clientY };

      mapRef.current.panBy([-dx, -dy], { duration: 0 });
    };

    const stopRightDrag = () => {
      rightDragging = false;
      rightLast = null;
      if (rightCanvas) rightCanvas.style.cursor = "";
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    async function initializeMap() {
      const maplibregl = await import("maplibre-gl");

      if (
        cancelled ||
        !mapContainer.current ||
        mapRef.current
      ) {
        return;
      }

      const map = new maplibregl.Map({
        dragPan: true,
        dragRotate: false,
        container: mapContainer.current,
        center: [29.06, 40.19],
        zoom: 6,
        minZoom: 3,
        maxZoom: 19,
        attributionControl: false,
        // MapLibre WebGL canvasının ekran görüntüsünde boş/siyah gelmesini önler.
        // Bu seçenek MapOptions altında değil, WebGL context ayarları içindedir.
        canvasContextAttributes: {
          preserveDrawingBuffer: true,
        },

        style: {
          version: 8,

          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },

            satellite: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "© Esri",
            },
          },

          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
            },

            {
              id: "satellite",
              type: "raster",
              source: "satellite",
              layout: {
                visibility: "none",
              },
            },
          ],
        },
      } as any);

      mapRef.current = map;

      rightCanvas = map.getCanvas();
      rightCanvas.addEventListener("mousedown", onRightDown, true);
      rightCanvas.addEventListener("contextmenu", onContextMenu, true);
      window.addEventListener("mousemove", onRightMove);
      window.addEventListener("mouseup", stopRightDrag);

      map.on("load", () => {
        if (cancelled) return;

        setMapReady(true);
        updateScreenCoordinates();
        updateScaleFromZoom(map);

        window.setTimeout(() => {
          map.resize();
          updateScreenCoordinates();
          updateScaleFromZoom(map);
        }, 100);
      });

      map.on("move", () => {
        updateScreenCoordinates();
      });

      map.on("zoom", () => {
        updateScreenCoordinates();
        updateScaleFromZoom(map);
      });

      map.on("moveend", () => {
        updateScaleFromZoom(map);
        emitProjectState();
      });

      map.on("zoomend", () => {
        updateScaleFromZoom(map);
        emitProjectState();
      });

      map.on("resize", () => {
        updateScreenCoordinates();
        updateScaleFromZoom(map);
      });

      map.on("mousemove", (event) => {
        const coordinate: Coordinate = [
          event.lngLat.lng,
          event.lngLat.lat,
        ];

        setMousePosition(coordinate);

        if (
          drawModeRef.current === "line" ||
          drawModeRef.current === "polygon"
        ) {
          const precise = getPrecisionCoordinate(coordinate, { x: event.point.x, y: event.point.y }, Boolean((event.originalEvent as MouseEvent | undefined)?.shiftKey));
          cursorCoordinateRef.current = precise.coordinate;
          setPrecisionStatus(precise.snapLabel);
          updateScreenCoordinates();
        }
      });

      map.on("mouseout", () => {
        setMousePosition(null);
        setPrecisionStatus("");

        if (
          drawModeRef.current === "line" ||
          drawModeRef.current === "polygon"
        ) {
          cursorCoordinateRef.current = null;
                updateScreenCoordinates();
        }
      });

      map.on("click", (event) => {
        const coordinate: Coordinate = [
          event.lngLat.lng,
          event.lngLat.lat,
        ];

        const mode = drawModeRef.current;

        if (mode === "point") {
          const precise = getPrecisionCoordinate(coordinate, { x: event.point.x, y: event.point.y }, Boolean((event.originalEvent as MouseEvent | undefined)?.shiftKey));
          addPoint(precise.coordinate);
          setPrecisionStatus(precise.snapLabel);
          return;
        }

        if (mode === "line" || mode === "polygon") {
          const precise = getPrecisionCoordinate(coordinate, { x: event.point.x, y: event.point.y }, Boolean((event.originalEvent as MouseEvent | undefined)?.shiftKey));
          const nextCoordinates = [
            ...currentCoordinatesRef.current,
            precise.coordinate,
          ];

          currentCoordinatesRef.current = nextCoordinates;
          setCurrentCoordinates(nextCoordinates);

          updateScreenCoordinates();

          showMessage(
            `${mode === "line" ? "📏" : "⬡"} ${nextCoordinates.length} nokta`,
          );
          return;
        }

        const currentUserLayers = userLayersRef.current;

        const clickableLayerIds = currentUserLayers.flatMap((layer) =>
          layer.visible
            ? [
                `user-data-${layer.id}-fill`,
                `user-data-${layer.id}-line`,
                `user-data-${layer.id}-point`,
              ]
            : [],
        ).filter((id) => Boolean(map.getLayer(id)));

        if (!clickableLayerIds.length) {
          onFeatureSelect?.(null);
          return;
        }

        const rendered = map.queryRenderedFeatures(event.point, {
          layers: clickableLayerIds,
        });

        const picked = rendered[0] as any;
        if (!picked) {
          onFeatureSelect?.(null);
          return;
        }

        const layerId = String(picked.source ?? "").replace(/^user-data-/, "");
        const sourceLayer = currentUserLayers.find((layer) => layer.id === layerId);

        if (!sourceLayer) {
          onFeatureSelect?.(null);
          return;
        }

        const feature: GeoJSONFeature = {
          type: "Feature",
          geometry: picked.geometry ?? null,
          properties: picked.properties ?? null,
        };

        selectAttributeFeatureFromMap(sourceLayer, feature);

        onFeatureSelect?.({
          layerId: sourceLayer.id,
          layerName: sourceLayer.name,
          feature,
        });
      });
    }

    initializeMap();

    return () => {
      cancelled = true;

      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }

      if (rightCanvas) {
        rightCanvas.removeEventListener("mousedown", onRightDown, true);
        rightCanvas.removeEventListener("contextmenu", onContextMenu, true);
        rightCanvas = null;
      }
      window.removeEventListener("mousemove", onRightMove);
      window.removeEventListener("mouseup", stopRightDrag);
      stopRightDrag();

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const readyMap = mapRef.current;
    if (!mapReady || !readyMap || externalServices.length === 0) return;
    let cancelled = false;

    async function restoreServices() {
      for (const service of externalServices) {
        const sourceId = `external-${service.id}`;
        if (!readyMap || readyMap.getSource(sourceId)) continue;

        try {
          if (service.type === "WMS") {
            if (!service.layer) continue;

            readyMap.addSource(
              sourceId,
              {
                type: "raster",
                tiles: [buildWmsTileUrl(service.url, service.layer)],
                tileSize: 256,
              } as any,
            );

            readyMap.addLayer(
              {
                id: `${sourceId}-raster`,
                type: "raster",
                source: sourceId,
                paint: { "raster-opacity": service.opacity },
                layout: {
                  visibility: service.visible ? "visible" : "none",
                },
              } as any,
            );
          } else if (service.type === "WMTS") {
            readyMap.addSource(
              sourceId,
              {
                type: "raster",
                tiles: [normalizeWmtsUrl(service.url)],
                tileSize: 256,
              } as any,
            );

            readyMap.addLayer(
              {
                id: `${sourceId}-raster`,
                type: "raster",
                source: sourceId,
                paint: { "raster-opacity": service.opacity },
                layout: {
                  visibility: service.visible ? "visible" : "none",
                },
              } as any,
            );
          } else {
            const response = await fetch(serviceRequestUrl(service), {
              headers: { Accept: "application/json" },
            });

            if (!response.ok) {
              throw new Error(`WFS ${response.status}`);
            }

            const data = await response.json();

            if (cancelled || !data || data.type !== "FeatureCollection") {
              continue;
            }

            // MapRef yeniden null olmuşsa async işlem sonrası haritaya dokunma.
            if (!mapRef.current) continue;

            readyMap.addSource(
              sourceId,
              {
                type: "geojson",
                data,
              } as any,
            );

            readyMap.addLayer(
              {
                id: `${sourceId}-fill`,
                type: "fill",
                source: sourceId,
                filter: ["==", ["geometry-type"], "Polygon"],
                paint: {
                  "fill-color": "#2563eb",
                  "fill-opacity": service.opacity * 0.35,
                },
                layout: {
                  visibility: service.visible ? "visible" : "none",
                },
              } as any,
            );

            readyMap.addLayer(
              {
                id: `${sourceId}-line`,
                type: "line",
                source: sourceId,
                filter: [
                  "in",
                  ["geometry-type"],
                  "LineString",
                  "MultiLineString",
                  "Polygon",
                  "MultiPolygon",
                ],
                paint: {
                  "line-color": "#1d4ed8",
                  "line-width": 2,
                  "line-opacity": service.opacity,
                },
                layout: {
                  visibility: service.visible ? "visible" : "none",
                },
              } as any,
            );

            readyMap.addLayer(
              {
                id: `${sourceId}-point`,
                type: "circle",
                source: sourceId,
                filter: [
                  "in",
                  ["geometry-type"],
                  "Point",
                  "MultiPoint",
                ],
                paint: {
                  "circle-color": "#1d4ed8",
                  "circle-radius": 5,
                  "circle-opacity": service.opacity,
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 1,
                },
                layout: {
                  visibility: service.visible ? "visible" : "none",
                },
              } as any,
            );
          }
        } catch (error) {
          console.warn(
            "Harici servis yeniden yüklenemedi",
            service.name,
            error,
          );
        }
      }
    }

    void restoreServices();

    return () => {
      cancelled = true;
    };
  }, [mapReady, externalServices]);

  /* KULLANICI VERİ KATMANLARI */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const prefix = "user-data-";
    const previousIds = previousUserLayerIdsRef.current;
    const layerToFit =
      userLayers.find(
        (layer) => !previousIds.has(layer.id) && layer.visible,
      ) ?? null;

    function getLayerBounds(
      layer: UserMapLayer,
    ): [[number, number], [number, number]] | null {
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;

      const visitCoordinates = (value: unknown): void => {
        if (!Array.isArray(value)) return;

        if (
          value.length >= 2 &&
          typeof value[0] === "number" &&
          typeof value[1] === "number" &&
          Number.isFinite(value[0]) &&
          Number.isFinite(value[1])
        ) {
          minLon = Math.min(minLon, value[0]);
          minLat = Math.min(minLat, value[1]);
          maxLon = Math.max(maxLon, value[0]);
          maxLat = Math.max(maxLat, value[1]);
          return;
        }

        for (const item of value) visitCoordinates(item);
      };

      for (const feature of layer.data.features) {
        if (feature.geometry?.coordinates) {
          visitCoordinates(feature.geometry.coordinates);
        }
      }

      if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
        return null;
      }

      return [
        [minLon, minLat],
        [maxLon, maxLat],
      ];
    }

    /*
     * Önce ERGIS kullanıcı verilerinin eski çizimlerini temizliyoruz.
     * Bu önemli: Fast Refresh veya aynı katmanın güncellenmesi sırasında
     * eski source/layer kalırsa yeni GeoJSON görünmeyebiliyor.
     */
    // SADECE artık mevcut olmayan kullanıcı katmanlarını temizle.
    // Önceki sürümde "user-data-ID-fill" doğrudan "ID" ile karşılaştırıldığı
    // için katmanlar eklenir eklenmez tekrar silinebiliyordu.
    const wantedIds = new Set(userLayers.map((layer) => layer.id));

    const layerSuffixes = ["-fill", "-line", "-point"];
    const oldStyleLayers = map.getStyle().layers ?? [];

    for (const styleLayer of oldStyleLayers) {
      if (!styleLayer.id.startsWith(prefix)) continue;

      const suffix = layerSuffixes.find((item) =>
        styleLayer.id.endsWith(item),
      );
      if (!suffix) continue;

      const layerId = styleLayer.id.slice(
        prefix.length,
        styleLayer.id.length - suffix.length,
      );

      if (!wantedIds.has(layerId) && map.getLayer(styleLayer.id)) {
        map.removeLayer(styleLayer.id);
      }
    }

    const sourceSuffixes = [
      "-polygon-source",
      "-line-source",
      "-point-source",
    ];
    const styleSources = map.getStyle().sources ?? {};

    for (const sourceId of Object.keys(styleSources)) {
      if (!sourceId.startsWith(prefix)) continue;

      const suffix = sourceSuffixes.find((item) =>
        sourceId.endsWith(item),
      );
      if (!suffix) continue;

      const layerId = sourceId.slice(
        prefix.length,
        sourceId.length - suffix.length,
      );

      if (!wantedIds.has(layerId) && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }

    /*
     * Her geometri tipini ayrı GeoJSON source'a ayırıyoruz.
     * Böylece Polygon/MultiPolygon verisi kesin olarak fill,
     * LineString/MultiLineString line, Point/MultiPoint circle
     * layer'ına gider. MapLibre geometry-type filtresine bağımlı değiliz.
     */
    for (const layer of userLayers) {
      const baseId = `${prefix}${layer.id}`;

      const polygonSourceId = `${baseId}-polygon-source`;
      const lineSourceId = `${baseId}-line-source`;
      const pointSourceId = `${baseId}-point-source`;

      const fillId = `${baseId}-fill`;
      const lineId = `${baseId}-line`;
      const pointId = `${baseId}-point`;

      const polygonFeatures: GeoJSONFeature[] = [];
      const lineFeatures: GeoJSONFeature[] = [];
      const pointFeatures: GeoJSONFeature[] = [];

      for (const feature of layer.data.features) {
        const type = feature.geometry?.type;

        if (type === "Polygon" || type === "MultiPolygon") {
          polygonFeatures.push(feature);
        } else if (
          type === "LineString" ||
          type === "MultiLineString"
        ) {
          lineFeatures.push(feature);
        } else if (type === "Point" || type === "MultiPoint") {
          pointFeatures.push(feature);
        }
      }

      const polygonData: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: polygonFeatures,
      };

      const lineData: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: lineFeatures,
      };

      const pointData: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: pointFeatures,
      };

      // React/Next geliştirme modunda effect birden fazla kez çalışabilir.
      // Source zaten varsa addSource() MapLibre'da "already exists" hatası verir.
      // Bu nedenle mevcut source'u güncelliyor, yoksa oluşturuyoruz.
      const existingPolygonSource = map.getSource(polygonSourceId) as any;
      if (existingPolygonSource && typeof existingPolygonSource.setData === "function") {
        existingPolygonSource.setData(polygonData as any);
      } else {
        map.addSource(polygonSourceId, {
          type: "geojson",
          data: polygonData as any,
        });
      }

      const existingLineSource = map.getSource(lineSourceId) as any;
      if (existingLineSource && typeof existingLineSource.setData === "function") {
        existingLineSource.setData(lineData as any);
      } else {
        map.addSource(lineSourceId, {
          type: "geojson",
          data: lineData as any,
        });
      }

      const existingPointSource = map.getSource(pointSourceId) as any;
      if (existingPointSource && typeof existingPointSource.setData === "function") {
        existingPointSource.setData(pointData as any);
      } else {
        map.addSource(pointSourceId, {
          type: "geojson",
          data: pointData as any,
        });
      }

      const opacity = Math.max(0, Math.min(1, layer.opacity));
      const visibility = layer.visible ? "visible" : "none";

      if (map.getLayer(fillId)) {
        map.setLayoutProperty(fillId, "visibility", visibility);
        map.setPaintProperty(fillId, "fill-color", layer.color);
        map.setPaintProperty(fillId, "fill-opacity", opacity * 0.35);
      } else {
        map.addLayer({
          id: fillId,
          type: "fill",
          source: polygonSourceId,
          layout: { visibility },
          paint: {
            "fill-color": layer.color,
            "fill-opacity": opacity * 0.35,
          },
        });
      }

      if (map.getLayer(lineId)) {
        map.setLayoutProperty(lineId, "visibility", visibility);
        map.setPaintProperty(lineId, "line-color", layer.color);
        map.setPaintProperty(lineId, "line-opacity", opacity);
      } else {
        map.addLayer({
          id: lineId,
          type: "line",
          source: lineSourceId,
          layout: { visibility },
          paint: {
            "line-color": layer.color,
            "line-width": 2.5,
            "line-opacity": opacity,
          },
        });
      }

      if (map.getLayer(pointId)) {
        map.setLayoutProperty(pointId, "visibility", visibility);
        map.setPaintProperty(pointId, "circle-color", layer.color);
        map.setPaintProperty(pointId, "circle-opacity", opacity);
      } else {
        map.addLayer({
          id: pointId,
          type: "circle",
          source: pointSourceId,
          layout: { visibility },
          paint: {
            "circle-color": layer.color,
            "circle-radius": 6,
            "circle-opacity": opacity,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
      }
    }

    /*
     * Sadece yeni yüklenen katmanda otomatik zoom.
     * Renk/opaklık/görünürlük değişince harita zıplamaz.
     */
    if (layerToFit) {
      const bounds = getLayerBounds(layerToFit);

      if (bounds) {
        const [[minLon, minLat], [maxLon, maxLat]] = bounds;

        if (minLon === maxLon && minLat === maxLat) {
          map.flyTo({
            center: [minLon, minLat],
            zoom: 16,
            duration: 700,
          });
        } else {
          map.fitBounds(bounds as any, {
            padding: 100,
            maxZoom: 17,
            duration: 700,
          });
        }
      }
    }

    map.triggerRepaint();

    previousUserLayerIdsRef.current = new Set(
      userLayers.map((layer) => layer.id),
    );
  }, [userLayers, mapReady]);

  /* activeLayers ile uydu katmanı kontrolü */
  useEffect(() => {
    if (!mapReady) return;

    const wantsSatellite = activeLayers.includes("satellite");
    const map = mapRef.current;

    if (!map) return;

    satelliteRef.current = wantsSatellite;
    setSatellite(wantsSatellite);

    if (map.getLayer("osm")) {
      map.setLayoutProperty(
        "osm",
        "visibility",
        wantsSatellite ? "none" : "visible",
      );
    }

    if (map.getLayer("satellite")) {
      map.setLayoutProperty(
        "satellite",
        "visibility",
        wantsSatellite ? "visible" : "none",
      );
    }
  }, [activeLayers, mapReady]);

  /* PROJE DURUMUNU GERİ YÜKLE */
  useEffect(() => {
    if (!mapReady || !restoreProject) return;

    const map = mapRef.current;
    if (!map) return;

    const state = restoreProject.state;
    const safePoints = Array.isArray(state.points) ? state.points : [];
    const safeDrawings = Array.isArray(state.drawings) ? state.drawings : [];

    pointsRef.current = safePoints;
    drawingsRef.current = safeDrawings;
    setPoints(safePoints);
    setDrawings(safeDrawings);

    const maxPointId = safePoints.reduce((max, item) => Math.max(max, item.id), 0);
    const maxDrawingId = safeDrawings.reduce((max, item) => Math.max(max, item.id), 0);
    nextId.current = Math.max(maxPointId, maxDrawingId) + 1;

    const center = Array.isArray(state.center) && state.center.length === 2
      ? state.center
      : [29.06, 40.19] as Coordinate;
    const zoom = Number.isFinite(state.zoom) ? state.zoom : 6;
    map.jumpTo({ center, zoom });

    const wantsSatellite = Boolean(state.satellite);
    satelliteRef.current = wantsSatellite;
    setSatellite(wantsSatellite);

    if (map.getLayer("osm")) {
      map.setLayoutProperty("osm", "visibility", wantsSatellite ? "none" : "visible");
    }
    if (map.getLayer("satellite")) {
      map.setLayoutProperty("satellite", "visibility", wantsSatellite ? "visible" : "none");
    }

    const denominator = Number(state.scaleDenominator);
    if (Number.isFinite(denominator) && denominator > 0) {
      scaleDenominatorRef.current = Math.round(denominator);
      setActiveScaleDenominator(Math.round(denominator));
      setScaleInput(String(Math.round(denominator)));
    }

    window.setTimeout(() => {
      map.resize();
      updateScreenCoordinates();
      emitProjectState();
    }, 50);
 }, []);

  useEffect(() => {
    if (!mapReady) return;
    const timer = window.setTimeout(() => emitProjectState(), 0);
    return () => window.clearTimeout(timer);
  }, [points, drawings, satellite, activeScaleDenominator, mapReady]);

  /* Klavye kısayolları: ESC ve CTRL+Z */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelDrawing();
        return;
      }

      if (event.key === "Enter") {
        if (drawModeRef.current === "line" || drawModeRef.current === "polygon") {
          event.preventDefault();
          finishDrawing();
          return;
        }
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        if (drawModeRef.current !== "none") {
          event.preventDefault();
          undoLastVertex();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const temporaryScreen =
    screenDrawings.find((item) => item.id === -999)?.points ?? "";

  const selectedDrawing =
    drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null;

  const selectedCentroid =
    selectedDrawing?.type === "polygon"
      ? centroid(selectedDrawing.coordinates)
      : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#e2e8f0",
      }}
    >
      {/* MAPLIBRE */}
      <div
        ref={mapContainer}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* SVG ÇİZİM KATMANI */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 20,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {/* TAMAMLANMIŞ ÇİZİMLER */}
        {screenDrawings
          .filter((drawing) => drawing.id !== -999)
          .map((drawing) => {
            const isSelected = drawing.id === selectedDrawingId || analysisSelectionIds.includes(drawing.id);

            const style = drawing.style ?? {
              color: drawing.type === "line" ? "#2563eb" : "#16a34a",
              width: drawing.type === "line" ? 5 : 4,
              lineStyle: "solid" as LineStyle,
            };

            if (drawing.type === "line") {
              return (
                <polyline
                  key={drawing.id}
                  points={drawing.points}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={isSelected ? style.width + 2 : style.width}
                  strokeDasharray={lineDash(style.lineStyle)}
                  strokeLinecap={style.lineStyle === "dotted" ? "round" : "round"}
                  strokeLinejoin="round"
                />
              );
            }

            return (
              <polygon
                key={drawing.id}
                points={drawing.points}
                fill={style.color}
                fillOpacity={isSelected ? 0.28 : 0.16}
                stroke={style.color}
                strokeWidth={isSelected ? style.width + 2 : style.width}
                strokeDasharray={lineDash(style.lineStyle)}
                strokeLinejoin="round"
              />
            );
          })}

        {/* GEÇİCİ ÇİZGİ */}
        {currentCoordinates.length > 0 &&
          drawMode === "line" && (
            <polyline
              points={temporaryScreen}
              fill="none"
              stroke={drawingColor}
              strokeWidth={drawingWidth}
              strokeDasharray={lineDash(drawingLineStyle)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

        {/* GEÇİCİ ALAN */}
        {currentCoordinates.length > 0 &&
          drawMode === "polygon" && (
            <polygon
              points={temporaryScreen}
              fill={drawingColor}
              fillOpacity="0.14"
              stroke={drawingColor}
              strokeWidth={drawingWidth}
              strokeDasharray={lineDash(drawingLineStyle)}
              strokeLinejoin="round"
            />
          )}

        {/* ÇİZİM KÖŞE NOKTALARI */}
        {currentCoordinates.map((_, index) => {
          const projected = temporaryScreen
            .split(" ")
            .map((value) => {
              const [x, y] = value.split(",").map(Number);
              return { x, y };
            });

          const point = projected[index];
          if (!point) return null;

          return (
            <circle
              key={`corner-${index}`}
              cx={point.x}
              cy={point.y}
              r="6"
              fill="white"
              stroke="#2563eb"
              strokeWidth="3"
            />
          );
        })}
      </svg>

      {/* GERÇEK NOKTA MARKERLARI */}
      {screenPoints.map((point) => {
        const selected = point.id === selectedPointId;

        return (
          <button
            key={point.id}
            type="button"
            aria-label="Haritadaki nokta"
            onClick={(event) => {
              event.stopPropagation();

              const source = pointsRef.current.find(
                (item) => item.id === point.id,
              );

              if (source) {
                selectPoint(source);
              }
            }}
            style={{
              position: "absolute",
              left: point.x,
              top: point.y,
              transform: "translate(-50%, -50%)",
              width: selected ? point.size + 4 : point.size,
              height: selected ? point.size + 4 : point.size,
              padding: 0,
              borderRadius: "50%",
              background: point.color,
              border: selected
                ? "4px solid #0f172a"
                : "3px solid white",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
              zIndex: 60,
              cursor: "pointer",
            }}
          />
        );
      })}

      {/* ÇİZİM SEÇİMİ İÇİN ŞEFFAF HITBOX'LAR */}
      {drawings.map((drawing) => {
        const projected =
          screenDrawings.find(
            (item) => item.id === drawing.id,
          )?.points ?? "";

        if (!projected) return null;

        return drawing.type === "line" ? (
          <svg
            key={`hit-${drawing.id}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 35,
              pointerEvents: "none",
            }}
          >
            <polyline
              points={projected}
              fill="none"
              stroke="transparent"
              strokeWidth="18"
              style={{ pointerEvents: "stroke" }}
              onClick={(event) => selectDrawing(drawing, event)}
            />
          </svg>
        ) : (
          <svg
            key={`hit-${drawing.id}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 34,
              pointerEvents: "none",
            }}
          >
            <polygon
              points={projected}
              fill="transparent"
              stroke="transparent"
              strokeWidth="10"
              style={{ pointerEvents: "all" }}
              onClick={(event) => selectDrawing(drawing, event)}
            />
          </svg>
        );
      })}

      {/* GEOMETRİ DÜZENLEME OVERLAY */}
      {geometryEdit && (() => {
        const layer = userLayers.find((item) => item.id === geometryEdit.layerId);
        const feature = layer?.data.features[geometryEdit.featureIndex];
        if (!layer || !feature?.geometry || !mapRef.current) return null;

        const vertices = getEditableVertices(feature);
        if (!vertices.length) return null;

        const screenVertices = vertices
          .map((coordinate, index) => {
            const projected = projectCoordinate(mapRef.current!, coordinate);
            return projected ? { coordinate, index, x: projected[0], y: projected[1] } : null;
          })
          .filter(Boolean) as Array<{ coordinate: Coordinate; index: number; x: number; y: number }>;

        let path = "";
        if (feature.geometry.type === "LineString") {
          path = geoJsonLinePath(mapRef.current, feature.geometry.coordinates);
        } else if (feature.geometry.type === "Polygon") {
          path = geoJsonPolygonPath(mapRef.current, feature.geometry.coordinates);
        }

        return (
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 90, pointerEvents: "none", overflow: "visible" }}
            onPointerMove={handleGeometryPointerMove}
            onPointerUp={handleGeometryPointerUp}
            onPointerCancel={handleGeometryPointerUp}
          >
            {path && (
              <path
                d={path}
                fill={feature.geometry.type === "Polygon" ? "#0f766e" : "none"}
                fillOpacity={feature.geometry.type === "Polygon" ? 0.10 : 0}
                stroke="#0f766e"
                strokeWidth={4}
                strokeDasharray="7 5"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "stroke", cursor: "copy" }}
                onDoubleClick={addGeometryVertexAtPointer}
              />
            )}

            {screenVertices.map(({ index, x, y }) => (
              <g key={`edit-vertex-${geometryEdit.layerId}-${geometryEdit.featureIndex}-${index}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={11}
                  fill="rgba(15,118,110,0.14)"
                  stroke="none"
                  style={{ pointerEvents: "none" }}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill="white"
                  stroke="#0f766e"
                  strokeWidth={3}
                  style={{ pointerEvents: "all", cursor: "grab" }}
                  onPointerDown={(event) => vertexPointerDown(event, index)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteGeometryVertex(index);
                  }}
                />
              </g>
            ))}
          </svg>
        );
      })()}

      {/* DÜZENLEME DURUMU */}
      {geometryEdit && (
        <div
          style={{
            position: "absolute",
            top: 62,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 180,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(15,118,110,0.96)",
            color: "white",
            boxShadow: "0 5px 18px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800 }}>✏️ Geometri düzenleme</span>
          <span style={{ fontSize: 11, opacity: 0.9 }}>Köşeyi sürükle · Çizgiye çift tıkla ekle · Köşeye çift tıkla sil</span>
          <button
            type="button"
            onClick={() => stopGeometryEdit()}
            style={{ border: "none", borderRadius: 7, padding: "6px 9px", background: "white", color: "#0f766e", fontWeight: 800, cursor: "pointer", fontSize: 11 }}
          >
            ✓ Bitir
          </button>
        </div>
      )}

      {/* KONUM */}
      <button
        type="button"
        onClick={goToTurkey}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 100,
          padding: "8px 14px",
          border: "1px solid #dbe3ed",
          borderRadius: 10,
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ fontSize: 11, color: "#64748b" }}>
          Konum
        </div>

        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Türkiye
        </div>
      </button>

      {/* MESAJ */}
      {message && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            padding: "11px 20px",
            borderRadius: 10,
            background: "#0f172a",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          {message}
        </div>
      )}

      {/* KOORDİNAT / ÖLÇÜM BİLGİSİ */}
      {(status || mousePosition) && (
        <div
          style={{
            position: "absolute",
            left: 24,
            bottom: 92,
            zIndex: 500,
            minWidth: 180,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(107,30,50,0.18)",
            boxShadow: "0 5px 18px rgba(60,20,30,0.12)",
          }}
        >
          {status && (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  marginBottom: 2,
                }}
              >
                {status.title}
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {status.value}
              </div>
            </>
          )}

          {!status && mousePosition && (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  marginBottom: 2,
                }}
              >
                Fare konumu
              </div>

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {mousePosition[1].toFixed(5)},{" "}
                {mousePosition[0].toFixed(5)}
              </div>
            </>
          )}
        </div>
      )}

      {/* SEÇİLİ ALANIN MERKEZİ */}
      {selectedCentroid && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 70,
            transform: "translateX(-50%)",
            zIndex: 100,
            padding: "7px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid #dbe3ed",
            fontSize: 11,
            color: "#475569",
          }}
        >
          Alan merkezi: {selectedCentroid[1].toFixed(5)},{" "}
          {selectedCentroid[0].toFixed(5)}
        </div>
      )}

      {/* ZOOM */}
      <div
        style={{
          position: "absolute",
          top: 72,
          right: 24,
          zIndex: 500,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 9,
          background: "white",
          border: "1px solid #dbe3ed",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        }}
      >
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          style={zoomButton}
        >
          +
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          style={{
            ...zoomButton,
            borderTop: "1px solid #e2e8f0",
          }}
        >
          −
        </button>

        <button
          type="button"
          onClick={goToTurkey}
          style={{
            ...zoomButton,
            borderTop: "1px solid #e2e8f0",
            fontSize: 18,
          }}
        >
          ⌖
        </button>
      </div>

      {/* İMAR PLANI LEJANTI */}
      {legendOpen && (
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 18,
            zIndex: 160,
            width: 330,
            maxHeight: "calc(100% - 150px)",
            overflowY: "auto",
            padding: 16,
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                İmar Planı Lejandı
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                Alan kullanımını seç, sonra haritada çiz.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLegendOpen(false)}
              style={{
                width: 28,
                height: 28,
                border: "1px solid #e2e8f0",
                borderRadius: 7,
                background: "white",
                cursor: "pointer",
                color: "#475569",
              }}
            >
              ×
            </button>
          </div>

          {(["Konut", "Ticaret ve Çalışma", "Sosyal Donatı", "Yeşil Alan", "Ulaşım", "Teknik Altyapı"] as const).map((group) => (
            <div key={group} style={{ marginTop: 14 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#94a3b8",
                marginBottom: 6,
              }}>
                {group}
              </div>

              <div style={{ display: "grid", gap: 5 }}>
                {LAND_USE_ITEMS.filter((item) => item.group === group).map((item) => {
                  const active = selectedLandUse.id === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectLandUse(item)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        width: "100%",
                        padding: "8px 9px",
                        borderRadius: 8,
                        border: active ? "1px solid #0f172a" : "1px solid #e2e8f0",
                        background: active ? "#f8fafc" : "white",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: 25,
                          height: 19,
                          flexShrink: 0,
                          borderRadius: 3,
                          background: item.color,
                          border: "1px solid rgba(15,23,42,0.22)",
                        }}
                      />

                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 650, color: "#334155" }}>
                          {item.name}
                        </span>
                        <span style={{ display: "block", fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                          {item.code}
                        </span>
                      </span>

                      {active && (
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a" }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 14,
            padding: 10,
            borderRadius: 9,
            background: "#f8fafc",
            color: "#64748b",
            fontSize: 10,
            lineHeight: 1.5,
          }}>
            Seçilen kullanım: <strong style={{ color: "#334155" }}>{selectedLandUse.name}</strong>
          </div>
        </div>
      )}

      {/* ÇİZİM STİLİ */}
      {stylePanelOpen && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 102,
            transform: "translateX(-50%)",
            zIndex: 150,
            width: 300,
            padding: 16,
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
            Çizim Stili
          </div>

          <div style={{
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: 11,
            color: "#475569",
          }}>
            İmar kullanımı: <strong style={{ color: "#0f172a" }}>{selectedLandUse.name}</strong>
          </div>

          <label style={styleLabel}>
            Renk
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <input
                type="color"
                value={drawingColor}
                onChange={(event) => {
                  const value = event.target.value;
                  setDrawingColor(value);
                  updateSelectedDrawingStyle({ color: value });
                  updateSelectedPointStyle({ color: value });
                }}
                style={{ width: 44, height: 36, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{drawingColor}</span>
            </div>
          </label>

          <label style={{ ...styleLabel, marginTop: 12 }}>
            Kalınlık: {drawingWidth}px
            <input
              type="range"
              min="1"
              max="14"
              step="1"
              value={drawingWidth}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDrawingWidth(value);
                updateSelectedDrawingStyle({ width: value });
              }}
              style={{ width: "100%", marginTop: 7 }}
            />
          </label>

          <label style={{ ...styleLabel, marginTop: 12 }}>
            Kalem tipi
            <select
              value={drawingLineStyle}
              onChange={(event) => {
                const value = event.target.value as LineStyle;
                setDrawingLineStyle(value);
                updateSelectedDrawingStyle({ lineStyle: value });
              }}
              style={{ width: "100%", marginTop: 6, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", color: "#0f172a" }}
            >
              <option value="solid">Düz kalem</option>
              <option value="dashed">Kesik kalem</option>
              <option value="dotted">Noktalı kalem</option>
            </select>
          </label>

          <label style={{ ...styleLabel, marginTop: 12 }}>
            Nokta boyutu: {pointSize}px
            <input
              type="range"
              min="12"
              max="40"
              step="2"
              value={pointSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPointSize(value);
                updateSelectedPointStyle({ size: value });
              }}
              style={{ width: "100%", marginTop: 7 }}
            />
          </label>

          <div style={{ marginTop: 12, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Seçtiğin stil, bundan sonra ekleyeceğin nokta, çizgi ve alanlara uygulanır.
          </div>
        </div>
      )}

      {/* KAYDETME / ÇIKTI FORMAT SEÇİMİ */}
      {saveFormatOpen && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 102,
            transform: "translateX(-50%)",
            zIndex: 500,
            width: 390,
            maxWidth: "calc(100% - 24px)",
            maxHeight: "calc(100% - 120px)",
            overflowY: "auto",
            padding: 16,
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            background: "rgba(255,255,255,0.99)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 5 }}>
            Haritayı ve veriyi kaydet
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.45 }}>
            Harita çıktısı veya üzerinde çalıştığın CBS verisini istediğin formatta dışa aktar.
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="map-scale-input" style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
              Harita ölçeği
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: 15 }}>1 /</span>
              <input
                id="map-scale-input"
                type="text"
                inputMode="numeric"
                value={scaleInput}
                onChange={(event) => setScaleInput(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => { if (event.key === "Enter") applyPrintScale(); }}
                placeholder="1000"
                style={{ flex: 1, height: 40, padding: "0 11px", border: "1px solid #cbd5e1", borderRadius: 8, outline: "none", fontSize: 14, fontWeight: 700, color: "#0f172a", background: "white" }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              Örnek: 1000 = 1/1.000 · 100000 = 1/100.000
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Harita çıktıları
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 13 }}>
            <button type="button" onClick={saveAsPdf} style={{ padding: "11px 10px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}>
              📄 PDF
            </button>
            <button type="button" onClick={saveAsJpeg} style={{ padding: "11px 10px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#0f172a", color: "white", cursor: "pointer", fontWeight: 700 }}>
              🖼️ JPEG
            </button>
            <button type="button" onClick={saveAsPng} style={{ padding: "11px 10px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}>
              🖼️ PNG
            </button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>
            CBS veri çıktıları
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button type="button" onClick={saveAsGeoJson} style={{ padding: "10px 6px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#ecfdf5", color: "#065f46", cursor: "pointer", fontWeight: 700 }}>
              🗺️ GeoJSON
            </button>
            <button type="button" onClick={saveAsKml} style={{ padding: "10px 6px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 700 }}>
              🌍 KML
            </button>
            <button type="button" onClick={saveAsCsv} style={{ padding: "10px 6px", borderRadius: 9, border: "1px solid #dbe3ed", background: "#fff7ed", color: "#9a3412", cursor: "pointer", fontWeight: 700 }}>
              📊 CSV
            </button>
          </div>

          <button type="button" onClick={() => setSaveFormatOpen(false)} style={{ width: "100%", marginTop: 8, padding: "8px 10px", border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
            Vazgeç
          </button>
        </div>
      )}

      {/* CBS ARAÇLARI */}
      {cbsToolOpen && (
        <div
          style={{
            position: "absolute",
            left: 18,
            bottom: 78,
            zIndex: 150,
            width: 245,
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,255,255,0.76)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(107,30,50,0.16)",
            boxShadow: "0 8px 28px rgba(60,20,30,0.14)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            CBS Araçları
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>
            İki obje gereken araçlar için haritada Ctrl/Shift ile seçim yap.
          </div>

          {[
            ["Tampon Bölge", "🟣", createBuffer],
            ["Kırp", "✂️", clipActiveLayer],
            ["Merkez Nokta", "⊙", createCentroidFromSelection],
            ["Mesafe", "📏", activateDistanceMeasure],
            ["Alan", "⬡", () => {
              setMeasureMode("none");
              activateMode("polygon");
              setCbsToolOpen(false);
            }],
            ["Birleştir", "🔗", mergeSelectedDrawings],
            ["Böl / Split", "✂️", splitSelectedDrawing],
            ["Kesişim Kontrolü", "◎", checkSelectedIntersection],
          ].map(([label, icon, action]) => (
            <button
              key={String(label)}
              type="button"
              onClick={action as () => void}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                width: "100%",
                padding: "9px 10px",
                marginTop: 5,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: "white",
                cursor: "pointer",
                textAlign: "left",
                color: "#334155",
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              <span style={{ width: 22 }}>{String(icon)}</span>
              {String(label)}
            </button>
          ))}
        </div>
      )}

      {layerPanelOpen && (
        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 78,
            zIndex: 150,
            width: 270,
            maxHeight: 330,
            overflowY: "auto",
            padding: 12,
            border: "1px solid #dbe3ed",
            borderRadius: 12,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
            Katmanlar
          </div>

          {userLayers.length === 0 ? (
            <div style={{ fontSize: 11, color: "#94a3b8", padding: 8 }}>
              Henüz kullanıcı katmanı yok.
            </div>
          ) : (
            userLayers.map((layer) => {
              const active = activeUserLayerId === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setActiveUserLayerId(layer.id);

                    if (onUserLayersChange) {
                      onUserLayersChange(
                        userLayers.map((item) =>
                          item.id === layer.id
                            ? { ...item, visible: !item.visible }
                            : item,
                        ),
                      );
                    }

                    showMessage(
                      layer.visible
                        ? `◌ ${layer.name} kapatıldı`
                        : `✓ ${layer.name} açıldı`,
                    );
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 9px",
                    marginTop: 4,
                    border: active ? "1px solid #0f172a" : "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: active ? "#f8fafc" : "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: layer.color,
                      border: "1px solid rgba(15,23,42,0.2)",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 11, color: "#334155", fontWeight: 650 }}>
                    {layer.name}
                  </span>
                  <span
                    style={{
                      color: layer.visible ? "#16a34a" : "#94a3b8",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {layer.visible ? "●" : "○"}
                  </span>
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={openCreateLayer}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px dashed #0f766e",
              background: "#f0fdfa",
              color: "#0f766e",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            ＋ Yeni Katman Oluştur
          </button>
        </div>
      )}

      {/* KULLANICI GEOJSON GÖRSEL OVERLAY
          MapLibre katmanı hangi nedenle çizilmezse çizilsin, kullanıcı verisini
          aynı harita projeksiyonunda SVG olarak görünür tutar. */}
      {mapRef.current && userLayers.some((layer) => layer.visible) && (
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 35,
            // SVG yalnızca görsel yedek çizimdir; fare olaylarını MapLibre canvas'a bırakır.
            pointerEvents: "none",
            overflow: "hidden",
          }}
          onClick={(event) => {
            // Boş SVG alanına tıklanırsa harita tıklamasını bozma.
            if (event.target === event.currentTarget) {
              onFeatureSelect?.(null);
            }
          }}
        >
          {userLayers
            .filter((layer) => layer.visible)
            .flatMap((layer) =>
              layer.data.features.map((feature, featureIndex) => {
                const key = `${layer.id}-${featureIndex}`;
                const handleSelect = (event: ReactMouseEvent) => {
                  event.stopPropagation();

                  selectAttributeFeatureFromMap(layer, feature);
                  onFeatureSelect?.({
                    layerId: layer.id,
                    layerName: layer.name,
                    feature,
                  });
                };

                const geometry = feature.geometry;
                if (!geometry) return null;

                // Görsel geometriyi üretirken aynı zamanda tıklanabilir hale getir.
                const commonProps = {
                  onClick: handleSelect,
                  style: { pointerEvents: "all", cursor: "pointer" } as const,
                };

                if (geometry.type === "Polygon") {
                  const d = geoJsonPolygonPath(mapRef.current!, geometry.coordinates);
                  if (!d) return null;
                  return (
                    <path
                      key={key}
                      d={d}
                      fill={layer.color}
                      fillOpacity={Math.max(0, Math.min(1, layer.opacity * 0.28))}
                      stroke={layer.color}
                      strokeOpacity={Math.max(0, Math.min(1, layer.opacity))}
                      strokeWidth={3}
                      {...commonProps}
                    />
                  );
                }

                if (geometry.type === "MultiPolygon") {
                  return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
                    .map((polygon: any, index: number) => {
                      const d = geoJsonPolygonPath(mapRef.current!, polygon);
                      if (!d) return null;
                      return (
                        <path
                          key={`${key}-${index}`}
                          d={d}
                          fill={layer.color}
                          fillOpacity={Math.max(0, Math.min(1, layer.opacity * 0.28))}
                          stroke={layer.color}
                          strokeOpacity={Math.max(0, Math.min(1, layer.opacity))}
                          strokeWidth={3}
                          {...commonProps}
                        />
                      );
                    });
                }

                if (geometry.type === "LineString") {
                  const d = geoJsonLinePath(mapRef.current!, geometry.coordinates);
                  if (!d) return null;
                  return (
                    <path
                      key={key}
                      d={d}
                      fill="none"
                      stroke={layer.color}
                      strokeOpacity={Math.max(0, Math.min(1, layer.opacity))}
                      strokeWidth={8}
                      {...commonProps}
                    />
                  );
                }

                if (geometry.type === "MultiLineString") {
                  return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
                    .map((line: any, index: number) => {
                      const d = geoJsonLinePath(mapRef.current!, line);
                      if (!d) return null;
                      return (
                        <path
                          key={`${key}-${index}`}
                          d={d}
                          fill="none"
                          stroke={layer.color}
                          strokeOpacity={Math.max(0, Math.min(1, layer.opacity))}
                          strokeWidth={8}
                          {...commonProps}
                        />
                      );
                    });
                }

                if (geometry.type === "Point") {
                  const point = projectCoordinate(mapRef.current!, geometry.coordinates);
                  if (!point) return null;
                  return (
                    <circle
                      key={key}
                      cx={point[0]}
                      cy={point[1]}
                      r={10}
                      fill={layer.color}
                      fillOpacity={Math.max(0, Math.min(1, layer.opacity))}
                      stroke="#ffffff"
                      strokeWidth={2}
                      {...commonProps}
                    />
                  );
                }

                if (geometry.type === "MultiPoint") {
                  return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
                    .map((coord: any, index: number) => {
                      const point = projectCoordinate(mapRef.current!, coord);
                      if (!point) return null;
                      return (
                        <circle
                          key={`${key}-${index}`}
                          cx={point[0]}
                          cy={point[1]}
                          r={10}
                          fill={layer.color}
                          fillOpacity={Math.max(0, Math.min(1, layer.opacity))}
                          stroke="#ffffff"
                          strokeWidth={2}
                          {...commonProps}
                        />
                      );
                    });
                }

                return null;
              }),
            )}
        </svg>
      )}

      {createLayerOpen && (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 18,
            zIndex: 80,
            width: 330,
            maxWidth: "calc(100% - 36px)",
            background: "rgba(255,255,255,0.98)",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 12px 36px rgba(0,0,0,0.22)",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
              Yeni Katman Oluştur
            </div>
            <button
              type="button"
              onClick={() => setCreateLayerOpen(false)}
              style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}
              aria-label="Kapat"
            >
              ×
            </button>
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
            Katman adı
          </label>
          <input
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createUserLayer(); }}
            placeholder="Örn. Konut Alanları"
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12 }}
          />

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
            Geometri tipi
          </label>
          <select
            value={newLayerGeometry}
            onChange={(e) => setNewLayerGeometry(e.target.value as "Point" | "LineString" | "Polygon")}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12, background: "white" }}
          >
            <option value="Point">Nokta</option>
            <option value="LineString">Çizgi</option>
            <option value="Polygon">Poligon</option>
          </select>

          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>Renk</label>
              <input
                type="color"
                value={newLayerColor}
                onChange={(e) => setNewLayerColor(e.target.value)}
                style={{ width: "100%", height: 40, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>Opaklık</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={newLayerOpacity}
                onChange={(e) => setNewLayerOpacity(Number(e.target.value))}
                style={{ width: "100%", marginTop: 10 }}
              />
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>%{Math.round(newLayerOpacity * 100)}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setCreateLayerOpen(false)}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", color: "#334155", fontWeight: 700, cursor: "pointer" }}
            >
              İptal
            </button>
            <button
              type="button"
              onClick={createUserLayer}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "none", background: "#0f766e", color: "white", fontWeight: 800, cursor: "pointer" }}
            >
              Oluştur
            </button>
          </div>
        </div>
      )}

      {/* ÖZNİTELİK TABLOSU */}
      {attributeTableOpen && (
        <div
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            bottom: 104,
            zIndex: 170,
            maxHeight: "min(68vh, 620px)",
            background: "rgba(255,255,255,0.99)",
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                ▦ Öznitelik Tablosu
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                Katmandaki objeleri ara, düzenle, ekle ve yönet
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select
                value={attributeLayerId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setAttributeLayerId(id);
                  setSelectedAttributeFeatureId(null);
                  if (id) {
                    setActiveUserLayerId(id);
                    const selectedLayer = userLayers.find((item) => item.id === id);
                    if (selectedLayer?.geometryType) setNewFeatureGeometry(selectedLayer.geometryType);
                  }
                }}
                style={{
                  height: 34,
                  minWidth: 190,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "0 9px",
                  background: "white",
                  color: "#334155",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                <option value="">Katman seç</option>
                {userLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={closeAttributeTable}
                style={{
                  width: 34,
                  height: 34,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  background: "white",
                  color: "#475569",
                  cursor: "pointer",
                  fontSize: 18,
                }}
                aria-label="Öznitelik tablosunu kapat"
              >
                ×
              </button>
            </div>
          </div>

          {(() => {
            const layer = userLayers.find((item) => item.id === attributeLayerId);
            const features = layer?.data.features ?? [];
            const propertyKeys = Array.from(
              new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))),
            ).filter((key) => key !== "__ergis_id");

            const rows = features
              .map((feature, sourceIndex) => ({ feature, sourceIndex }))
              .filter(({ feature }) => {
                const query = attributeSearch.trim().toLocaleLowerCase("tr-TR");
                if (!query) return true;
                return Object.values(feature.properties ?? {})
                  .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(query))
                  || String(feature.geometry?.type ?? "").toLocaleLowerCase("tr-TR").includes(query);
              })
              .sort((a, b) => {
                if (!attributeSortKey) return a.sourceIndex - b.sourceIndex;
                const av = attributeSortKey === "__geometry"
                  ? String(a.feature.geometry?.type ?? "")
                  : String(a.feature.properties?.[attributeSortKey] ?? "");
                const bv = attributeSortKey === "__geometry"
                  ? String(b.feature.geometry?.type ?? "")
                  : String(b.feature.properties?.[attributeSortKey] ?? "");
                const an = Number(av);
                const bn = Number(bv);
                const bothNumbers = av.trim() !== "" && bv.trim() !== "" && Number.isFinite(an) && Number.isFinite(bn);
                const comparison = bothNumbers
                  ? an - bn
                  : av.localeCompare(bv, "tr", { numeric: true, sensitivity: "base" });
                return attributeSortDirection === "asc" ? comparison : -comparison;
              });

            const sortIcon = (key: string) =>
              attributeSortKey === key ? (attributeSortDirection === "asc" ? " ↑" : " ↓") : "";

            if (!layer) {
              return (
                <div style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  {userLayers.length
                    ? "Yukarıdan bir katman seç."
                    : "Önce bir kullanıcı katmanı oluştur veya ekle."}
                </div>
              );
            }

            return (
              <>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom: "1px solid #e2e8f0",
                  flexWrap: "wrap",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                      {rows.length}/{features.length} obje · {propertyKeys.length} alan
                    </span>
                    <input
                      value={attributeSearch}
                      onChange={(e) => setAttributeSearch(e.target.value)}
                      placeholder="Tabloda ara..."
                      style={{
                        height: 32,
                        width: 180,
                        border: "1px solid #cbd5e1",
                        borderRadius: 7,
                        padding: "0 9px",
                        fontSize: 12,
                        background: "white",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <select
                      value={newFeatureGeometry}
                      onChange={(e) => setNewFeatureGeometry(e.target.value as "Point" | "LineString" | "Polygon")}
                      style={{ height: 32, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 6px", background: "white", fontSize: 12 }}
                    >
                      <option value="Point">Nokta</option>
                      <option value="LineString">Çizgi</option>
                      <option value="Polygon">Alan</option>
                    </select>
                    <button
                      type="button"
                      onClick={startNewLayerFeature}
                      style={{ height: 32, padding: "0 10px", border: "none", borderRadius: 7, background: "#0f766e", color: "white", fontWeight: 800, cursor: "pointer", fontSize: 12 }}
                    >
                      ＋ Yeni Obje
                    </button>
                    <button
                      type="button"
                      onClick={() => exportAttributeCsv(layer)}
                      style={{ height: 32, padding: "0 9px", border: "1px solid #cbd5e1", borderRadius: 7, background: "white", color: "#334155", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportAttributeExcel(layer)}
                      style={{ height: 32, padding: "0 9px", border: "1px solid #cbd5e1", borderRadius: 7, background: "white", color: "#334155", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                    >
                      Excel
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                  <input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="Yeni alan adı"
                    onKeyDown={(e) => { if (e.key === "Enter") addAttributeField(); }}
                    style={{ height: 32, width: 145, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px", fontSize: 12 }}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as "text" | "number")}
                    style={{ height: 32, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 6px", background: "white", fontSize: 12 }}
                  >
                    <option value="text">Metin</option>
                    <option value="number">Sayı</option>
                  </select>
                  <button
                    type="button"
                    onClick={addAttributeField}
                    style={{ height: 32, padding: "0 10px", border: "none", borderRadius: 7, background: "#0f766e", color: "white", fontWeight: 800, cursor: "pointer", fontSize: 12 }}
                  >
                    ＋ Alan
                  </button>
                </div>

                {features.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                    Bu katmanda henüz obje yok. <b>＋ Yeni Obje</b> ile doğrudan bu katmana çizim ekleyebilirsin.
                  </div>
                ) : rows.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                    Aramana uygun kayıt bulunamadı.
                  </div>
                ) : (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 2 }}>
                          <th style={{ padding: "9px 10px", textAlign: "left", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" }}>#</th>
                          <th style={{ padding: "9px 10px", textAlign: "left", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => toggleAttributeSort("__geometry")}>Geometri{attributeSortKey === "__geometry" ? sortIcon("__geometry") : ""}</th>
                          {propertyKeys.map((key) => (
                            <th key={key} onClick={() => toggleAttributeSort(key)} style={{ padding: "9px 10px", textAlign: "left", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap", cursor: "pointer" }}>
                              {key}{sortIcon(key)}
                            </th>
                          ))}
                          <th style={{ padding: "9px 10px", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" }}>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ feature, sourceIndex }) => {
                          const featureId = attributeFeatureKey(sourceIndex);
                          const selected = selectedAttributeFeatureId === featureId;
                          return (
                            <tr
                              key={`${layer.id}-${featureId}`}
                              onClick={(event) => {
                                const target = event.target as HTMLElement;
                                if (["INPUT", "BUTTON", "SELECT"].includes(target.tagName)) return;
                                setSelectedAttributeFeatureId(featureId);
                                zoomToAttributeFeature(feature);
                              }}
                              style={{ background: selected ? "#ecfeff" : "white", borderBottom: "1px solid #edf2f7", cursor: "pointer" }}
                            >
                              <td style={{ padding: "7px 10px", color: "#64748b", fontWeight: 700 }}>{sourceIndex + 1}</td>
                              <td style={{ padding: "7px 10px", whiteSpace: "nowrap", color: "#334155" }}>{feature.geometry?.type ?? "—"}</td>
                              {propertyKeys.map((key) => (
                                <td key={key} style={{ padding: "5px 7px", minWidth: 130 }}>
                                  <input
                                    value={String(feature.properties?.[key] ?? "")}
                                    onChange={(e) => updateFeatureProperty(featureId, key, e.target.value)}
                                    style={{ width: "100%", boxSizing: "border-box", height: 32, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", color: "#334155", background: "white", outline: "none" }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: "5px 7px", whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", gap: 5 }}>
                                  <button
                                    type="button"
                                    onClick={() => { setSelectedAttributeFeatureId(featureId); zoomToAttributeFeature(feature); }}
                                    style={{ height: 30, padding: "0 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "white", color: "#0f766e", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                                  >
                                    🎯 Göster
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startGeometryEdit(layer.id, sourceIndex)}
                                    style={{ height: 30, padding: "0 9px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                                  >
                                    ✏️ Düzenle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteAttributeFeature(sourceIndex)}
                                    style={{ height: 30, padding: "0 8px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff1f2", color: "#dc2626", fontWeight: 800, cursor: "pointer", fontSize: 11 }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* HASSAS ÇİZİM / SNAP PANELİ */}
      {precisionPanelOpen && (
        <div style={{ position: "absolute", left: "50%", bottom: 102, transform: "translateX(-50%)", zIndex: 220, width: 340, maxWidth: "calc(100% - 24px)", padding: 14, border: "1px solid #dbe3ed", borderRadius: 14, background: "rgba(255,255,255,0.99)", boxShadow: "0 10px 30px rgba(0,0,0,0.20)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div><div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>🎯 Hassas Çizim</div><div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>QGIS/CAD tarzı yakalama ve ölçülü çizim</div></div>
            <button type="button" onClick={() => setPrecisionPanelOpen(false)} style={{ border: "none", background: "#f1f5f9", borderRadius: 7, width: 28, height: 28, cursor: "pointer", color: "#475569" }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, padding: 9, border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 11, fontWeight: 700, color: "#334155", cursor: "pointer" }}><input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} /> Snap</label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, padding: 9, border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 11, fontWeight: 700, color: "#334155", cursor: "pointer" }}><input type="checkbox" checked={angleLockEnabled} onChange={(e) => setAngleLockEnabled(e.target.checked)} /> Açı 45°</label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, padding: 9, border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 11, fontWeight: 700, color: "#334155", cursor: "pointer" }}><input type="checkbox" checked={gridEnabled} onChange={(e) => setGridEnabled(e.target.checked)} /> Grid</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 5, border: "1px solid #e2e8f0", borderRadius: 9 }}><span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>Snap px</span><input type="number" min="5" max="30" value={snapTolerance} onChange={(e) => setSnapTolerance(Math.max(5, Math.min(30, Number(e.target.value) || 14)))} style={{ width: 60, height: 28, border: "1px solid #cbd5e1", borderRadius: 6, padding: "0 6px" }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Grid aralığı (m)<input type="number" min="1" step="1" value={gridSizeMeters} onChange={(e) => setGridSizeMeters(Math.max(1, Number(e.target.value) || 10))} style={{ width: "100%", height: 32, marginTop: 4, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px" }} /></label>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Segment uzunluğu (m)<input type="text" inputMode="decimal" placeholder="Boş = serbest" value={lengthConstraintInput} onChange={(e) => setLengthConstraintInput(e.target.value.replace(/[^0-9.,]/g, ""))} style={{ width: "100%", height: 32, marginTop: 4, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px" }} /></label>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 6 }}>Koordinat ile işlem</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input type="text" inputMode="decimal" placeholder="Boylam (X)" value={coordinateLngInput} onChange={(e) => setCoordinateLngInput(e.target.value)} style={{ height: 32, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px" }} /><input type="text" inputMode="decimal" placeholder="Enlem (Y)" value={coordinateLatInput} onChange={(e) => setCoordinateLatInput(e.target.value)} style={{ height: 32, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px" }} /></div>
            <button type="button" onClick={addCoordinateVertexFromInputs} style={{ width: "100%", marginTop: 7, height: 34, border: "none", borderRadius: 8, background: "#0f766e", color: "white", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>📍 Koordinatı ekle / git</button>
          </div>
          <button type="button" onClick={applyOffsetToSelectedFeature} style={{ width: "100%", marginTop: 8, height: 34, border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", color: "#334155", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>↔ Offset / Öteleme uygula</button>
          <div style={{ marginTop: 8, fontSize: 10, color: "#64748b", lineHeight: 1.45 }}><strong>Shift</strong> basılı tutarak da 45° açı kilidini geçici açabilirsin. Düzenleme modunda çizgiye çift tıklayarak yeni vertex eklenir; vertex'e çift tıklayarak silinir.</div>
          {precisionStatus && <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 8, background: "#ecfeff", color: "#0f766e", fontSize: 11, fontWeight: 800 }}>{precisionStatus}</div>}
        </div>
      )}

      {gridEnabled && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 12, pointerEvents: "none", opacity: 0.22 }}>
          {Array.from({ length: 40 }).map((_, i) => <line key={`grid-v-${i}`} x1={i * 32} y1="0" x2={i * 32} y2="100%" stroke="#64748b" strokeWidth="1" />)}
          {Array.from({ length: 30 }).map((_, i) => <line key={`grid-h-${i}`} x1="0" y1={i * 32} x2="100%" y2={i * 32} stroke="#64748b" strokeWidth="1" />)}
        </svg>
      )}

      {/* CANLI KARTOGRAFİK ÖLÇEK */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 94,
          transform: "translateX(-50%)",
          zIndex: 120,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 13px",
          border: "1px solid rgba(15,23,42,0.10)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Ölçek</span>
        <strong style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
          1:{activeScaleDenominator.toLocaleString("tr-TR")}
        </strong>
      </div>

      {/* HARİCİ WMS / WFS / WMTS SERVİSLERİ */}
      {servicesPanelOpen && (
        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 94,
            zIndex: 220,
            width: 360,
            maxWidth: "calc(100% - 36px)",
            maxHeight: "min(72vh, 560px)",
            overflowY: "auto",
            padding: 15,
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>🌐 Harita Servisleri</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>WMS · WFS · WMTS</div>
            </div>
            <button
              type="button"
              onClick={() => setServicesPanelOpen(false)}
              style={{
                width: 30,
                height: 30,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: "white",
                color: "#475569",
                cursor: "pointer",
                fontSize: 18,
              }}
              aria-label="Servis panelini kapat"
            >
              ×
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {(["WMS", "WFS", "WMTS"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setServiceType(type)}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: serviceType === type ? "1px solid #0f766e" : "1px solid #cbd5e1",
                  background: serviceType === type ? "#ecfdf5" : "white",
                  color: serviceType === type ? "#0f766e" : "#475569",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
            Servis adı
          </label>
          <input
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder={`Örn. ${serviceType} Katmanı`}
            style={{
              width: "100%",
              height: 36,
              boxSizing: "border-box",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "0 9px",
              marginBottom: 9,
              outline: "none",
            }}
          />

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
            Servis URL
          </label>
          <input
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addExternalService(); }}
            placeholder={
              serviceType === "WMTS"
                ? "https://.../{z}/{x}/{y}"
                : "https://.../MapServer"
            }
            style={{
              width: "100%",
              height: 36,
              boxSizing: "border-box",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "0 9px",
              marginBottom: 9,
              outline: "none",
            }}
          />

          {serviceType !== "WMTS" && (
            <>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
                Katman adı
              </label>
              <input
                value={serviceLayer}
                onChange={(e) => setServiceLayer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addExternalService(); }}
                placeholder={serviceType === "WMS" ? "Örn. workspace:layer" : "Örn. layer_name"}
                style={{
                  width: "100%",
                  height: 36,
                  boxSizing: "border-box",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "0 9px",
                  marginBottom: 10,
                  outline: "none",
                }}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => void addExternalService()}
            style={{
              width: "100%",
              height: 38,
              border: "none",
              borderRadius: 9,
              background: "#0f766e",
              color: "white",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            ＋ Servisi Haritaya Ekle
          </button>

          <div style={{ marginTop: 14, paddingTop: 11, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
              Eklenen servisler
            </div>

            {externalServices.length === 0 ? (
              <div style={{ padding: 10, borderRadius: 8, background: "#f8fafc", color: "#94a3b8", fontSize: 11 }}>
                Henüz harici servis eklenmedi.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 7 }}>
                {externalServices.map((service) => (
                  <div
                    key={service.id}
                    style={{
                      padding: 9,
                      border: "1px solid #e2e8f0",
                      borderRadius: 9,
                      background: "white",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <button
                        type="button"
                        onClick={() => toggleExternalService(service.id)}
                        style={{
                          width: 30,
                          height: 28,
                          border: "1px solid #cbd5e1",
                          borderRadius: 7,
                          background: service.visible ? "#ecfdf5" : "#f8fafc",
                          color: service.visible ? "#0f766e" : "#94a3b8",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                        title={service.visible ? "Servisi gizle" : "Servisi göster"}
                      >
                        {service.visible ? "●" : "○"}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#334155" }}>
                          {service.name}
                        </div>
                        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
                          {service.type}{service.layer ? ` · ${service.layer}` : ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeExternalService(service.id)}
                        style={{
                          width: 30,
                          height: 28,
                          border: "1px solid #fecaca",
                          borderRadius: 7,
                          background: "#fff1f2",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                        title="Servisi kaldır"
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
                      <span style={{ fontSize: 9, color: "#64748b", whiteSpace: "nowrap" }}>Opaklık</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={service.opacity}
                        onChange={(e) => setExternalServiceOpacity(service.id, Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ width: 32, textAlign: "right", fontSize: 9, color: "#64748b" }}>
                        {Math.round(service.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ARAÇLAR */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 18,
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: 5,
          padding: 8,
          border: "1px solid rgba(107,30,50,0.14)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.76)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 8px 30px rgba(60,20,30,0.14)",
          maxWidth: "calc(100% - 24px)",
          overflowX: "auto",
        }}
      >
        <ToolButton
          label="CBS"
          icon="🧭"
          active={cbsToolOpen}
          onClick={() => {
            setCbsToolOpen((open) => !open);
            setLayerPanelOpen(false);
            setLegendOpen(false);
            setStylePanelOpen(false);
          }}
        />

        <ToolButton
          label="Katman"
          icon="🗂️"
          active={layerPanelOpen}
          onClick={() => {
            setLayerPanelOpen((open) => !open);
            setCbsToolOpen(false);
            setAttributeTableOpen(false);
          }}
        />

        <ToolButton
          label="Öznitelik"
          icon="▦"
          active={attributeTableOpen}
          onClick={openAttributeTable}
        />

        <ToolButton
          label="Düzenle"
          icon="✏️"
          active={Boolean(geometryEdit)}
          onClick={startSelectedGeometryEdit}
        />

        <ToolButton
          label="Hassas"
          icon="🎯"
          active={precisionPanelOpen}
          onClick={() => {
            setPrecisionPanelOpen((open) => !open);
            setCbsToolOpen(false); setLayerPanelOpen(false); setAttributeTableOpen(false); setLegendOpen(false); setStylePanelOpen(false);
          }}
        />

        <ToolButton
          label="Uydu"
          icon="🛰️"
          active={satellite}
          onClick={toggleSatellite}
        />

        <ToolButton
          label="Lejant"
          icon="🗂️"
          active={legendOpen}
          onClick={() => {
            setLegendOpen((open) => !open);
            setStylePanelOpen(false);
          }}
        />

        <ToolButton
          label="Stil"
          icon="🎨"
          active={stylePanelOpen}
          onClick={() => {
            setStylePanelOpen((open) => !open);
            setLegendOpen(false);
          }}
        />

        <ToolButton
          label="Nokta"
          icon="📍"
          active={drawMode === "point"}
          onClick={() => activateMode("point")}
        />

        <ToolButton
          label="Çizgi"
          icon="📏"
          active={drawMode === "line"}
          onClick={() => activateMode("line")}
        />

        <ToolButton
          label="Alan"
          icon="⬡"
          active={drawMode === "polygon"}
          onClick={() => activateMode("polygon")}
        />

        <ToolButton
          label="Geri Al"
          icon="↶"
          active={false}
          onClick={undoLastVertex}
        />

        <ToolButton
          label="Sil"
          icon="⌫"
          active={false}
          danger
          onClick={deleteSelected}
        />

        <ToolButton
          label="Temizle"
          icon="🗑️"
          active={false}
          danger
          onClick={clearAll}
        />

        <ToolButton
          label="Servis"
          icon="🌐"
          active={servicesPanelOpen}
          onClick={() => {
            setServicesPanelOpen((open) => !open);
            setCbsToolOpen(false);
            setLayerPanelOpen(false);
            setLegendOpen(false);
            setStylePanelOpen(false);
            setAttributeTableOpen(false);
          }}
        />

        <ToolButton
          label="Kaydet"
          icon="💾"
          active={saveFormatOpen}
          onClick={() => setSaveFormatOpen((open) => !open)}
        />

        <ToolButton
          label="Çıktı"
          icon="🖨️"
          active={saveFormatOpen}
          onClick={() => setSaveFormatOpen((open) => !open)}
        />
      </div>

      {/* NOKTA SAYACI */}
      {points.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 65,
            zIndex: 100,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.96)",
            color: "#334155",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          📍 {points.length} nokta
        </div>
      )}

      {/* ÇİZİM DURUMU */}
      {drawMode !== "none" && (
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 18,
            transform: "translateY(-84px)",
            zIndex: 100,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(15,23,42,0.94)",
            color: "white",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {drawMode === "point" && "📍 Nokta modu"}
          {drawMode === "line" &&
            `📏 ${currentCoordinates.length} nokta`}
          {drawMode === "polygon" &&
            `⬡ ${currentCoordinates.length} köşe`}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  danger = false,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 76,
        minWidth: 76,
        height: 64,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        borderRadius: 9,
        border: active
          ? "1px solid #6B1E32"
          : "1px solid rgba(107,30,50,0.12)",
        background: danger
          ? "rgba(220,38,38,0.06)"
          : active
            ? "rgba(107,30,50,0.12)"
            : "rgba(255,255,255,0.72)",
        backdropFilter: "blur(10px)",
        color: danger
          ? "#b91c1c"
          : active
            ? "#6B1E32"
            : "#475569",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      <span style={{ fontSize: 19 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const styleLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
};

const zoomButton: CSSProperties = {
  width: 44,
  height: 44,
  border: "none",
  background: "rgba(255,255,255,0.70)",
  color: "#6B1E32",
  fontSize: 25,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
