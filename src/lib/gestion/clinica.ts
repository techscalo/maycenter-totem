import { useEffect, useState } from "react";

const KEY = "maycenter_clinica_activa";

// Clínica/sucursal "activa" elegida por el usuario para trabajar (persistida localmente).
export function useClinicaActiva(): [string, (id: string) => void] {
  const [id, setId] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setId(localStorage.getItem(KEY) ?? "");
    }
  }, []);

  const set = (value: string) => {
    setId(value);
    if (typeof window !== "undefined") {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    }
  };

  return [id, set];
}
