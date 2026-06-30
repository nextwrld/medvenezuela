# Mapa del feed (Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Un toggle "Lista / Mapa" en el Home que muestra, en un mapa lazy, todas las solicitudes activas que tienen coordenadas, con marcadores por urgencia que llevan al detalle.

**Architecture:** Endpoint tRPC dedicado y liviano (`solicitudes.mapPoints`) que devuelve solo `{id, latitud, longitud, urgencia, medicamento}` de las solicitudes con coords y estatus activo/en_proceso. El mapa (Leaflet+OSM) carga bajo demanda (chunk aparte) cuando el usuario elige "Mapa".

**Tech Stack:** tRPC v11, Drizzle (MySQL), React 19, Leaflet, Vitest.

**Rama:** `feat/ubicacion-geografica` (misma que Fase 1 — un solo PR a `main`). Depende de las columnas lat/lng de la Fase 1.

---

## Task P2-1: Endpoint `mapPoints`

**Files:**
- Modify: `app/api/solicitudes-router.ts`
- Test: `app/api/map-points.test.ts` (nuevo)

- [ ] **Step 1: Failing test** — `app/api/map-points.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapPointSelect } from "./solicitudes-router";

describe("mapPointSelect", () => {
  it("expone solo los campos livianos del mapa", () => {
    expect(Object.keys(mapPointSelect).sort()).toEqual(
      ["id", "latitud", "longitud", "medicamento", "urgencia"].sort(),
    );
  });

  it("nunca expone credenciales (pinGestion/pinCierre)", () => {
    expect(Object.keys(mapPointSelect)).not.toContain("pinGestion");
    expect(Object.keys(mapPointSelect)).not.toContain("pinCierre");
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `cd app && npx vitest run api/map-points.test.ts` → falla (no existe `mapPointSelect`).

- [ ] **Step 3: Implement** in `app/api/solicitudes-router.ts`:

1. Extend the drizzle import to include `isNotNull`:
```ts
import { eq, and, like, or, desc, count, isNotNull } from "drizzle-orm";
```

2. After `publicSolicitudSelect` (near the top), add and export the lightweight projection:
```ts
// Proyección mínima para el mapa del feed. Solo lo que un marcador necesita;
// nunca incluye credenciales (pinGestion/pinCierre) ni datos de contacto.
export const mapPointSelect = {
  id: schema.solicitudes.id,
  latitud: schema.solicitudes.latitud,
  longitud: schema.solicitudes.longitud,
  urgencia: schema.solicitudes.urgencia,
  medicamento: schema.solicitudes.medicamento,
};
```

3. Add the `mapPoints` procedure inside `createRouter({ ... })` (e.g. right after `stats`):
```ts
  // Puntos para el mapa del feed: todas las solicitudes activas / en proceso
  // que tienen coordenadas. Sin paginar (payload chico) y sin datos sensibles.
  mapPoints: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select(mapPointSelect)
      .from(schema.solicitudes)
      .where(
        and(
          isNotNull(schema.solicitudes.latitud),
          isNotNull(schema.solicitudes.longitud),
          or(
            eq(schema.solicitudes.estatus, "activo"),
            eq(schema.solicitudes.estatus, "en_proceso"),
          ),
        ),
      );
  }),
```

- [ ] **Step 4: Run tests + typecheck** — `cd app && npx vitest run api/map-points.test.ts && npx tsc -b`
  Expected: test PASS; tsc solo con el error preexistente de `Header.tsx`.

- [ ] **Step 5: Commit**
```bash
git add app/api/solicitudes-router.ts app/api/map-points.test.ts
git commit -m "feat(api): endpoint mapPoints para el mapa del feed"
```

---

## Task P2-2: Mapa del feed + toggle en el Home

**Files:**
- Create: `app/src/components/MapaSolicitudes.tsx`
- Modify: `app/src/pages/Home.tsx`

- [ ] **Step 1: Create `app/src/components/MapaSolicitudes.tsx`** (límite lazy: Leaflet en chunk aparte):

```tsx
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
```

- [ ] **Step 2: Integrate the toggle into `app/src/pages/Home.tsx`**

Read the file first. It uses `useNavigate`, `useState`, and `trpc.solicitudes.list`/`stats`. The list is rendered inside `<main>`. Make these additive changes:

1. Imports: merge `lazy, Suspense` into the existing `react` import. Add an icon and the lazy component:
```tsx
import { Map as MapIcon, List as ListIcon } from "lucide-react";
const MapaSolicitudes = lazy(() => import("@/components/MapaSolicitudes"));
```

2. View state (near the other `useState`):
```tsx
  const [view, setView] = useState<"lista" | "mapa">("lista");
