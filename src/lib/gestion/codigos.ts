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
