import { detectConvenioBlocks as detectBlockMatches } from "../convenio-detector.js";
import { detectConvenioBlocks as detectStructuredSections } from "../convenio-block-detector.js";
import { detectConvenioLayout, parseConvenioDeterministically } from "./heuristic-parser.js";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const CHUNK_PAGE_SIZE = 6;
const MAX_CHARS_PER_CHUNK = 18000;

const normalizeText = (value) => String(value || "").trim();

const safeJsonParse = (value) => {
  if (!value) {
    return null;
  }

  const fenced = value.match(/```json\s*([\s\S]*?)```/i)?.[1] || value.match(/```\s*([\s\S]*?)```/i)?.[1] || value;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
};

const chunkPages = (pages) => {
  const chunks = [];
  let currentChunk = [];
  let currentChars = 0;

  pages.forEach((page) => {
    const pageChars = page.text.length;
    const shouldSplit = currentChunk.length >= CHUNK_PAGE_SIZE || (currentChunk.length && currentChars + pageChars > MAX_CHARS_PER_CHUNK);

    if (shouldSplit) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }

    currentChunk.push(page);
    currentChars += pageChars;
  });

  if (currentChunk.length) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const buildChunkPrompt = (documentData, chunkPagesData, baseline = {}) => {
  const chunkText = chunkPagesData.map((page) => `Pagina ${page.pageNumber}\n${page.text}`).join("\n\n");

  return `
Analiza este fragmento de un convenio colectivo y responde SOLO con JSON valido.

Objetivo:
- completar datos faltantes del parser deterministico
- inferir categorias ambiguas
- aportar escalas o formulas que no se detectaron localmente
- no repetir entidades ya detectadas
- no encapsular texto crudo del PDF

Formato exacto:
{
  "metadataHints": {
    "nombre": "",
    "cct": "",
    "activity": ""
  },
  "categorias": [{ "id": "", "nombre": "", "basico": 0, "zona": "general", "periodo": "", "estado": "activo", "pageNumber": 0 }],
  "escalas": [{ "categoriaId": "", "categoria": "", "periodo": "", "monto": 0, "zona": "general", "pageNumber": 0 }],
  "adicionales": [{ "id": "", "nombre": "", "tipo": "percentage|fixed", "base": "basico|total_remunerativo", "valor": 0, "pageNumber": 0 }],
  "formulas": [{ "id": "", "nombre": "", "tipo": "percentage|fixed", "base": "basico|total_remunerativo", "valor": 0, "pageNumber": 0 }],
  "zonas": [{ "id": "", "nombre": "", "porcentaje": 0, "pageNumber": 0 }]
}

Archivo: ${documentData.fileName}
Layout detectado: ${baseline.layoutMode || "text"}
Base detectada:
${JSON.stringify({
  categorias: baseline.categorias?.slice(0, 12) || [],
  escalas: baseline.escalas?.slice(0, 12) || [],
  formulas: baseline.formulas?.slice(0, 12) || [],
  zonas: baseline.zonas?.slice(0, 12) || [],
}, null, 2)}
Texto:
${chunkText}
`;
};

const mergeExtraction = (target, chunkResult) => ({
  metadataHints: {
    ...target.metadataHints,
    ...(chunkResult.metadataHints || {}),
  },
  categorias: [...target.categorias, ...(chunkResult.categorias || [])],
  escalas: [...target.escalas, ...(chunkResult.escalas || [])],
  adicionales: [...target.adicionales, ...(chunkResult.adicionales || [])],
  formulas: [...target.formulas, ...(chunkResult.formulas || [])],
  zonas: [...target.zonas, ...(chunkResult.zonas || [])],
  warnings: [...(target.warnings || []), ...(chunkResult.warnings || [])],
});

