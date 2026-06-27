import { AlertTriangle, Clock, CheckCircle } from "lucide-react";

type UrgencyLevel = "critico" | "moderado" | "estable";

const config: Record<
  UrgencyLevel,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  critico: {
    label: "CRÍTICO",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: AlertTriangle,
  },
  moderado: {
    label: "MODERADO",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    icon: Clock,
  },
  estable: {
    label: "ESTABLE",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle,
  },
};

interface UrgencyBadgeProps {
  level: UrgencyLevel;
  size?: "sm" | "md";
}

export default function UrgencyBadge({ level, size = "sm" }: UrgencyBadgeProps) {
  const c = config[level];
  const Icon = c.icon;
  const sizeClasses =
    size === "md"
      ? "px-3 py-1.5 text-xs gap-1.5"
      : "px-2 py-0.5 text-[11px] gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${c.className} ${sizeClasses}`}
    >
      <Icon className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {c.label}
    </span>
  );
}
