import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  ChevronRight,
  Pill,
  Building2,
  Phone,
  User,
  FileText,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import Header from "@/components/Header";
import { ESTADOS_VENEZUELA } from "@db/seed";
import { coordsFromPosition, formatCoords } from "@/lib/geo";
import { getMunicipios } from "@db/municipios";

const UbicacionPicker = lazy(() => import("@/components/UbicacionPicker"));

type FormData = {
  medicamento: string;
  principioActivo: string;
  cantidad: string;
  dosis: string;
  hospital: string;
  estado: string;
  ciudad: string;
  telefono: string;
  nombreSolicitante: string;
  rolSolicitante: "medico" | "familiar" | "personal_salud" | "";
  inicialesPaciente: string;
  urgencia: "critico" | "moderado" | "estable";
  notas: string;
  latitud: number | null;
  longitud: number | null;
};

const initialForm: FormData = {
  medicamento: "",
  principioActivo: "",
  cantidad: "",
  dosis: "",
  hospital: "",
  estado: "",
  ciudad: "",
  telefono: "",
  nombreSolicitante: "",
  rolSolicitante: "",
  inicialesPaciente: "",
  urgencia: "moderado",
  notas: "",
  latitud: null,
  longitud: null,
};

export default function NuevaSolicitud() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<
    { id: number; pinGestion: string; pinCierre: string } | null
  >(null);
  const [copiedPinCierre, setCopiedPinCierre] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const setCoords = (coords: { lat: number; lng: number } | null) => {
    setForm((prev) => ({
      ...prev,
      latitud: coords ? coords.lat : null,
      longitud: coords ? coords.lng : null,
    }));
  };

  const handleUsarMiUbicacion = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no permite obtener la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords(coordsFromPosition(pos)),
      () =>
        setGeoError(
          "No se pudo obtener tu ubicación. Podés marcarla en el mapa.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const createMutation = trpc.solicitudes.create.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setSubmitted(true);
    },
  });

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!form.medicamento.trim()) newErrors.medicamento = "Campo requerido";
    if (!form.principioActivo.trim()) newErrors.principioActivo = "Campo requerido";
    if (!form.cantidad.trim()) newErrors.cantidad = "Campo requerido";
    if (!form.hospital.trim()) newErrors.hospital = "Campo requerido";
    if (!form.estado) newErrors.estado = "Selecciona un estado";
    if (!form.ciudad.trim()) newErrors.ciudad = "Selecciona un municipio";
    if (!form.telefono.trim()) newErrors.telefono = "Campo requerido";
    if (!form.nombreSolicitante.trim())
      newErrors.nombreSolicitante = "Campo requerido";
    if (!form.rolSolicitante) newErrors.rolSolicitante = "Selecciona un rol";

    // Phone validation - Venezuelan format
    const phoneClean = form.telefono.replace(/\D/g, "");
    if (phoneClean.length < 10) {
      newErrors.telefono = "Mínimo 10 dígitos";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate({
      medicamento: form.medicamento.trim(),
      principioActivo: form.principioActivo.trim(),
      cantidad: form.cantidad.trim(),
      dosis: form.dosis.trim() || undefined,
      hospital: form.hospital.trim(),
      estado: form.estado,
      ciudad: form.ciudad.trim(),
      telefono: form.telefono.trim(),
      nombreSolicitante: form.nombreSolicitante.trim(),
      rolSolicitante: form.rolSolicitante as "medico" | "familiar" | "personal_salud",
      inicialesPaciente: form.inicialesPaciente.trim() || undefined,
      urgencia: form.urgencia,
      notas: form.notas.trim() || undefined,
      latitud: form.latitud ?? undefined,
      longitud: form.longitud ?? undefined,
    });
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Al cambiar de estado, el municipio (campo `ciudad`) deja de ser válido —
  // se resetea para forzar una nueva selección del catálogo del nuevo estado.
  const handleEstadoChange = (estado: string) => {
    setForm((prev) => ({ ...prev, estado, ciudad: "" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.estado;
      delete next.ciudad;
      return next;
    });
  };

  const copyToClipboard = async (
    text: string,
    type: "pin-cierre" | "link"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "pin-cierre") {
        setCopiedPinCierre(true);
        setTimeout(() => setCopiedPinCierre(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      if (type === "pin-cierre") {
        setCopiedPinCierre(true);
        setTimeout(() => setCopiedPinCierre(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  };

  // ─── Success Screen ───
  if (submitted && result) {
    const link = `${window.location.origin}/solicitud/${result.id}`;
    const waMessage = encodeURIComponent(
      `🚨 Solicitud de medicamento en MedVene\n\nSe necesita: ${form.medicamento}\nPrincipio activo: ${form.principioActivo}\nCantidad: ${form.cantidad}\nHospital: ${form.hospital}\nMunicipio: ${form.ciudad}, ${form.estado}\nContacto: ${form.telefono}\n\nVer solicitud: ${link}`
    );

    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-lg mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            <h1 className="text-xl font-bold text-zinc-900 mb-2">
              Solicitud publicada
            </h1>
            <p className="text-sm text-zinc-500 mb-6">
              Tu solicitud está ahora visible en el feed público. Compártela para
              llegar a más donantes.
            </p>

            {/* PIN de cierre — único código que el usuario necesita
                guardar. El estado se gestiona directamente desde la
                página de detalle sin necesidad del PIN de gestión. */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
                  PIN de cierre (guárdalo — no lo compartas)
                </p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-bold text-amber-800 tracking-widest font-mono">
                    {result.pinCierre}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(result.pinCierre, "pin-cierre")
                    }
                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    {copiedPinCierre ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 mt-2">
                  Usa el PIN de cierre para marcar como recibido
                </p>
              </div>

            {/* Link */}
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 mb-6">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Link de tu solicitud
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={link}
                  className="flex-1 text-xs p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-600"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(link, "link")}
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Share buttons */}
            <div className="space-y-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-11"
                onClick={() =>
                  window.open(`https://wa.me/?text=${waMessage}`, "_blank")
                }
              >
                <Share2 className="w-4 h-4" />
                Compartir por WhatsApp
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 h-11 border-zinc-300"
                onClick={() => navigate(`/solicitud/${result.id}`)}
              >
                Ver solicitud
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 h-10 text-zinc-500"
                onClick={() => {
                  setSubmitted(false);
                  setResult(null);
                  setForm(initialForm);
                }}
              >
                Crear otra solicitud
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Form ───
  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </button>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
          {/* Form header */}
          <div className="p-6 border-b border-zinc-100">
            <h1 className="text-xl font-bold text-zinc-900">
              Solicitar Medicamento
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Completa los datos para publicar tu solicitud en el feed público.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Section 1: Medication */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                  <Pill className="w-3.5 h-3.5 text-red-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wide">
                  Información del Medicamento
                </h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Medicamento requerido <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.medicamento}
                  onChange={(e) => updateField("medicamento", e.target.value)}
                  placeholder="Ej: Paracetamol, Ibuprofeno, Morfina..."
                  className={`h-12 ${errors.medicamento ? "border-red-300" : ""}`}
                />
                {errors.medicamento && (
                  <p className="text-xs text-red-500 mt-1">{errors.medicamento}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Principio activo <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.principioActivo}
                  onChange={(e) => updateField("principioActivo", e.target.value)}
                  placeholder="Ej: Acetaminofén, Ibuprofeno..."
                  className={`h-12 ${errors.principioActivo ? "border-red-300" : ""}`}
                />
                {errors.principioActivo && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.principioActivo}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Cantidad <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={form.cantidad}
                    onChange={(e) => updateField("cantidad", e.target.value)}
                    placeholder="Ej: 10 cajas"
                    className={`h-12 ${errors.cantidad ? "border-red-300" : ""}`}
                  />
                  {errors.cantidad && (
                    <p className="text-xs text-red-500 mt-1">{errors.cantidad}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Dosis / Presentación
                  </label>
                  <Input
                    value={form.dosis}
                    onChange={(e) => updateField("dosis", e.target.value)}
                    placeholder="Ej: 500mg"
                    className="h-12"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Location */}
            <div className="space-y-4 pt-6 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wide">
                  Ubicación y Contacto
                </h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Centro asistencial / Hospital{" "}
                  <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.hospital}
                  onChange={(e) => updateField("hospital", e.target.value)}
                  placeholder="Ej: Hospital Vargas de Caracas"
                  className={`h-12 ${errors.hospital ? "border-red-300" : ""}`}
                />
                {errors.hospital && (
                  <p className="text-xs text-red-500 mt-1">{errors.hospital}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Estado <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.estado}
                    onChange={(e) => handleEstadoChange(e.target.value)}
                    className={`w-full h-12 px-3 rounded-lg border bg-white text-sm ${
                      errors.estado ? "border-red-300" : "border-zinc-300"
                    }`}
                  >
                    <option value="">Seleccionar...</option>
                    {ESTADOS_VENEZUELA.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  {errors.estado && (
                    <p className="text-xs text-red-500 mt-1">{errors.estado}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Municipio <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.ciudad}
                    onChange={(e) => updateField("ciudad", e.target.value)}
                    disabled={!form.estado}
                    className={`w-full h-12 px-3 rounded-lg border bg-white text-sm disabled:bg-zinc-100 disabled:text-zinc-400 ${
                      errors.ciudad ? "border-red-300" : "border-zinc-300"
                    }`}
                  >
                    <option value="">
                      {form.estado
                        ? "Seleccionar..."
                        : "Elige un estado primero"}
                    </option>
                    {getMunicipios(form.estado).map((m) => (
                      <option key={`${m.nombre}-${m.capital}`} value={m.nombre}>
                        {m.nombre} ({m.capital})
                      </option>
                    ))}
                  </select>
                  {errors.ciudad && (
                    <p className="text-xs text-red-500 mt-1">{errors.ciudad}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Ubicación exacta{" "}
                  <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <p className="text-xs text-zinc-500 mb-2">
                  Ayuda a quien dona a llegar con una ruta más clara.
                </p>

                {form.latitud != null && form.longitud != null ? (
                  <div className="flex items-center justify-between gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm text-green-800">
                      Ubicación marcada ✓{" "}
                      <span className="font-mono text-xs text-green-700">
                        {formatCoords(form.latitud, form.longitud)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCoords(null)}
                      className="text-xs text-green-700 underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUsarMiUbicacion}
                      className="h-10 px-3 rounded-lg border border-zinc-300 text-sm bg-white"
                    >
                      📍 Usar mi ubicación
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMap((s) => !s)}
                      className="h-10 px-3 rounded-lg border border-zinc-300 text-sm bg-white"
                    >
                      {showMap ? "Ocultar mapa" : "Marcar en el mapa"}
                    </button>
                  </div>
                )}

                {geoError && (
                  <p className="text-xs text-red-500 mt-1">{geoError}</p>
                )}

                {showMap && form.latitud == null && (
                  <div className="mt-2">
                    <Suspense
                      fallback={
                        <div className="h-64 w-full rounded-lg border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
                          Cargando mapa…
                        </div>
                      }
                    >
                      <UbicacionPicker
                        value={
                          form.latitud != null && form.longitud != null
                            ? { lat: form.latitud, lng: form.longitud }
                            : null
                        }
                        onChange={(c) => {
                          setCoords(c);
                          setShowMap(false);
                        }}
                      />
                    </Suspense>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Teléfono de contacto <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    value={form.telefono}
                    onChange={(e) => updateField("telefono", e.target.value)}
                    placeholder="0412-1234567"
                    className={`h-12 pl-10 ${errors.telefono ? "border-red-300" : ""}`}
                    type="tel"
                  />
                </div>
                {errors.telefono && (
                  <p className="text-xs text-red-500 mt-1">{errors.telefono}</p>
                )}
                <p className="text-xs text-zinc-400 mt-1">
                  Se mostrará públicamente para que los donantes te contacten
                </p>
              </div>
            </div>

            {/* Section 3: Requester */}
            <div className="space-y-4 pt-6 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wide">
                  Solicitante
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={form.nombreSolicitante}
                    onChange={(e) =>
                      updateField("nombreSolicitante", e.target.value)
                    }
                    placeholder="Dr. Juan Pérez"
                    className={`h-12 ${
                      errors.nombreSolicitante ? "border-red-300" : ""
                    }`}
                  />
                  {errors.nombreSolicitante && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.nombreSolicitante}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Rol <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.rolSolicitante}
                    onChange={(e) =>
                      updateField("rolSolicitante", e.target.value)
                    }
                    className={`w-full h-12 px-3 rounded-lg border bg-white text-sm ${
                      errors.rolSolicitante ? "border-red-300" : "border-zinc-300"
                    }`}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="medico">Médico</option>
                    <option value="familiar">Familiar</option>
                    <option value="personal_salud">Personal de Salud</option>
                  </select>
                  {errors.rolSolicitante && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.rolSolicitante}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Iniciales del paciente (opcional)
                </label>
                <Input
                  value={form.inicialesPaciente}
                  onChange={(e) =>
                    updateField("inicialesPaciente", e.target.value)
                  }
                  placeholder="Ej: J.P."
                  className="h-12"
                />
              </div>
            </div>

            {/* Section 4: Urgency */}
            <div className="space-y-4 pt-6 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wide">
                  Nivel de Urgencia
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      value: "critico" as const,
                      label: "Crítico",
                      desc: "Vida en riesgo",
                      className:
                        "border-red-300 bg-red-50 text-red-700 has-[:checked]:bg-red-600 has-[:checked]:text-white has-[:checked]:border-red-600",
                    },
                    {
                      value: "moderado" as const,
                      label: "Moderado",
                      desc: "Necesario pronto",
                      className:
                        "border-orange-300 bg-orange-50 text-orange-700 has-[:checked]:bg-orange-500 has-[:checked]:text-white has-[:checked]:border-orange-500",
                    },
                    {
                      value: "estable" as const,
                      label: "Estable",
                      desc: "Puede esperar",
                      className:
                        "border-green-300 bg-green-50 text-green-700 has-[:checked]:bg-green-600 has-[:checked]:text-white has-[:checked]:border-green-600",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-all ${option.className}`}
                  >
                    <input
                      type="radio"
                      name="urgencia"
                      value={option.value}
                      checked={form.urgencia === option.value}
                      onChange={() => updateField("urgencia", option.value)}
                      className="sr-only"
                    />
                    <p className="font-semibold text-sm">{option.label}</p>
                    <p className="text-[11px] mt-0.5 opacity-80">{option.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* Section 5: Notes */}
            <div className="space-y-4 pt-6 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-zinc-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-zinc-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wide">
                  Notas Adicionales
                </h2>
              </div>

              <Textarea
                value={form.notas}
                onChange={(e) => updateField("notas", e.target.value)}
                placeholder="Información adicional relevante..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Submit */}
            <div className="pt-6 border-t border-zinc-100">
              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white h-13 text-base font-semibold gap-2"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Publicando...
                  </>
                ) : (
                  <>
                    Publicar Solicitud
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
              <p className="text-xs text-zinc-400 text-center mt-3">
                Al publicar, tu solicitud será visible públicamente para que los
                donantes puedan contactarte.
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
