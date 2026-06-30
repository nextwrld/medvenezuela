// Mapa de solo lectura que muestra un pin. Límite lazy: Leaflet + CSS quedan
// en un chunk aparte, cargado solo cuando el usuario expande "Ver mapa".
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = { lat: number; lng: number };

export default function MiniMapa({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([lat, lng], 15);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    L.marker([lat, lng]).addTo(map);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full rounded-lg border border-zinc-300"
      role="application"
      aria-label="Mapa de la ubicación"
    />
  );
}
