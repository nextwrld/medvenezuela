import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Shield,
  Lock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Package,
  Building2,
  MapPin,
  User,
  Calendar,
  ChevronRight,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import Header from "@/components/Header";
import UrgencyBadge from "@/components/UrgencyBadge";
import StatusBadge from "@/components/StatusBadge";

const statusFlow = {
  activo: "en_proceso",
  en_proceso: "recibido",
  recibido: null,
} as const;

const statusLabels: Record<string, { label: string; description: string; button: string; color: string }> = {
  activo: {
    label: "ACTIVA",
    description: "La solicitud está visible en el feed y los donantes pueden contactarte.",
    button: "Marcar como EN PROCESO",
    color: "bg-yellow-600 hover:bg-yellow-700",
  },
  en_proceso: {
    label: "EN PROCESO",
    description: "Alguien se ha comprometido a ayudar. La solicitud sigue visible.",
    button: "Marcar como RECIBIDO",
    color: "bg-green-600 hover:bg-green-700",
  },
  recibido: {
    label: "RECIBIDO",
    description: "El medicamento ya fue entregado. La solicitud ya no aparece en el feed.",
    button: "",
    color: "",
  },
};

export default function Gestion() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const [inputPin, setInputPin] = useState(pin ?? "");
  const [searchedPin, setSearchedPin] = useState(pin ?? "");
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  // Closure-form state. Only relevant when transitioning to `recibido`;
  // cleared on success and when the user changes solicitud.
  const [pinCierre, setPinCierre] = useState("");
  const [notasCierre, setNotasCierre] = useState("");

  useEffect(() => {
    if (pin) {
      setInputPin(pin);
      setSearchedPin(pin);
      setUpdateSuccess(false);
      setUpdateError(null);
      setPinCierre("");
      setNotasCierre("");
    }
  }, [pin]);

  const { data: solicitud, isLoading } = trpc.solicitudes.getByPin.useQuery(
    { pin: searchedPin },
    { enabled: searchedPin.length >= 6 }
  );

  const updateMutation = trpc.solicitudes.updateStatus.useMutation({
    onSuccess: (data) => {
      // The router returns `{ success: false, throttled: true, error, resetsAt }`
      // for blocked closure attempts instead of throwing. Treat those as a
      // user-visible error so the throttle signal is not silently dropped.
      if (data && data.success === false) {
        const until = data.resetsAt
          ? new Date(data.resetsAt).toLocaleTimeString("es-VE", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        setUpdateError(
          data.throttled && until
            ? `${data.error ?? "Demasiados intentos."} Reintente después de las ${until}.`
            : (data.error ?? "No se pudo actualizar el estado.")
        );
        return;
      }
      setUpdateError(null);
      setUpdateSuccess(true);
      setPinCierre("");
      setNotasCierre("");
      setTimeout(() => setUpdateSuccess(false), 3000);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPin.length >= 6) {
      setSearchedPin(inputPin);
      setUpdateSuccess(false);
      setUpdateError(null);
      setPinCierre("");
      setNotasCierre("");
      // Update URL without navigation
      window.history.replaceState(null, "", `/gestion/${inputPin}`);
    }
  };

  const handleUpdateStatus = () => {
    if (!solicitud) return;
    const nextStatus = statusFlow[solicitud.estatus];
    if (!nextStatus) return;

    // Non-terminal transitions: the management PIN is sufficient; the
    // closure credential is intentionally not consulted here so a leaked
    // `pinGestion` cannot drive a solicitud to the terminal state.
    if (nextStatus !== "recibido") {
      updateMutation.mutate({
        id: solicitud.id,
        pinGestion: searchedPin,
        estatus: nextStatus,
      });
      return;
    }

    // Terminal close: `pinCierre` is mandatory; `notasCierre` is optional.
    if (!pinCierre.trim()) {
      return;
    }

    updateMutation.mutate({
      id: solicitud.id,
      pinGestion: searchedPin,
      estatus: nextStatus,
      pinCierre: pinCierre.trim(),
      notasCierre: notasCierre.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6">
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </button>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="p-6 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900">
                  Gestionar Solicitud
                </h1>
                <p className="text-sm text-zinc-500">
                  Ingresa tu PIN para administrar una solicitud
                </p>
              </div>
            </div>
          </div>

          {/* PIN Input */}
          <div className="p-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  value={inputPin}
                  onChange={(e) => setInputPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ingresa tu PIN (6 dígitos)"
                  maxLength={8}
                  className="pl-10 h-12 text-center font-mono text-lg tracking-widest"
                />
              </div>
              <Button
                type="submit"
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={inputPin.length < 6}
              >
                Buscar
              </Button>
            </form>
          </div>

          {/* Loading */}
          {isLoading && searchedPin.length >= 6 && (
            <div className="px-6 pb-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
              <p className="text-sm text-zinc-500 mt-2">Buscando solicitud...</p>
            </div>
          )}

          {/* Not found */}
          {!isLoading && searchedPin.length >= 6 && !solicitud && (
            <div className="px-6 pb-6 text-center">
              <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Ban className="w-7 h-7 text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-700 mb-1">
                No se encontró la solicitud
              </h3>
              <p className="text-sm text-zinc-500">
                Verifica que el PIN sea correcto.
              </p>
            </div>
          )}

          {/* Solicitud found */}
          {!isLoading && solicitud && (
            <div className="px-6 pb-6">
              {/* Success message */}
              {updateSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700">
                    Estado actualizado exitosamente
                  </p>
                </div>
              )}

              {/* Error message — surfaced from any update mutation failure,
                  including throttle responses. Throttle responses come back
                  through `onSuccess({ success: false, throttled, ... })`
                  rather than as a thrown error, so we keep a dedicated
                  `updateError` channel that captures both shapes. */}
              {updateError && !updateMutation.isPending && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700">{updateError}</p>
                </div>
              )}

              {/* Solicitud card */}
              <div className="border border-zinc-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <UrgencyBadge level={solicitud.urgencia} />
                    <StatusBadge status={solicitud.estatus} />
                  </div>
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(solicitud.createdAt).toLocaleDateString("es-VE")}
                  </span>
                </div>

                <div>
                  <p className="font-semibold text-zinc-900">
                    {solicitud.medicamento}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {solicitud.principioActivo}
                  </p>
                </div>

                <div className="space-y-1.5 text-sm text-zinc-600">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {solicitud.cantidad}
                      {solicitud.dosis ? ` · ${solicitud.dosis}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{solicitud.hospital}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {solicitud.ciudad}, {solicitud.estado}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{solicitud.nombreSolicitante}</span>
                  </div>
                </div>
              </div>

              {/* Status management */}
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-xl ${
                    solicitud.estatus === "recibido"
                      ? "bg-green-50 border border-green-200"
                      : solicitud.estatus === "activo"
                      ? "bg-red-50 border border-red-200"
                      : "bg-yellow-50 border border-yellow-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {solicitud.estatus === "recibido" ? (
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-zinc-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-zinc-800">
                        Estado: {statusLabels[solicitud.estatus].label}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {statusLabels[solicitud.estatus].description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status actions */}
                {solicitud.estatus !== "recibido" && (
                  <>
                    {/* Intermediate transition: `activo` -> `en_proceso`.
                        The management PIN is sufficient; the closure PIN
                        is intentionally not consulted here. */}
                    {solicitud.estatus === "activo" && (
                      <Button
                        onClick={handleUpdateStatus}
                        disabled={updateMutation.isPending}
                        className={`w-full text-white h-12 gap-2 ${statusLabels[solicitud.estatus].color}`}
                      >
                        {updateMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Actualizando...
                          </>
                        ) : (
                          <>
                            {statusLabels[solicitud.estatus].button}
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    )}

                    {/* Terminal transition: `en_proceso` -> `recibido`.
                        The closure PIN is mandatory; the management PIN
                        is still required to look up the solicitud but it
                        alone cannot close it. The spec's split-PIN
                        contract is enforced server-side; the UI just
                        surfaces the inputs. */}
                    {solicitud.estatus === "en_proceso" && (
                      <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                        <p className="text-xs font-medium text-yellow-800 uppercase tracking-wide">
                          Confirmar cierre
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            PIN de cierre <span className="text-red-500">*</span>
                          </label>
                          <Input
                            value={pinCierre}
                            onChange={(e) =>
                              setPinCierre(
                                e.target.value.replace(/\D/g, "").slice(0, 6)
                              )
                            }
                            placeholder="000000"
                            maxLength={6}
                            inputMode="numeric"
                            className="h-12 text-center font-mono text-lg tracking-widest"
                            disabled={updateMutation.isPending}
                          />
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Solicita el PIN de cierre al solicitante
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            Notas de cierre (opcional)
                          </label>
                          <Textarea
                            value={notasCierre}
                            onChange={(e) => setNotasCierre(e.target.value)}
                            placeholder="Información adicional sobre el cierre..."
                            rows={2}
                            className="resize-none bg-white"
                            disabled={updateMutation.isPending}
                          />
                        </div>
                        <Button
                          onClick={handleUpdateStatus}
                          disabled={
                            updateMutation.isPending || !pinCierre.trim()
                          }
                          className={`w-full text-white h-12 gap-2 ${statusLabels[solicitud.estatus].color}`}
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Actualizando...
                            </>
                          ) : (
                            <>
                              {statusLabels[solicitud.estatus].button}
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {solicitud.estatus === "recibido" && (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-green-700">
                      ¡Gracias! Esta solicitud ha sido marcada como recibida y ya
                      no aparece en el feed público.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/")}
                      className="border-zinc-300 gap-2"
                    >
                      Volver al feed
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
