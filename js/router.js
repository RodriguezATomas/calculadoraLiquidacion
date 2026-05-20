const ROUTES = {
  dashboard: {
    id: "dashboard",
    href: "index.html",
    label: "Inicio",
    searchPlaceholder: "Buscar convenios, categorías, cálculos...",
  },
  selector: {
    id: "selector",
    href: "convenios.html",
    label: "Elegir convenio",
    searchPlaceholder: "Buscar convenio...",
  },
  chatbot: {
    id: "chatbot",
    href: "ia-center.html",
    label: "Consultas al chatbot",
    searchPlaceholder: "Buscar conversación o consulta...",
  },
  ia: {
    id: "ia",
    href: "ia-center.html",
    label: "Centro IA",
    searchPlaceholder: "Buscar análisis, prompts o conversaciones...",
  },
  convenios: {
    id: "convenios",
    href: "convenios.html",
    label: "Convenios",
    searchPlaceholder: "Buscar convenio...",
  },
  "convenio-editor": {
    id: "convenio-editor",
    href: "convenio-editor.html",
    label: "Editor de convenio",
    searchPlaceholder: "Buscar registros del convenio...",
  },
  configuracion: {
    id: "configuracion",
    href: "configuracion.html",
    label: "Configuración",
    searchPlaceholder: "Buscar configuración...",
  },
};

export const getRouteMap = () => ROUTES;

export const getRouteForPage = (page) => {
  if (page === "convenios") {
    return ROUTES.convenios;
  }

  if (page === "ia-center") {
    return ROUTES.ia;
  }

  if (page === "configuracion") {
    return ROUTES.configuracion;
  }

  if (page === "convenio-editor") {
    return ROUTES["convenio-editor"];
  }

  return ROUTES.dashboard;
};

export const navigateTo = (href) => {
  window.location.href = href;
};
