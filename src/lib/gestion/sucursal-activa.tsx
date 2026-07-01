import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserContext } from "@/lib/gestion/use-auth";

type Sucursal = { id: string; nombre: string };

type SucursalActivaCtx = {
  /** Sucursales asignadas al usuario. */
  sucursales: Sucursal[];
  /** Id de la sede activa (siempre una de las asignadas), o "" si no hay ninguna. */
  sucursalId: string;
  /** Nombre de la sede activa. */
  sucursalNombre: string;
  /** Puede cambiar de sede (tiene 2+ asignadas). */
  puedeCambiar: boolean;
  setSucursalId: (id: string) => void;
};

const Ctx = createContext<SucursalActivaCtx | null>(null);
const STORAGE_KEY = "gestion_sucursal_activa";

export function SucursalActivaProvider({ children }: { children: ReactNode }) {
  const { sucursales } = useUserContext();
  const [sucursalId, setSucursalIdState] = useState("");

  // Inicializa/valida la sede activa contra las asignadas (lee la guardada si sigue siendo válida).
  useEffect(() => {
    if (!sucursales.length) return;
    const ids = sucursales.map((s) => s.id);
    if (sucursalId && ids.includes(sucursalId)) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setSucursalIdState(stored && ids.includes(stored) ? stored : ids[0]);
  }, [sucursales, sucursalId]);

  const setSucursalId = (id: string) => {
    setSucursalIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<SucursalActivaCtx>(() => {
    const activa = sucursales.find((s) => s.id === sucursalId);
    return {
      sucursales,
      sucursalId,
      sucursalNombre: activa?.nombre ?? "",
      puedeCambiar: sucursales.length > 1,
      setSucursalId,
    };
  }, [sucursales, sucursalId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSucursalActiva() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSucursalActiva debe usarse dentro de SucursalActivaProvider");
  return ctx;
}
