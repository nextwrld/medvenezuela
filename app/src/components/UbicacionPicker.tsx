// Mapa para fijar un pin. Este componente es el límite lazy: se importa con
// import() dinámico desde NuevaSolicitud, de modo que Leaflet y su CSS quedan
// en un chunk aparte y NO entran al bundle inicial (clave para 3G).
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Centro por defecto: Venezuela (aprox.), zoom país.
const DEFAULT_CENTER: [number, number] = [6.42, -66.58];
const DEFAULT_ZOOM = 6;

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
};

export default function UbicacionPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Mantener el handler actual sin re-suscribir el evento de click.
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(
      value ? [value.lat, value.lng] : DEFAULT_CENTER,
      value ? 15 : DEFAULT_ZOOM,
    );
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    if (value) {
      markerRef.current = L.marker([value.lat, value.lng]).addTo(map);
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map);
      }
      onChangeRef.current(coords);
    });

    // Leaflet necesita un recálculo de tamaño cuando el contenedor se monta
    // dentro de un bloque que acaba de aparecer.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo se inicializa una vez; los updates de `value` externos no
    // re-crean el mapa (el usuario interactúa tocando).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-lg border border-zinc-300"
      role="application"
      aria-label="Mapa para marcar la ubicación"
    />
  );
}
