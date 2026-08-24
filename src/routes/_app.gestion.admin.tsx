import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Trash2,
  Plus,
  Check,
  X,
  Search,
  Copy,
  ExternalLink,
  MonitorSmartphone,
  Upload,
} from "lucide-react";
import { useUserContext } from "@/lib/gestion/use-auth";
import {
  listSucursales,
  createSucursal,
  deleteSucursal,
  listPisosAll,
  createPiso,
  deletePiso,
  listObrasSociales,
  createObraSocial,
  toggleObraSocial,
  deleteObraSocial,
  listOdontologos,
  createOdontologo,
  deleteOdontologo,
  listNomencladoresAdmin,
  createNomenclador,
  updateNomenclador,
  deleteNomenclador,
  previewNomencladorImport,
  previewNomencladorImportPdf,
  applyNomencladorImport,
  listServiciosParticularesAdmin,
  createServicioParticular,
  updateServicioParticular,
  deleteServicioParticular,
  getSucursalesTotem,
} from "@/lib/gestion/data.server";
import {
  listGestionUsers,
  createGestionUser,
  updateGestionUser,
  deleteGestionUser,
} from "@/lib/gestion/users.functions";
import {
  RESOURCES,
  RESOURCE_LABELS,
  ACTION_LABELS,
  presetForRole,
  type Resource,
} from "@/lib/gestion/permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/gestion/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, can, isLoading } = useUserContext();
  const puedeConfigurar = can("configuracion", "view");
  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!puedeConfigurar) return <Navigate to="/gestion" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Catálogos y ajustes del sistema.</p>
      </div>

      <Tabs defaultValue="sucursales">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
          <TabsTrigger value="pisos">Pisos</TabsTrigger>
          <TabsTrigger value="obras">Obras sociales</TabsTrigger>
          <TabsTrigger value="odontologos">Odontólogos</TabsTrigger>
          <TabsTrigger value="nomencladores">Nomencladores</TabsTrigger>
          <TabsTrigger value="particulares">Particulares</TabsTrigger>
          <TabsTrigger value="totem">Tótem</TabsTrigger>
          {isAdmin && <TabsTrigger value="usuarios">Usuarios</TabsTrigger>}
        </TabsList>
        <TabsContent value="sucursales">
          <SucursalesTab />
        </TabsContent>
        <TabsContent value="pisos">
          <PisosTab />
        </TabsContent>
        <TabsContent value="obras">
          <ObrasTab />
        </TabsContent>
        <TabsContent value="odontologos">
          <OdontologosTab />
        </TabsContent>
        <TabsContent value="nomencladores">
          <NomencladoresTab />
        </TabsContent>
        <TabsContent value="particulares">
          <ParticularesTab />
        </TabsContent>
        <TabsContent value="totem">
          <TotemLinksTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="usuarios">
            <UsuariosTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SucursalesTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["sucursales", "admin"],
    queryFn: () => listSucursales(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sucursales", "admin"] });
  const [nombre, setNombre] = useState("");

  const create = useMutation({
    mutationFn: () => createSucursal({ data: { nombre: nombre.trim() } }),
    onSuccess: () => {
      toast.success("Sucursal creada");
      setNombre("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSucursal({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminada");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Nueva sucursal</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <Button onClick={() => nombre.trim() && create.mutate()} disabled={!nombre.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>{s.nombre}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("¿Eliminar?") && del.mutate(s.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PisosTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["pisos", "admin"], queryFn: () => listPisosAll() });
  const { data: sucursales = [] } = useQuery({
    queryKey: ["sucursales"],
    queryFn: () => listSucursales(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pisos", "admin"] });
  const [nombre, setNombre] = useState("");
  const [sucursalId, setSucursalId] = useState("");

  const create = useMutation({
    mutationFn: () => createPiso({ data: { nombre: nombre.trim(), sucursalId } }),
    onSuccess: () => {
      toast.success("Piso creado");
      setNombre("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePiso({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <Label>Sucursal</Label>
            <select
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
            >
              <option value="">Elegir…</option>
              {sucursales.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Nombre piso</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Piso 1"
            />
          </div>
          <Button
            onClick={() => sucursalId && nombre.trim() && create.mutate()}
            disabled={!sucursalId || !nombre.trim()}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sucursal</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{p.sucursalNombre ?? "—"}</TableCell>
                <TableCell>{p.nombre}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("¿Eliminar?") && del.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ObrasTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["obras_sociales", "admin"],
    queryFn: () => listObrasSociales(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["obras_sociales", "admin"] });
  const [nombre, setNombre] = useState("");
  const [esPart, setEsPart] = useState(false);

  const create = useMutation({
    mutationFn: () => createObraSocial({ data: { nombre: nombre.trim(), esParticular: esPart } }),
    onSuccess: () => {
      toast.success("Obra social creada");
      setNombre("");
      setEsPart(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: (o: any) => toggleObraSocial({ data: { id: o.id, activa: !o.activa } }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteObraSocial({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminada");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={esPart} onChange={(e) => setEsPart(e.target.checked)} />
            Es particular
          </label>
          <Button onClick={() => nombre.trim() && create.mutate()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Particular</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell>{o.nombre}</TableCell>
                <TableCell>
                  {o.esParticular ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>
                  <button onClick={() => toggle.mutate(o)} className="text-xs underline">
                    {o.activa ? "Activa" : "Inactiva"}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OdontologosTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["odontologos", "admin"],
    queryFn: () => listOdontologos({ data: {} }),
  });
  const { data: sucursales = [] } = useQuery({
    queryKey: ["sucursales"],
    queryFn: () => listSucursales(),
  });
  const { data: pisos = [] } = useQuery({
    queryKey: ["pisos", "admin"],
    queryFn: () => listPisosAll(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["odontologos", "admin"] });
  const [form, setForm] = useState({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" });

  const create = useMutation({
    mutationFn: () =>
      createOdontologo({
        data: {
          nombre: form.nombre.trim(),
          numeroOd: form.numero_od.trim() || null,
          sucursalId: form.sucursal_id,
          pisoId: form.piso_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("Odontólogo creado");
      setForm({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteOdontologo({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pisosFiltrados = pisos.filter((p: any) => p.sucursalId === form.sucursal_id);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div>
            <Label>Sucursal</Label>
            <select
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
              value={form.sucursal_id}
              onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, piso_id: "" })}
            >
              <option value="">…</option>
              {sucursales.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Piso</Label>
            <select
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
              value={form.piso_id}
              disabled={!form.sucursal_id}
              onChange={(e) => setForm({ ...form, piso_id: e.target.value })}
            >
              <option value="">—</option>
              {pisosFiltrados.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div>
            <Label>Nº OD</Label>
            <Input
              value={form.numero_od}
              onChange={(e) => setForm({ ...form, numero_od: e.target.value })}
            />
          </div>
          <Button onClick={() => form.nombre.trim() && form.sucursal_id && create.mutate()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Nº OD</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell>{o.nombre}</TableCell>
                <TableCell>{o.numeroOd ?? "—"}</TableCell>
                <TableCell>{o.sucursalNombre ?? "—"}</TableCell>
                <TableCell>{o.pisoNombre ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Parsea números en formato AR ("17.826,57") o plano ("21044.74").
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return Number(s);
}

const IMPORT_SYNONYMS: Record<string, string[]> = {
  codigo: ["codigo", "código", "code", "cod", "nomenclador"],
  plan: ["plan"],
  descripcion: ["descripcion", "descripción", "detalle", "prestacion", "prestación"],
  monto: ["monto", "precio", "importe", "arancel", "valor", "total"],
  copago: ["copago", "coseguro", "cargo afiliado", "cargo paciente", "paciente"],
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Mapea columnas del archivo a los campos canónicos y arma las filas.
function sheetToCanonical(sheet: any[]): { rows: any[]; mapped: Record<string, string | null> } {
  const headers = sheet.length ? Object.keys(sheet[0]) : [];
  const mapped: Record<string, string | null> = {};
  for (const [field, syns] of Object.entries(IMPORT_SYNONYMS)) {
    mapped[field] = headers.find((h) => syns.some((s) => norm(h).includes(s))) ?? null;
  }
  const rows = sheet
    .map((r) => {
      const codigo = mapped.codigo ? String(r[mapped.codigo] ?? "").trim() : "";
      if (!codigo) return null;
      const monto = mapped.monto ? toNum(r[mapped.monto]) : NaN;
      const copagoRaw = mapped.copago ? r[mapped.copago] : "";
      const copago = copagoRaw === "" || copagoRaw == null ? null : toNum(copagoRaw);
      const plan = mapped.plan ? String(r[mapped.plan] ?? "").trim() || null : null;
      const descripcion = mapped.descripcion ? String(r[mapped.descripcion] ?? "").trim() : undefined;
      return { codigo, plan, descripcion, monto: Number.isFinite(monto) ? monto : 0, copago };
    })
    .filter(Boolean);
  return { rows, mapped };
}

type ImportPreview = Awaited<ReturnType<typeof previewNomencladorImport>>;
type Archetype = "flat-ars" | "flat-dotted" | "matrix-plans";
const ARCHETYPE_LABEL: Record<Archetype, string> = {
  "flat-ars": "Lista plana (ej. Avalian)",
  "flat-dotted": "Lista con capítulos (ej. OSPJN)",
  "matrix-plans": "Matriz por plan (ej. OSDE)",
};

function NomencladorImportDialog({
  obraSocialId,
  obraNombre,
  onDone,
}: {
  obraSocialId: string;
  obraNombre: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [mapped, setMapped] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [pdfB64, setPdfB64] = useState<string | null>(null);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const reset = () => {
    setFileName("");
    setRows([]);
    setMapped({});
    setPreview(null);
    setCreateMissing(false);
    setPdfB64(null);
    setArchetype(null);
    setParseWarnings([]);
  };

  const previewMut = useMutation({
    mutationFn: (r: any[]) => previewNomencladorImport({ data: { obraSocialId, rows: r } }),
    onSuccess: (p) => setPreview(p),
    onError: (e) => toast.error((e as Error).message),
  });
  const previewPdfMut = useMutation({
    mutationFn: (vars: { b64: string; arch?: Archetype }) =>
      previewNomencladorImportPdf({
        data: { obraSocialId, fileBase64: vars.b64, archetype: vars.arch },
      }),
    onSuccess: (r) => {
      setPreview(r);
      setRows(r.rows);
      setArchetype(r.archetype);
      setParseWarnings(r.parseWarnings);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const analyzing = previewMut.isPending || previewPdfMut.isPending;
  const applyMut = useMutation({
    mutationFn: () => applyNomencladorImport({ data: { obraSocialId, rows, createMissing } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} actualizados${r.created ? `, ${r.created} nuevos` : ""}`);
      onDone();
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    if (/\.pdf$/i.test(file.name)) {
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk)
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const b64 = btoa(bin);
      setPdfB64(b64);
      previewPdfMut.mutate({ b64 });
      return;
    }
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[];
    const { rows: canon, mapped: m } = sheetToCanonical(sheet);
    setRows(canon);
    setMapped(m);
    if (!m.codigo || !m.monto) {
      toast.error("No se detectaron las columnas Código y Monto en el archivo");
      return;
    }
    if (canon.length) previewMut.mutate(canon);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" />
        Actualizar precios masivo
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Actualizar precios · {obraNombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Subí el <b>PDF</b> del arancel de la obra social (o un CSV/Excel con columnas{" "}
              <b>código</b>, <b>monto</b>, <b>plan</b>, <b>copago</b>). Se previsualizan los
              cambios antes de aplicar.
            </p>
            <Input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            {fileName && !pdfB64 && (
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} filas · columnas detectadas:{" "}
                {Object.entries(mapped)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}→${v}`)
                  .join(", ") || "—"}
              </p>
            )}
            {pdfB64 && archetype && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{fileName} · formato detectado:</span>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={archetype}
                  onChange={(e) =>
                    pdfB64 && previewPdfMut.mutate({ b64: pdfB64, arch: e.target.value as Archetype })
                  }
                >
                  {(Object.keys(ARCHETYPE_LABEL) as Archetype[]).map((a) => (
                    <option key={a} value={a}>
                      {ARCHETYPE_LABEL[a]}
                    </option>
                  ))}
                </select>
                {parseWarnings.length > 0 && (
                  <span className="text-amber-600">· {parseWarnings.length} líneas sin parsear</span>
                )}
              </div>
            )}

            {analyzing && <p className="text-sm">Analizando…</p>}

            {preview && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone="brand">{preview.toUpdate.length} a actualizar</Badge>
                  <Badge>{preview.unchanged} sin cambios</Badge>
                  <Badge tone="green">{preview.toCreate.length} nuevos</Badge>
                  <Badge>{preview.missingInFile.length} en DB no en archivo</Badge>
                  {preview.warnings.length > 0 && (
                    <Badge tone="amber">{preview.warnings.length} warnings</Badge>
                  )}
                </div>

                {preview.warnings.length > 0 && (
                  <div className="max-h-24 overflow-auto rounded border p-2 text-xs text-amber-700">
                    {preview.warnings.slice(0, 30).map((w, i) => (
                      <div key={i}>
                        {w.codigo}
                        {w.plan ? ` [${w.plan}]` : ""}: {w.issue}
                      </div>
                    ))}
                  </div>
                )}

                {preview.toUpdate.length > 0 && (
                  <div className="max-h-56 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">Nuevo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.toUpdate.slice(0, 200).map((u, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono">{u.codigo}</TableCell>
                            <TableCell>{u.plan ?? "—"}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              ${u.montoOld}
                            </TableCell>
                            <TableCell className="text-right font-medium">${u.montoNew}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {preview.toCreate.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-emerald-700">
                      Códigos nuevos (no existen en la base):
                    </p>
                    <div className="max-h-40 overflow-auto rounded border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.toCreate.slice(0, 200).map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono">{c.codigo}</TableCell>
                              <TableCell>{c.plan ?? "—"}</TableCell>
                              <TableCell className="text-xs">{c.descripcion}</TableCell>
                              <TableCell className="text-right font-medium">${c.monto}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={createMissing}
                        onChange={(e) => setCreateMissing(e.target.checked)}
                      />
                      Crear estos {preview.toCreate.length} códigos nuevos
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => (setOpen(false), reset())}>
              Cancelar
            </Button>
            <Button
              disabled={
                !preview ||
                applyMut.isPending ||
                (preview.toUpdate.length === 0 && !(createMissing && preview.toCreate.length > 0))
              }
              onClick={() => applyMut.mutate()}
            >
              {applyMut.isPending
                ? "Aplicando…"
                : `Aplicar ${preview ? preview.toUpdate.length + (createMissing ? preview.toCreate.length : 0) : 0} cambios`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "brand" | "green" | "amber" }) {
  const cls =
    tone === "brand"
      ? "bg-sky-100 text-sky-800"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

function NomencladoresTab() {
  const qc = useQueryClient();
  const { data: obras = [] } = useQuery({
    queryKey: ["obras_sociales", "admin"],
    queryFn: () => listObrasSociales(),
  });
  const [obraId, setObraId] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["nomencladores_admin", obraId],
    enabled: !!obraId,
    queryFn: () => listNomencladoresAdmin({ data: { obraSocialId: obraId } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["nomencladores_admin", obraId] });

  const [busqueda, setBusqueda] = useState("");
  const dataFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return data;
    return data.filter((n: any) => `${n.codigo} ${n.descripcion}`.toLowerCase().includes(q));
  }, [data, busqueda]);

  const [form, setForm] = useState({ codigo: "", descripcion: "", monto: 0, copago: "" });
  const create = useMutation({
    mutationFn: () =>
      createNomenclador({
        data: {
          obraSocialId: obraId,
          codigo: form.codigo.trim(),
          descripcion: form.descripcion.trim(),
          monto: Number(form.monto) || 0,
          montoPaciente: form.copago.trim() === "" ? null : Number(form.copago),
        },
      }),
    onSuccess: () => {
      toast.success("Código creado");
      setForm({ codigo: "", descripcion: "", monto: 0, copago: "" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (data: {
      id: string;
      codigo?: string;
      descripcion?: string;
      monto?: number;
      montoPaciente?: number | null;
    }) => updateNomenclador({ data }),
    onSuccess: () => {
      invalidate();
      toast.success("Guardado");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteNomenclador({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Obra social</Label>
            <select
              className="h-10 w-full md:w-80 rounded-md border bg-transparent px-3 text-sm"
              value={obraId}
              onChange={(e) => setObraId(e.target.value)}
            >
              <option value="">Elegí una obra social…</option>
              {obras.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </div>
          {obraId && (
            <NomencladorImportDialog
              obraSocialId={obraId}
              obraNombre={obras.find((o: any) => o.id === obraId)?.nombre ?? ""}
              onDone={invalidate}
            />
          )}
        </div>

        {obraId && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_140px_140px_auto] gap-2 items-end">
              <div>
                <Label>Código</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
              </div>
              <div>
                <Label>Monto</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Copago</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Opcional"
                  value={form.copago}
                  onChange={(e) => setForm({ ...form, copago: e.target.value })}
                />
              </div>
              <Button onClick={() => form.codigo.trim() && create.mutate()}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>

            <div className="relative md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código o descripción…"
                className="pl-9"
              />
              {busqueda && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {dataFiltrada.length}
                </span>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-36 text-right">Monto</TableHead>
                  <TableHead className="w-36 text-right">Copago</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataFiltrada.map((n: any) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Input
                        className="h-8 font-mono"
                        defaultValue={n.codigo}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== n.codigo) upd.mutate({ id: n.id, codigo: v });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        defaultValue={n.descripcion}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== n.descripcion) upd.mutate({ id: n.id, descripcion: v });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 text-right"
                        defaultValue={n.monto}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== Number(n.monto)) upd.mutate({ id: n.id, monto: v });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="—"
                        className="h-8 text-right"
                        defaultValue={n.montoPaciente ?? ""}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === "" ? null : Number(raw);
                          const actual = n.montoPaciente == null ? null : Number(n.montoPaciente);
                          if (v !== actual) upd.mutate({ id: n.id, montoPaciente: v });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm("¿Eliminar?") && del.mutate(n.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {dataFiltrada.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      {busqueda.trim()
                        ? "Sin resultados para la búsqueda."
                        : "Sin códigos cargados."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ParticularesTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["servicios_particulares", "admin"],
    queryFn: () => listServiciosParticularesAdmin(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["servicios_particulares", "admin"] });

  const [busqueda, setBusqueda] = useState("");
  const dataFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return data;
    return data.filter((s: any) => `${s.codigo ?? ""} ${s.descripcion}`.toLowerCase().includes(q));
  }, [data, busqueda]);

  // Cotización manual del día para convertir ARS → USD (el catálogo se guarda en USD).
  const [cotizacion, setCotizacion] = useState(1530);
  const arsToUsd = (ars: number) =>
    cotizacion > 0 ? Math.round((ars / cotizacion) * 100) / 100 : 0;

  const [form, setForm] = useState({ codigo: "", descripcion: "", precio_ars: "", precio_usd: 0 });
  const create = useMutation({
    mutationFn: () =>
      createServicioParticular({
        data: {
          codigo: form.codigo.trim() || null,
          descripcion: form.descripcion.trim(),
          precioUsd: Number(form.precio_usd) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Servicio creado");
      setForm({ codigo: "", descripcion: "", precio_ars: "", precio_usd: 0 });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (data: {
      id: string;
      codigo?: string | null;
      descripcion?: string;
      precioUsd?: number;
    }) => updateServicioParticular({ data }),
    onSuccess: () => {
      invalidate();
      toast.success("Guardado");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteServicioParticular({ data: { id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Catálogo de servicios particulares con precio en dólares (lista aparte de obras sociales).
        </p>
        <div className="flex items-end gap-2">
          <div>
            <Label>Cotización USD del día</Label>
            <Input
              type="number"
              min={0}
              step="1"
              className="w-40"
              value={cotizacion}
              onChange={(e) => setCotizacion(Number(e.target.value) || 0)}
            />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            $ por dólar. Se usa para convertir ARS → USD (editable).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_130px_130px_auto] gap-2 items-end">
          <div>
            <Label>Código</Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>
          <div>
            <Label>Precio ARS</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="En pesos"
              value={form.precio_ars}
              onChange={(e) =>
                setForm({
                  ...form,
                  precio_ars: e.target.value,
                  precio_usd: arsToUsd(Number(e.target.value)),
                })
              }
            />
          </div>
          <div>
            <Label>Precio USD</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.precio_usd}
              onChange={(e) => setForm({ ...form, precio_usd: Number(e.target.value) })}
            />
          </div>
          <Button onClick={() => form.descripcion.trim() && create.mutate()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        <div className="relative md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o descripción…"
            className="pl-9"
          />
          {busqueda && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {dataFiltrada.length}
            </span>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-36 text-right">Precio ARS</TableHead>
              <TableHead className="w-36 text-right">Precio USD</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataFiltrada.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Input
                    className="h-8 font-mono"
                    placeholder="—"
                    defaultValue={s.codigo ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (s.codigo ?? "")) upd.mutate({ id: s.id, codigo: v || null });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    defaultValue={s.descripcion}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.descripcion) upd.mutate({ id: s.id, descripcion: v });
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="→ USD"
                    className="h-8 text-right"
                    onBlur={(e) => {
                      const ars = Number(e.target.value);
                      if (!ars) return;
                      upd.mutate({ id: s.id, precioUsd: arsToUsd(ars) });
                      e.target.value = "";
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    key={`usd-${s.id}-${s.precioUsd}`}
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-8 text-right"
                    defaultValue={s.precioUsd}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== Number(s.precioUsd)) upd.mutate({ id: s.id, precioUsd: v });
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("¿Eliminar?") && del.mutate(s.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {dataFiltrada.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  {busqueda.trim() ? "Sin resultados para la búsqueda." : "Sin servicios cargados."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Checklist de sucursales (multi-selección; "Todas" marca todas las sedes).
function SucursalesChecklist({
  all,
  value,
  onChange,
}: {
  all: { id: string; nombre: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const allIds = all.map((s) => s.id);
  const todas = all.length > 0 && value.length === all.length;
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={todas}
          onChange={(e) => onChange(e.target.checked ? allIds : [])}
        />
        Todas
      </label>
      {all.map((s) => (
        <label key={s.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
          {s.nombre}
        </label>
      ))}
    </div>
  );
}

// Matriz de permisos recurso × acción.
function PermisosMatrix({
  value,
  onChange,
}: {
  value: string[];
  onChange: (perms: string[]) => void;
}) {
  const has = (k: string) => value.includes(k);
  const toggle = (k: string) => onChange(has(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="space-y-0.5">
      {(Object.keys(RESOURCES) as Resource[]).map((res) => (
        <div key={res} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-1.5">
          <span className="w-40 text-sm font-medium">{RESOURCE_LABELS[res]}</span>
          {RESOURCES[res].map((action) => {
            const k = `${res}:${action}`;
            return (
              <label key={k} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={has(k)} onChange={() => toggle(k)} />
                {ACTION_LABELS[action]}
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UsuariosTab() {
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["gestion-users"],
    queryFn: () => listGestionUsers(),
  });
  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: () => listSucursales(),
  });

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<
    "admin" | "administrativo" | "direccion" | "odontologo" | "recepcionista"
  >("administrativo");
  // Sedes elegidas para el alta (vacío = todas al crear).
  const [sucursalIds, setSucursalIds] = useState<string[]>([]);
  // Editor de accesos por usuario (fila expandida): sedes + matriz de permisos.
  const [editUser, setEditUser] = useState<string | null>(null);
  const [editSucs, setEditSucs] = useState<string[]>([]);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<string>("administrativo");

  const allSucIds = (sucursales ?? []).map((s: any) => s.id);

  const createM = useMutation({
    mutationFn: () =>
      createGestionUser({
        data: {
          email,
          password,
          nombre,
          role,
          sucursal_ids: sucursalIds.length ? sucursalIds : allSucIds,
        },
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setEmail("");
      setNombre("");
      setPassword("");
      setRole("administrativo");
      setSucursalIds([]);
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Abre el editor de accesos de un usuario, precargando sedes/permisos/rol actuales.
  const openEditor = (u: any) => {
    setEditUser(u.user_id);
    setEditSucs(u.sucursal_ids ?? []);
    setEditRole(u.roles[0] ?? "administrativo");
    // Si no tiene permisos cargados, precargar el preset de su rol como punto de partida.
    setEditPerms(
      u.permissions?.length ? u.permissions : presetForRole((u.roles[0] ?? "administrativo") as any),
    );
  };
  const saveEditor = () => {
    if (!editUser) return;
    updateM.mutate(
      { user_id: editUser, sucursal_ids: editSucs.length ? editSucs : allSucIds, permissions: editPerms },
      { onSuccess: () => setEditUser(null) },
    );
  };

  const updateM = useMutation({
    mutationFn: (vars: {
      user_id: string;
      role?: any;
      sucursal_ids?: string[];
      new_password?: string;
      permissions?: string[];
    }) => updateGestionUser({ data: vars as any }),
    onSuccess: () => {
      toast.success("Actualizado");
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (user_id: string) => deleteGestionUser({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-semibold">Nuevo usuario</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="direccion">Dirección</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                  <SelectItem value="odontologo">Odontólogo</SelectItem>
                  <SelectItem value="recepcionista">Recepcionista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sucursales (si no elegís ninguna, se asignan todas)</Label>
            <SucursalesChecklist
              all={sucursales ?? []}
              value={sucursalIds}
              onChange={setSucursalIds}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => createM.mutate()}
              disabled={createM.isPending || !email || !password || !nombre || password.length < 6}
            >
              <Plus className="h-4 w-4 mr-2" /> Crear usuario
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {(users ?? []).map((u: any) => (
                <Fragment key={u.user_id}>
                  <TableRow>
                    <TableCell className="font-medium">{u.nombre || "—"}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.roles[0] ?? "administrativo"}
                        onValueChange={(v) => updateM.mutate({ user_id: u.user_id, role: v })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="direccion">Dirección</SelectItem>
                          <SelectItem value="administrativo">Administrativo</SelectItem>
                          <SelectItem value="odontologo">Odontólogo</SelectItem>
                          <SelectItem value="recepcionista">Recepcionista</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(sucursales?.length ?? 0) > 0 &&
                      u.sucursal_ids?.length === sucursales?.length
                        ? "Todas"
                        : (u.sucursales ?? []).map((s: any) => s.nombre).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={editUser === u.user_id ? "default" : "outline"}
                        onClick={() => (editUser === u.user_id ? setEditUser(null) : openEditor(u))}
                      >
                        Accesos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const np = window.prompt("Nueva contraseña (mín. 6)");
                          if (np && np.length >= 6)
                            updateM.mutate({ user_id: u.user_id, new_password: np });
                        }}
                      >
                        Resetear pass
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          confirm(`¿Eliminar a ${u.email}?`) && removeM.mutate(u.user_id)
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {editUser === u.user_id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <div className="space-y-4 p-2">
                          <div>
                            <div className="text-sm font-semibold mb-1.5">Sucursales con acceso</div>
                            <SucursalesChecklist
                              all={sucursales ?? []}
                              value={editSucs}
                              onChange={setEditSucs}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-sm font-semibold">Permisos por sección</div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditPerms(presetForRole(editRole as any))}
                              >
                                Aplicar preset del rol
                              </Button>
                            </div>
                            <PermisosMatrix value={editPerms} onChange={setEditPerms} />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setEditUser(null)}>
                              Cancelar
                            </Button>
                            <Button onClick={saveEditor} disabled={updateM.isPending}>
                              Guardar accesos
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {!isLoading && (users ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Sin usuarios.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TotemLinksTab() {
  const { data: sucs = [] } = useQuery({
    queryKey: ["totem-sucursales-admin"],
    queryFn: () => getSucursalesTotem(),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const buildUrl = (slug: string, piso: string | null) =>
    `${origin}/?clinica=${slug}${piso ? `&piso=${encodeURIComponent(piso)}` : ""}`;
  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-5">
        <p className="text-sm text-muted-foreground">
          Links de acceso rápido al tótem por clínica y piso. Abrí el link correspondiente en cada
          tablet: el tótem queda configurado para esa clínica/piso.
        </p>
        {sucs.map((s: any) => (
          <div key={s.slug} className="space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
              {s.nombre}
              <span className="text-xs font-normal text-muted-foreground">({s.slug})</span>
            </div>
            <div className="space-y-2 pl-6">
              {(s.pisos.length ? s.pisos : [null]).map((piso: string | null) => {
                const url = buildUrl(s.slug, piso);
                return (
                  <div
                    key={piso ?? "base"}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <span className="text-sm font-medium w-20">
                      {piso ? `Piso ${piso}` : "General"}
                    </span>
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 min-w-[200px] truncate">
                      {url}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copy(url)}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar
                    </Button>
                    <Button size="sm" asChild>
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" /> Abrir
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {sucs.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin sucursales con slug configurado.</p>
        )}
      </CardContent>
    </Card>
  );
}
