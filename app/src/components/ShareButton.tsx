import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShareButtonProps {
  url: string;
  title: string;
  text: string;
  phone?: string;
}

export default function ShareButton({ url, title, text, phone }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;

  const waShareUrl = phone
    ? `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${text}\n\n${fullUrl}`)}`
    : null;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch {
        // User cancelled or share failed, fall through to dialog
      }
    }
    setOpen(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = fullUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 text-xs gap-1.5 border-zinc-300"
        onClick={handleShare}
      >
        <Share2 className="w-3.5 h-3.5" />
        Compartir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Compartir solicitud</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              <p className="text-sm font-medium text-zinc-900 mb-1">{title}</p>
              <p className="text-xs text-zinc-500">{text}</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="flex-1 text-xs p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-600"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar
                  </>
                )}
              </Button>
            </div>

            {waShareUrl && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                onClick={() => window.open(waShareUrl, "_blank")}
              >
                Compartir por WhatsApp
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
