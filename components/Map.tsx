"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
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
}

interface MapProps {
  activeLayers?: string[];
  userLayers?: UserMapLayer[];
  onUserLayersChange?: (layers: UserMapLayer[]) => void;
  searchRequest?: { query: string; id: number };
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

export default function Map({
  activeLayers = ["base"],
  userLayers = [],
  onUserLayersChange,
  searchRequest,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

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
  const [activeUserLayerId, setActiveUserLayerId] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState<"none" | "distance">("none");

  const [message, setMessage] = useState("");
  const messageTimer = useRef<number | null>(null);

  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(
    null,
  );

  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);

  const [status, setStatus] = useState<{
    title: string;
    value: string;
  } | null>(null);

  const [mousePosition, setMousePosition] = useState<Coordinate | null>(null);

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

    let center: Coordinate | null = null;

    if (selectedPointId !== null) {
      center =
        pointsRef.current.find((point) => point.id === selectedPointId)?.coordinate ??
        null;
    } else if (selectedDrawingId !== null) {
      const drawing = drawingsRef.current.find((item) => item.id === selectedDrawingId);
      if (drawing) center = centroid(drawing.coordinates);
    }

    if (!center) {
      showMessage("Tampon için önce haritada bir nokta veya alan/çizgi seç");
      return;
    }

    const coordinates = makeGeodesicCircle(center, radius);
    const feature: DrawingFeature = {
      id: nextId.current++,
      type: "polygon",
      coordinates,
      style: {
        color: "#7c3aed",
        width: 3,
        lineStyle: "solid",
      },
      landUse: {
        id: "buffer",
        name: `Tampon Bölge (${radius} m)`,
        code: "BUF",
      },
    };

    drawingsRef.current = [...drawingsRef.current, feature];
    setDrawings(drawingsRef.current);
    setSelectedDrawingId(feature.id);
    setSelectedPointId(null);
    setStatus({
      title: "Tampon Bölge",
      value: `${radius.toLocaleString("tr-TR")} m`,
    });
    updateScreenCoordinates();
    setCbsToolOpen(false);
    showMessage("✓ Tampon bölge oluşturuldu");
  }

  function clipActiveLayer() {
    const boundary = drawingsRef.current.find(
      (drawing) =>
        drawing.id === selectedDrawingId && drawing.type === "polygon",
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

    // Nokta geometrileri için tam kırpma; diğer geometriler güvenli biçimde korunur.
    const clippedFeatures = layer.data.features.filter((feature) => {
      if (!feature.geometry) return false;

      if (feature.geometry.type === "Point") {
        const coordinates = feature.geometry.coordinates as Coordinate;
        return pointInPolygon(coordinates, boundary.coordinates);
      }

      return true;
    });

    onUserLayersChange(
      userLayers.map((item) =>
        item.id === layer.id
          ? {
              ...item,
              data: {
                ...item.data,
                features: clippedFeatures,
              },
            }
          : item,
      ),
    );

    setCbsToolOpen(false);
    showMessage("✓ Katman kırpıldı");
  }

  function selectLandUse(item: LandUseItem) {
    setSelectedLandUseId(item.id);
    setDrawingColor(item.color);
    setLegendOpen(false);
    setStylePanelOpen(false);
    activateMode("polygon");
    showMessage(`✓ ${item.name} seçildi — haritada alan çiz`);
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
      showMessage("📏 Çizgi için noktalara tıkla, sonra Bitir'e bas");
    } else if (mode === "polygon") {
      showMessage("⬡ Alan için köşelere tıkla, sonra Bitir'e bas");
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

  function selectDrawing(drawing: DrawingFeature) {
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

  function toggleSatellite() {
    const map = mapRef.current;
    if (!map) return;

    const newValue = !satellite;
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

  useEffect(() => {
    let cancelled = false;

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

      map.on("load", () => {
        if (cancelled) return;

        setMapReady(true);
        updateScreenCoordinates();

        window.setTimeout(() => {
          map.resize();
          updateScreenCoordinates();
        }, 100);
      });

      map.on("move", () => {
        updateScreenCoordinates();
      });

      map.on("zoom", () => {
        updateScreenCoordinates();
      });

      map.on("resize", () => {
        updateScreenCoordinates();
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
          cursorCoordinateRef.current = coordinate;
          updateScreenCoordinates();
        }
      });

      map.on("mouseout", () => {
        setMousePosition(null);

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
          addPoint(coordinate);
          return;
        }

        if (mode === "line" || mode === "polygon") {
          const nextCoordinates = [
            ...currentCoordinatesRef.current,
            coordinate,
          ];

          currentCoordinatesRef.current = nextCoordinates;
          setCurrentCoordinates(nextCoordinates);

          updateScreenCoordinates();

          showMessage(
            `${mode === "line" ? "📏" : "⬡"} ${nextCoordinates.length} nokta`,
          );
        }
      });
    }

    initializeMap();

    return () => {
      cancelled = true;

      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  /* KULLANICI VERİ KATMANLARI */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const prefix = "user-data-";
    const wanted = new Set(userLayers.map((layer) => layer.id));

    // Remove layers/sources that no longer exist.
    const styleLayers = map.getStyle().layers ?? [];
    for (const layer of styleLayers) {
      if (layer.id.startsWith(prefix) && !wanted.has(layer.id.slice(prefix.length))) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
    }

    for (const layer of userLayers) {
      const sourceId = `${prefix}${layer.id}`;
      const lineId = `${sourceId}-line`;
      const fillId = `${sourceId}-fill`;
      const pointId = `${sourceId}-point`;

      const existing = map.getSource(sourceId) as any;

      if (existing) {
        existing.setData(layer.data as any);
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data: layer.data as any,
        });
      }

      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: "fill",
          source: sourceId,
          filter: ["==", ["geometry-type"], "Polygon"] as any,
          paint: {
            "fill-color": layer.color,
            "fill-opacity": layer.opacity * 0.35,
          },
        });
      }

