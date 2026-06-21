import { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ListPlus,
  Table2,
  Settings,
  LogOut,
  BarChart3,
  FileText,
  Stethoscope,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useUserContext } from "@/lib/gestion/use-auth";
import { useClinicaActiva } from "@/lib/gestion/clinica";
import { listSucursales } from "@/lib/gestion/data.server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logo from "@/assets/maycenter-logo.png";

const NAV = [
  { to: "/gestion", label: "Inicio", icon: LayoutDashboard, exact: true },
  { to: "/gestion/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/gestion/prestaciones/nueva", label: "Nueva prestación", icon: ListPlus },
  { to: "/gestion/prestaciones", label: "Prestaciones", icon: Table2 },
  { to: "/gestion/odontologos", label: "Odontólogos", icon: Stethoscope },
  { to: "/gestion/reportes/diario", label: "Reporte diario", icon: FileText },
  { to: "/gestion/reportes/ioma", label: "Reporte IOMA", icon: FileText },
  { to: "/gestion/admin", label: "Administración", icon: Settings, adminOnly: true },
];

export function GestionShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile, roles, isAdmin } = useUserContext();
  const [clinica, setClinica] = useClinicaActiva();
  const { data: sucursales = [] } = useQuery({ queryKey: ["sucursales"], queryFn: () => listSucursales() });

  const handleLogout = async () => {
    await authClient.signOut();
    navigate({ to: "/gestion/login" });
  };

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Maycenter" className="h-9 w-9 rounded-lg object-contain" />
            <div>
              <div className="text-sm font-semibold">Maycenter</div>
              <div className="text-xs text-muted-foreground">Gestión clínica</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon;
            const active = item.exact ? path === item.to : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t space-y-2">
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Clínica activa
            </div>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={clinica}
              onChange={(e) => setClinica(e.target.value)}
            >
              <option value="">Todas / sin fijar</option>
              {sucursales.map((s: any) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="px-2 text-xs text-muted-foreground truncate">
            {profile?.nombre || "Usuario"}
          </div>
          <div className="px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            {roles.join(", ") || "sin rol"}
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Salir
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Maycenter" className="h-6 w-6 rounded object-contain" />
            <span className="font-semibold">Maycenter</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
