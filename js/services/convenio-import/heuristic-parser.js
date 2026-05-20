const ROW_Y_TOLERANCE = 3;
const COLUMN_X_TOLERANCE = 18;
const TABLE_GAP_ROWS = 2;
const MIN_TABLE_ROWS = 3;
const MIN_TABLE_COLUMNS = 2;

const normalizeText = (value) => String(value || "").trim();
const normalizeLine = (value) => normalizeText(value).replace(/\s+/g, " ");

const slugify = (value) => (
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);

const CODE_PATTERN = /^[A-Z]{0,3}\d{1,3}[A-Z]{0,2}$/i;
const ZONA_PATTERN = /^zona\s+[ivx0-9]+$/i;
const FORMULA_PATTERN = /[A-Z]\[\d+\]|\*|\/|\+|-/;
const PERCENT_PATTERN = /(\d+(?:[.,]\d+)?)\s*%/;

const INSTITUTIONAL_PATTERNS = [
  /ministerio/i,
  /secretaria/i,
  /subsecretaria/i,
  /federacion/i,
  /federación/i,
  /sindicato/i,
  /convenio colectivo/i,
  /homologacion/i,
  /homologación/i,
  /resolucion/i,
  /resolución/i,
  /expediente/i,
  /^pagina\s+\d+/i,
  /^pág\.\s*\d+/i,
];

const HEADER_NOISE_PATTERNS = [
  /codigo|código|cat\.?|categoría|descripcion|descripción|sistema|nombre/i,
  /basico|básico|inc\.?|incremento|total|periodo|período/i,
  /zona|porcentaje|región|region|regiones/i,
  /concepto|fórmula|formula/i,
];

const PERIOD_MONTHS = {
  ene: "01",
  enero: "01",
  feb: "02",
  febrero: "02",
  mar: "03",
  marzo: "03",
  abr: "04",
  abril: "04",
  may: "05",
  mayo: "05",
  jun: "06",
  junio: "06",
  jul: "07",
  julio: "07",
  ago: "08",
  agosto: "08",
  sep: "09",
  sept: "09",
  septiembre: "09",
  set: "09",
  setiembre: "09",
  oct: "10",
  octubre: "10",
  nov: "11",
  noviembre: "11",
  dic: "12",
  diciembre: "12",
};

export const normalizeMoney = (value) => {
  const source = normalizeText(value).replace(/\s/g, "").replace(/^\$/, "");
  if (!source) {
    return 0;
  }

  if (source.includes(",") && source.includes(".")) {
    const decimalSeparator = source.lastIndexOf(",") > source.lastIndexOf(".") ? "," : ".";
    return decimalSeparator === ","
      ? Number(source.replace(/\./g, "").replace(",", ".")) || 0
      : Number(source.replace(/,/g, "")) || 0;
  }

  if (source.includes(",")) {
    const [left, right = ""] = source.split(",");
    return right.length === 2
      ? Number(`${left.replace(/\./g, "")}.${right}`) || 0
      : Number(`${left}${right}`.replace(/\./g, "")) || 0;
  }

  return Number(source.replace(/\./g, "")) || 0;
};

export const normalizePercent = (value) => {
  const matched = String(value || "").match(PERCENT_PATTERN);
  return matched ? Number(matched[1].replace(",", ".")) || 0 : 0;
};

export const normalizeFormula = (value) => normalizeLine(value);

