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

// Solo cuenta como facturado lo que entra a la caja (facturable !== false).
export function esFacturable(r: { facturable?: boolean | null }): boolean {
  return r.facturable !== false;
}
