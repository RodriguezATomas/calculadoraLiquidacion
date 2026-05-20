const normalizeText = (value) => String(value || "").trim();

const slugify = (value) => (
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);

const SPANISH_MONTHS = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const SECTION_KEYS = ["categorias", "escalas", "adicionales", "formulas", "zonas"];

const CATEGORY_STOPWORDS = [
  "categoria",
  "categorias",
  "basico",
  "basicos",
  "escala",
  "escalas",
  "remuneracion",
  "remuneraciones",
  "salario",
  "salarios",
  "vigencia",
  "periodo",
  "zona",
];

const FORMULA_HINTS = ["adicional", "presentismo", "antig", "asistencia", "zona", "viatico", "plus", "titulo", "bonificacion"];

const normalizeLine = (value) => (
  normalizeText(value)
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .trim()
);

const splitLines = (value) => (
  String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean)
);

const parseMoneyToken = (value) => {
  const source = normalizeText(value).replace(/\s/g, "");
  if (!source) {
    return 0;
  }

  if (/^\d+$/.test(source)) {
    return Number(source);
  }

  if (source.includes(",") && source.includes(".")) {
    return Number(source.replace(/\./g, "").replace(",", ".")) || 0;
  }

  if (source.includes(",")) {
    const [left, right = ""] = source.split(",");
    if (right.length === 2) {
      return Number(`${left.replace(/\./g, "")}.${right}`) || 0;
    }
    return Number(`${left}${right}`.replace(/\./g, "")) || 0;
  }

  return Number(source.replace(/\./g, "")) || 0;
};

const parseMoney = (value) => {
  const source = typeof value === "number" ? String(value) : normalizeText(value);
  if (!source) {
    return 0;
  }

  const matches = [...source.matchAll(/\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/g)]
    .map((match) => parseMoneyToken(match[1]))
    .filter((amount) => amount > 0);

  return matches.length ? Math.max(...matches) : 0;
};

const parsePercent = (value) => {
  const source = typeof value === "number" ? String(value) : normalizeText(value);
  if (!source) {
    return 0;
  }

  const matched = source.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!matched) {
    return Number.isFinite(Number(source)) ? Number(source) : 0;
  }

  return Number(matched[1].replace(",", ".")) || 0;
};

const parsePeriodsFromText = (value) => {
  const source = normalizeText(value).toLowerCase();
  const found = new Set();

  [...source.matchAll(/\b(20\d{2})[\/.-](0[1-9]|1[0-2])\b/g)].forEach((match) => {
    found.add(`${match[1]}-${match[2]}`);
  });

  [...source.matchAll(/\b(0[1-9]|1[0-2])[\/.-](20\d{2})\b/g)].forEach((match) => {
    found.add(`${match[2]}-${match[1]}`);
  });

  [...source.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})\b/g)].forEach((match) => {
    found.add(`${match[2]}-${SPANISH_MONTHS[match[1]]}`);
  });

  return [...found];
};

const pickPrimaryPeriod = (...values) => {
  const periods = values.flatMap((value) => parsePeriodsFromText(value));
  return periods[0] || "";
};

const normalizeZonaNombre = (value) => {
  const source = normalizeText(value).toLowerCase();
  if (!source || source === "general") {
    return "general";
  }

  const zonaMatch = source.match(/zona\s+([a-z0-9\- ]+)/i);
  if (zonaMatch?.[1]) {
    return normalizeText(zonaMatch[1]).toLowerCase();
  }

  if (source.includes("patagon")) {
    return "patagonica";
  }

  if (source.includes("austral")) {
    return "austral";
  }

  return source;
};

const extractZonaFromText = (value) => {
  const source = normalizeText(value);
  if (!source) {
    return "general";
  }

  const explicit = source.match(/zona\s+([a-z0-9\- ]+)/i);
  if (explicit?.[1]) {
    return normalizeZonaNombre(explicit[1]);
  }

  if (/desfavorable/i.test(source)) {
    return "desfavorable";
  }

  if (/patagon/i.test(source)) {
    return "patagonica";
  }

  if (/austral/i.test(source)) {
    return "austral";
  }

  return "general";
};

