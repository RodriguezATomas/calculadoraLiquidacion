import { sanitizeConvenioSections } from "./normalizer.js";

const SECTION_TITLES = {
  categorias: "Categorias",
  escalas: "Escalas",
  adicionales: "Adicionales",
  formulas: "Formulas",
  zonas: "Zonas",
};

const toReviewItems = (items = [], key) => items.map((item, index) => ({
  id: item.id || `${key}-${index + 1}`,
  title: item.nombre || item.categoriaId || `${SECTION_TITLES[key]} ${index + 1}`,
  text: JSON.stringify(item, null, 2),
  pageNumber: item.pageNumber || null,
  score: item.score || 1,
}));

const safeParseItem = (text, fallback = {}) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

export const buildConvenioJsonFiles = (bundle) => ({
  "metadata.json": bundle.metadata,
  "categorias.json": bundle.categorias,
  "escalas.json": bundle.escalas,
  "adicionales.json": bundle.adicionales,
  "formulas.json": bundle.formulas,
  "zonas.json": bundle.zonas,
});

export const buildReviewStateFromBundle = (bundle) => ({
  importedAt: new Date().toISOString(),
  ignoreLegalArticles: true,
  sections: Object.keys(SECTION_TITLES).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    enabled: true,
    collapsed: false,
    items: toReviewItems(bundle[key] || [], key),
  })),
  summary: {
    detectedBlocks: Object.keys(SECTION_TITLES).reduce((total, key) => total + (bundle[key]?.length || 0), 0),
    legalArticles: 0,
  },
});

export const buildConvenioBundleFromReview = (metadata, reviewState) => {
  const rawSections = reviewState.sections.reduce((accumulator, section) => {
    accumulator[section.key] = section.enabled
      ? section.items.map((item) => safeParseItem(item.text, { nombre: item.title }))
      : [];
    return accumulator;
  }, {});
  const sections = sanitizeConvenioSections(rawSections);

  return {
    metadata,
    categorias: sections.categorias || [],
    escalas: sections.escalas || [],
    adicionales: sections.adicionales || [],
    formulas: sections.formulas || [],
    zonas: sections.zonas || [],
  };
};
