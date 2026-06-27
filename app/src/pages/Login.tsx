import { useState } from "react";
import { Link } from "react-router";
import { LogIn, UserPlus, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: (data) => {
      if (data.success && data.token) {
        localStorage.setItem("local_auth_token", data.token);
        window.location.href = "/";
      } else {
        setError(data.error ?? "Error al iniciar sesión");
      }
    },
  });

  const registerMutation = trpc.localAuth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.token) {
        localStorage.setItem("local_auth_token", data.token);
        window.location.href = "/";
      } else {
        setError(data.error ?? "Error al registrarse");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "login") {
      if (!username.trim() || !password.trim()) {
        setError("Completa todos los campos");
        return;
      }
      loginMutation.mutate({ username: username.trim(), password });
    } else {
      if (!username.trim() || !password.trim() || !displayName.trim()) {
        setError("Completa todos los campos");
        return;
      }
      if (username.length < 3) {
        setError("El usuario debe tener al menos 3 caracteres");
        return;
      }
      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres");
        return;
      }
      registerMutation.mutate({
        username: username.trim(),
        password,
        displayName: displayName.trim(),
      });
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="max-w-md mx-auto px-4 py-8">
        {/* Back */}
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 text-center border-b border-zinc-100">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-red-700 font-bold text-lg">M</span>
            </div>
            <h1 className="text-lg font-bold text-zinc-900">MedVene</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {mode === "login"
                ? "Ingresa para gestionar solicitudes"
                : "Crea una cuenta para publicar y gestionar"}
            </p>
          </div>

          <div className="p-6">
            {/* Mode tabs */}
            <div className="flex rounded-xl bg-zinc-100 p-1 mb-6">
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  mode === "login"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <LogIn className="w-4 h-4" />
                Ingresar
              </button>
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  mode === "register"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Crear Cuenta
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Nombre completo
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Dr. Juan Pérez"
                    className="h-12"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Usuario
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario123"
                  className="h-12"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Contraseña
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="h-12"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white h-12 gap-2"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando...
                  </>
                ) : mode === "login" ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    Ingresar
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Crear Cuenta
                  </>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-zinc-400">o</span>
              </div>
            </div>

            {/* OAuth */}
            <Button
              variant="outline"
              className="w-full h-12 gap-2 border-zinc-300"
              onClick={() => {
                window.location.href = getOAuthUrl();
              }}
            >
              Ingresar con Kimi
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-6">
          No necesitas cuenta para crear o ver solicitudes. La autenticación es
          opcional para funciones avanzadas.
        </p>
      </main>
    </div>
  );
}