const cleanCategoryName = (value) => {
  let cleaned = normalizeLine(value)
    .replace(/\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d+)?/g, " ")
    .replace(/\b(20\d{2})[\/.-](0[1-9]|1[0-2])\b/g, " ")
    .replace(/\b(0[1-9]|1[0-2])[\/.-](20\d{2})\b/g, " ")
    .replace(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+20\d{2}\b/gi, " ")
    .replace(/\b(?:zona|general|desfavorable|patagonica|austral)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  CATEGORY_STOPWORDS.forEach((word) => {
    cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, "gi"), " ").replace(/\s+/g, " ").trim();
  });

  return cleaned.replace(/^[\-:;,./ ]+|[\-:;,./ ]+$/g, "").trim();
};

const dedupeByKey = (items, getKey) => {
  const used = new Set();
  return items.filter((item, index) => {
    const key = getKey(item, index);
    if (!key || used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  });
};

const collectDocumentLines = (documentData) => (
  (documentData?.pages || []).flatMap((page) => splitLines(page.text).map((line) => ({
    line,
    pageNumber: page.pageNumber,
  })))
);

const collectSectionItems = (extractedData, key) => Array.isArray(extractedData?.[key]) ? extractedData[key] : [];

const collectSectionLines = (extractedData, key) => collectSectionItems(extractedData, key).flatMap((item) => (
  splitLines(item?.text || item?.texto || item?.rawText || item?.nombre || item?.categoria || "")
));

const buildScaleCandidatesFromItems = (items) => items.map((item, index) => {
  const categoria = normalizeText(item?.categoria || item?.categoriaNombre || item?.nombre || item?.categoriaId);
  const monto = parseMoney(item?.monto ?? item?.valor);
  const periodo = normalizeText(item?.periodo || item?.vigencia || "");
  const zona = normalizeZonaNombre(item?.zona || "general");
  return categoria && monto > 0
    ? {
        key: `${slugify(categoria)}|${periodo || "sin-periodo"}|${zona}|${index}`,
        categoria,
        monto,
        periodo,
        zona,
      }
    : null;
}).filter(Boolean);

const buildScaleCandidatesFromLines = (lines, fallbackPeriod) => lines.map(({ line }, index) => {
  const moneyMatches = [...line.matchAll(/\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/g)];
  const amounts = moneyMatches
    .map((match) => ({
      raw: match[0],
      value: parseMoneyToken(match[1]),
      index: match.index || 0,
    }))
    .filter((entry) => entry.value >= 1000);

  if (!amounts.length) {
    return null;
  }

  const selectedAmount = amounts.sort((left, right) => right.value - left.value)[0];
  const categoria = cleanCategoryName(line.slice(0, selectedAmount.index));
  if (!categoria || categoria.length < 3) {
    return null;
  }

  return {
    key: `${slugify(categoria)}|${pickPrimaryPeriod(line) || fallbackPeriod || "sin-periodo"}|${extractZonaFromText(line)}|${index}`,
    categoria,
    monto: selectedAmount.value,
    periodo: pickPrimaryPeriod(line) || fallbackPeriod || "",
    zona: extractZonaFromText(line),
  };
}).filter(Boolean);

const buildCategoryCandidates = ({ extractedData, scaleCandidates, fallbackPeriod }) => {
  const direct = collectSectionItems(extractedData, "categorias")
    .map((item, index) => {
      const nombre = cleanCategoryName(item?.nombre || item?.categoria || item?.title || item?.id || "");
      return nombre
        ? {
            key: `${slugify(nombre)}|${index}`,
            nombre,
            basico: parseMoney(item?.basico ?? item?.monto ?? item?.valor),
            zona: normalizeZonaNombre(item?.zona || "general"),
            periodo: normalizeText(item?.periodo || item?.vigencia || fallbackPeriod),
          }
        : null;
    })
    .filter(Boolean);

  const fromScales = scaleCandidates.map((item, index) => ({
    key: `${slugify(item.categoria)}|escala|${index}`,
    nombre: item.categoria,
    basico: item.zona === "general" ? item.monto : 0,
    zona: item.zona || "general",
    periodo: item.periodo || fallbackPeriod,
  }));

  return [...direct, ...fromScales];
};

const normalizeCategorias = (items = [], fallbackPeriod = "") => dedupeByKey(items
  .map((item, index) => {
    const nombre = cleanCategoryName(item?.nombre || item?.categoria || item?.title || item?.id || "");
    if (!nombre) {
      return null;
    }

    return {
      id: slugify(item?.id || item?.codigo || nombre || `categoria-${index + 1}`),
      codigo: normalizeText(item?.codigo || ""),
      nombre,
      basico: parseMoney(item?.basico ?? item?.monto ?? item?.valor),
      zona: normalizeZonaNombre(item?.zona || "general"),
      periodo: normalizeText(item?.periodo || item?.vigencia || fallbackPeriod),
      estado: normalizeText(item?.estado || "activo") || "activo",
    };
  })
  .filter(Boolean), (item) => item.id);

const normalizeEscalas = (items = [], categorias = [], fallbackPeriod = "") => items
  .map((item, index) => {
    const categoriaNombre = cleanCategoryName(item?.categoria || item?.categoriaNombre || item?.nombre || item?.title || item?.categoriaId);
    const categoriaId = item?.categoriaId
      ? slugify(item.categoriaId)
      : (categorias.find((categoria) => slugify(categoria.nombre) === slugify(categoriaNombre))?.id || slugify(categoriaNombre));
    const monto = parseMoney(item?.monto ?? item?.valor);
    const periodo = normalizeText(item?.periodo || item?.vigencia || fallbackPeriod || "");
    if (!categoriaId || !monto) {
      return null;
    }

    return {
      categoriaId,
      nombre: categoriaNombre,
      codigo: normalizeText(item?.codigo || ""),
      basico: parseMoney(item?.basico),
      incremento: parseMoney(item?.incremento),
      total: parseMoney(item?.total),
      periodo,
      monto,
      zona: normalizeZonaNombre(item?.zona || "general"),
      estado: normalizeText(item?.estado || "activo") || "activo",
    };
  })
  .filter(Boolean);

const inferFormulaBase = (value) => {
  const source = normalizeText(value).toLowerCase();
  if (source.includes("total remunerativo")) {
    return "total_remunerativo";
  }
  if (source.includes("remunerativo")) {
    return "total_remunerativo";
  }
  return "basico";
};

const cleanFormulaName = (value, fallback) => {
  const source = normalizeLine(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d+)?/g, " ")
    .replace(/\bsobre\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return source || fallback;
};

const normalizeFormulaItems = (items = [], fallbackKind = "formula") => dedupeByKey(items
  .map((item, index) => {
    const rawLabel = item?.nombre || item?.title || item?.line || item?.id || `${fallbackKind} ${index + 1}`;
    const tipo = normalizeText(item?.tipo || (String(item?.valor || "").includes("%") ? "percentage" : ""));
    const percent = parsePercent(item?.valor ?? item?.line ?? rawLabel);
    const money = parseMoney(item?.valor ?? item?.line ?? rawLabel);
    const resolvedType = tipo || (percent > 0 ? "percentage" : "fixed");
    const valor = resolvedType === "percentage" ? percent : money;
    const nombre = cleanFormulaName(rawLabel, `${fallbackKind} ${index + 1}`);
    if (!nombre || valor <= 0) {
      return null;
    }

    return {
      id: slugify(item?.id || nombre || `${fallbackKind}-${index + 1}`),
      codigo: normalizeText(item?.codigo || ""),
      nombre,
      concepto: normalizeText(item?.concepto || nombre),
      formula: normalizeText(item?.formula || ""),
      tipo: resolvedType,
      base: normalizeText(item?.base || inferFormulaBase(item?.base || item?.line || rawLabel)),
      valor,
      estado: normalizeText(item?.estado || "activo") || "activo",
    };
  })
  .filter(Boolean), (item) => item.id);

const buildFormulaCandidatesFromLines = (lines) => lines
  .map(({ line }, index) => {
    const lower = line.toLowerCase();
    const hasHint = FORMULA_HINTS.some((hint) => lower.includes(hint)) || /%/.test(line);
    if (!hasHint) {
      return null;
    }

    const percent = parsePercent(line);
    const money = parseMoney(line);
    if (!percent && !money) {
      return null;
    }

    return {
      id: slugify(line),
      nombre: cleanFormulaName(line, `formula ${index + 1}`),
      tipo: percent ? "percentage" : "fixed",
      base: inferFormulaBase(line),
      valor: percent || money,
    };
  })
  .filter(Boolean);

const normalizeZonas = (items = []) => dedupeByKey(items
  .map((item, index) => {
    const nombre = normalizeZonaNombre(item?.nombre || item?.zona || item?.id || "");
    const porcentaje = parsePercent(item?.porcentaje ?? item?.valor ?? item?.line);
    if (!nombre) {
      return null;
    }

    return {
      id: slugify(item?.id || nombre || `zona-${index + 1}`),
      nombre: nombre === "general" ? "Zona general" : nombre,
      porcentaje,
      region: normalizeText(item?.region || ""),
      estado: normalizeText(item?.estado || "activo") || "activo",
    };
  })
  .filter(Boolean), (item) => item.id);

const buildZonaCandidatesFromLines = (lines) => lines
  .map(({ line }, index) => {
    if (!/zona|desfavorable|patagon|austral/i.test(line)) {
      return null;
    }

    const porcentaje = parsePercent(line);
    if (!porcentaje) {
      return null;
    }

    return {
      id: `zona-${index + 1}`,
      nombre: extractZonaFromText(line),
      porcentaje,
    };
  })
  .filter(Boolean);

const normalizeMetadata = (documentData, extractedData) => {
  const rawName = extractedData?.metadataHints?.nombre || documentData?.fileName?.replace(/\.pdf$/i, "") || "convenio";
  return {
    id: slugify(rawName),
    slug: slugify(rawName),
    nombre: normalizeText(rawName),
    cct: normalizeText(extractedData?.metadataHints?.cct || ""),
    activity: normalizeText(extractedData?.metadataHints?.activity || ""),
    source: documentData?.fileName || "",
    sourceType: documentData?.source || "pdf",
    updatedAt: new Date().toISOString(),
    status: "review",
    estado: "review",
  };
};

export const sanitizeConvenioSections = (sections = {}, options = {}) => {
  const fallbackPeriod = normalizeText(options.fallbackPeriod || "");
  const categorias = normalizeCategorias(sections.categorias || [], fallbackPeriod);
  const escalas = normalizeEscalas(sections.escalas || [], categorias, fallbackPeriod);
  const adicionales = normalizeFormulaItems(sections.adicionales || [], "adicional");
  const formulas = normalizeFormulaItems(sections.formulas || [], "formula");
  const zonas = normalizeZonas(sections.zonas || []);

  return {
    categorias: categorias.map((categoria) => {
      const escalaGeneral = escalas.find((escala) => escala.categoriaId === categoria.id && escala.zona === "general");
      return {
        ...categoria,
        basico: categoria.basico || escalaGeneral?.monto || 0,
        periodo: categoria.periodo || escalaGeneral?.periodo || fallbackPeriod,
      };
    }),
    escalas: dedupeByKey(escalas, (item) => `${item.categoriaId}|${item.periodo}|${item.zona}`),
    adicionales,
    formulas,
    zonas,
  };
};

export const normalizeConvenioExtraction = (documentData, extractedData) => {
  const documentLines = collectDocumentLines(documentData);
  const fallbackPeriod = pickPrimaryPeriod(
    documentData?.fullText,
    ...SECTION_KEYS.flatMap((key) => collectSectionLines(extractedData, key))
  );

  const scaleCandidates = [
    ...buildScaleCandidatesFromItems(collectSectionItems(extractedData, "escalas")),
    ...buildScaleCandidatesFromLines(documentLines, fallbackPeriod),
  ];

  const categoryCandidates = buildCategoryCandidates({
    extractedData,
    scaleCandidates,
    fallbackPeriod,
  });

  const formulaCandidates = [
    ...collectSectionItems(extractedData, "formulas"),
    ...collectSectionItems(extractedData, "adicionales"),
    ...buildFormulaCandidatesFromLines(documentLines),
  ];

  const zonaCandidates = [
    ...collectSectionItems(extractedData, "zonas"),
    ...buildZonaCandidatesFromLines(documentLines),
  ];

  const sections = sanitizeConvenioSections({
    categorias: categoryCandidates,
    escalas: scaleCandidates,
    adicionales: collectSectionItems(extractedData, "adicionales"),
    formulas: formulaCandidates,
    zonas: zonaCandidates,
  }, {
    fallbackPeriod,
  });

  return {
    metadata: normalizeMetadata(documentData, extractedData),
    categorias: sections.categorias,
    escalas: sections.escalas,
    adicionales: sections.adicionales,
    formulas: sections.formulas,
    zonas: sections.zonas,
  };
};
