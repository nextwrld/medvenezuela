// Mapa del feed: muestra un marcador por solicitud con coordenadas, coloreado
// por urgencia. Click en un marcador → navega al detalle (vía onSelect).
// Límite lazy: Leaflet + CSS quedan fuera del bundle inicial.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: number;
  latitud: number;
  longitud: number;
  urgencia: "critico" | "moderado" | "estable";
  medicamento: string;
};

type Props = { points: MapPoint[]; onSelect: (id: number) => void };

const URGENCIA_COLOR: Record<MapPoint["urgencia"], string> = {
  critico: "#dc2626",
  moderado: "#ea580c",
  estable: "#16a34a",
};

const DEFAULT_CENTER: [number, number] = [6.42, -66.58];
const DEFAULT_ZOOM = 6;

export default function MapaSolicitudes({ points, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    const markers: L.CircleMarker[] = [];
    for (const p of points) {
      const marker = L.circleMarker([p.latitud, p.longitud], {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: URGENCIA_COLOR[p.urgencia],
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindTooltip(p.medicamento)
        .on("click", () => onSelectRef.current(p.id));
      markers.push(marker);
    }

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }

    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Se inicializa una vez con los puntos disponibles al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[60vh] w-full rounded-2xl border border-zinc-200"
      role="application"
      aria-label="Mapa de solicitudes"
    />
  );
}