const buildHeuristicFallback = (documentData) => {
  const parsed = parseConvenioDeterministically(documentData);
  const blockMatches = detectBlockMatches(documentData);
  const structured = detectStructuredSections(documentData);
  const fallbackFormulas = (structured.formulas?.entries || []).map((item) => ({
    id: "",
    nombre: item.label,
    tipo: "percentage",
    base: "",
    valor: 0,
    pageNumber: 0,
  }));
  const mergedFormulas = parsed.formulas.length ? parsed.formulas : fallbackFormulas;

  return {
    ...parsed,
    categorias: parsed.categorias.length ? parsed.categorias : (blockMatches.categorias || []).map((item) => ({
      id: "",
      nombre: item.title,
      basico: 0,
      zona: "general",
      periodo: "",
      estado: "activo",
      pageNumber: item.pageNumber,
    })),
    escalas: parsed.escalas.length ? parsed.escalas : (blockMatches.escalas || []).map((item) => ({
      categoriaId: "",
      categoria: item.title,
      monto: 0,
      periodo: "",
      zona: "general",
      pageNumber: item.pageNumber,
    })),
    adicionales: parsed.adicionales.length ? parsed.adicionales : (blockMatches.adicionales || []).map((item) => ({
      id: "",
      nombre: item.title,
      tipo: "percentage",
      base: "",
      valor: 0,
      pageNumber: item.pageNumber,
    })),
    formulas: mergedFormulas,
    zonas: parsed.zonas.length ? parsed.zonas : (blockMatches.zonas || []).map((item) => ({
      id: "",
      nombre: item.title,
      porcentaje: 0,
      pageNumber: item.pageNumber,
    })),
  };
};

const requestGeminiExtractionChunk = async (documentData, chunkPagesData, baseline) => {
  const geminiConfig = window.GEMINI_CONFIG || {};
  const apiKey = normalizeText(geminiConfig.API_KEY);
  const model = normalizeText(geminiConfig.MODEL || "gemini-2.5-flash");

  if (!apiKey) {
    throw new Error("missing-gemini-key");
  }

  const response = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildChunkPrompt(documentData, chunkPagesData, baseline) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 24,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`gemini-http-${response.status}:${payload.slice(0, 180)}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
  const parsed = safeJsonParse(text);
  if (!parsed) {
    throw new Error("invalid-gemini-json");
  }

  return parsed;
};

export const extractConvenioWithAi = async (documentData, options = {}) => {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const onLog = typeof options.onLog === "function" ? options.onLog : null;
  const chunks = chunkPages(documentData.pages || []);
  const deterministic = parseConvenioDeterministically(documentData);
  const layout = detectConvenioLayout(documentData);
  const initial = { ...deterministic };

  onLog?.({
    level: "info",
    stage: "layout-detector",
    message: `Layout ${layout.detection.isTabular ? "tabular" : "texto"} detectado. Score ${layout.detection.metrics.score}.`,
  });

  (deterministic.warnings || []).forEach((message) => {
    onLog?.({
      level: "warn",
      stage: "heuristic-parser",
      message,
    });
  });

  try {
    let merged = initial;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      onProgress?.({
        stage: "ai-extractor",
        current: index + 1,
        total: chunks.length,
        message: `Analizando bloque ${index + 1} de ${chunks.length} con IA`,
      });
      onLog?.({
        level: "info",
        stage: "ai-extractor",
        message: `Enviando a IA paginas ${chunk[0]?.pageNumber} a ${chunk[chunk.length - 1]?.pageNumber} para completar datos faltantes.`,
      });

      const chunkResult = await requestGeminiExtractionChunk(documentData, chunk, {
        layoutMode: layout.detection.isTabular ? "table" : "text",
        categorias: merged.categorias,
        escalas: merged.escalas,
        formulas: merged.formulas,
        zonas: merged.zonas,
      });
      merged = mergeExtraction(merged, chunkResult);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    onLog?.({
      level: "info",
      stage: "ai-extractor",
      message: "Extraccion IA finalizada correctamente.",
    });
    return {
      mode: "hybrid",
      ...merged,
    };
  } catch (error) {
    onLog?.({
      level: "warn",
      stage: "ai-extractor",
      message: `La IA no pudo completar la extraccion. Se usa fallback heuristico. ${error.message || ""}`.trim(),
    });
    return {
      mode: "heuristic",
      ...buildHeuristicFallback(documentData),
    };
  }
};