```

3. Map data query (only fetches when the map is shown):
```tsx
  const { data: mapPoints, isLoading: mapLoading } =
    trpc.solicitudes.mapPoints.useQuery(undefined, { enabled: view === "mapa" });
```

4. A toggle control: place it at the top of `<main>`, before the results list. Render exactly:
```tsx
        <div className="mb-4 inline-flex rounded-lg border border-zinc-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView("lista")}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md text-sm ${
              view === "lista" ? "bg-zinc-900 text-white" : "text-zinc-600"
            }`}
          >
            <ListIcon className="w-4 h-4" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView("mapa")}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md text-sm ${
              view === "mapa" ? "bg-zinc-900 text-white" : "text-zinc-600"
            }`}
          >
            <MapIcon className="w-4 h-4" /> Mapa
          </button>
        </div>
```

5. Conditional render: wrap the EXISTING results/list block so it only renders when `view === "lista"`, and add the map branch for `view === "mapa"`. The map branch:
```tsx
        {view === "mapa" && (
          <div>
            {mapLoading ? (
              <div className="h-[60vh] w-full rounded-2xl border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
                Cargando mapa…
              </div>
            ) : (mapPoints?.length ?? 0) === 0 ? (
              <div className="h-[60vh] w-full rounded-2xl border border-zinc-200 flex items-center justify-center text-sm text-zinc-400 text-center px-6">
                Aún no hay solicitudes con ubicación marcada.
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="h-[60vh] w-full rounded-2xl border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
                    Cargando mapa…
                  </div>
                }
              >
                <MapaSolicitudes
                  points={mapPoints ?? []}
                  onSelect={(id) => navigate(`/solicitud/${id}`)}
                />
              </Suspense>
            )}
          </div>
        )}
```
Keep the existing list/pagination markup intact, just gated behind `view === "lista"`. Do not remove the stats bar or filters (those stay visible in both views, or at least in list view — keep them where they are; only the results area switches).

- [ ] **Step 3: Typecheck + lint** — `cd app && npx tsc -b && npx eslint src/components/MapaSolicitudes.tsx src/pages/Home.tsx`
  Expected: tsc solo con el error preexistente de `Header.tsx`; eslint limpio en los dos archivos. Fix cualquier cosa nueva.

- [ ] **Step 4: Commit**
```bash
git add app/src/components/MapaSolicitudes.tsx app/src/pages/Home.tsx
git commit -m "feat(ui): toggle Lista/Mapa con mapa lazy de solicitudes en el Home"
```

---

## Task P2-3: Verificación

**Files:** ninguno (verificación).

- [ ] **Step 1: Tests** — `cd app && npx vitest run`. Esperado: todos verdes salvo los 3 archivos con error de parse PREEXISTENTE (`api/integration/schema-contract.integration.test.ts`, `scripts/schema-contract.test.ts`, `scripts/verify-build-env.test.ts`). Ningún otro fallo.
- [ ] **Step 2: Lint** — `cd app && npm run lint`. Esperado: solo errores preexistentes (idénticos a `main` + el `Header.tsx`). Cero nuevos.
- [ ] **Step 3: Build** — `cd app && npm run build`. Esperado: OK; chunk(s) de mapa separados del entry (Leaflet + `MapaSolicitudes` en chunks aparte).
- [ ] **Step 4: No push.** El controlador hace el push final que actualiza el PR existente.

---

## Notas
- Depende de la Fase 1 (columnas lat/lng + DTO). Va en la misma rama → un solo PR a `main`.
- `mapPoints` no pagina (payload chico, solo 5 campos). Si a futuro hay miles de puntos con coords, Fase 3 puede agregar clustering / acotar por viewport.
