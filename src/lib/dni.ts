// Validación y normalización de DNI, compartida entre tótem, turnos manuales y prestaciones.
// Regla: solo dígitos, entre 6 y 9 (cubre DNI viejos y nuevos, sin puntos).

export function normalizeDni(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function isValidDni(raw: string): boolean {
  const d = normalizeDni(raw);
  return d.length >= 6 && d.length <= 9;
}

export const DNI_ERROR = "Ingresá un DNI válido (6 a 9 dígitos, sin puntos)";
