import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Monitor, ClipboardList, LogIn, LayoutDashboard, BarChart3, ListPlus, Table2,
  Stethoscope, DollarSign, FileText, Settings, ShieldCheck, HelpCircle, PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/gestion/ayuda")({
  component: AyudaPage,
});

type Sec = {
  id: string;
  icon: any;
  titulo: string;
  ruta?: string;
  resumen: string;
  acceso: string;
  pasos?: string[];
  notas?: string[];
};

const SECCIONES: Sec[] = [
  {
    id: "totem",
    icon: Monitor,
    titulo: "Tótem (autogestión del paciente)",
    ruta: "/ (pantalla pública del tótem)",
    acceso: "Público — no requiere iniciar sesión. Pensado para la tablet/pantalla en la sala de espera.",
    resumen:
      "El paciente registra su llegada al llegar a la clínica. Lo que carga acá aparece en tiempo real en el panel de Recepción.",
    pasos: [
      "El paciente toca la pantalla y elige el tipo de llegada (con turno / sin turno, según configuración).",
      "Indica si es paciente nuevo o existente y el tipo de atención.",
      "Selecciona su cobertura (obra social) o particular.",
      "Escribe nombre y apellido y su DNI.",
      "Confirma. Queda registrada la llegada y el paciente espera a ser llamado.",
    ],
    notas: [
      "No se borran solos: las llegadas viejas se archivan desde Recepción.",
      "Si la tablet se reinicia, basta con volver a abrir la URL del tótem.",
    ],
  },
  {
    id: "recepcion",
    icon: ClipboardList,
    titulo: "Recepción",
    ruta: "/gestion/recepcion",
    acceso: "Requiere iniciar sesión.",
    resumen:
      "Panel donde la recepcionista ve las llegadas del tótem y las va gestionando. Se actualiza solo cada ~10 segundos.",
    pasos: [
      "Mirá la lista de pacientes que registraron su llegada (más reciente arriba).",
      "Cambiá el estado de cada llegada a medida que avanza la atención (esperando → atendido, etc.).",
      "Usá 'archivar' para limpiar las llegadas viejas del día.",
    ],
    notas: ["Si no ves llegadas nuevas, esperá unos segundos o recargá la página."],
  },
  {
    id: "registro",
    icon: LogIn,
    titulo: "Iniciar sesión y crear cuenta",
    ruta: "/gestion/login",
    acceso: "Público (la pantalla de acceso).",
    resumen:
      "Acceso al sistema de gestión con email y contraseña. Desde acá también se registran las cuentas nuevas.",
    pasos: [
      "Para entrar: escribí tu email y contraseña y tocá 'Iniciar sesión'.",
      "Para una cuenta nueva: usá la opción de registrarte con email, contraseña y nombre.",
      "Al registrarte se crea tu perfil automáticamente.",
    ],
    notas: [
      "El primer usuario que se registra NO tiene rol admin: un administrador debe asignárselo (o se asigna en la base la primera vez).",
      "Las cuentas nuevas las debería crear un admin desde Administración → Usuarios, así quedan con el rol y la sucursal correctos.",
    ],
  },
  {
    id: "inicio",
    icon: LayoutDashboard,
    titulo: "Inicio",
    ruta: "/gestion",
    acceso: "Requiere iniciar sesión.",
    resumen: "Pantalla de bienvenida con un resumen rápido del estado del día y accesos a las secciones.",
  },
  {
    id: "dashboard",
    icon: BarChart3,
    titulo: "Dashboard",
    ruta: "/gestion/dashboard",
    acceso: "Requiere iniciar sesión.",
    resumen: "Métricas y gráficos de la actividad de la clínica (atenciones, totales, etc.).",
  },
  {
    id: "nueva-prestacion",
    icon: ListPlus,
    titulo: "Nueva prestación (atención)",
    ruta: "/gestion/prestaciones/nueva",
    acceso: "Requiere iniciar sesión.",
    resumen:
      "Se carga una atención completa: datos del paciente y todas las prestaciones que se le hicieron, en una o varias líneas.",
    pasos: [
      "Completá fecha, paciente y DNI. Opcional: código de consulta y 'Primera vez' si es paciente nuevo.",
      "Elegí sucursal, piso y odontólogo (los selects se escriben para buscar).",
      "Elegí la obra social. Si la obra social tiene planes (ej. OSDE, Biomed), aparece el selector 'Plan'.",
      "En cada línea elegí el código de prestación: el precio se completa solo según la obra social y el plan.",
      "Para varias prestaciones, tocá 'Agregar línea'. Si algo no está en la lista, usá código/descripción manual.",
      "En cada línea, el check 'Facturable' viene activado. Desmarcalo en trabajos que no se facturan (pruebas, escaneos, impresiones).",
      "Si la línea es una placa MIO, elegí su estado: Impresión, Entrega o Reimpresión.",
      "Revisá el total y tocá 'Guardar atención'.",
    ],
    notas: [
      "Particular: si elegís 'Particular', usás la lista de precios particular en ARS (se gestiona en Precios).",
      "Los precios salen de la sección Precios; si están desactualizados, corregilos ahí.",
      "El check 'Facturable' y el estado de la placa MIO alimentan los análisis del reporte IOMA. Cargalos bien para que los números cierren.",
    ],
  },
  {
    id: "prestaciones",
    icon: Table2,
    titulo: "Prestaciones",
    ruta: "/gestion/prestaciones",
    acceso: "Requiere iniciar sesión.",
    resumen: "Listado de todas las prestaciones cargadas (una fila por prestación), con filtros por fecha.",
    pasos: [
      "Filtrá por rango de fechas para ver las atenciones de un período.",
      "Revisá paciente, obra social, código, monto y odontólogo de cada prestación.",
    ],
  },
  {
    id: "odontologos",
    icon: Stethoscope,
    titulo: "Odontólogos",
    ruta: "/gestion/odontologos",
    acceso: "Ver: cualquier usuario. Crear/editar/eliminar: solo admin.",
    resumen: "Listado de los odontólogos de la clínica, con búsqueda, orden por columna y alta/edición.",
    pasos: [
      "Buscá por nombre o número de matrícula (Nº OD).",
      "Ordená tocando el encabezado de cada columna.",
      "Admin: agregá un odontólogo con su sucursal y piso, o editá/eliminá con los íconos de la fila.",
    ],
  },
  {
    id: "precios",
    icon: DollarSign,
    titulo: "Precios por obra social",
    ruta: "/gestion/precios",
    acceso: "Ver: cualquier usuario. Crear/editar/eliminar: solo admin.",
    resumen:
      "Acá viven los aranceles de cada obra social (y plan). Estos precios son los que autocompletan Nueva prestación.",
    pasos: [
      "Elegí la obra social (el select se escribe para buscar).",
      "Si la obra social tiene planes, filtrá por plan.",
      "Buscá una prestación por código o descripción y ordená por columna.",
      "Admin: editá el monto con el lápiz, agregá una prestación nueva, o eliminá con el tacho.",
    ],
    notas: [
      "Biomed muestra el desglose O.S. / Paciente (copago).",
      "Algunas filas de OSPJN (sección prótesis) vienen del documento original con errores: revisalas y corregí el monto a mano.",
      "'Particular' se gestiona como una obra social más, en pesos.",
    ],
  },
  {
    id: "reportes",
    icon: FileText,
    titulo: "Reportes (diario e IOMA)",
    ruta: "/gestion/reportes/diario · /gestion/reportes/ioma",
    acceso: "Requiere iniciar sesión.",
    resumen:
      "Reportes para control y presentación: el diario resume la actividad del día; el de IOMA arma la liquidación específica de esa obra social.",
    pasos: [
      "Reporte diario: elegí la fecha y, si querés, filtrá por sucursal, obra social y/o odontólogo. Arriba ves los totales (pacientes, prestaciones y facturación).",
      "Reporte IOMA: elegí el período. Además del total, trae los análisis específicos de IOMA.",
      "Revisá los totales y exportá a Excel o PDF.",
    ],
    notas: [
      "Pacientes = cantidad de atenciones distintas; prestaciones = cantidad de líneas cargadas.",
      "El reporte IOMA muestra: primeras consultas, actividades por odontólogo, placas MIO (impresas vs entregadas, con sus sesiones), incrustaciones y trabajos no facturables por odontólogo.",
    ],
  },
  {
    id: "admin",
    icon: Settings,
    titulo: "Administración",
    ruta: "/gestion/admin",
    acceso: "Solo admin.",
    resumen: "Configuración de toda la plataforma, organizada en pestañas.",
    pasos: [
      "Usuarios: crear cuentas, asignar rol y sucursal (CABA, La Plata o Ambas), resetear contraseña, dar de baja.",
      "Sucursales: alta/baja de las sedes (ej. CABA, La Plata).",
      "Pisos: pisos/consultorios dentro de cada sucursal.",
      "Obras sociales: listado de coberturas; marcar activas e indicar si son particular.",
      "Nomencladores: aranceles por obra social (también editables desde la pantalla Precios).",
      "Servicios particulares: catálogo aparte de servicios en USD.",
    ],
    notas: ["Crear los usuarios desde acá garantiza que queden con el rol y la sucursal correctos."],
  },
  {
    id: "roles",
    icon: ShieldCheck,
    titulo: "Roles y sucursales",
    acceso: "—",
    resumen: "El rol define qué puede editar; la sucursal asignada define qué información ve.",
    notas: [
      "Admin: ve y edita todo (Administración y precios), dentro de su(s) sucursal(es) asignada(s).",
      "Operador (sin rol admin): puede cargar atenciones, ver listados y reportes, pero no editar la configuración ni los precios.",
      "Cada cuenta se asigna a CABA, La Plata o Ambas (desde Administración → Usuarios).",
      "Toda la información (reportes, prestaciones, odontólogos) se muestra de la sucursal activa.",
      "Quien tiene Ambas ve un selector de sucursal en el menú lateral para cambiar de sede (una por vez). Quien tiene una sola la ve fija.",
    ],
  },
];

function AyudaPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" /> Ayuda y documentación
          </h1>
          <p className="text-sm text-muted-foreground">
            Guía de cada pantalla del sistema: qué hace, quién puede usarla y cómo.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => import("@/lib/gestion/tour").then((m) => m.startTour())}
        >
          <PlayCircle className="h-4 w-4 mr-2" /> Ver tutorial guiado
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Índice</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {SECCIONES.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <s.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.titulo}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {SECCIONES.map((s) => (
        <Card key={s.id} id={s.id} className="scroll-mt-6">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 text-primary p-2">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{s.titulo}</h2>
                {s.ruta && <div className="text-xs font-mono text-muted-foreground">{s.ruta}</div>}
              </div>
            </div>

            <p className="text-sm">{s.resumen}</p>

            <div className="text-xs">
              <span className="font-medium text-muted-foreground">Acceso: </span>
              <span>{s.acceso}</span>
            </div>

            {s.pasos && (
              <div>
                <div className="text-sm font-medium mb-1">Cómo se usa</div>
                <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                  {s.pasos.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
              </div>
            )}

            {s.notas && (
              <div>
                <div className="text-sm font-medium mb-1">A tener en cuenta</div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {s.notas.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
