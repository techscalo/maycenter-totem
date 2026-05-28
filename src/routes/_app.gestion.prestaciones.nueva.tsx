import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useUserContext } from "@/lib/gestion/use-auth";

export const Route = createFileRoute("/_app/gestion/prestaciones/nueva")({
  component: NuevaPrestacion,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (sucursalDefault: string) => ({
  fecha: todayISO(),
  paciente: "",
  dni: "",
  sucursal_id: sucursalDefault,
  obra_social_id: "",
  piso_id: "",
  odontologo_id: "",
  nomenclador_id: "",
  codigo_manual: "",
  descripcion_manual: "",
  cantidad: 1,
  monto: 0,
  monto_usd: "" as string | number,
  cotizacion_usd: "" as string | number,
  observaciones: "",
});

function NuevaPrestacion() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, user } = useUserContext();
  const [form, setForm] = useState(emptyForm(""));

  const { data: sucursales = [] } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await supabase.from("sucursales").select("*").order("nombre")).data ?? [],
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras_sociales_activas"],
    queryFn: async () => (await supabase.from("obras_sociales").select("*").eq("activa", true).order("nombre")).data ?? [],
  });
  const { data: pisos = [] } = useQuery({
    queryKey: ["pisos", form.sucursal_id],
    enabled: !!form.sucursal_id,
    queryFn: async () => (await supabase.from("pisos").select("*").eq("sucursal_id", form.sucursal_id).order("nombre")).data ?? [],
  });
  const { data: odontologos = [] } = useQuery({
    queryKey: ["odontologos", form.sucursal_id, form.piso_id],
    enabled: !!form.sucursal_id,
    queryFn: async () => {
      let q = supabase.from("odontologos").select("*").eq("sucursal_id", form.sucursal_id).eq("activo", true);
      if (form.piso_id) q = q.eq("piso_id", form.piso_id);
      return (await q.order("nombre")).data ?? [];
    },
  });
  const { data: nomencladores = [] } = useQuery({
    queryKey: ["nomencladores", form.obra_social_id],
    enabled: !!form.obra_social_id,
    queryFn: async () => (await supabase.from("nomencladores").select("*").eq("obra_social_id", form.obra_social_id).eq("activo", true).order("codigo")).data ?? [],
  });

  const selectedObra: any = useMemo(
    () => obras.find((o: any) => o.id === form.obra_social_id),
    [obras, form.obra_social_id],
  );
  const isParticular = !!selectedObra?.es_particular;

  // Sucursal por defecto desde el perfil
  useEffect(() => {
    if (!form.sucursal_id && profile?.sucursal_id) {
      setForm((f) => ({ ...f, sucursal_id: profile.sucursal_id! }));
    } else if (!form.sucursal_id && sucursales.length === 1) {
      setForm((f) => ({ ...f, sucursal_id: (sucursales[0] as any).id }));
    }
  }, [profile?.sucursal_id, sucursales, form.sucursal_id]);

  // Autocompletar monto al elegir nomenclador
  const onNomencladorChange = (id: string) => {
    const nom: any = nomencladores.find((n: any) => n.id === id);
    setForm((f) => ({
      ...f,
      nomenclador_id: id,
      monto: nom ? Number(nom.monto) : f.monto,
    }));
  };

  const onObraChange = (id: string) => {
    const o: any = obras.find((x: any) => x.id === id);
    setForm((f) => ({
      ...f,
      obra_social_id: id,
      nomenclador_id: "",
      monto: o?.es_particular ? 0 : f.monto,
    }));
  };

  const saveMut = useMutation({
    mutationFn: async (andAnother: boolean) => {
      if (!form.paciente.trim()) throw new Error("Ingresá el nombre del paciente");
      if (!form.dni.trim()) throw new Error("Ingresá el DNI");
      if (!form.sucursal_id) throw new Error("Elegí sucursal");
      if (!form.obra_social_id) throw new Error("Elegí obra social");
      if (!form.odontologo_id) throw new Error("Elegí odontólogo");
      if (!isParticular && !form.nomenclador_id && !form.codigo_manual.trim()) {
        throw new Error("Elegí un código del nomenclador o cargá un código manual");
      }
      if (Number(form.monto) < 0) throw new Error("Monto inválido");

      const payload: any = {
        fecha: form.fecha,
        paciente: form.paciente.trim(),
        dni: form.dni.trim(),
        sucursal_id: form.sucursal_id,
        obra_social_id: form.obra_social_id,
        piso_id: form.piso_id || null,
        odontologo_id: form.odontologo_id,
        nomenclador_id: form.nomenclador_id || null,
        codigo_manual: form.codigo_manual.trim() || null,
        descripcion_manual: form.descripcion_manual.trim() || null,
        cantidad: Number(form.cantidad) || 1,
        monto: Number(form.monto) || 0,
        monto_usd: form.monto_usd === "" ? null : Number(form.monto_usd),
        cotizacion_usd: form.cotizacion_usd === "" ? null : Number(form.cotizacion_usd),
        observaciones: form.observaciones.trim() || null,
        created_by: user?.id ?? null,
      };
      const { error } = await supabase.from("prestaciones").insert(payload);
      if (error) throw error;
      return andAnother;
    },
    onSuccess: (andAnother) => {
      toast.success("Prestación guardada");
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
      qc.invalidateQueries({ queryKey: ["gestion-home-stats"] });
      if (andAnother) {
        setForm((f) => ({
          ...emptyForm(f.sucursal_id),
          obra_social_id: f.obra_social_id,
          piso_id: f.piso_id,
          odontologo_id: f.odontologo_id,
        }));
      } else {
        navigate({ to: "/gestion/prestaciones" });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sel = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva prestación</h1>
        <p className="text-sm text-muted-foreground">Cargá la atención lo más rápido posible.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Paciente</Label>
              <Input value={form.paciente} onChange={(e) => setForm({ ...form, paciente: e.target.value })} placeholder="Nombre y apellido" autoFocus />
            </div>
            <div>
              <Label>DNI</Label>
              <Input inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "") })} />
            </div>

            <div>
              <Label>Sucursal</Label>
              <select className={sel} value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, piso_id: "", odontologo_id: "" })}>
                <option value="">Elegir…</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label>Piso</Label>
              <select className={sel} value={form.piso_id} disabled={!form.sucursal_id} onChange={(e) => setForm({ ...form, piso_id: e.target.value, odontologo_id: "" })}>
                <option value="">{form.sucursal_id ? "Elegir…" : "Elegí sucursal primero"}</option>
                {pisos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            <div>
              <Label>Odontólogo</Label>
              <select className={sel} value={form.odontologo_id} disabled={!form.sucursal_id} onChange={(e) => setForm({ ...form, odontologo_id: e.target.value })}>
                <option value="">Elegir…</option>
                {odontologos.map((o: any) => <option key={o.id} value={o.id}>{o.nombre}{o.numero_od ? ` (${o.numero_od})` : ""}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <Label>Obra social</Label>
              <select className={sel} value={form.obra_social_id} onChange={(e) => onObraChange(e.target.value)}>
                <option value="">Elegir…</option>
                {obras.map((o: any) => <option key={o.id} value={o.id}>{o.nombre}{o.es_particular ? " (particular)" : ""}</option>)}
              </select>
            </div>

            {!isParticular ? (
              <div className="md:col-span-3">
                <Label>Código de prestación</Label>
                <select className={sel} value={form.nomenclador_id} disabled={!form.obra_social_id} onChange={(e) => onNomencladorChange(e.target.value)}>
                  <option value="">{form.obra_social_id ? (nomencladores.length === 0 ? "Sin códigos cargados — usá manual" : "Elegir código…") : "Elegí obra social primero"}</option>
                  {nomencladores.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.codigo} — {n.descripcion} (${Number(n.monto).toLocaleString("es-AR")})</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Código (manual)</Label>
                  <Input value={form.codigo_manual} onChange={(e) => setForm({ ...form, codigo_manual: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="md:col-span-2">
                  <Label>Descripción</Label>
                  <Input value={form.descripcion_manual} onChange={(e) => setForm({ ...form, descripcion_manual: e.target.value })} placeholder="Prestación realizada" />
                </div>
              </>
            )}

            {!isParticular && !form.nomenclador_id && form.obra_social_id && (
              <>
                <div>
                  <Label>Código manual</Label>
                  <Input value={form.codigo_manual} onChange={(e) => setForm({ ...form, codigo_manual: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="md:col-span-2">
                  <Label>Descripción manual</Label>
                  <Input value={form.descripcion_manual} onChange={(e) => setForm({ ...form, descripcion_manual: e.target.value })} placeholder="Opcional" />
                </div>
              </>
            )}

            <div>
              <Label>Cantidad</Label>
              <Input type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>Monto ARS</Label>
              <Input type="number" min={0} step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Monto USD <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input type="number" min={0} step="0.01" value={form.monto_usd} onChange={(e) => setForm({ ...form, monto_usd: e.target.value })} />
            </div>

            <div>
              <Label>Cotización USD <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input type="number" min={0} step="0.01" value={form.cotizacion_usd} onChange={(e) => setForm({ ...form, cotizacion_usd: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Observaciones</Label>
              <Input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => navigate({ to: "/gestion/prestaciones" })}>Cancelar</Button>
            <Button variant="secondary" onClick={() => saveMut.mutate(true)} disabled={saveMut.isPending}>Guardar y cargar otra</Button>
            <Button onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
