import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Search, Activity, Package, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import Header from "@/components/Header";
import SolicitudCard from "@/components/SolicitudCard";
import { ESTADOS_VENEZUELA, ZONAS_EMERGENCIA } from "@db/seed";

export default function Home() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedEstado, setSelectedEstado] = useState("");
  const [selectedUrgencia, setSelectedUrgencia] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = trpc.solicitudes.list.useQuery({
    search: debouncedSearch || undefined,
    estado: selectedEstado || undefined,
    urgencia: (selectedUrgencia as "critico" | "moderado" | "estable") || undefined,
    page,
    limit: 20,
  });

  const { data: stats } = trpc.solicitudes.stats.useQuery();

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedEstado("");
    setSelectedUrgencia("");
    setPage(1);
  }, []);

  const hasFilters = search || selectedEstado || selectedUrgencia;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      {/* Stats bar */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <Activity className="w-4 h-4 text-red-600" />
              <span className="text-sm">
                <span className="font-semibold text-red-600">{stats?.activos ?? 0}</span>{" "}
                <span className="text-zinc-500">activas</span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Package className="w-4 h-4 text-yellow-600" />
              <span className="text-sm">
                <span className="font-semibold text-yellow-600">{stats?.enProceso ?? 0}</span>{" "}
                <span className="text-zinc-500">en proceso</span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm">
                <span className="font-semibold text-green-600">{stats?.recibidos ?? 0}</span>{" "}
                <span className="text-zinc-500">recibidas</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <section className="mb-6 overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-r from-red-600 via-red-500 to-orange-400 text-white shadow-sm">
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1 text-center lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
                Emergencia activa
              </p>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                Ayudemos a los afectados del terremoto
              </h2>
              <p className="text-sm text-white/85 sm:text-base">
                Conecta rápidamente donaciones y nuevas solicitudes de medicamentos.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-end">
              <Button
                asChild
                variant="outline"
                className="h-11 border-white/50 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white"
              >
                <a href="#como-ayudar">¿Cómo ayudar?</a>
              </Button>
              <Button
                onClick={() => navigate("/solicitar")}
                className="h-11 bg-white px-5 font-semibold text-red-700 hover:bg-red-50"
              >
                Nueva Solicitud
              </Button>
            </div>
          </div>
        </section>

        {/* Search and filters */}
        <div className="mb-6 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Buscar medicamento, hospital o ciudad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-12 bg-white border-zinc-300 text-base"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              className="h-12 px-3 border-zinc-300"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          </div>

          {/* Emergency zone chips */}
          {!showFilters && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ZONAS_EMERGENCIA.map((zona) => (
                <button
                  key={zona}
                  onClick={() =>
                    setSelectedEstado(selectedEstado === zona ? "" : zona)
                  }
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedEstado === zona
                      ? "bg-red-600 text-white"
                      : "bg-white text-zinc-600 border border-zinc-200 hover:border-red-300"
                  }`}
                >
                  {zona}
                </button>
              ))}
            </div>
          )}

          {/* Expanded filters */}
          {showFilters && (
            <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5 block">
                  Estado
                </label>
                <select
                  value={selectedEstado}
                  onChange={(e) => setSelectedEstado(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm bg-white"
                >
                  <option value="">Todos los estados</option>
                  {ESTADOS_VENEZUELA.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5 block">
                  Urgencia
                </label>
                <div className="flex gap-2">
                  {["", "critico", "moderado", "estable"].map((u) => (
                    <button
                      key={u}
                      onClick={() => setSelectedUrgencia(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedUrgencia === u
                          ? u === "critico"
                            ? "bg-red-600 text-white"
                            : u === "moderado"
                            ? "bg-orange-500 text-white"
                            : u === "estable"
                            ? "bg-green-500 text-white"
                            : "bg-zinc-800 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {u === ""
                        ? "Todas"
                        : u === "critico"
                        ? "Crítico"
                        : u === "moderado"
                        ? "Moderado"
                        : "Estable"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active filters */}
          {hasFilters && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Filtros activos:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 gap-1"
                onClick={clearFilters}
              >
                <X className="w-3 h-3" />
                Limpiar
              </Button>
            </div>
          )}
        </div>

        <section
          id="como-ayudar"
          className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
        >
            <div className="mb-5 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-600">
                Cómo ayudar
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                Paso a paso para apoyar una solicitud
              </h2>
              <p className="mt-2 text-sm text-zinc-600 sm:text-base">
                Sigue este proceso para ayudar de forma rápida, segura y ordenada.
              </p>
            </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                step: "01",
                title: "Revisa la necesidad",
                description:
                  "Usa la búsqueda y los filtros para encontrar solicitudes activas según medicamento, hospital, ciudad o nivel de urgencia.",
              },
              {
                step: "02",
                title: "Confirma que puedes ayudar",
                description:
                  "Abre la solicitud, verifica la cantidad requerida y asegúrate de contar con el medicamento o con una forma real de conseguirlo.",
              },
              {
                step: "03",
                title: "Contacta al solicitante",
                description:
                  "Escribe o llama al contacto publicado para confirmar disponibilidad, coordinar la entrega y evitar esfuerzos duplicados.",
              },
              {
                step: "04",
                title: "Coordina o crea una nueva solicitud",
                description:
                  "Si no encontraste la necesidad publicada, usa Nueva Solicitud para registrar el caso y hacerlo visible a otros donantes.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                  {item.step}
                </div>
                <h3 className="text-base font-semibold text-zinc-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Results count */}
        {!isLoading && data && (
          <div className="mb-4">
            <p className="text-sm text-zinc-500">
              {data.total} solicitud{data.total !== 1 ? "es" : ""} encontrada
              {data.total !== 1 ? "s" : ""}
              {data.totalPages > 1 && (
                <span className="text-zinc-400">
                  {" "}
                  · Página {page} de {data.totalPages}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3"
              >
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="space-y-2 pt-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Solicitudes grid */}
        {!isLoading && data && data.items.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.items.map((solicitud) => (
                <SolicitudCard key={solicitud.id} solicitud={solicitud} />
              ))}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-zinc-300"
                >
                  Anterior
                </Button>
                <span className="flex items-center px-3 text-sm text-zinc-500">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  className="border-zinc-300"
                >
                  Siguiente
                </Button>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!isLoading && data && data.items.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-700 mb-2">
              No hay solicitudes activas
            </h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
              {hasFilters
                ? "No se encontraron resultados con los filtros aplicados. Intenta con otros criterios."
                : "Sé el primero en crear una solicitud de medicamento."}
            </p>
            {hasFilters ? (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="border-zinc-300"
              >
                Limpiar filtros
              </Button>
            ) : (
              <Button
                onClick={() => (window.location.href = "/solicitar")}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Crear solicitud
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
            <a
              href="https://nextwrld.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-zinc-700"
            >
              <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-[8px]">M</span>
              </div>
              <span>MedVene · Plataforma para emergencias médicas</span>
            </a>
            <div className="flex flex-col items-center gap-1 text-center sm:items-end sm:text-right">
              <span>Venezuela 2026</span>
              <a
                href="https://nextwrld.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 hover:underline"
              >
                Hecho por NextWrld
              </a>
              <span className="max-w-xs text-zinc-500">
                A disposición para apoyar cualquier proyecto o necesidad que sume
                en la respuesta ante este desastre.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
