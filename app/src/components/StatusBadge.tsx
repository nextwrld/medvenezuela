type Status = "activo" | "en_proceso" | "recibido";

const config: Record<Status, { label: string; className: string }> = {
  activo: {
    label: "ACTIVO",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  en_proceso: {
    label: "EN PROCESO",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  recibido: {
    label: "RECIBIDO",
    className: "bg-green-50 text-green-700 border-green-200",
  },
};

interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${c.className}`}
    >
      {c.label}
    </span>
  );
}
