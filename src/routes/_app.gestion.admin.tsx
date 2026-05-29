import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2, Plus, Check, X } from "lucide-react";
import { useUserContext } from "@/lib/gestion/use-auth";
import { useServerFn } from "@tanstack/react-start";
import {
  listGestionUsers,
  createGestionUser,
  updateGestionUser,
  deleteGestionUser,
} from "@/lib/gestion/users.functions";
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
  const { isAdmin, isLoading } = useUserContext();
  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!isAdmin) return <Navigate to="/gestion" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administración</h1>
        <p className="text-sm text-muted-foreground">Catálogos del sistema.</p>
      </div>

      <Tabs defaultValue="sucursales">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
          <TabsTrigger value="pisos">Pisos</TabsTrigger>
          <TabsTrigger value="obras">Obras sociales</TabsTrigger>
          <TabsTrigger value="odontologos">Odontólogos</TabsTrigger>
          <TabsTrigger value="nomencladores">Nomencladores</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
        </TabsList>
        <TabsContent value="sucursales"><SucursalesTab /></TabsContent>
        <TabsContent value="pisos"><PisosTab /></TabsContent>
        <TabsContent value="obras"><ObrasTab /></TabsContent>
        <TabsContent value="odontologos"><OdontologosTab /></TabsContent>
        <TabsContent value="nomencladores"><NomencladoresTab /></TabsContent>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useCatalog<T = any>(table: string, order = "nombre") {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [table, "admin"],
    queryFn: async () => (await supabase.from(table as any).select("*").order(order)).data as T[],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: [table, "admin"] });
  return { ...query, invalidate };
}

