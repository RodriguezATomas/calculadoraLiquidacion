const SECTION_DEFINITIONS = [
  {
    key: "categories",
    title: "Categorias",
    headingPatterns: [/categor/i, /clasific/i, /puestos/i],
    itemPatterns: [/oficial/i, /medio oficial/i, /ayudante/i, /administrativ/i, /maestranz/i, /categoria/i],
  },
  {
    key: "scales",
    title: "Escalas",
    headingPatterns: [/escala/i, /remuneraci/i, /salari/i, /basico/i],
    itemPatterns: [/\$\s*\d/, /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b/, /jornal/i, /mensual/i],
  },
  {
    key: "additionals",
    title: "Adicionales",
    headingPatterns: [/adicional/i, /plus/i, /viatic/i, /presentismo/i, /zona/i],
    itemPatterns: [/adicional/i, /presentismo/i, /viatic/i, /zona/i, /antiguedad/i, /titulo/i],
  },
  {
    key: "formulas",
    title: "Formulas",
    headingPatterns: [/formula/i, /calculo/i, /porcent/i, /base de calculo/i],
    itemPatterns: [/%/, /sobre/i, /calcular/i, /base/i, /coeficiente/i],
  },
  {
    key: "articles",
    title: "Articulos",
    headingPatterns: [/art(?:iculo|[ií]culo)/i, /disposici/i, /clausula/i],
    itemPatterns: [/^art(?:iculo|[ií]culo)\s+\d+/i],
  },
];

const normalizeLine = (line) => (
  line
    .replace(/\s+/g, " ")
    .trim()
);

const splitLines = (text) => (
  text
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean)
);

const isHeadingLine = (line) => {
  const compact = line.replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (!compact) {
    return false;
  }

  const isUppercase = compact === compact.toUpperCase() && compact.length >= 6;
  return isUppercase || /^art(?:iculo|[ií]culo)\s+\d+/i.test(line);
};

const findHeadingIndexes = (lines) => {
  const indexes = [];

  lines.forEach((line, index) => {
    if (isHeadingLine(line)) {
      indexes.push(index);
    }
  });

  return indexes;
};

const buildSections = (lines) => {
  const headingIndexes = findHeadingIndexes(lines);
  const boundaries = headingIndexes.length ? headingIndexes : [0];

  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? lines.length;
    const content = lines.slice(start, end);

    return {
      heading: content[0] || "Sin titulo",
      content,
      text: content.join("\n"),
    };
  });
};

const scoreSection = (section, definition) => {
  let score = 0;

  definition.headingPatterns.forEach((pattern) => {
    if (pattern.test(section.heading)) {
      score += 3;
    }
  });

  definition.itemPatterns.forEach((pattern) => {
    if (pattern.test(section.text)) {
      score += 1;
    }
  });

  return score;
};

const extractEntries = (section, definition) => {
  const entries = [];

  section.content.forEach((line) => {
    if (definition.itemPatterns.some((pattern) => pattern.test(line))) {
      entries.push({
        label: line.slice(0, 120),
        sourceHeading: section.heading,
      });
    }
  });

  return entries.slice(0, 20);
};

const createModule = (definition, section) => {
  const entries = extractEntries(section, definition);

  return {
    key: definition.key,
    title: definition.title,
    heading: section.heading,
    confidence: Math.min(1, scoreSection(section, definition) / 6),
    selected: Boolean(entries.length || section.text),
    summary: section.text.slice(0, 400),
    entries,
    rawText: section.text,
  };
};

const detectSections = (pages) => {
  const lines = splitLines(pages.map((page) => page.text).join("\n"));
  const sections = buildSections(lines);

  return SECTION_DEFINITIONS.reduce((accumulator, definition) => {
    const ranked = sections
      .map((section) => ({ section, score: scoreSection(section, definition) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    accumulator[definition.key] = ranked.length
      ? createModule(definition, ranked[0].section)
      : {
          key: definition.key,
          title: definition.title,
          heading: "No detectado",
          confidence: 0,
          selected: false,
          summary: "",
          entries: [],
          rawText: "",
        };

    return accumulator;
  }, {});
};

export const detectConvenioBlocks = (documentData) => detectSections(documentData.pages);

export const buildConvenioJsonBundle = ({ slug, name, sourceFileName, pageCount, modules }) => ({
  convenio: {
    id: slug,
    nombre: name,
    fuente: sourceFileName,
    pageCount,
  },
  categorias: {
    items: modules.categories.entries,
    rawText: modules.categories.rawText,
  },
  adicionales: {
    items: modules.additionals.entries,
    rawText: modules.additionals.rawText,
  },
  escalas: {
    items: modules.scales.entries,
    rawText: modules.scales.rawText,
  },
  formulas: {
    items: modules.formulas.entries,
    rawText: modules.formulas.rawText,
  },
  metadata: {
    generatedAt: new Date().toISOString(),
    headings: Object.fromEntries(Object.values(modules).map((module) => [module.key, module.heading])),
    selectedModules: Object.fromEntries(Object.values(modules).map((module) => [module.key, module.selected])),
    articulosImportantes: {
      items: modules.articles.entries,
      rawText: modules.articles.rawText,
    },
  },
});
