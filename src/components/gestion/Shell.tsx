import { ReactNode, useState, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListPlus,
  Table2,
  Settings,
  LogOut,
  BarChart3,
  FileText,
  Stethoscope,
  DollarSign,
  HelpCircle,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  Sun,
  Moon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useUserContext } from "@/lib/gestion/use-auth";
import { useSucursalActiva } from "@/lib/gestion/sucursal-activa";
import { useTheme } from "@/lib/gestion/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import logo from "@/assets/maycenter-logo.png";

const NAV = [
  { to: "/gestion", label: "Inicio", icon: LayoutDashboard, exact: true },
  { to: "/gestion/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/gestion/recepcion", label: "Recepción", icon: ClipboardList },
  { to: "/gestion/prestaciones/nueva", label: "Nueva prestación", icon: ListPlus },
  { to: "/gestion/prestaciones", label: "Prestaciones", icon: Table2 },
  { to: "/gestion/odontologos", label: "Odontólogos", icon: Stethoscope },
  { to: "/gestion/precios", label: "Precios", icon: DollarSign },
  { to: "/gestion/reportes/diario", label: "Reporte diario", icon: FileText },
  { to: "/gestion/reportes/ioma", label: "Reporte IOMA", icon: FileText },
  { to: "/gestion/admin", label: "Administración", icon: Settings, adminOnly: true },
  { to: "/gestion/ayuda", label: "Ayuda", icon: HelpCircle },
];

export function GestionShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile, roles, isAdmin } = useUserContext();
  const { sucursales, sucursalId, sucursalNombre, puedeCambiar, setSucursalId } =
    useSucursalActiva();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("gestion_sidebar_collapsed") === "1");
  }, []);

  useEffect(() => {
    import("@/lib/gestion/tour").then((m) => m.maybeStartTourForNewUser());
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("gestion_sidebar_collapsed", next ? "1" : "0");
      return next;
    });

  const handleLogout = async () => {
    await authClient.signOut();
    navigate({ to: "/gestion/login" });
  };

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card h-screen sticky top-0 transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "py-5 border-b flex items-center",
            collapsed ? "px-2 justify-center" : "px-5",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={logo}
              alt="Maycenter"
              className="h-9 w-9 rounded-lg object-contain shrink-0"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Maycenter</div>
                <div className="text-xs text-muted-foreground truncate">Gestión clínica</div>
              </div>
            )}
          </div>
        </div>

        {sucursales.length > 0 && (
          <div
            className={cn("border-b", collapsed ? "px-2 py-3 flex justify-center" : "px-4 py-3")}
          >
            {collapsed ? (
              <Building2
                className="h-4 w-4 text-muted-foreground"
                data-tour="sucursal"
                aria-label={sucursalNombre}
              />
            ) : puedeCambiar ? (
              <div data-tour="sucursal">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Sucursal
                </div>
                <Select value={sucursalId} onValueChange={setSucursalId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" data-tour="sucursal">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{sucursalNombre}</span>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <button
            type="button"
            data-tour="sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className={cn(
              "flex items-center gap-3 rounded-md py-2 text-sm w-full text-muted-foreground hover:bg-accent transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && "Colapsar menú"}
          </button>

          {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon;
            const active = item.exact ? path === item.to : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-tour={item.to.split("/").pop()}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
                  collapsed ? "justify-center px-0" : "px-3",
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t space-y-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                title="Cambiar tema"
                aria-label="Cambiar tema"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleLogout}
                title="Salir"
                aria-label="Salir"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">
                    {profile?.nombre || "Usuario"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roles.join(", ") || "sin rol"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggle}
                  title="Cambiar tema"
                  aria-label="Cambiar tema"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Maycenter" className="h-6 w-6 rounded object-contain" />
            <span className="font-semibold">Maycenter</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
