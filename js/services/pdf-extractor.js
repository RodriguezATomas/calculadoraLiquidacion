const PDFJS_VERSION = "5.7.284";
const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
const YIELD_EVERY_PAGES = 8;

let pdfJsModulePromise = null;

const normalizeText = (value) => (
  value
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, "")
    .trim()
);

const getPdfJs = async () => {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import(PDFJS_MODULE_URL).then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjsLib;
    });
  }

  return pdfJsModulePromise;
};

const extractPageText = async (pdfDocument, pageNumber) => {
  const page = await pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const items = textContent.items.map((item, index) => ({
    id: `${pageNumber}-${index}`,
    text: item.str || "",
    x: Number(item.transform?.[4] || 0),
    y: Number(item.transform?.[5] || 0),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    fontName: item.fontName || "",
  })).filter((item) => item.text);
  const rawText = items.map((item) => item.text).join(" ");
  const text = normalizeText(rawText);

  console.info(`[pdf-extractor] Pagina ${pageNumber} procesada. Largo: ${text.length}`);

  return {
    pageNumber,
    text,
    items,
  };
};

export const extractPdfText = async (file, options = {}) => {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const onLog = typeof options.onLog === "function" ? options.onLog : null;
  console.info(`[pdf-extractor] Iniciando lectura de ${file.name}`);
  onLog?.({ level: "info", stage: "pdf-parser", message: `Iniciando lectura de ${file.name}` });

  try {
    const pdfjsLib = await getPdfJs();
    const data = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      pages.push(await extractPageText(pdfDocument, pageNumber));
      onProgress?.({
        stage: "pdf-parser",
        current: pageNumber,
        total: pdfDocument.numPages,
        message: `Procesando pagina ${pageNumber} de ${pdfDocument.numPages}`,
      });
      if (pageNumber % YIELD_EVERY_PAGES === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const fullText = normalizeText(pages.map((page) => page.text).join("\n\n"));

    console.info(`[pdf-extractor] Extraccion finalizada. Paginas: ${pdfDocument.numPages}. Largo total: ${fullText.length}`);
    onLog?.({
      level: "info",
      stage: "pdf-parser",
      message: `Extraccion finalizada. ${pdfDocument.numPages} pagina(s), ${fullText.length} caracteres.`,
    });

    return {
      fileName: file.name,
      totalPages: pdfDocument.numPages,
      pages,
      fullText,
    };
  } catch (error) {
    console.error("[pdf-extractor] Error al extraer PDF", error);
    onLog?.({
      level: "error",
      stage: "pdf-parser",
      message: `Error al extraer el PDF con pdf.js: ${error.message || "sin detalle"}`,
    });
    throw error;
  }
};
