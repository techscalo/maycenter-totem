// Códigos de nomenclador con tratamiento especial en reportes.
// Confirmar con el cliente si hay más códigos de incrustación.
export const CODIGO_PLACA_MIO = "806";
export const CODIGOS_INCRUSTACION = ["40103"];
export const CODIGO_CONSULTA = "101";

// Normaliza códigos para comparar (en el sheet aparecen como "0806", en la base "806").
const norm = (c?: string | null) => (c ?? "").trim().replace(/^0+/, "");

export function esPlacaMio(codigo?: string | null, descripcion?: string | null): boolean {
  if (norm(codigo) === CODIGO_PLACA_MIO) return true;
  return (descripcion ?? "").toUpperCase().includes("PLACA MIO");
}

export function esIncrustacion(codigo?: string | null, descripcion?: string | null): boolean {
  if (CODIGOS_INCRUSTACION.includes(norm(codigo))) return true;
  return (descripcion ?? "").toUpperCase().includes("INCRUSTACION");
}

// --- Sub-tipos de prestación (desplegable en la línea de carga) ---------------
// Reusan la columna `atencion_items.estado_placa` (texto libre) como "sub-tipo".
// Placa MIO: etapa del trabajo. Prótesis: tipo de prótesis.

export const ESTADO_PLACA_OPCIONES = [
  { value: "impresion", label: "Impresión" },
  { value: "entrega", label: "Entrega" },
  { value: "reimpresion", label: "Reimpresión" },
] as const;

export const TIPO_PROTESIS_OPCIONES = [
  { value: "completa", label: "Completa" },
  { value: "parcial", label: "Parcial" },
  { value: "cromo_cobalto", label: "Cromo cobalto" },
  { value: "flexible", label: "Flexible" },
  { value: "provisoria", label: "Provisoria" },
] as const;

// Todos los valores válidos del campo sub-tipo (para validación en el server).
export const SUBTIPO_VALUES = [
  ...ESTADO_PLACA_OPCIONES.map((o) => o.value),
  ...TIPO_PROTESIS_OPCIONES.map((o) => o.value),
] as [string, ...string[]];

export const SUBTIPO_LABEL: Record<string, string> = Object.fromEntries(
  [...ESTADO_PLACA_OPCIONES, ...TIPO_PROTESIS_OPCIONES].map((o) => [o.value, o.label]),
);

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function esProtesis(codigo?: string | null, descripcion?: string | null): boolean {
  void codigo;
  return sinAcentos((descripcion ?? "").toUpperCase()).includes("PROTESIS");
}
