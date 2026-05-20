const REVIEW_SECTIONS = [
  { key: "categorias", title: "Categorias" },
  { key: "adicionales", title: "Adicionales" },
  { key: "escalas", title: "Escalas" },
  { key: "formulas", title: "Formulas" },
  { key: "zonas", title: "Zonas" },
];

const mapItems = (items = []) => items.map((item, index) => ({
  id: `${item.pageNumber || "manual"}-${index}-${item.title || "item"}`,
  title: item.title || `Item ${index + 1}`,
  text: item.text || "",
  pageNumber: item.pageNumber || null,
  score: item.score || 0,
}));

export const createImportReviewState = (document, detection) => {
  const sections = REVIEW_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    enabled: true,
    collapsed: false,
    items: mapItems(detection?.[section.key] || []),
  }));

  return {
    importedAt: new Date().toISOString(),
    ignoreLegalArticles: true,
    sections,
    summary: {
      detectedBlocks: sections.reduce((total, section) => total + section.items.length, 0),
      legalArticles: detection?.debug?.articulosImportantes?.length || 0,
    },
  };
};