const parsePeriods = (value) => {
  const source = normalizeText(value).toLowerCase();
  const found = new Set();

  [...source.matchAll(/\b(20\d{2})[\/.-](0[1-9]|1[0-2])\b/g)].forEach((match) => {
    found.add(`${match[1]}-${match[2]}`);
  });

  [...source.matchAll(/\b([a-záéíóú]{3,10})\s*['’]?\s*(\d{2,4})\b/g)].forEach((match) => {
    const month = PERIOD_MONTHS[match[1]];
    const year = match[2].length === 2 ? `20${match[2]}` : match[2];
    if (month) {
      found.add(`${year}-${month}`);
    }
  });

  return [...found];
};

const dedupe = (items, keyBuilder) => {
  const seen = new Set();
  return items.filter((item, index) => {
    const key = keyBuilder(item, index);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const collectPdfItems = (documentData) => (
  (documentData?.pages || []).flatMap((page) => (page.items || []).map((item) => ({
    pageNumber: page.pageNumber,
    text: normalizeText(item.text),
    x: Number(item.x || 0),
    y: Number(item.y || 0),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
  })))
    .filter((item) => item.text)
    .filter((item) => !INSTITUTIONAL_PATTERNS.some((pattern) => pattern.test(item.text)))
);

const groupItemsByRow = (items) => {
  const sorted = [...items].sort((left, right) => {
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    if (Math.abs(right.y - left.y) > ROW_Y_TOLERANCE) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });

  const rows = [];
  sorted.forEach((item) => {
    const row = rows.find((candidate) => candidate.pageNumber === item.pageNumber && Math.abs(candidate.y - item.y) <= ROW_Y_TOLERANCE);
    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
      return;
    }

    rows.push({
      pageNumber: item.pageNumber,
      y: item.y,
      items: [item],
    });
  });

  return rows
    .map((row, index) => {
      const ordered = row.items.sort((left, right) => left.x - right.x);
      return {
        id: `${row.pageNumber}-${index}`,
        pageNumber: row.pageNumber,
        y: row.y,
        items: ordered,
        text: ordered.map((item) => item.text).join(" "),
      };
    })
    .filter((row) => row.items.length >= MIN_TABLE_COLUMNS)
    .filter((row) => !INSTITUTIONAL_PATTERNS.some((pattern) => pattern.test(row.text)));
};

const clusterXs = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const clusters = [];

  sorted.forEach((x) => {
    const cluster = clusters.find((candidate) => Math.abs(candidate.center - x) <= COLUMN_X_TOLERANCE);
    if (cluster) {
      cluster.values.push(x);
      cluster.center = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
      return;
    }

    clusters.push({
      center: x,
      values: [x],
    });
  });

  return clusters.map((cluster) => cluster.center).sort((left, right) => left - right);
};

const buildRowSignature = (row) => row.items.map((item) => item.x);

const signatureCompatible = (anchors, rowXs) => {
  if (!anchors.length || anchors.length !== rowXs.length) {
    return false;
  }
  return rowXs.every((x, index) => Math.abs((anchors[index] || 0) - x) <= COLUMN_X_TOLERANCE * 1.5);
};

const clusterRowItemsToAnchors = (row, anchors) => {
  const cells = anchors.map((anchor, index) => ({
    col: index,
    x: anchor,
    items: [],
  }));

  row.items.forEach((item) => {
    const nearestIndex = anchors.reduce((bestIndex, anchor, index) => {
      const bestDistance = Math.abs(anchors[bestIndex] - item.x);
      const currentDistance = Math.abs(anchor - item.x);
      return currentDistance < bestDistance ? index : bestIndex;
    }, 0);

    cells[nearestIndex].items.push(item);
  });

  const normalized = cells
    .map((cell) => ({
      col: cell.col,
      x: cell.x,
      text: normalizeLine(cell.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ")),
    }))
    .filter((cell) => cell.text);

  const concatenatedColumns = normalized.filter((cell) => {
    const fragments = cell.text.split(/\s{2,}/).filter(Boolean);
    return fragments.length > 2;
  }).length;

  return {
    id: row.id,
    pageNumber: row.pageNumber,
    y: row.y,
    rawItems: row.items,
    cells: normalized,
    columns: anchors.map((_, index) => normalized.find((cell) => cell.col === index)?.text || ""),
    nonEmptyColumns: normalized.length,
    corrupted: normalized.some((cell) => normalizeText(cell.text).length > 60) || concatenatedColumns > 0 || row.items.length > anchors.length + 1,
  };
};

const finalizeTable = (rows, tableIndex) => {
  if (rows.length < MIN_TABLE_ROWS) {
    return null;
  }

  const anchors = clusterXs(rows.flatMap((row) => row.items.map((item) => item.x)));
  if (anchors.length < MIN_TABLE_COLUMNS) {
    return null;
  }

  const reconstructedRows = rows.map((row) => clusterRowItemsToAnchors(row, anchors)).filter((row) => row.nonEmptyColumns > 0);
  const counts = new Map();
  reconstructedRows.forEach((row) => {
    counts.set(row.nonEmptyColumns, (counts.get(row.nonEmptyColumns) || 0) + 1);
  });
  const dominantCount = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 0;
  const denseRows = reconstructedRows.filter((row) => row.nonEmptyColumns === dominantCount).length;
  const validRows = reconstructedRows.filter((row) => !row.corrupted && row.nonEmptyColumns >= Math.max(MIN_TABLE_COLUMNS, dominantCount));

  if (denseRows < MIN_TABLE_ROWS || dominantCount < MIN_TABLE_COLUMNS) {
    return null;
  }

  return {
    id: `table-${tableIndex + 1}`,
    columnAnchors: anchors,
    dominantCount,
    rows: validRows,
    metrics: {
      rows: validRows.length,
      columns: anchors.length,
      denseRows,
    },
  };
};

const buildTables = (rows) => {
  const tables = [];
  let buffer = [];
  let bufferAnchors = [];
  let gapCount = 0;

  const flush = () => {
    if (!buffer.length) {
      return;
    }
    const table = finalizeTable(buffer, tables.length);
    if (table) {
      tables.push(table);
    }
    buffer = [];
    bufferAnchors = [];
    gapCount = 0;
  };

  rows.forEach((row) => {
    const signature = buildRowSignature(row);
    if (signature.length < MIN_TABLE_COLUMNS) {
      gapCount += 1;
      if (gapCount >= TABLE_GAP_ROWS) {
        flush();
      }
      return;
    }

    if (!buffer.length) {
      buffer = [row];
      bufferAnchors = signature;
      gapCount = 0;
      return;
    }

    const samePage = buffer[buffer.length - 1].pageNumber === row.pageNumber;
    const compatible = signatureCompatible(bufferAnchors, signature);

    if (samePage && compatible) {
      buffer.push(row);
      bufferAnchors = clusterXs([...bufferAnchors, ...signature]);
      gapCount = 0;
      return;
    }

    flush();
    buffer = [row];
    bufferAnchors = signature;
    gapCount = 0;
  });

  flush();
  return tables;
};

const flattenTableRows = (tables) => tables.flatMap((table) => table.rows.map((row) => ({ ...row, tableId: table.id })));

const findHeaderTable = (tables, patterns) => {
  for (const table of tables) {
    const headerRow = table.rows.find((row) => patterns.every((pattern) => row.columns.some((column) => pattern.test(column))));
    if (headerRow) {
      return { table, headerRow };
    }
  }
  return { table: null, headerRow: null };
};

const getHeaderIndex = (columns, patterns, fallback = 0) => {
  const index = columns.findIndex((column) => patterns.some((pattern) => pattern.test(column)));
  return index >= 0 ? index : fallback;
};

const buildRowsAfterHeader = (table, headerRow) => {
  if (!table || !headerRow) {
    return [];
  }

  const startIndex = table.rows.findIndex((row) => row.id === headerRow.id);
  return table.rows
    .slice(startIndex + 1)
    .filter((row) => !row.corrupted)
    .filter((row) => row.nonEmptyColumns >= 2)
    .filter((row) => !row.columns.some((column) => HEADER_NOISE_PATTERNS.some((pattern) => pattern.test(column))));
};

export const parsePdfTables = (documentData) => {
  const items = collectPdfItems(documentData);
  const rows = groupItemsByRow(items);
  const tables = buildTables(rows);
  const flatRows = flattenTableRows(tables);
  const columnAnchors = dedupe(tables.flatMap((table) => table.columnAnchors), (value) => Math.round(value)).sort((left, right) => left - right);

  tables.forEach((table) => {
    console.table(table.rows.map((row) => ({
      table: table.id,
      page: row.pageNumber,
      y: Math.round(row.y * 100) / 100,
      columns: row.nonEmptyColumns,
      c0: row.columns[0] || "",
      c1: row.columns[1] || "",
      c2: row.columns[2] || "",
      c3: row.columns[3] || "",
    })));
    console.table(table.columnAnchors.map((x, index) => ({
      table: table.id,
      col: index,
      x: Math.round(x * 100) / 100,
    })));
  });

  return {
    failed: !tables.length,
    tables,
    rows: flatRows,
    columnAnchors,
    metrics: {
      items: items.length,
      rows: rows.length,
      tables: tables.length,
      columns: columnAnchors.length,
    },
  };
};

const parseCategoriasTableRows = (tableData) => {
  const { table, headerRow } = findHeaderTable(tableData.tables, [/codigo|código|cat\.?/i, /descripcion|descripción|sistema|categoría|categoria/i]);
  const headerColumns = headerRow?.columns || [];
  const codeIndex = getHeaderIndex(headerColumns, [/codigo|código|cat\.?/i], 0);
  const nameIndex = getHeaderIndex(headerColumns, [/descripcion|descripción|sistema|categoría|categoria|nombre/i], 1);

  return dedupe(buildRowsAfterHeader(table, headerRow)
    .map((row) => {
      const codigo = normalizeText(row.columns[codeIndex] || "").toUpperCase();
      const nombre = normalizeLine(row.columns[nameIndex] || "");
      if (!codigo || !CODE_PATTERN.test(codigo) || !nombre) {
        return null;
      }
      return {
        codigo,
        nombre,
        pageNumber: row.pageNumber,
        cells: row.cells,
      };
    })
    .filter(Boolean), (item) => item.codigo);
};

const parseEscalasTableRows = (tableData) => {
  const { table, headerRow } = findHeaderTable(tableData.tables, [/cat\.?|código|codigo/i, /basico|básico|total|inc\.?|incremento/i]);
  const headerColumns = headerRow?.columns || [];
  const codeIndex = getHeaderIndex(headerColumns, [/cat\.?|código|codigo/i], 0);
  const basicIndex = getHeaderIndex(headerColumns, [/basico|básico/i], 1);
  const incrementIndex = getHeaderIndex(headerColumns, [/inc\.?|incremento/i], 2);
  const totalIndex = getHeaderIndex(headerColumns, [/total/i], 3);
  const periodo = parsePeriods(headerColumns.join(" "))[0] || "";

  return dedupe(buildRowsAfterHeader(table, headerRow)
    .map((row) => {
      const categoria = normalizeText(row.columns[codeIndex] || "").toUpperCase();
      const basico = normalizeMoney(row.columns[basicIndex] || "");
      const incremento = normalizeMoney(row.columns[incrementIndex] || "");
      const total = normalizeMoney(row.columns[totalIndex] || "");
      if (!categoria || !CODE_PATTERN.test(categoria) || (!basico && !incremento && !total)) {
        return null;
      }
      return {
        categoria,
        basico,
        incremento,
        total: total || basico + incremento,
        periodo,
        pageNumber: row.pageNumber,
        cells: row.cells,
      };
    })
    .filter(Boolean), (item) => `${item.categoria}|${item.periodo}|${item.total}`);
};

const parseZonasTableRows = (tableData) => {
  const { table, headerRow } = findHeaderTable(tableData.tables, [/zona/i, /porcentaje/i, /region|región|regiones/i]);
  const headerColumns = headerRow?.columns || [];
  const zonaIndex = getHeaderIndex(headerColumns, [/zona/i], 0);
  const porcentajeIndex = getHeaderIndex(headerColumns, [/porcentaje/i], 1);
  const regionIndex = getHeaderIndex(headerColumns, [/region|región|regiones/i], 2);

  const explicit = dedupe(buildRowsAfterHeader(table, headerRow)
    .map((row) => {
      const zona = normalizeLine(row.columns[zonaIndex] || "");
      const porcentaje = normalizePercent(row.columns[porcentajeIndex] || "");
      const region = normalizeLine(row.columns[regionIndex] || "");
      if (!zona || (!ZONA_PATTERN.test(zona) && normalizeText(zona).length > 25)) {
        return null;
      }
      return {
        zona,
        porcentaje,
        region,
        pageNumber: row.pageNumber,
        cells: row.cells,
      };
    })
    .filter(Boolean), (item) => item.zona);

  return explicit.length ? explicit : [{ zona: "Zona general", porcentaje: 0, region: "", pageNumber: 0, cells: [] }];
};

const parseFormulasTableRows = (tableData) => {
  const { table, headerRow } = findHeaderTable(tableData.tables, [/cod/i, /concepto/i, /formula|fórmula/i]);
  const headerColumns = headerRow?.columns || [];
  const codeIndex = getHeaderIndex(headerColumns, [/cod/i], 0);
  const conceptIndex = getHeaderIndex(headerColumns, [/concepto/i], 1);
  const formulaIndex = getHeaderIndex(headerColumns, [/formula|fórmula/i], 2);

  return dedupe(buildRowsAfterHeader(table, headerRow)
    .map((row, index) => {
      const codigo = normalizeText(row.columns[codeIndex] || String(index + 1)).toUpperCase();
      const concepto = normalizeLine(row.columns[conceptIndex] || "");
      const formula = normalizeFormula(row.columns[formulaIndex] || "");
      if (!concepto || !formula || !FORMULA_PATTERN.test(formula)) {
        return null;
      }
      return {
        codigo,
        concepto,
        formula,
        pageNumber: row.pageNumber,
        cells: row.cells,
      };
    })
    .filter(Boolean), (item) => `${item.codigo}|${item.concepto}`);
};

const normalizeCategoriasOutput = (items) => items.map((item) => ({
  id: slugify(`${item.codigo}-${item.nombre}`),
  codigo: item.codigo,
  nombre: item.nombre,
  basico: 0,
  zona: "general",
  periodo: "",
  estado: "activo",
  pageNumber: item.pageNumber || 0,
}));

const normalizeEscalasOutput = (items) => items.map((item) => ({
  id: slugify(`${item.categoria}-${item.periodo || "sin-periodo"}`),
  categoriaId: slugify(item.categoria),
  categoria: item.categoria,
  codigo: item.categoria,
  nombre: item.categoria,
  basico: item.basico || 0,
  incremento: item.incremento || 0,
  total: item.total || 0,
  monto: item.total || item.basico || 0,
  zona: "general",
  periodo: item.periodo || "",
  estado: "activo",
  pageNumber: item.pageNumber || 0,
}));

const normalizeZonasOutput = (items) => items.map((item, index) => ({
  id: slugify(item.zona || `zona-${index + 1}`),
  nombre: item.zona || "Zona general",
  porcentaje: item.porcentaje || 0,
  region: item.region || "",
  estado: "activo",
  pageNumber: item.pageNumber || 0,
}));

const normalizeFormulasOutput = (items) => items.map((item) => ({
  id: slugify(`${item.codigo}-${item.concepto}`),
  codigo: item.codigo,
  nombre: item.concepto,
  concepto: item.concepto,
  formula: item.formula,
  tipo: "percentage",
  base: "basico",
  valor: normalizePercent(item.formula),
  periodo: "",
  estado: "activo",
  pageNumber: item.pageNumber || 0,
}));

const buildDebugPayload = ({ tableData, categoriasRows, escalasRows, zonasRows, formulasRows }) => ({
  linesDetected: tableData.rows,
  validRows: {
    categorias: categoriasRows,
    escalas: escalasRows,
    zonas: zonasRows,
    formulas: formulasRows,
  },
  montosDetectados: escalasRows.map((item) => item.total || item.basico || item.incremento).filter(Boolean),
  tables: tableData.tables.map((table) => ({
    id: table.id,
    columns: table.columnAnchors,
    rows: table.rows.map((row) => ({
      pageNumber: row.pageNumber,
      y: row.y,
      columns: row.columns,
    })),
  })),
});

export const detectConvenioLayout = (documentData) => {
  const tables = parsePdfTables(documentData);
  return {
    preprocessedEntries: tables.rows,
    detection: {
      isTabular: !tables.failed,
      metrics: tables.metrics,
    },
    tables,
  };
};

export const parseCategoriasTable = (documentData, context = {}) => parseCategoriasTableRows(context.tables || parsePdfTables(documentData));
export const parseEscalasTable = (documentData, context = {}) => parseEscalasTableRows(context.tables || parsePdfTables(documentData));
export const parseZonasTable = (documentData, context = {}) => parseZonasTableRows(context.tables || parsePdfTables(documentData));
export const parseFormulasTable = (documentData, context = {}) => parseFormulasTableRows(context.tables || parsePdfTables(documentData));

export const parseCategorias = (documentData, context = {}) => normalizeCategoriasOutput(parseCategoriasTable(documentData, context));
export const parseEscalas = (documentData, context = {}) => normalizeEscalasOutput(parseEscalasTable(documentData, context));
export const parseZonas = (documentData, context = {}) => normalizeZonasOutput(parseZonasTable(documentData, context));
export const parseFormulas = (documentData, context = {}) => normalizeFormulasOutput(parseFormulasTable(documentData, context));

export const parseConvenioDeterministically = (documentData) => {
  const tableData = parsePdfTables(documentData);
  const categoriasRows = parseCategoriasTableRows(tableData);
  const escalasRows = parseEscalasTableRows(tableData);
  const zonasRows = parseZonasTableRows(tableData);
  const formulasRows = parseFormulasTableRows(tableData);
  const categorias = normalizeCategoriasOutput(categoriasRows);
  const escalas = normalizeEscalasOutput(escalasRows);
  const zonas = normalizeZonasOutput(zonasRows);
  const formulas = normalizeFormulasOutput(formulasRows);
  const warnings = [];

  if (tableData.failed) {
    warnings.push("Parser tabular failed.");
  }
  if (!categorias.length) {
    warnings.push("No se detectaron categorias tabulares.");
  }
  if (!escalas.length) {
    warnings.push("No se detectaron escalas tabulares.");
  } else {
    warnings.push(`Se detectaron ${escalas.length} fila(s) de escala.`);
  }
  if (!zonas.length) {
    warnings.push("No se detectaron zonas tabulares.");
  }
  if (!formulas.length) {
    warnings.push("No se detectaron formulas tabulares.");
  }

  return {
    metadataHints: {
      nombre: documentData?.fileName?.replace(/\.pdf$/i, "") || "convenio",
      cct: "",
      activity: "",
    },
    categorias,
    escalas,
    adicionales: formulas.filter((item) => !/zona/i.test(item.nombre)),
    formulas,
    zonas,
    warnings,
    debug: buildDebugPayload({
      tableData,
      categoriasRows,
      escalasRows,
      zonasRows,
      formulasRows,
    }),
  };
};
