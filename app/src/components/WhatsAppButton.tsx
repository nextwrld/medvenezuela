import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhatsAppButtonProps {
  phone: string;
  message?: string;
  size?: "sm" | "md";
  variant?: "default" | "outline";
}

export default function WhatsAppButton({
  phone,
  message,
  size = "sm",
  variant = "default",
}: WhatsAppButtonProps) {
  const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "");
  const defaultMessage =
    message ||
    "Hola, vi tu solicitud en MedVenezuela. Quiero ayudar con el medicamento que necesitas.";
  const waUrl = `https://wa.me/58${cleanPhone}?text=${encodeURIComponent(defaultMessage)}`;

  const sizeClasses = size === "md" ? "h-11 px-4 text-sm" : "h-9 px-3 text-xs";

  return (
    <Button
      variant={variant}
      className={`bg-green-600 hover:bg-green-700 text-white gap-2 ${sizeClasses}`}
      onClick={() => window.open(waUrl, "_blank")}
    >
      <Phone className="w-4 h-4" />
      {size === "md" ? "Contactar por WhatsApp" : "WhatsApp"}
    </Button>
  );
}