function SucursalesTab() {
  const { data = [], invalidate } = useCatalog<any>("sucursales");
  const [nombre, setNombre] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sucursales").insert({ nombre: nombre.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sucursal creada"); setNombre(""); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sucursales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminada"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1"><Label>Nueva sucursal</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <Button onClick={() => nombre.trim() && create.mutate()} disabled={!nombre.trim()}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
      </div>
      <Table><TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((s: any) => (
            <TableRow key={s.id}>
              <TableCell>{s.nombre}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function UsuariosTab() {
  const qc = useQueryClient();
  const list = useServerFn(listGestionUsers);
  const create = useServerFn(createGestionUser);
  const update = useServerFn(updateGestionUser);
  const remove = useServerFn(deleteGestionUser);

  const { data: users, isLoading } = useQuery({
    queryKey: ["gestion-users"],
    queryFn: () => list(),
  });

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await supabase.from("sucursales").select("id, nombre").order("nombre")).data ?? [],
  });

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "administrativo" | "direccion" | "odontologo">("administrativo");
  const [sucursalId, setSucursalId] = useState<string>("none");

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          email,
          password,
          nombre,
          role,
          sucursal_id: sucursalId === "none" ? null : sucursalId,
        },
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setEmail(""); setNombre(""); setPassword(""); setRole("administrativo"); setSucursalId("none");
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: (vars: { user_id: string; role?: any; sucursal_id?: string | null; new_password?: string }) =>
      update({ data: vars as any }),
    onSuccess: () => {
      toast.success("Actualizado");
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (user_id: string) => remove({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["gestion-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <div className="font-semibold">Nuevo usuario</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1.5"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Contraseña</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} /></div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="direccion">Dirección</SelectItem>
                <SelectItem value="administrativo">Administrativo</SelectItem>
                <SelectItem value="odontologo">Odontólogo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {(sucursales ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => createM.mutate()}
            disabled={createM.isPending || !email || !password || !nombre || password.length < 6}
          >
            <Plus className="h-4 w-4 mr-2" /> Crear usuario
          </Button>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
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
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Cargando…</TableCell></TableRow>}
            {(users ?? []).map((u: any) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.nombre || "—"}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell>
                  <Select
                    value={u.roles[0] ?? "administrativo"}
                    onValueChange={(v) => updateM.mutate({ user_id: u.user_id, role: v })}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="direccion">Dirección</SelectItem>
                      <SelectItem value="administrativo">Administrativo</SelectItem>
                      <SelectItem value="odontologo">Odontólogo</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={u.sucursal_id ?? "none"}
                    onValueChange={(v) =>
                      updateM.mutate({ user_id: u.user_id, sucursal_id: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {(sucursales ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const np = window.prompt("Nueva contraseña (mín. 6)");
                      if (np && np.length >= 6) updateM.mutate({ user_id: u.user_id, new_password: np });
                    }}
                  >
                    Resetear pass
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm(`¿Eliminar a ${u.email}?`) && removeM.mutate(u.user_id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (users ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin usuarios.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function PisosTab() {
  const { data = [], invalidate } = useCatalog<any>("pisos");
  const { data: sucursales = [] } = useCatalog<any>("sucursales");
  const [nombre, setNombre] = useState("");
  const [sucursalId, setSucursalId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pisos").insert({ nombre: nombre.trim(), sucursal_id: sucursalId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Piso creado"); setNombre(""); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("pisos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <div><Label>Sucursal</Label>
          <select className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Elegir…</option>
            {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div><Label>Nombre piso</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Piso 1" /></div>
        <Button onClick={() => sucursalId && nombre.trim() && create.mutate()} disabled={!sucursalId || !nombre.trim()}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
      </div>
      <Table><TableHeader><TableRow><TableHead>Sucursal</TableHead><TableHead>Piso</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell>{sucursales.find((s: any) => s.id === p.sucursal_id)?.nombre ?? "—"}</TableCell>
              <TableCell>{p.nombre}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function ObrasTab() {
  const { data = [], invalidate } = useCatalog<any>("obras_sociales");
  const [nombre, setNombre] = useState("");
  const [esPart, setEsPart] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("obras_sociales").insert({ nombre: nombre.trim(), es_particular: esPart });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Obra social creada"); setNombre(""); setEsPart(false); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: async (o: any) => { const { error } = await supabase.from("obras_sociales").update({ activa: !o.activa }).eq("id", o.id); if (error) throw error; },
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("obras_sociales").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Eliminada"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={esPart} onChange={(e) => setEsPart(e.target.checked)} />
          Es particular
        </label>
        <Button onClick={() => nombre.trim() && create.mutate()}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
      </div>
      <Table><TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Particular</TableHead><TableHead>Activa</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((o: any) => (
            <TableRow key={o.id}>
              <TableCell>{o.nombre}</TableCell>
              <TableCell>{o.es_particular ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
              <TableCell>
                <button onClick={() => toggle.mutate(o)} className="text-xs underline">
                  {o.activa ? "Activa" : "Inactiva"}
                </button>
              </TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function OdontologosTab() {
  const { data = [], invalidate } = useCatalog<any>("odontologos");
  const { data: sucursales = [] } = useCatalog<any>("sucursales");
  const { data: pisos = [] } = useCatalog<any>("pisos");
  const [form, setForm] = useState({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("odontologos").insert({
        nombre: form.nombre.trim(),
        numero_od: form.numero_od.trim() || null,
        sucursal_id: form.sucursal_id,
        piso_id: form.piso_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Odontólogo creado"); setForm({ nombre: "", numero_od: "", sucursal_id: "", piso_id: "" }); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("odontologos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const pisosFiltrados = pisos.filter((p: any) => p.sucursal_id === form.sucursal_id);

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div><Label>Sucursal</Label>
          <select className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, piso_id: "" })}>
            <option value="">…</option>
            {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div><Label>Piso</Label>
          <select className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" value={form.piso_id} disabled={!form.sucursal_id} onChange={(e) => setForm({ ...form, piso_id: e.target.value })}>
            <option value="">—</option>
            {pisosFiltrados.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div><Label>Nombre</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
        <div><Label>Nº OD</Label><Input value={form.numero_od} onChange={(e) => setForm({ ...form, numero_od: e.target.value })} /></div>
        <Button onClick={() => form.nombre.trim() && form.sucursal_id && create.mutate()}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
      </div>
      <Table><TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Nº OD</TableHead><TableHead>Sucursal</TableHead><TableHead>Piso</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((o: any) => (
            <TableRow key={o.id}>
              <TableCell>{o.nombre}</TableCell>
              <TableCell>{o.numero_od ?? "—"}</TableCell>
              <TableCell>{sucursales.find((s: any) => s.id === o.sucursal_id)?.nombre ?? "—"}</TableCell>
              <TableCell>{pisos.find((p: any) => p.id === o.piso_id)?.nombre ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function NomencladoresTab() {
  const { data: obras = [] } = useCatalog<any>("obras_sociales");
  const [obraId, setObraId] = useState("");
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["nomencladores_admin", obraId],
    enabled: !!obraId,
    queryFn: async () => (await supabase.from("nomencladores").select("*").eq("obra_social_id", obraId).order("codigo")).data ?? [],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["nomencladores_admin", obraId] });

  const [form, setForm] = useState({ codigo: "", descripcion: "", monto: 0 });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("nomencladores").insert({
        obra_social_id: obraId,
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        monto: Number(form.monto) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Código creado"); setForm({ codigo: "", descripcion: "", monto: 0 }); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: async ({ id, monto }: { id: string; monto: number }) => {
      const { error } = await supabase.from("nomencladores").update({ monto }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("nomencladores").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div>
        <Label>Obra social</Label>
        <select className="h-10 w-full md:w-80 rounded-md border bg-transparent px-3 text-sm" value={obraId} onChange={(e) => setObraId(e.target.value)}>
          <option value="">Elegí una obra social…</option>
          {obras.map((o: any) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </div>

      {obraId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_140px_auto] gap-2 items-end">
            <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
            <div><Label>Descripción</Label><Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
            <div><Label>Monto</Label><Input type="number" min={0} step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} /></div>
            <Button onClick={() => form.codigo.trim() && create.mutate()}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
          </div>

          <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead className="w-40 text-right">Monto</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((n: any) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono">{n.codigo}</TableCell>
                  <TableCell>{n.descripcion}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} step="0.01"
                      className="h-8 text-right"
                      defaultValue={n.monto}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== Number(n.monto)) upd.mutate({ id: n.id, monto: v });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => confirm("¿Eliminar?") && del.mutate(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin códigos cargados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </CardContent></Card>
  );
}
