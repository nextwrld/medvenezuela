import { useNavigate } from "react-router";
import { MapPin, Building2, Package, Calendar } from "lucide-react";
import type { PublicSolicitud } from "@db/schema";
import UrgencyBadge from "./UrgencyBadge";
import StatusBadge from "./StatusBadge";
import WhatsAppButton from "./WhatsAppButton";
import ShareButton from "./ShareButton";

interface SolicitudCardProps {
  solicitud: PublicSolicitud;
}

function timeAgo(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  return d.toLocaleDateString("es-VE");
}

const urgencyBorder: Record<string, string> = {
  critico: "border-l-red-500",
  moderado: "border-l-orange-400",
  estable: "border-l-green-400",
};

export default function SolicitudCard({ solicitud }: SolicitudCardProps) {
  const navigate = useNavigate();

  const shareTitle = `Se necesita ${solicitud.medicamento}`;
  const shareText = `${solicitud.cantidad} de ${solicitud.principioActivo} para ${solicitud.hospital} en ${solicitud.ciudad}, ${solicitud.estado}. Contacto: ${solicitud.telefono}`;

  return (
    <div
      className={`bg-white rounded-xl border border-zinc-200 border-l-4 ${urgencyBorder[solicitud.urgencia]} shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => navigate(`/solicitud/${solicitud.id}`)}
    >
      <div className="p-4">
        {/* Header: Badges + time */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <UrgencyBadge level={solicitud.urgencia} />
            <StatusBadge status={solicitud.estatus} />
          </div>
          <span className="text-[11px] text-zinc-400 flex items-center gap-1 shrink-0">
            <Calendar className="w-3 h-3" />
            {timeAgo(solicitud.createdAt)}
          </span>
        </div>

        {/* Medication name */}
        <h3 className="font-semibold text-zinc-900 text-base mb-1">
          {solicitud.medicamento}
        </h3>
        <p className="text-sm text-zinc-500 mb-3">{solicitud.principioActivo}</p>

        {/* Details */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Package className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>{solicitud.cantidad}</span>
            {solicitud.dosis && (
              <span className="text-zinc-400">· {solicitud.dosis}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{solicitud.hospital}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>
              {solicitud.ciudad}, {solicitud.estado}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2 pt-3 border-t border-zinc-100"
          onClick={(e) => e.stopPropagation()}
        >
          <WhatsAppButton
            phone={solicitud.telefono}
            message={`Hola ${solicitud.nombreSolicitante}, vi tu solicitud en MedVene para ${solicitud.medicamento} (${solicitud.principioActivo}). Quiero ayudar. ¿Aún lo necesitas?`}
          />
          <ShareButton
            url={`/solicitud/${solicitud.id}`}
            title={shareTitle}
            text={shareText}
            phone={solicitud.telefono}
          />
        </div>
      </div>
    </div>
  );
}
