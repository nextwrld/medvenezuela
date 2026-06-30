// Bloque de navegación del detalle: botón "Cómo llegar" (handoff a Google
// Maps/Waze) y un mini-mapa lazy COLAPSADO por defecto (no descarga tiles
// hasta que el usuario lo expande). El mapa se importa con import() dinámico.
import { lazy, Suspense, useState } from "react";
import { Navigation } from "lucide-react";
import { buildDirectionsUrl, buildWazeUrl, formatCoords } from "@/lib/geo";

const MiniMapa = lazy(() => import("./MiniMapa"));

type Props = { lat: number; lng: number };

export default function UbicacionDetalle({ lat, lng }: Props) {
  const [showMap, setShowMap] = useState(false);

  return (
    <div className="space-y-3">
      <a
        href={buildDirectionsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
      >
        <Navigation className="w-4 h-4" />
        Cómo llegar
      </a>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <a
          href={buildWazeUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Abrir en Waze
        </a>
        <button
          type="button"
          onClick={() => setShowMap((s) => !s)}
          className="underline"
        >
          {showMap ? "Ocultar mapa" : "Ver mapa"}
        </button>
      </div>
      <p className="text-xs text-zinc-400 font-mono">{formatCoords(lat, lng)}</p>

      {showMap && (
        <Suspense
          fallback={
            <div className="h-56 w-full rounded-lg border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
              Cargando mapa…
            </div>
          }
        >
          <MiniMapa lat={lat} lng={lng} />
        </Suspense>
      )}
    </div>
  );
}
