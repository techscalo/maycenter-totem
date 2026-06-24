import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/lib/gestion/use-auth";
import {
  listSucursales,
  listPisos,
  listOdontologos,
  listObrasSociales,
  listNomencladores,
  listServiciosParticulares,
  createAtencion,
} from "@/lib/gestion/data.server";

export const Route = createFileRoute("/_app/gestion/prestaciones/nueva")({
  component: NuevaPrestacion,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type LineItem = {
  key: string;
  nomencladorId: string;
  servicioParticularId: string;
  codigoManual: string;
  descripcionManual: string;
  cantidad: number;
  monto: number;
  montoUsd: string | number;
  cotizacionUsd: string | number;
};

const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(),
  nomencladorId: "",
  servicioParticularId: "",
  codigoManual: "",
  descripcionManual: "",
  cantidad: 1,
  monto: 0,
  montoUsd: "",
  cotizacionUsd: "",
});

const emptyHeader = (sucursalDefault: string) => ({
  fecha: todayISO(),
  paciente: "",
  dni: "",
  sucursal_id: sucursalDefault,
  obra_social_id: "",
  plan: "",
  piso_id: "",
  odontologo_id: "",
  codigo_consulta: "",
  primera_vez: false,
  observaciones: "",
});

function NuevaPrestacion() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useUserContext();
  const [header, setHeader] = useState(emptyHeader(""));
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  const { data: sucursales = [] } = useQuery({
    queryKey: ["sucursales"],
    queryFn: () => listSucursales(),
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras_sociales_activas"],
    queryFn: async () => (await listObrasSociales()).filter((o) => o.activa),
  });
  const { data: pisos = [] } = useQuery({
    queryKey: ["pisos", header.sucursal_id],
    enabled: !!header.sucursal_id,
    queryFn: () => listPisos({ data: { sucursalId: header.sucursal_id } }),
  });
  const { data: odontologos = [] } = useQuery({
    queryKey: ["odontologos", "activos"],
    queryFn: () => listOdontologos({ data: { soloActivos: true } }),
  });

  const selectedObra: any = useMemo(
    () => obras.find((o: any) => o.id === header.obra_social_id),
    [obras, header.obra_social_id],
  );
  const isParticular = !!selectedObra?.esParticular;

  const { data: nomencladores = [] } = useQuery({
    queryKey: ["nomencladores", header.obra_social_id],
    enabled: !!header.obra_social_id && !isParticular,
    queryFn: () => listNomencladores({ data: { obraSocialId: header.obra_social_id } }),
  });
  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios_particulares"],
    enabled: isParticular,
    queryFn: () => listServiciosParticulares(),
  });

  // Planes disponibles dentro de la OS (OSDE, Biomed). Si hay, se filtra por plan.
  const planes = useMemo(
    () => [...new Set((nomencladores as any[]).map((n) => n.plan).filter(Boolean))],
    [nomencladores],
  );
  const nomencladoresFiltrados = useMemo(
    () => (header.plan ? (nomencladores as any[]).filter((n) => n.plan === header.plan) : nomencladores),
    [nomencladores, header.plan],
  );

  // Sucursal por defecto: sucursal del perfil > única sucursal
  useEffect(() => {
    if (header.sucursal_id) return;
    if (profile?.sucursalId) {
      setHeader((h) => ({ ...h, sucursal_id: profile.sucursalId! }));
    } else if (sucursales.length === 1) {
      setHeader((h) => ({ ...h, sucursal_id: (sucursales[0] as any).id }));
    }
  }, [profile?.sucursalId, sucursales, header.sucursal_id]);

  const patchItem = (key: string, patch: Partial<LineItem>) =>
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const onNomencladorChange = (key: string, id: string) => {
    const nom: any = nomencladores.find((n: any) => n.id === id);
    patchItem(key, { nomencladorId: id, monto: nom ? Number(nom.monto) : 0 });
  };

  const onServicioChange = (key: string, id: string) => {
    const s: any = servicios.find((x: any) => x.id === id);
    patchItem(key, { servicioParticularId: id, montoUsd: s ? Number(s.precioUsd) : "" });
  };

  const onObraChange = (id: string) => {
    setHeader((h) => ({ ...h, obra_social_id: id, plan: "" }));
    setItems([emptyLine()]); // el tipo de línea cambia según particular o no
  };

  const totalArs = items.reduce((s, it) => s + Number(it.monto || 0) * (it.cantidad || 1), 0);
  const totalUsd = items.reduce((s, it) => s + Number(it.montoUsd || 0) * (it.cantidad || 1), 0);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!header.paciente.trim()) throw new Error("Ingresá el nombre del paciente");
      if (!header.dni.trim()) throw new Error("Ingresá el DNI");
      if (!header.sucursal_id) throw new Error("Elegí sucursal");
      if (!header.obra_social_id) throw new Error("Elegí obra social");
      if (!header.odontologo_id) throw new Error("Elegí odontólogo");

      const validItems = items.filter(
        (it) =>
          it.nomencladorId ||
          it.servicioParticularId ||
          it.codigoManual.trim() ||
          it.descripcionManual.trim(),
      );
      if (validItems.length === 0) throw new Error("Agregá al menos una prestación");

      return createAtencion({
        data: {
          fecha: header.fecha,
          paciente: header.paciente,
          dni: header.dni,
          sucursalId: header.sucursal_id,
          obraSocialId: header.obra_social_id,
          pisoId: header.piso_id || null,
          odontologoId: header.odontologo_id,
          codigoConsulta: header.codigo_consulta || null,
          primeraVez: header.primera_vez,
          observaciones: header.observaciones || null,
          items: validItems.map((it) => ({
            nomencladorId: it.nomencladorId || null,
            servicioParticularId: it.servicioParticularId || null,
            codigoManual: it.codigoManual || null,
            descripcionManual: it.descripcionManual || null,
            cantidad: Number(it.cantidad) || 1,
            monto: Number(it.monto) || 0,
            montoUsd: it.montoUsd === "" ? null : Number(it.montoUsd),
            cotizacionUsd: it.cotizacionUsd === "" ? null : Number(it.cotizacionUsd),
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Atención guardada");
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
      qc.invalidateQueries({ queryKey: ["gestion-home-stats"] });
      navigate({ to: "/gestion/prestaciones" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva atención</h1>
        <p className="text-sm text-muted-foreground">
          Cargá los datos del paciente y todas sus prestaciones.
        </p>
      </div>

      {/* Cabecera */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={header.fecha}
                onChange={(e) => setHeader({ ...header, fecha: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Paciente</Label>
              <Input
                value={header.paciente}
                onChange={(e) => setHeader({ ...header, paciente: e.target.value })}
                placeholder="Nombre y apellido"
                autoFocus
              />
            </div>

            <div>
              <Label>DNI</Label>
              <Input
                inputMode="numeric"
                value={header.dni}
                onChange={(e) => setHeader({ ...header, dni: e.target.value.replace(/\D/g, "") })}
              />
            </div>
            <div>
              <Label>Código de consulta</Label>
              <Input
                value={header.codigo_consulta}
                onChange={(e) => setHeader({ ...header, codigo_consulta: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 h-10 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={header.primera_vez}
                  onChange={(e) => setHeader({ ...header, primera_vez: e.target.checked })}
                />
                <span className="text-sm">Primera vez (paciente nuevo)</span>
              </label>
            </div>

            <div>
              <Label>Sucursal</Label>
              <Combobox
                options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))}
                value={header.sucursal_id}
                onChange={(v) => setHeader({ ...header, sucursal_id: v, piso_id: "", odontologo_id: "" })}
              />
            </div>
            <div>
              <Label>Piso</Label>
              <Combobox
                options={pisos.map((p: any) => ({ value: p.id, label: p.nombre }))}
                value={header.piso_id}
                onChange={(v) => setHeader({ ...header, piso_id: v })}
                disabled={!header.sucursal_id}
                placeholder={header.sucursal_id ? "Elegir…" : "Elegí sucursal primero"}
              />
            </div>
            <div>
              <Label>Odontólogo</Label>
              <Combobox
                options={odontologos.map((o: any) => ({
                  value: o.id,
                  label: `${o.nombre}${o.numeroOd ? ` (${o.numeroOd})` : ""}`,
                }))}
                value={header.odontologo_id}
                onChange={(v) => setHeader({ ...header, odontologo_id: v })}
              />
            </div>

            <div className={planes.length > 0 ? "md:col-span-2" : "md:col-span-3"}>
              <Label>Obra social</Label>
              <Combobox
                options={obras.map((o: any) => ({
                  value: o.id,
                  label: `${o.nombre}${o.esParticular ? " (particular)" : ""}`,
                }))}
                value={header.obra_social_id}
                onChange={onObraChange}
              />
            </div>
            {planes.length > 0 && (
              <div>
                <Label>Plan</Label>
                <Combobox
                  options={planes.map((p) => ({ value: p, label: p }))}
                  value={header.plan}
                  onChange={(v) => { setHeader((h) => ({ ...h, plan: v })); setItems([emptyLine()]); }}
                  placeholder="Elegir plan…"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Prestaciones (líneas) */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Prestaciones</h2>
              <p className="text-xs text-muted-foreground">
                {isParticular
                  ? "Servicios particulares (precio en USD)."
                  : header.obra_social_id
                    ? "Códigos del nomenclador (precio en ARS)."
                    : "Elegí una obra social para cargar prestaciones."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!header.obra_social_id}
              onClick={() => setItems((arr) => [...arr, emptyLine()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Agregar línea
            </Button>
          </div>

          {items.map((it, idx) => (
            <div key={it.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Línea {idx + 1}</span>
                {items.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setItems((arr) => arr.filter((x) => x.key !== it.key))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {!header.obra_social_id ? (
                <p className="text-sm text-muted-foreground">Elegí obra social primero.</p>
              ) : isParticular ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6">
                    <Label>Servicio particular</Label>
                    <Combobox
                      options={servicios.map((s: any) => ({
                        value: s.id,
                        label: `${s.codigo ? `${s.codigo} — ` : ""}${s.descripcion} (U$D ${Number(s.precioUsd).toLocaleString("es-AR")})`,
                      }))}
                      value={it.servicioParticularId}
                      onChange={(v) => onServicioChange(it.key, v)}
                      placeholder={servicios.length === 0 ? "Sin servicios — usá manual" : "Elegir servicio…"}
                      searchPlaceholder="Buscar servicio…"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) => patchItem(it.key, { cantidad: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Monto USD</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.montoUsd}
                      onChange={(e) => patchItem(it.key, { montoUsd: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Cotización</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.cotizacionUsd}
                      onChange={(e) => patchItem(it.key, { cotizacionUsd: e.target.value })}
                      placeholder="ARS/USD"
                    />
                  </div>
                  {!it.servicioParticularId && (
                    <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Código (manual)</Label>
                        <Input
                          value={it.codigoManual}
                          onChange={(e) => patchItem(it.key, { codigoManual: e.target.value })}
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <Label>Descripción (manual)</Label>
                        <Input
                          value={it.descripcionManual}
                          onChange={(e) => patchItem(it.key, { descripcionManual: e.target.value })}
                          placeholder="Servicio realizado"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-7">
                    <Label>Código de prestación</Label>
                    <Combobox
                      options={nomencladoresFiltrados.map((n: any) => ({
                        value: n.id,
                        label: `${n.codigo} — ${n.descripcion} ($${Number(n.monto).toLocaleString("es-AR")})`,
                      }))}
                      value={it.nomencladorId}
                      onChange={(v) => onNomencladorChange(it.key, v)}
                      placeholder={
                        planes.length > 0 && !header.plan
                          ? "Elegí un plan primero"
                          : nomencladoresFiltrados.length === 0
                            ? "Sin códigos — usá manual"
                            : "Elegir código…"
                      }
                      searchPlaceholder="Buscar código o prestación…"
                      disabled={planes.length > 0 && !header.plan}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) => patchItem(it.key, { cantidad: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label>Monto ARS</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.monto}
                      onChange={(e) => patchItem(it.key, { monto: Number(e.target.value) || 0 })}
                    />
                  </div>
                  {!it.nomencladorId && (
                    <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Código (manual)</Label>
                        <Input
                          value={it.codigoManual}
                          onChange={(e) => patchItem(it.key, { codigoManual: e.target.value })}
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <Label>Descripción (manual)</Label>
                        <Input
                          value={it.descripcionManual}
                          onChange={(e) => patchItem(it.key, { descripcionManual: e.target.value })}
                          placeholder="Prestación realizada"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="md:col-span-3">
            <Label>Observaciones</Label>
            <Input
              value={header.observaciones}
              onChange={(e) => setHeader({ ...header, observaciones: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t text-sm">
            <div className="text-muted-foreground">
              Total: <b className="text-foreground">${totalArs.toLocaleString("es-AR")}</b>
              {totalUsd > 0 && (
                <>
                  {" · "}
                  <b className="text-foreground">U$D {totalUsd.toLocaleString("es-AR")}</b>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate({ to: "/gestion/prestaciones" })}>
                Cancelar
              </Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "Guardando…" : "Guardar atención"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
