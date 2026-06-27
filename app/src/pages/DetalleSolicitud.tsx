import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  MapPin,
  Building2,
  Package,
  Phone,
  User,
  Calendar,
  FileText,
  Shield,
  Activity,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import Header from "@/components/Header";
import UrgencyBadge from "@/components/UrgencyBadge";
import StatusBadge from "@/components/StatusBadge";
import WhatsAppButton from "@/components/WhatsAppButton";
import ShareButton from "@/components/ShareButton";
import { useEffect } from "react";

function timeAgo(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minuto${minutes > 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

const rolLabels: Record<string, string> = {
  medico: "Médico",
  familiar: "Familiar",
  personal_salud: "Personal de Salud",
};

const urgencyIcons: Record<string, typeof Activity> = {
  critico: AlertTriangle,
  moderado: Clock,
  estable: Activity,
};

export default function DetalleSolicitud() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const solicitudId = Number(id);

  const { data: solicitud, isLoading } = trpc.solicitudes.getById.useQuery(
    { id: solicitudId },
    { enabled: !isNaN(solicitudId) && solicitudId > 0 }
  );

  // Update OG meta tags dynamically
  useEffect(() => {
    if (!solicitud) return;

    const title = `Se necesita ${solicitud.medicamento} - ${solicitud.hospital} | MedVene`;
    const description = `${solicitud.cantidad} de ${solicitud.principioActivo} para ${solicitud.hospital} en ${solicitud.ciudad}, ${solicitud.estado}. Contacto: ${solicitud.telefono}. Urgencia: ${solicitud.urgencia}.`;

    document.title = title;

    const setMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    const setName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:type", "website");
    setMeta(
      "og:url",
      `${window.location.origin}/solicitud/${solicitud.id}`
    );
    setName("twitter:card", "summary_large_image");
    setName("twitter:title", title);
    setName("twitter:description", description);
    setName(
      "description",
      description
    );

    return () => {
      // Reset meta on unmount
      document.title = "MedVene | Ayuda Médica Venezuela";
    };
  }, [solicitud]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="space-y-3 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!solicitud) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-zinc-400" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-700 mb-2">
            Solicitud no encontrada
          </h1>
          <p className="text-sm text-zinc-500 mb-6">
            Es posible que haya sido marcada como recibida o el enlace sea
            incorrecto.
          </p>
          <Button
            onClick={() => navigate("/")}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Volver al inicio
          </Button>
        </main>
      </div>
    );
  }

  const shareTitle = `Se necesita ${solicitud.medicamento}`;
  const shareText = `${solicitud.cantidad} de ${solicitud.principioActivo} para ${solicitud.hospital} en ${solicitud.ciudad}, ${solicitud.estado}`;
  const detailUrl = `/solicitud/${solicitud.id}`;

  const UrgencyIcon = urgencyIcons[solicitud.urgencia];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al feed
        </button>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Alert header */}
          <div
            className={`p-4 ${
              solicitud.urgencia === "critico"
                ? "bg-red-50 border-b border-red-100"
                : solicitud.urgencia === "moderado"
                ? "bg-orange-50 border-b border-orange-100"
                : "bg-green-50 border-b border-green-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  solicitud.urgencia === "critico"
                    ? "bg-red-100"
                    : solicitud.urgencia === "moderado"
                    ? "bg-orange-100"
                    : "bg-green-100"
                }`}
              >
                <UrgencyIcon
                  className={`w-5 h-5 ${
                    solicitud.urgencia === "critico"
                      ? "text-red-600"
                      : solicitud.urgencia === "moderado"
                      ? "text-orange-600"
                      : "text-green-600"
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <UrgencyBadge level={solicitud.urgencia} />
                  <StatusBadge status={solicitud.estatus} />
                </div>
                <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Publicado {timeAgo(solicitud.createdAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Medication */}
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 mb-1">
                {solicitud.medicamento}
              </h1>
              <p className="text-base text-zinc-500">
                {solicitud.principioActivo}
              </p>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
                <Package className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Cantidad
                  </p>
                  <p className="text-sm font-medium text-zinc-900">
                    {solicitud.cantidad}
                  </p>
                  {solicitud.dosis && (
                    <p className="text-xs text-zinc-400">{solicitud.dosis}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
                <Building2 className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Hospital
                  </p>
                  <p className="text-sm font-medium text-zinc-900">
                    {solicitud.hospital}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
                <MapPin className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Ubicación
                  </p>
                  <p className="text-sm font-medium text-zinc-900">
                    {solicitud.ciudad}, {solicitud.estado}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
                <User className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Solicitante
                  </p>
                  <p className="text-sm font-medium text-zinc-900">
                    {solicitud.nombreSolicitante}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {rolLabels[solicitud.rolSolicitante]}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl sm:col-span-2">
                <Phone className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Contacto
                  </p>
                  <p className="text-lg font-semibold text-zinc-900 font-mono">
                    {solicitud.telefono}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {solicitud.notas && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <FileText className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                    Notas
                  </p>
                  <p className="text-sm text-amber-800">{solicitud.notas}</p>
                </div>
              </div>
            )}

            {/* Patient initials */}
            {solicitud.inicialesPaciente && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Shield className="w-4 h-4" />
                <span>
                  Paciente: {solicitud.inicialesPaciente}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-4 border-t border-zinc-100 space-y-3">
              <WhatsAppButton
                phone={solicitud.telefono}
                message={`Hola ${solicitud.nombreSolicitante}, vi tu solicitud en MedVene para ${solicitud.medicamento} (${solicitud.principioActivo}) en ${solicitud.hospital}. Quiero ayudar. ¿Aún lo necesitas?`}
                size="md"
              />
              <div className="flex gap-2">
                <ShareButton
                  url={detailUrl}
                  title={shareTitle}
                  text={shareText}
                  phone={solicitud.telefono}
                />
                <Button
                  variant="outline"
                  className="flex-1 h-11 border-zinc-300 gap-2"
                  onClick={() => navigate(`/gestion/${solicitud.pinGestion}`)}
                >
                  <Shield className="w-4 h-4" />
                  Gestionar solicitud
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Management hint */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-sm text-blue-800">
            <strong>¿Eres el solicitante?</strong> Usa tu PIN{" "}
            <span className="font-mono font-bold">{solicitud.pinGestion}</span>{" "}
            para gestionar esta solicitud{" "}
            <button
              onClick={() => navigate(`/gestion/${solicitud.pinGestion}`)}
              className="underline font-medium hover:text-blue-900"
            >
              aquí
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
