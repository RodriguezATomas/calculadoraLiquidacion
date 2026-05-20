import { extractConvenioWithAi } from "./ai-extractor.js";
import { buildConvenioJsonFiles, buildReviewStateFromBundle } from "./json-generator.js";
import { normalizeConvenioExtraction } from "./normalizer.js";
import { parseConvenioPdf } from "./pdf-parser.js";
import { validateNormalizedConvenio } from "./validator.js";

export const runConvenioPdfImportPipeline = async (file, options = {}) => {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const onLog = typeof options.onLog === "function" ? options.onLog : null;

  onLog?.({
    level: "info",
    stage: "pipeline",
    message: "Inicio del pipeline PDF -> extraccion -> normalizacion -> validacion -> JSON.",
  });

  const document = await parseConvenioPdf(file, { onProgress, onLog });
  const extracted = await extractConvenioWithAi(document, { onProgress, onLog });

  if (extracted?.debug) {
    const detectedRows = Array.isArray(extracted.debug.linesDetected) ? extracted.debug.linesDetected.length : 0;
    const validEscalas = Array.isArray(extracted.debug.validRows?.escalas) ? extracted.debug.validRows.escalas.length : 0;
    const detectedMontos = Array.isArray(extracted.debug.montosDetectados) ? extracted.debug.montosDetectados.length : 0;
    onLog?.({
      level: "info",
      stage: "debug-parser",
      message: `Debug parser: ${detectedRows} fila(s) reconstruida(s), ${validEscalas} escala(s) valida(s), ${detectedMontos} monto(s).`,
    });
  }

  const normalized = normalizeConvenioExtraction(document, extracted);
  const validation = validateNormalizedConvenio(normalized);
  const jsonFiles = buildConvenioJsonFiles(normalized);
  const review = buildReviewStateFromBundle(normalized);

  onLog?.({
    level: "info",
    stage: "pipeline",
    message: "Pipeline finalizado y JSON modular generado.",
  });

  return {
    document,
    extracted,
    normalized,
    validation,
    jsonFiles,
    review,
  };
};
