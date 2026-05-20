import { extractPdfText } from "../pdf-extractor.js";
import { extractPdfDocument } from "../pdf-text-extractor.js";

const normalizeFallbackDocument = (documentData) => ({
  fileName: documentData.fileName,
  totalPages: documentData.pageCount,
  pages: (documentData.pages || []).map((page) => ({
    pageNumber: page.number,
    text: page.text,
  })),
  fullText: documentData.fullText,
  source: "fallback-text",
});

export const parseConvenioPdf = async (file, options = {}) => {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const onLog = typeof options.onLog === "function" ? options.onLog : null;

  try {
    const parsed = await extractPdfText(file, { onProgress, onLog });
    return {
      ...parsed,
      source: "pdfjs",
    };
  } catch (primaryError) {
    onLog?.({
      level: "warn",
      stage: "pdf-parser",
      message: "Se activo el parser alternativo por un error en pdf.js.",
    });

    try {
      const fallbackDocument = await extractPdfDocument(file);
      onProgress?.({
        stage: "pdf-parser",
        current: fallbackDocument.pageCount,
        total: fallbackDocument.pageCount,
        message: `Parser alternativo completo (${fallbackDocument.pageCount} pagina(s))`,
      });
      return normalizeFallbackDocument(fallbackDocument);
    } catch (fallbackError) {
      onLog?.({
        level: "error",
        stage: "pdf-parser",
        message: `Fallo tambien el parser alternativo: ${fallbackError.message || "sin detalle"}`,
      });
      throw fallbackError || primaryError;
    }
  }
};
