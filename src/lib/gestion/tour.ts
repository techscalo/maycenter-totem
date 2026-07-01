import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "gestion_tour_done";

const STEPS: DriveStep[] = [
  {
    popover: {
      title: "Bienvenido a Maycenter",
      description:
        "Te muestro en 1 minuto cómo funciona el sistema de gestión. Podés salir cuando quieras con Esc.",
    },
  },
  {
    element: '[data-tour="sucursal"]',
    popover: {
      title: "Sucursal activa",
      description:
        "Toda la info (reportes, prestaciones, odontólogos) corresponde a esta sede. Si tu cuenta tiene acceso a las dos, podés cambiar de sucursal acá.",
    },
  },
  {
    element: '[data-tour="recepcion"]',
    popover: {
      title: "Recepción",
      description:
        "Las llegadas que cargan los pacientes desde el tótem aparecen acá. La recepcionista las va marcando como atendidas. Se actualiza sola cada ~10s.",
    },
  },
  {
    element: '[data-tour="nueva"]',
    popover: {
      title: "Nueva prestación",
      description:
        "Cargás una atención: paciente, obra social y una o varias prestaciones. Marcá si una línea es facturable o no, y el estado de las placas MIO (impresión / entrega).",
    },
  },
  {
    element: '[data-tour="prestaciones"]',
    popover: {
      title: "Prestaciones",
      description: "El listado de todo lo cargado, con filtros. Desde acá podés editar o corregir.",
    },
  },
  {
    element: '[data-tour="odontologos"]',
    popover: {
      title: "Odontólogos",
      description:
        "El padrón de profesionales. Cada uno tiene su número de OD que aparece en los reportes.",
    },
  },
  {
    element: '[data-tour="precios"]',
    popover: {
      title: "Precios",
      description:
        "La lista de precios por obra social y plan. Lo que cargues acá autocompleta los montos en Nueva prestación.",
    },
  },
  {
    element: '[data-tour="diario"]',
    popover: {
      title: "Reporte diario",
      description:
        "Total del día con filtros por obra social y por odontólogo: facturación, pacientes y prestaciones. Exportable a Excel y PDF.",
    },
  },
  {
    element: '[data-tour="ioma"]',
    popover: {
      title: "Reporte IOMA",
      description:
        "Además del total, trae los análisis que pide IOMA: primeras consultas, actividades por odontólogo, placas MIO (impresas/entregadas), incrustaciones y trabajos no facturables.",
    },
  },
  {
    element: '[data-tour="sidebar-toggle"]',
    popover: {
      title: "Colapsar el menú",
      description: "Achicá el menú lateral para ganar espacio. Tu preferencia queda guardada.",
    },
  },
  {
    element: '[data-tour="ayuda"]',
    popover: {
      title: "Ayuda",
      description:
        "Acá tenés esta guía siempre disponible y podés volver a ver este tour cuando quieras.",
    },
  },
];

export function startTour() {
  const d = driver({
    showProgress: true,
    nextBtnText: "Siguiente",
    prevBtnText: "Anterior",
    doneBtnText: "Listo",
    progressText: "{{current}} de {{total}}",
    steps: STEPS,
    onDestroyed: () => localStorage.setItem(TOUR_KEY, "1"),
  });
  d.drive();
}

export function maybeStartTourForNewUser() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(TOUR_KEY) === "1") return;
  // Pequeño delay para asegurar que el sidebar esté montado.
  setTimeout(startTour, 600);
}
