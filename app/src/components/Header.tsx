import { Link, useNavigate } from "react-router";
import { Plus, LogIn, LogOut, Shield, User, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

export default function Header() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-zinc-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-red-700 font-bold text-base tracking-tight">
                MedVene
              </span>
              <span className="text-zinc-400 text-[10px] hidden sm:block -mt-0.5">
                Ayuda Médica Venezuela
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-3">
            <Button
              onClick={() => navigate("/solicitar")}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5 h-9 px-4 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Nueva Solicitud
            </Button>

            {isAdmin && (
              <Link to="/admin">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-zinc-300"
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </Button>
              </Link>
            )}

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-zinc-400" />
                  {user?.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="h-9 gap-1.5 text-zinc-500"
                >
                  <LogOut className="w-4 h-4" />
                  Salir
                </Button>
              </div>
            ) : (
              // <Button
              //   variant="outline"
              //   size="sm"
              //   onClick={() => navigate("/login")}
              //   className="h-9 gap-1.5 border-zinc-300"
              // >
              //   <LogIn className="w-4 h-4" />
              //   Ingresar
              // </Button>
              <></>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="sm:hidden p-2 text-zinc-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-zinc-100 py-3 space-y-2">
            <Button
              onClick={() => {
                navigate("/solicitar");
                setMobileMenuOpen(false);
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white gap-2 h-11"
            >
              <Plus className="w-4 h-4" />
              Nueva Solicitud
            </Button>

            {isAuthenticated ? (
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-600">
                  <User className="w-4 h-4" />
                  {user?.name}
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 h-10"
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </Button>
              </div>
            ) : (
              // <Button
              //   variant="outline"
              //   className="w-full gap-2 h-10 mt-2"
              //   onClick={() => {
              //     navigate("/login");
              //     setMobileMenuOpen(false);
              //   }}
              // >
              //   <LogIn className="w-4 h-4" />
              //   Ingresar
              // </Button>
              <></>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
