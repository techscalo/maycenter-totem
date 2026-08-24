// Helpers de cálculo para reportes/dashboard.
// Una "fila" (r) es un item de la vista plana de listPrestaciones: precio unitario en `monto`
// y `monto_usd`, con `cantidad` aparte. Estos helpers evitan repetir el `* cantidad` en cada
// agregado (bug: los reportes sumaban el unitario sin multiplicar por la cantidad).

export function montoLinea(r: { monto?: number | null; cantidad?: number | null }): number {
  return Number(r.monto || 0) * Number(r.cantidad || 1);
}

export function montoUsdLinea(r: { monto_usd?: number | null; cantidad?: number | null }): number {
  return Number(r.monto_usd || 0) * Number(r.cantidad || 1);
}

// Copago a cargo del paciente (monto_paciente por cantidad). 0 si la OS no tiene desglose.
export function copagoLinea(r: {
  monto_paciente?: number | null;
  cantidad?: number | null;
}): number {
  return Number(r.monto_paciente || 0) * Number(r.cantidad || 1);
}

// Parte a cargo de la obra social = arancel total − copago del paciente.
// Sin desglose (monto_paciente null), toda la línea se factura a la OS.
export function facturacionOsLinea(r: {
  monto?: number | null;
  monto_paciente?: number | null;
  cantidad?: number | null;
}): number {
  return montoLinea(r) - copagoLinea(r);
}

// Solo cuenta como facturado lo que entra a la caja (facturable !== false).
export function esFacturable(r: { facturable?: boolean | null }): boolean {
  return r.facturable !== false;
}
