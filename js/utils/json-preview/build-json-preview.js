import { sanitizeConvenioSections } from "../../services/convenio-import/normalizer.js";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const buildImportJsonPreview = (document, reviewState, validation) => {
  if (!document || !reviewState) {
    return {};
  }

  const rawSections = reviewState.sections.reduce((accumulator, section) => {
    accumulator[section.key] = section.enabled
      ? section.items.map((item) => safeParse(item.text, {
        nombre: item.title,
        }))
      : [];
    return accumulator;
  }, {});
  const sections = sanitizeConvenioSections(rawSections, {
    fallbackPeriod: validation?.convenio?.escalas?.[0]?.periodo || "",
  });

  return {
    metadata: {
      nombre: validation?.convenio?.metadata?.nombre || document.fileName.replace(/\.pdf$/i, ""),
      slug: validation?.convenio?.metadata?.slug || validation?.convenio?.metadata?.id || "",
      source: document.fileName,
      paginas: document.totalPages,
      fechaImportacion: reviewState.importedAt,
    },
    categorias: sections.categorias || [],
    escalas: sections.escalas || [],
    adicionales: sections.adicionales || [],
    formulas: sections.formulas || [],
    zonas: sections.zonas || [],
  };
};
