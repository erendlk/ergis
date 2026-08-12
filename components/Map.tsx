"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Coordinate = [number, number];
type DrawMode = "none" | "point" | "line" | "polygon";

interface PointFeature {
  id: number;
  coordinate: Coordinate;
}

interface DrawingFeature {
  id: number;
  type: "line" | "polygon";
  coordinates: Coordinate[];
}

interface ScreenPoint {
  id: number;
  x: number;
  y: number;
}

interface ScreenDrawing {
  id: number;
  type: "line" | "polygon";
  points: string;
}

interface MapProps {
  activeLayers?: string[];
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

export default function Map({
  activeLayers = ["base"],
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
      });
    }

    setScreenDrawings(projectedDrawings);
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

      const feature: DrawingFeature = {
        id: nextId.current++,
        type: "line",
        coordinates: [...coordinates],
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

  function selectDrawing(drawing: DrawingFeature) {
    setSelectedDrawingId(drawing.id);
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

  function saveDrawing() {
    const data = {
      application: "ŞehirGIS",
      version: 2,
      createdAt: new Date().toISOString(),
      points: pointsRef.current,
      drawings: drawingsRef.current,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "sehirgis-cizim.json";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    showMessage("💾 Çizim kaydedildi");
  }

  function printMap() {
    window.print();
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
      });

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

      map.getCanvas().addEventListener("mouseleave", () => {
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

            if (drawing.type === "line") {
              return (
                <polyline
                  key={drawing.id}
                  points={drawing.points}
                  fill="none"
                  stroke={isSelected ? "#0f172a" : "#2563eb"}
                  strokeWidth={isSelected ? 7 : 5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }

            return (
              <polygon
                key={drawing.id}
                points={drawing.points}
                fill={isSelected ? "#f59e0b" : "#22c55e"}
                fillOpacity={isSelected ? 0.28 : 0.22}
                stroke={isSelected ? "#d97706" : "#16a34a"}
                strokeWidth={isSelected ? 6 : 4}
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
              stroke="#2563eb"
              strokeWidth="5"
              strokeDasharray="8 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

        {/* GEÇİCİ ALAN */}
        {currentCoordinates.length > 0 &&
          drawMode === "polygon" && (
            <polygon
              points={temporaryScreen}
              fill="#22c55e"
              fillOpacity="0.14"
              stroke="#16a34a"
              strokeWidth="4"
              strokeDasharray="8 6"
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
              width: selected ? 26 : 22,
              height: selected ? 26 : 22,
              padding: 0,
              borderRadius: "50%",
              background: "#22c55e",
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
          label="Uydu"
          icon="🛰️"
          active={satellite}
          onClick={toggleSatellite}
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
          active={false}
          onClick={saveDrawing}
        />

        <ToolButton
          label="Çıktı"
          icon="🖨️"
          active={false}
          onClick={printMap}
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