      if (!map.getLayer(lineId)) {
        map.addLayer({
          id: lineId,
          type: "line",
          source: sourceId,
          filter: ["in", ["geometry-type"], "LineString", "Polygon"] as any,
          paint: {
            "line-color": layer.color,
            "line-width": 2,
            "line-opacity": layer.opacity,
          },
        });
      }

      if (!map.getLayer(pointId)) {
        map.addLayer({
          id: pointId,
          type: "circle",
          source: sourceId,
          filter: ["==", ["geometry-type"], "Point"] as any,
          paint: {
            "circle-color": layer.color,
            "circle-radius": 6,
            "circle-opacity": layer.opacity,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
      }

      const visibility = layer.visible ? "visible" : "none";
      for (const id of [fillId, lineId, pointId]) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibility);
        }
      }
    }
  }, [userLayers, mapReady]);

  /* activeLayers ile uydu katmanı kontrolü */
  useEffect(() => {
    if (!mapReady) return;

    const wantsSatellite = activeLayers.includes("satellite");
    const map = mapRef.current;

    if (!map) return;

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

  /* Klavye kısayolları: ESC ve CTRL+Z */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelDrawing();
        return;
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
            const isSelected = drawing.id === selectedDrawingId;

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
              onClick={() => selectDrawing(drawing)}
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
              onClick={() => selectDrawing(drawing)}
            />
          </svg>
        );
      })}

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
            left: 16,
            bottom: 112,
            zIndex: 100,
            minWidth: 180,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #dbe3ed",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
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
          top: 16,
          right: 16,
          zIndex: 100,
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

      {/* KAYDETME FORMAT SEÇİMİ */}
      {saveFormatOpen && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 102,
            transform: "translateX(-50%)",
            zIndex: 250,
            width: 310,
            padding: 16,
            border: "1px solid #dbe3ed",
            borderRadius: 14,
            background: "rgba(255,255,255,0.99)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 5,
            }}
          >
            Haritayı ölçekli kaydet
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#64748b",
              marginBottom: 12,
              lineHeight: 1.45,
            }}
          >
            Önce haritanın gerçek ölçeğini girin, ardından çıktı formatını seçin.
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="map-scale-input"
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "#334155",
              }}
            >
              Harita ölçeği
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: 15 }}>1 /</span>
              <input
                id="map-scale-input"
                type="text"
                inputMode="numeric"
                value={scaleInput}
                onChange={(event) => setScaleInput(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyPrintScale();
                  }
                }}
                placeholder="1000"
                style={{
                  flex: 1,
                  height: 40,
                  padding: "0 11px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  outline: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  background: "white",
                }}
              />
            </div>

            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              Örnek: 1000 = 1/1.000 · 100000 = 1/100.000
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={saveAsPdf}
              style={{
                flex: 1,
                padding: "11px 10px",
                borderRadius: 9,
                border: "1px solid #dbe3ed",
                background: "#f8fafc",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              📄 PDF
            </button>

            <button
              type="button"
              onClick={() => {
                setSaveFormatOpen(false);
                saveAsJpeg();
              }}
              style={{
                flex: 1,
                padding: "11px 10px",
                borderRadius: 9,
                border: "1px solid #dbe3ed",
                background: "#0f172a",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              🖼️ JPEG
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSaveFormatOpen(false)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "8px 10px",
              border: "none",
              background: "transparent",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
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
            border: "1px solid #dbe3ed",
            borderRadius: 12,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
            CBS Araçları
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
                    showMessage(`✓ ${layer.name} aktif katman`);
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
                  {active && <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span>}
                </button>
              );
            })
          )}
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
          border: "1px solid #dbe3ed",
          borderRadius: 12,
          background: "rgba(255,255,255,0.98)",
          boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
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
          label="Bitir"
          icon="✓"
          active={false}
          onClick={finishDrawing}
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
        height: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        borderRadius: 9,
        border: active
          ? "2px solid #22c55e"
          : "1px solid #dbe3ed",
        background: danger
          ? "#fff7f7"
          : active
            ? "#dcfce7"
            : "white",
        color: danger
          ? "#dc2626"
          : active
            ? "#166534"
            : "#334155",
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
  background: "white",
  color: "#0f172a",
  fontSize: 25,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};