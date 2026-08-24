import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Monitor, ClipboardList, LogIn, LayoutDashboard, BarChart3, ListPlus, Table2,
  Stethoscope, DollarSign, FileText, Settings, ShieldCheck, HelpCircle, PlayCircle, Upload,
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
      "El DNI es obligatorio y debe tener entre 6 y 9 dígitos (sin puntos).",
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
      "Centro de la recepcionista, con dos solapas: 'Orden de llegada (tótem)', que muestra las llegadas que los pacientes cargan en el tótem; y 'Turnos del día', que muestra los turnos agendados (de GHL) más los turnos cargados a mano.",
    pasos: [
      "Solapa 'Orden de llegada': mirá los pacientes que registraron su llegada (más reciente arriba), cambiales el estado a medida que avanza la atención y usá 'archivar' para limpiar las llegadas viejas del día.",
      "Solapa 'Turnos del día': elegí la fecha y filtrá por agenda, estado o buscador. Cada turno muestra hora, paciente, obra social y agenda.",
      "Marcá el estado de cada turno con el selector: En recepción → En sala → Finalizado (o Ausente).",
      "Cuando el paciente pasa al consultorio, marcá 'En sala': queda registrada la hora de ingreso a sala en su columna.",
      "Para un turno que no está en GHL, tocá 'Agregar turno', completá los datos (DNI obligatorio) y guardá. Aparece en la lista junto a los demás.",
    ],
    notas: [
      "Dos horas distintas: 'Hora llegada' es cuando el paciente entró a la clínica (check-in del tótem); 'Ingreso a sala' es cuando pasó al box de atención (al marcar 'En sala').",
      "Si un paciente hizo check-in en el tótem, su turno se marca 'En recepción' automáticamente al cruzarse por DNI.",
      "Al marcar 'Finalizado' o 'Ausente' se refleja también en GHL (asistió / no asistió). Los estados intermedios no tocan GHL.",
      "El turno manual no se sincroniza con GHL: vive solo en este sistema. Se puede eliminar con el tacho de su fila.",
      "El botón 'Columnas' permite mostrar u ocultar columnas (DNI, agendado por, etc.); la preferencia se recuerda.",
      "Si no ves llegadas nuevas, esperá unos segundos o recargá la página.",
    ],
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
      "El primer campo es el DNI (obligatorio, 6 a 9 dígitos sin puntos): al completarlo, si el paciente ya existe se autocompletan nombre y obra social.",
      "Revisá fecha (si no es la de hoy aparece un aviso) y paciente. Opcional: código de consulta y 'Primera vez' si es paciente nuevo.",
      "Elegí sucursal, piso y odontólogo (los selects se escriben para buscar).",
      "Elegí la obra social. Si la obra social tiene planes (ej. OSDE, Biomed), aparece el selector 'Plan'.",
      "En cada línea elegí el código de prestación: el precio se completa solo según la obra social y el plan. Si el código tiene copago cargado, el campo Copago se autocompleta (editable).",
      "Para varias prestaciones, tocá 'Agregar línea'. Si algo no está en la lista, usá código/descripción manual.",
      "En cada línea, el check 'Facturable' viene activado. Desmarcalo en trabajos que no se facturan (pruebas, escaneos, impresiones).",
      "Si la línea es una placa MIO, elegí su etapa: Impresión, Entrega o Reimpresión. Si es una prótesis, elegí el tipo: Completa, Parcial, Cromo cobalto, Flexible o Provisoria.",
      "Revisá el total y tocá 'Guardar atención'.",
    ],
    notas: [
      "'Primera vez' ya no se marca solo cuando el DNI no existe: lo decidís vos con el check (la base de pacientes se está poblando).",
      "Copago: es la parte a cargo del paciente. La facturación a la obra social = monto − copago.",
      "Particular: si elegís 'Particular', usás la lista de precios particular en ARS (se gestiona en Precios).",
      "Los precios salen de la sección Precios; si están desactualizados, corregilos ahí o usá la actualización masiva por PDF.",
      "El check 'Facturable' y el sub-tipo (placa MIO / prótesis) alimentan los análisis del reporte IOMA. Cargalos bien para que los números cierren.",
    ],
  },
  {
    id: "prestaciones",
    icon: Table2,
    titulo: "Prestaciones",
    ruta: "/gestion/prestaciones",
    acceso: "Requiere iniciar sesión.",
    resumen: "Listado de todas las prestaciones cargadas (una fila por prestación), con filtros por fecha, edición y borrado (incluso en lote).",
    pasos: [
      "Filtrá por rango de fechas para ver las atenciones de un período.",
      "Revisá paciente, obra social, código, monto y odontólogo de cada prestación.",
      "Editá una fila con el lápiz: podés cambiar fecha, piso, paciente, monto, copago, observaciones y 'Primera vez'.",
      "Para borrar varias juntas, tildá las filas con el checkbox y usá 'Eliminar seleccionadas'.",
    ],
    notas: [
      "El borrado en lote requiere permiso; al borrar todos los ítems de una atención, esa atención también se elimina.",
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
      "El copago (parte a cargo del paciente) es editable por código; Biomed y otras OS con desglose lo usan.",
      "Para cargar muchos precios de golpe, usá 'Actualización masiva de precios' (subís el PDF de la obra social).",
      "'Particular' se gestiona como una obra social más, en pesos (con conversión ARS→USD por cotización).",
    ],
  },
  {
    id: "import-precios",
    icon: Upload,
    titulo: "Actualización masiva de precios (por PDF)",
    ruta: "/gestion/admin → Nomencladores",
    acceso: "Solo admin.",
    resumen:
      "Actualiza todos los aranceles de una obra social de una sola vez subiendo el PDF que manda la obra social. El sistema lo lee, muestra un preview de los cambios y recién aplica cuando confirmás.",
    pasos: [
      "En Configuración → Nomencladores, elegí la obra social.",
      "Tocá 'Actualizar precios masivo' y subí el PDF del arancel (también acepta CSV/Excel).",
      "El sistema detecta el formato solo (podés corregirlo con el selector) y muestra el preview: cuántos precios se actualizan, cuántos quedan igual, cuántos son nuevos y las advertencias.",
      "Revisá la tabla de cambios (precio actual → nuevo). Si hay códigos nuevos, revisá la lista con su descripción y decidí si los creás (checkbox).",
      "Tocá 'Aplicar': se actualizan los precios y queda registrado en el historial.",
    ],
    notas: [
      "Nada se toca hasta que confirmás: el preview es solo lectura.",
      "Es idempotente: si el PDF ya está aplicado, muestra 0 cambios.",
      "Cada actualización guarda los precios viejos en el historial (reversible) y queda en el Registro de cambios.",
      "Las líneas que no se pueden leer o con precios sospechosos salen como advertencias; no se aplican solas.",
      "Formatos soportados: lista plana (ej. Avalian), lista con capítulos (ej. OSPJN) y matriz por plan (ej. OSDE). Una obra social con otro formato requiere agregar su lector.",
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
      "Reporte diario: elegí un día o un rango de fechas (con atajos Hoy / Últimos 7 / Este mes) y, si querés, filtrá por sucursal, obra social y/o odontólogo. Arriba ves los totales.",
      "Reporte IOMA: elegí el período. Además del total, trae los análisis específicos de IOMA.",
      "Revisá los totales y exportá a Excel o PDF (el PDF sale con el branding de Maycenter y los totales arriba).",
    ],
    notas: [
      "Pacientes = cantidad de atenciones distintas; prestaciones = cantidad de líneas cargadas.",
      "Cuando hay copago cargado, el reporte muestra además 'Copago (paciente)' y 'Facturación a OS' (arancel − copago).",
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
      "Nomencladores: aranceles por obra social (código, monto y copago editables), con 'Actualizar precios masivo' para cargar todo desde un PDF.",
      "Servicios particulares: catálogo en USD; podés cargar el precio en pesos y una cotización del día para que calcule el USD solo.",
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
