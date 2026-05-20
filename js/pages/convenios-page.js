import { actions } from "../app-state.js";
import { readConvenioImportState, writeConvenioImportState } from "../services/convenio-import-storage.js";
import { runConvenioPdfImportPipeline } from "../services/convenio-import/import-pipeline.js";
import {
  buildConvenioDraft,
  normalizeSlug,
  resolveConvenioSlug,
  saveConvenioModularWithMetadata,
} from "../services/convenio-modular.js";
import {
  activateConvenioVersion,
  deleteConvenioById,
  deactivateConvenioVersion,
  duplicateConvenioVersion,
  getAllConvenios,
  getConvenioHistory,
  restoreConvenioVersion,
} from "../services/convenio-storage.js";
import { icon } from "../ui/icons.js";
import { buildImportJsonPreview } from "../utils/json-preview/build-json-preview.js";

const PDF_IMPORT_SLOTS = [
  { key: "categorias", title: "categorias.pdf", description: "Carga el PDF especializado en categorias.", jsonName: "categorias.json" },
  { key: "escalas", title: "escalas.pdf", description: "Carga el PDF especializado en escalas.", jsonName: "escalas.json" },
  { key: "formulas", title: "formulas.pdf", description: "Carga el PDF especializado en formulas.", jsonName: "formulas.json" },
];

const MODULE_SECTIONS = [
  { key: "categorias", title: "Categorias", slotKey: "categorias", reviewKeys: ["categorias"] },
  { key: "escalas", title: "Escalas", slotKey: "escalas", reviewKeys: ["escalas"] },
  { key: "adicionales", title: "Adicionales", slotKey: "formulas", reviewKeys: ["adicionales", "formulas"] },
  { key: "zonas", title: "Zonas", slotKey: "formulas", reviewKeys: ["zonas"] },
];

const createModuleSection = (key, title) => ({
  key,
  title,
  enabled: true,
  collapsed: false,
  items: [],
});

const cloneModuleSection = (section, fallback) => ({
  ...createModuleSection(fallback.key, fallback.title),
  ...(section || {}),
  key: fallback.key,
  title: fallback.title,
  items: Array.isArray(section?.items) ? section.items : [],
});

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const getAvailableConvenios = () => getAllConvenios().filter((item) => item.isValid);
const normalizeImporterTab = (value) => (["categorias", "escalas", "adicionales", "zonas"].includes(value) ? value : "categorias");

const createInitialImporterState = () => {
  const stored = readConvenioImportState();
  const fallbackSlots = PDF_IMPORT_SLOTS.reduce((accumulator, slot) => {
    accumulator[slot.key] = {
      fileName: "",
      document: null,
      review: null,
      validation: null,
      jsonFiles: null,
      logs: [],
      progress: null,
      isLoading: false,
      ...(stored.slots?.[slot.key] || {}),
    };
    return accumulator;
  }, {});

  const fallbackSections = MODULE_SECTIONS.reduce((accumulator, section) => {
    accumulator[section.key] = cloneModuleSection(stored.moduleSections?.[section.key], section);
    return accumulator;
  }, {});

  return {
    activeSlot: stored.activeSlot || "categorias",
    activePreviewTab: normalizeImporterTab(stored.activePreviewTab || "categorias"),
    saveDraft: {
      nombre: stored.saveDraft?.nombre || "",
      slug: stored.saveDraft?.slug || "",
      actividad: stored.saveDraft?.actividad || "",
      version: stored.saveDraft?.version || 1,
      descripcion: stored.saveDraft?.descripcion || "",
      allowIncrementSlug: stored.saveDraft?.allowIncrementSlug ?? true,
    },
    slots: fallbackSlots,
    previews: {
      categorias: stored.previews?.categorias || null,
      escalas: stored.previews?.escalas || null,
      formulas: stored.previews?.formulas || null,
    },
    moduleSections: fallbackSections,
  };
};

const renderRow = (item) => `
  <tr data-convenio-row data-name="${`${item.label} ${item.activity}`.toLowerCase()}" data-status="${item.status}" data-activity="${item.activity}">
    <td><strong class="table-row__name">${item.label}</strong></td>
    <td><span class="table-row__activity">${item.activity}</span></td>
    <td><span class="table-status ${item.status === "review" ? "table-status--review" : "table-status--active"}">${item.isCurrent ? "Activa" : item.rawStatus === "draft" ? "Borrador" : item.rawStatus === "inactive" ? "Inactiva" : item.status === "review" ? "En revision" : "Activa"}</span></td>
    <td>${formatDate(item.updatedAt)}</td>
    <td>
      <div class="table-actions">
        ${item.slug && item.source ? `<button type="button" class="table-action" data-action="open" data-source="${item.source}" data-title="${item.label}" aria-label="Abrir">${icon("open")}</button>` : `<span class="table-row__activity">Slug invalido</span>`}
        ${item.slug && item.source ? `<button type="button" class="table-action" data-action="view" data-source="${item.source}" data-title="${item.label}" aria-label="Visualizar">${icon("eye")}</button>` : ""}
        <button type="button" class="table-action" data-action="edit" data-source="${item.source}" data-id="${item.id}" data-title="${item.label}" aria-label="Editar">${icon("pencil")}</button>
        ${item.slug ? `<button type="button" class="table-action" data-action="activate-version" data-id="${item.id}" data-title="${item.label}" aria-label="Activar">${icon("shield")}</button>` : ""}
        ${item.slug ? `<button type="button" class="table-action" data-action="deactivate-version" data-id="${item.id}" data-title="${item.label}" aria-label="Desactivar">${icon("trash")}</button>` : ""}
        ${item.slug ? `<button type="button" class="table-action" data-action="duplicate-version" data-id="${item.id}" data-title="${item.label}" aria-label="Duplicar">${icon("plus")}</button>` : ""}
        ${item.id?.includes("-v") ? `<button type="button" class="table-action" data-action="delete-version" data-id="${item.id}" data-title="${item.label}" aria-label="Eliminar">${icon("trash")}</button>` : ""}
        ${item.slug ? `<button type="button" class="table-action" data-action="restore-version" data-id="${item.id}" data-title="${item.label}" aria-label="Restaurar">${icon("open")}</button>` : ""}
        ${item.slug ? `<button type="button" class="table-action" data-action="view-history" data-id="${item.id}" data-title="${item.label}" aria-label="Historial">${icon("panel")}</button>` : ""}
      </div>
    </td>
  </tr>
`;

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

const prettifyName = (value, fallback = "Sin nombre") => {
  const source = String(value || "").trim();
  if (!source) {
    return fallback;
  }

  if (!source.includes("-")) {
    return source;
  }

  return source
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const persistImporter = (importerState) => {
  writeConvenioImportState({
    activeSlot: importerState.activeSlot,
    activePreviewTab: importerState.activePreviewTab,
    saveDraft: importerState.saveDraft,
    slots: importerState.slots,
    previews: importerState.previews,
    moduleSections: importerState.moduleSections,
  });
};

const getSlotBadge = (slotState) => {
  if (slotState.isLoading) {
    return "Procesando";
  }

  if (slotState.document) {
    return "Cargado";
  }

  return "Pendiente";
};

const buildSlotPreview = (slotKey, document, review, validation) => {
  const preview = buildImportJsonPreview(document, review, validation);

  if (slotKey === "categorias") {
    return {
      metadata: preview.metadata,
      categorias: preview.categorias || [],
    };
  }

  if (slotKey === "escalas") {
    return {
      metadata: preview.metadata,
      escalas: preview.escalas || [],
    };
  }

  return {
    metadata: preview.metadata,
    formulas: preview.formulas || [],
    adicionales: preview.adicionales || [],
    zonas: preview.zonas || [],
  };
};

const buildModuleSectionFromReview = (slotKey, review) => {
  const config = MODULE_SECTIONS.find((section) => section.slotKey === slotKey);
  if (!config) {
    return null;
  }

  const sourceSection = config.reviewKeys
    .map((sectionKey) => review?.sections?.find((section) => section.key === sectionKey))
    .find(Boolean);

  return sourceSection
    ? cloneModuleSection(sourceSection, config)
    : createModuleSection(config.key, config.title);
};

const parseModuleItem = (item) => {
  try {
    return JSON.parse(item.text);
  } catch {
    return {
      nombre: item.title || "Item",
      pageNumber: item.pageNumber,
      score: item.score ?? 0,
    };
  }
};

const syncPreviewFromModuleSection = (importerState, moduleKey) => {
  const section = importerState.moduleSections[moduleKey];
  const parsedItems = section.enabled ? section.items.map(parseModuleItem) : [];

  if (moduleKey === "categorias") {
    const fallbackMetadata = importerState.previews.categorias?.metadata || { nombre: "", slug: "", source: "", paginas: 0, fechaImportacion: "" };
    importerState.previews.categorias = {
      metadata: fallbackMetadata,
      categorias: parsedItems,
    };
    return;
  }

  if (moduleKey === "escalas") {
    const fallbackMetadata = importerState.previews.escalas?.metadata || { nombre: "", slug: "", source: "", paginas: 0, fechaImportacion: "" };
    importerState.previews.escalas = {
      metadata: fallbackMetadata,
      escalas: parsedItems,
    };
    return;
  }

  const fallbackMetadata = importerState.previews.formulas?.metadata || { nombre: "", slug: "", source: "", paginas: 0, fechaImportacion: "" };
  const currentPreview = importerState.previews.formulas || {};
  importerState.previews.formulas = {
    metadata: fallbackMetadata,
    formulas: moduleKey === "zonas" ? (currentPreview.formulas || []) : parsedItems,
    adicionales: moduleKey === "adicionales" ? parsedItems : (currentPreview.adicionales || currentPreview.formulas || []),
    zonas: moduleKey === "zonas" ? parsedItems : (currentPreview.zonas || []),
  };
};

const renderSlotUploader = (slot) => `
  <section class="import-panel import-slot" data-import-slot="${slot.key}">
    <div class="panel-header">
      <div>
        <span class="panel-eyebrow">Importador modular</span>
        <h3 class="panel-title">${slot.title}</h3>
        <p>${slot.description}</p>
      </div>
      <span class="table-status ${slot.key === "categorias" ? "table-status--active" : "table-status--review"}" id="${slot.key}SlotBadge">Pendiente</span>
    </div>

    <div class="upload-dropzone" id="${slot.key}UploadDropzone">
      <input id="${slot.key}PdfInput" type="file" accept="application/pdf" hidden>
      <div class="upload-dropzone__icon">${icon("folder")}</div>
      <h4>${slot.title}</h4>
      <p>${slot.description}</p>
      <button type="button" class="outline-button" data-pick-slot="${slot.key}">Seleccionar PDF</button>
      <small id="${slot.key}UploadStatusLabel">Sin archivo cargado.</small>
    </div>

    <div class="import-preview" id="${slot.key}ImportPreview"></div>

    <section class="import-panel">
      <div class="panel-header">
        <div><span class="panel-eyebrow">Logs</span><h3 class="panel-title">${slot.jsonName}</h3></div>
      </div>
      <div class="import-logs" id="${slot.key}ImportLogs"></div>
    </section>
  </section>
`;

const buildSaveDraftFromImporter = (importerState) => {
  const draft = buildConvenioDraft(importerState);
  const nombre = importerState.saveDraft?.nombre || draft.metadata.nombre || "";
  return {
    nombre,
    slug: importerState.saveDraft?.slug || normalizeSlug(nombre),
    actividad: importerState.saveDraft?.actividad || draft.metadata.actividad || "",
    version: importerState.saveDraft?.version || draft.metadata.version || 1,
    descripcion: importerState.saveDraft?.descripcion || draft.metadata.descripcion || "",
    allowIncrementSlug: importerState.saveDraft?.allowIncrementSlug ?? true,
  };
};

const getSlotPreview = (importerState, slotKey) => importerState.previews[slotKey] || null;

const getSlotDetectedCount = (slotKey, preview) => {
  if (!preview) {
    return 0;
  }

  if (slotKey === "categorias") {
    return preview.categorias?.length || 0;
  }

  if (slotKey === "escalas") {
    return preview.escalas?.length || 0;
  }

  return (preview.adicionales?.length || 0) + (preview.zonas?.length || 0);
};

const getSlotVisualStatus = (slotState) => {
  if (slotState.validation?.errors?.length) {
    return { tone: "error", label: "Error" };
  }
  if (slotState.validation?.warnings?.length) {
    return { tone: "warning", label: "Warning" };
  }
  if (slotState.document) {
    return { tone: "success", label: "OK" };
  }
  return { tone: "muted", label: "Pendiente" };
};

const buildSlotPreviewRows = (slotKey, preview) => {
  if (!preview) {
    return [];
  }

  if (slotKey === "categorias") {
    return (preview.categorias || []).slice(0, 3).map((item) => ({
      primary: item.codigo ? `${item.codigo} · ${prettifyName(item.nombre)}` : prettifyName(item.nombre),
      secondary: prettifyName(item.zona || "general", "Zona general"),
    }));
  }

  if (slotKey === "escalas") {
    return (preview.escalas || []).slice(0, 3).map((item) => ({
      primary: prettifyName(item.codigo || item.nombre || item.categoria || item.categoriaId),
      secondary: formatCurrency(item.total || item.monto || item.basico || 0),
    }));
  }

  return (preview.adicionales || preview.formulas || []).slice(0, 3).map((item) => ({
    primary: prettifyName(item.nombre),
    secondary: item.tipo === "percentage" ? `${item.valor}%` : formatCurrency(item.valor || 0),
  }));
};

const renderSlotCard = (slot, slotState, preview) => `
  <article class="import-admin-card ${slotState.document ? "is-loaded" : ""} ${slotState.isLoading ? "is-loading" : ""}">
    <div class="import-admin-card__header">
      <div class="import-admin-card__title">
        <span class="import-admin-card__icon">${icon("folder")}</span>
        <div>
          <strong>${slot.title}</strong>
          <p>${slot.description}</p>
        </div>
      </div>
      <div class="import-admin-card__badges">
        <span class="import-admin-badge import-admin-badge--${getSlotVisualStatus(slotState).tone}">${getSlotVisualStatus(slotState).label}</span>
        <span class="import-admin-badge import-admin-badge--${slotState.document ? "success" : slotState.isLoading ? "info" : "muted"}">${getSlotBadge(slotState)}</span>
      </div>
    </div>
    <div class="import-admin-stats">
      <div><span>Paginas</span><strong>${slotState.document?.totalPages || 0}</strong></div>
      <div><span>Bloques</span><strong>${slotState.review?.summary?.detectedBlocks || getSlotDetectedCount(slot.key, preview)}</strong></div>
      <div><span>Archivo</span><strong>${slotState.fileName || "Sin cargar"}</strong></div>
    </div>
    <div class="import-admin-preview-list">
      ${buildSlotPreviewRows(slot.key, preview).length
        ? buildSlotPreviewRows(slot.key, preview).map((row) => `
          <div class="import-admin-preview-row">
            <strong>${row.primary}</strong>
            <span>${row.secondary}</span>
          </div>
        `).join("")
        : `<div class="import-admin-preview-row import-admin-preview-row--empty"><span>Sin preview disponible</span></div>`}
    </div>
    <div class="import-admin-card__actions">
      <button type="button" class="outline-button" data-pick-slot="${slot.key}">${slotState.document ? "Reemplazar" : "Cargar"}</button>
      <button type="button" class="ghost-button" data-remove-slot="${slot.key}" ${slotState.document ? "" : "disabled"}>Eliminar</button>
    </div>
    ${slotState.progress?.message ? `<p class="import-admin-card__hint">${slotState.progress.message}</p>` : ""}
  </article>
`;

const renderCategoriasTable = (categorias = []) => `
  <div class="import-data-table-wrap">
    <table class="import-data-table">
      <thead><tr><th>Codigo</th><th>Categoria</th><th>Basico</th><th>Zona</th><th>Estado</th></tr></thead>
      <tbody>
        ${categorias.length ? categorias.map((item) => `
          <tr>
            <td>${item.codigo || "-"}</td>
            <td>${prettifyName(item.nombre)}</td>
            <td>${formatCurrency(item.basico || 0)}</td>
            <td>${prettifyName(item.zona || "general", "Zona general")}</td>
            <td><span class="import-admin-badge import-admin-badge--success">${item.estado || "activo"}</span></td>
          </tr>
        `).join("") : `<tr><td colspan="5" class="import-data-table__empty">Sin categorias detectadas.</td></tr>`}
      </tbody>
    </table>
  </div>
`;

const renderEscalasTable = (escalas = [], categorias = []) => {
  const categoriaMap = new Map((categorias || []).map((item) => [item.id, item.nombre]));
  return `
    <div class="import-data-table-wrap">
      <table class="import-data-table">
        <thead><tr><th>Cat</th><th>Basico</th><th>Inc.</th><th>Total</th><th>Periodo</th></tr></thead>
        <tbody>
          ${escalas.length ? escalas.map((item) => `
            <tr>
              <td>${item.codigo || prettifyName(item.nombre || categoriaMap.get(item.categoriaId) || item.categoriaId)}</td>
              <td>${formatCurrency(item.basico || 0)}</td>
              <td>${formatCurrency(item.incremento || 0)}</td>
              <td>${formatCurrency(item.total || item.monto || 0)}</td>
              <td>${item.periodo || "Periodo inferido"}</td>
            </tr>
          `).join("") : `<tr><td colspan="5" class="import-data-table__empty">Sin escalas detectadas.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

const renderAdicionalesCards = (items = []) => `
  <div class="import-pill-grid">
    ${items.length ? items.map((item) => `
      <article class="import-pill-card">
        <strong>${prettifyName(item.nombre)}</strong>
        <span>${item.tipo === "percentage" ? `${item.valor}%` : formatCurrency(item.valor)}</span>
      </article>
    `).join("") : `<div class="import-empty-card">Sin adicionales detectados.</div>`}
  </div>
`;

const renderZonasCards = (items = []) => {
  const zonas = items.length ? items : [{ id: "general", nombre: "Zona general", porcentaje: 0, estado: "activo" }];
  return `
    <div class="import-pill-grid">
      ${zonas.map((item) => `
        <article class="import-pill-card">
          <strong>${prettifyName(item.nombre, "Zona general")}</strong>
          <span>${Number(item.porcentaje) > 0 ? `${item.porcentaje}%` : "General"}</span>
        </article>
      `).join("")}
    </div>
  `;
};

const collectImporterWarnings = (importerState) => {
  const warnings = [];

  PDF_IMPORT_SLOTS.forEach((slot) => {
    const validation = importerState.slots[slot.key]?.validation;
    (validation?.warnings || []).forEach((message) => warnings.push(message));
  });

  if (!importerState.slots.escalas.document) {
    warnings.push("Falta escalas.pdf");
  }

  if (!importerState.slots.formulas.document) {
    warnings.push("Falta formulas.pdf");
  }

  return [...new Set(warnings)];
};

const renderImporterDataView = (importerState) => {
  const activeTab = importerState.activePreviewTab || "categorias";
  const categorias = importerState.previews.categorias?.categorias || [];
  const escalas = importerState.previews.escalas?.escalas || [];
  const adicionales = importerState.previews.formulas?.adicionales || importerState.previews.formulas?.formulas || [];
  const zonas = importerState.previews.formulas?.zonas || [];

  const tabs = [
    { key: "categorias", label: "Categorias", count: categorias.length },
    { key: "escalas", label: "Escalas", count: escalas.length },
    { key: "adicionales", label: "Adicionales", count: adicionales.length },
    { key: "zonas", label: "Zonas", count: zonas.length || 1 },
  ];

  let content = renderCategoriasTable(categorias);
  if (activeTab === "escalas") {
    content = renderEscalasTable(escalas, categorias);
  } else if (activeTab === "adicionales") {
    content = renderAdicionalesCards(adicionales);
  } else if (activeTab === "zonas") {
    content = renderZonasCards(zonas);
  }

  return `
    <section class="import-admin-panel">
      <div class="import-admin-panel__header">
        <div>
          <span class="panel-eyebrow">Datos detectados</span>
          <h3 class="panel-title">Revision estructurada</h3>
        </div>
      </div>
      <div class="import-admin-tabs">
        ${tabs.map((tab) => `
          <button type="button" class="import-admin-tab ${tab.key === activeTab ? "is-active" : ""}" data-import-tab="${tab.key}">
            <span>${tab.label}</span>
            <strong>${tab.count}</strong>
          </button>
        `).join("")}
      </div>
      <div class="import-admin-panel__body">${content}</div>
    </section>
  `;
};

const renderImporterSummary = (importerState) => {
  const categorias = importerState.previews.categorias?.categorias || [];
  const escalas = importerState.previews.escalas?.escalas || [];
  const adicionales = importerState.previews.formulas?.adicionales || importerState.previews.formulas?.formulas || [];
  const zonas = importerState.previews.formulas?.zonas || [{ id: "general", nombre: "Zona general" }];
  const warnings = collectImporterWarnings(importerState);

  return `
    <aside class="import-admin-summary">
      <div class="import-admin-summary__header">
        <span class="panel-eyebrow">Resumen</span>
        <h3 class="panel-title">Estado del importador</h3>
      </div>
      <div class="import-admin-summary__stats">
        <article><span>Categorias</span><strong>${categorias.length}</strong></article>
        <article><span>Escalas</span><strong>${escalas.length}</strong></article>
        <article><span>Adicionales</span><strong>${adicionales.length}</strong></article>
        <article><span>Zonas</span><strong>${zonas.length || 1}</strong></article>
      </div>
      <div class="import-admin-summary__warnings">
        <strong>Warnings</strong>
        ${warnings.length ? `<ul>${warnings.map((message) => `<li>${message}</li>`).join("")}</ul>` : `<p>Sin warnings relevantes.</p>`}
      </div>
    </aside>
  `;
};

export const conveniosPage = {
  title: "Convenios",
  description: "Gestiona y explora todos los convenios disponibles en el sistema.",
  hidePageHeader: true,
  render() {
    const availableConvenios = getAvailableConvenios();
    const activeCount = availableConvenios.filter((item) => item.status === "active").length;
    const reviewCount = availableConvenios.filter((item) => item.status === "review").length;
    const updatedThisMonth = availableConvenios.filter((item) => (item.updatedAt || "").startsWith("2026-05")).length;

    return `
      <div class="convenios-layout">
        <section class="convenios-heading">
          <div>
            <h2>Convenios</h2>
            <p>Gestiona convenios con importacion real desde PDF, versionado e integracion modular.</p>
          </div>
          <div class="convenios-actions"><button type="button" class="button" id="addConvenioButton">${icon("plus")} Importar convenio</button></div>
        </section>

        <section class="stats-row">
          <article class="stats-card"><div class="stats-card__icon icon-blue">${icon("folder")}</div><div><strong class="stats-card__value" id="totalConveniosStat">${availableConvenios.length}</strong><span class="stats-card__label">Total convenios</span></div></article>
          <article class="stats-card"><div class="stats-card__icon icon-green">${icon("shield")}</div><div><strong class="stats-card__value" id="activeConveniosStat">${activeCount}</strong><span class="stats-card__label">Convenios activos</span></div></article>
          <article class="stats-card"><div class="stats-card__icon icon-violet">${icon("sparkles")}</div><div><strong class="stats-card__value" id="updatedConveniosStat">${updatedThisMonth}</strong><span class="stats-card__label">Actualizados este mes</span></div></article>
          <article class="stats-card"><div class="stats-card__icon icon-orange">${icon("eye")}</div><div><strong class="stats-card__value" id="reviewConveniosStat">${reviewCount}</strong><span class="stats-card__label">En revision</span></div></article>
        </section>

        <section class="table-panel">
          <div class="table-toolbar">
            <div class="filters-row">
              <label class="field table-search"><input id="conveniosSearch" type="search" placeholder="Buscar convenio..."></label>
              <label class="field">
                <select id="statusFilter">
                  <option value="">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="review">En revision</option>
                </select>
              </label>
              <label class="field">
                <select id="activityFilter">
                  <option value="">Todas las actividades</option>
                  ${[...new Set(availableConvenios.map((item) => item.activity))].map((activity) => `<option value="${activity}">${activity}</option>`).join("")}
                </select>
              </label>
              <button type="button" class="outline-button" id="resetConvenioFilters">${icon("panel")} Filtros</button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Convenio</th><th>Actividad</th><th>Estado</th><th>Ultima actualizacion</th><th>Acciones</th></tr></thead>
              <tbody id="conveniosTableBody">${availableConvenios.map(renderRow).join("")}</tbody>
            </table>
          </div>

          <div class="table-footer">
            <span class="table-meta" id="conveniosCountLabel">Mostrando 1 a ${availableConvenios.length} de ${availableConvenios.length} convenios</span>
            <div class="pagination"><button type="button" class="is-active">1</button><button type="button">2</button><button type="button">></button></div>
          </div>
        </section>

        <section class="table-panel convenio-importer" id="convenioImporter">
          <div class="panel-header">
            <div>
              <span class="panel-eyebrow">Importacion PDF</span>
              <h3 class="panel-title">Importar convenio desde PDFs modulares</h3>
              <p>Vista administrativa limpia para cargar fuentes, revisar datos detectados y guardar el convenio.</p>
            </div>
            <div class="convenios-actions">
              <button type="button" class="outline-button" id="saveConvenioButton">${icon("folder")} Guardar convenio</button>
              <button type="button" class="outline-button" id="clearImportButton">${icon("trash")} Limpiar</button>
            </div>
          </div>

          <div class="import-admin-layout">
            <div class="import-admin-column import-admin-column--sources" id="importSourceColumn"></div>
            <div class="import-admin-column import-admin-column--data" id="importReviewPanel"></div>
            <div class="import-admin-column import-admin-column--summary" id="importSummaryPanel"></div>
          </div>

          ${PDF_IMPORT_SLOTS.map((slot) => `<input id="${slot.key}PdfInput" type="file" accept="application/pdf" hidden>`).join("")}
          <section class="import-panel" id="saveConvenioPanel"></section>
        </section>
      </div>
    `;
  },
  init({ registerSearch }) {
    let availableConvenios = getAvailableConvenios();
    const searchInput = document.getElementById("conveniosSearch");
    const statusFilter = document.getElementById("statusFilter");
    const activityFilter = document.getElementById("activityFilter");
    const tableBody = document.getElementById("conveniosTableBody");
    let rows = [...document.querySelectorAll("[data-convenio-row]")];
    const countLabel = document.getElementById("conveniosCountLabel");
    const totalConveniosStat = document.getElementById("totalConveniosStat");
    const activeConveniosStat = document.getElementById("activeConveniosStat");
    const updatedConveniosStat = document.getElementById("updatedConveniosStat");
    const reviewConveniosStat = document.getElementById("reviewConveniosStat");
    const importerRoot = document.getElementById("convenioImporter");
    const importSourceColumn = document.getElementById("importSourceColumn");
    const importReviewPanel = document.getElementById("importReviewPanel");
    const importSummaryPanel = document.getElementById("importSummaryPanel");
    const saveConvenioPanel = document.getElementById("saveConvenioPanel");
    const clearImportButton = document.getElementById("clearImportButton");
    const saveConvenioButton = document.getElementById("saveConvenioButton");
    const importerState = createInitialImporterState();

    const getSlotElements = (slotKey) => ({
      input: document.getElementById(`${slotKey}PdfInput`),
    });

    const appendLog = (slotKey, entry) => {
      importerState.slots[slotKey].logs = [...(importerState.slots[slotKey].logs || []), { createdAt: new Date().toISOString(), ...entry }].slice(-120);
      persistImporter(importerState);
      renderImporter();
    };

    const refreshConveniosView = () => {
      availableConvenios = getAvailableConvenios();
      tableBody.innerHTML = availableConvenios.map(renderRow).join("");
      rows = [...document.querySelectorAll("[data-convenio-row]")];
      totalConveniosStat.textContent = `${availableConvenios.length}`;
      activeConveniosStat.textContent = `${availableConvenios.filter((item) => item.status === "active").length}`;
      updatedConveniosStat.textContent = `${availableConvenios.filter((item) => (item.updatedAt || "").startsWith("2026-05")).length}`;
      reviewConveniosStat.textContent = `${availableConvenios.filter((item) => item.status === "review").length}`;
      activityFilter.innerHTML = `
        <option value="">Todas las actividades</option>
        ${[...new Set(availableConvenios.map((item) => item.activity))].map((activity) => `<option value="${activity}" ${activityFilter.value === activity ? "selected" : ""}>${activity}</option>`).join("")}
      `;
      bindTableActions();
      applyFilters();
    };

    const applyFilters = () => {
      const normalized = (searchInput.value || "").trim().toLowerCase();
      const selectedStatus = statusFilter.value;
      const selectedActivity = activityFilter.value;
      let visibleCount = 0;

      rows.forEach((row) => {
        const matchesSearch = row.dataset.name.includes(normalized);
        const matchesStatus = !selectedStatus || row.dataset.status === selectedStatus;
        const matchesActivity = !selectedActivity || row.dataset.activity === selectedActivity;
        const show = matchesSearch && matchesStatus && matchesActivity;
        row.style.display = show ? "" : "none";
        if (show) {
          visibleCount += 1;
        }
      });

      countLabel.textContent = `Mostrando 1 a ${visibleCount} de ${availableConvenios.length} convenios`;
    };

    const renderReviewPanel = () => {
      importReviewPanel.innerHTML = renderImporterDataView(importerState);
      importSummaryPanel.innerHTML = renderImporterSummary(importerState);
    };

    const renderSavePanel = () => {
      importerState.saveDraft = buildSaveDraftFromImporter(importerState);
      const slugPreview = normalizeSlug(importerState.saveDraft.slug || importerState.saveDraft.nombre);
      const existingSlugs = getAllConvenios().map((item) => item.slug).filter(Boolean);
      const alreadyExists = existingSlugs.includes(slugPreview);
      const suggestedSlug = alreadyExists
        ? resolveConvenioSlug(existingSlugs.map((slug) => ({ slug })), slugPreview, { allowIncrement: true }).slug
        : slugPreview;

      saveConvenioPanel.innerHTML = `
        <div class="panel-header">
          <div>
            <span class="panel-eyebrow">Confirmacion previa</span>
            <h3 class="panel-title">Datos del convenio a guardar</h3>
            <p>El slug ya no se toma del PDF. Confirmalo antes de guardar.</p>
          </div>
        </div>
        <div class="filters-row">
          <label class="field">
            <label>Nombre del convenio</label>
            <input id="saveConvenioNombre" type="text" value="${importerState.saveDraft.nombre}">
          </label>
          <label class="field">
            <label>Slug editable</label>
            <input id="saveConvenioSlug" type="text" value="${importerState.saveDraft.slug}">
          </label>
          <label class="field">
            <label>Actividad</label>
            <input id="saveConvenioActividad" type="text" value="${importerState.saveDraft.actividad}">
          </label>
          <label class="field">
            <label>Version</label>
            <input id="saveConvenioVersion" type="number" min="1" value="${importerState.saveDraft.version}">
          </label>
        </div>
        <div class="filters-row">
          <label class="field" style="flex:1 1 100%;">
            <label>Descripcion</label>
            <textarea id="saveConvenioDescripcion">${importerState.saveDraft.descripcion}</textarea>
          </label>
        </div>
        <div class="filters-row">
          <label class="field">
            <label>Slug normalizado</label>
            <input type="text" value="${slugPreview}" readonly>
          </label>
          <label class="field">
            <label>Sufijo automatico si existe</label>
            <select id="saveConvenioAllowIncrement">
              <option value="true" ${importerState.saveDraft.allowIncrementSlug ? "selected" : ""}>Si</option>
              <option value="false" ${!importerState.saveDraft.allowIncrementSlug ? "selected" : ""}>No</option>
            </select>
          </label>
          <label class="field">
            <label>Estado del slug</label>
            <input type="text" value="${alreadyExists ? `Duplicado. Sugerido: ${suggestedSlug}` : "Disponible"}" readonly>
          </label>
        </div>
      `;
    };

    const renderImporter = () => {
      importSourceColumn.innerHTML = `
        <section class="import-admin-panel">
          <div class="import-admin-panel__header">
            <div>
              <span class="panel-eyebrow">Importacion</span>
              <h3 class="panel-title">Fuentes cargadas</h3>
            </div>
          </div>
          <div class="import-admin-source-list">
            ${PDF_IMPORT_SLOTS.map((slot) => renderSlotCard(slot, importerState.slots[slot.key], getSlotPreview(importerState, slot.key))).join("")}
          </div>
        </section>
      `;

      renderSavePanel();
      renderReviewPanel();
    };

    const updateReviewSection = (sectionKey, updater) => {
      if (!importerState.moduleSections[sectionKey]) {
        return;
      }

      importerState.moduleSections[sectionKey] = updater(importerState.moduleSections[sectionKey]);
      syncPreviewFromModuleSection(importerState, sectionKey);
      persistImporter(importerState);
      renderReviewPanel();
    };

    const resetImporter = () => {
      importerState.activeSlot = "categorias";
      importerState.activePreviewTab = "categorias";
      importerState.saveDraft = {
        nombre: "",
        slug: "",
        actividad: "",
        version: 1,
        descripcion: "",
        allowIncrementSlug: true,
      };
      PDF_IMPORT_SLOTS.forEach((slot) => {
        importerState.slots[slot.key] = {
          fileName: "",
          document: null,
          review: null,
          validation: null,
          jsonFiles: null,
          logs: [],
          progress: null,
          isLoading: false,
        };
        importerState.previews[slot.key] = null;
      });
      MODULE_SECTIONS.forEach((section) => {
        importerState.moduleSections[section.key] = createModuleSection(section.key, section.title);
      });
      persistImporter(importerState);
      renderImporter();
    };

    const loadPdf = async (slotKey, file) => {
      if (!file || file.type !== "application/pdf") {
        actions.addNotification("Archivo invalido", "Selecciona un PDF de convenio.");
        return;
      }

      const slotState = importerState.slots[slotKey];
      importerState.activeSlot = slotKey;
      importerState.activePreviewTab = slotKey;
      slotState.isLoading = true;
      slotState.fileName = file.name;
      slotState.document = null;
      slotState.review = null;
      slotState.validation = null;
      slotState.jsonFiles = null;
      slotState.logs = [];
      slotState.progress = { current: 0, total: 1, message: "Preparando importacion" };
      renderImporter();

      try {
        const result = await runConvenioPdfImportPipeline(file, {
          onProgress: (progress) => {
            slotState.progress = progress;
            renderImporter();
          },
          onLog: (entry) => appendLog(slotKey, entry),
        });

        slotState.document = result.document;
        slotState.review = result.review;
        slotState.validation = {
          ...result.validation,
          convenio: result.normalized,
        };
        slotState.jsonFiles = result.jsonFiles;
        importerState.previews[slotKey] = buildSlotPreview(slotKey, result.document, result.review, slotState.validation);
        const syncedSection = buildModuleSectionFromReview(slotKey, result.review);
        if (syncedSection) {
          importerState.moduleSections[syncedSection.key] = syncedSection;
        }
        actions.addNotification("PDF procesado", `${file.name} quedo listo para preview independiente.`);
      } catch (error) {
        appendLog(slotKey, {
          level: "error",
          stage: "pipeline",
          message: `No se pudo completar la importacion: ${error.message || "sin detalle"}`,
        });
        actions.addNotification("Error de importacion", "No se pudo procesar el PDF del convenio.");
      } finally {
        slotState.isLoading = false;
        slotState.progress = null;
        persistImporter(importerState);
        renderImporter();
      }
    };

    [searchInput, statusFilter, activityFilter].forEach((element) => {
      element.addEventListener("input", applyFilters);
      element.addEventListener("change", applyFilters);
    });

    document.getElementById("resetConvenioFilters")?.addEventListener("click", () => {
      searchInput.value = "";
      statusFilter.value = "";
      activityFilter.value = "";
      applyFilters();
    });

    document.getElementById("addConvenioButton")?.addEventListener("click", () => {
      importerRoot.scrollIntoView({ behavior: "smooth", block: "start" });
      getSlotElements("categorias").input.click();
    });

    const bindTableActions = () => {
      document.querySelectorAll("[data-action]").forEach((button) => {
        button.onclick = () => {
        const source = button.getAttribute("data-source");
        const convenioId = button.getAttribute("data-id");
        const title = button.getAttribute("data-title");
        const action = button.getAttribute("data-action");
        actions.addHistoryEntry({ type: "convention", title, detail: `Accion ${action} ejecutada sobre ${title}.` });
        actions.addNotification("Accion sobre convenio", `${title}: ${action}.`);

        if (action === "activate-version" && convenioId) {
          activateConvenioVersion(convenioId);
          return;
        }

        if (action === "deactivate-version" && convenioId) {
          deactivateConvenioVersion(convenioId);
          return;
        }

        if (action === "duplicate-version" && convenioId) {
          duplicateConvenioVersion(convenioId);
          return;
        }

        if (action === "delete-version" && convenioId) {
          deleteConvenioById(convenioId);
          return;
        }

        if (action === "restore-version" && convenioId) {
          restoreConvenioVersion(convenioId);
          return;
        }

        if (action === "view-history" && convenioId) {
          const history = getConvenioHistory(convenioId);
          const detail = history.length ? history.slice(0, 6).map((item) => `${item.action} · ${formatDate(item.createdAt)}`).join(" | ") : "Sin historial registrado.";
          actions.addNotification("Historial de convenio", detail);
          return;
        }

        if (action === "view") {
          if (!source) {
            actions.addNotification("Convenio omitido", "El convenio no tiene un slug valido para abrir.");
            return;
          }
          window.open(source, "_blank", "noopener");
          return;
        }

        if (action === "edit" && convenioId?.includes("-v")) {
          window.location.href = `convenio-editor.html?id=${encodeURIComponent(convenioId)}`;
          return;
        }

        if (!source) {
          actions.addNotification("Convenio omitido", "El convenio no tiene un slug valido para abrir.");
          return;
        }
        window.location.href = source;
        };
      });
    };

    bindTableActions();

    PDF_IMPORT_SLOTS.forEach((slot) => {
      const elements = getSlotElements(slot.key);
      elements.input?.addEventListener("change", (event) => {
        loadPdf(slot.key, event.target.files?.[0]);
        event.target.value = "";
      });
    });

    importerRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const pickSlot = target.closest("[data-pick-slot]")?.getAttribute("data-pick-slot");
      if (pickSlot) {
        importerState.activeSlot = pickSlot;
        persistImporter(importerState);
        getSlotElements(pickSlot).input?.click();
        return;
      }

      const removeSlot = target.closest("[data-remove-slot]")?.getAttribute("data-remove-slot");
      if (removeSlot) {
        clearSlot(removeSlot);
        return;
      }

      const importTab = target.closest("[data-import-tab]")?.getAttribute("data-import-tab");
      if (importTab) {
        importerState.activePreviewTab = importTab;
        persistImporter(importerState);
        renderReviewPanel();
      }
    });

    clearImportButton?.addEventListener("click", resetImporter);
    saveConvenioButton?.addEventListener("click", async () => {
      try {
        const metadataInput = {
          nombre: String(document.getElementById("saveConvenioNombre")?.value || "").trim(),
          slug: String(document.getElementById("saveConvenioSlug")?.value || "").trim(),
          actividad: String(document.getElementById("saveConvenioActividad")?.value || "").trim(),
          version: Number(document.getElementById("saveConvenioVersion")?.value || 1),
          descripcion: String(document.getElementById("saveConvenioDescripcion")?.value || "").trim(),
          allowIncrementSlug: document.getElementById("saveConvenioAllowIncrement")?.value === "true",
        };
        importerState.saveDraft = metadataInput;
        persistImporter(importerState);
        const result = await saveConvenioModularWithMetadata(importerState, metadataInput);
        actions.addNotification("Convenio guardado", `${result.convenio.metadata.nombre} ya esta disponible en la calculadora generica.`);
        refreshConveniosView();
      } catch (error) {
        const message = error.code === "duplicate-slug"
          ? error.message
          : error.code === "filesystem-api-not-supported"
            ? "Tu navegador no permite guardar carpetas directamente."
            : error.code === "invalid-convenio-modules"
              ? "Faltan categorias, escalas o formulas para guardar el convenio."
              : error.code === "invalid-convenio-metadata"
                ? "Completa nombre y slug antes de guardar."
                : "No se pudo guardar el convenio.";
        actions.addNotification("Error al guardar", message);
      }
    });

    saveConvenioPanel.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const nombre = document.getElementById("saveConvenioNombre");
      const slug = document.getElementById("saveConvenioSlug");
      const actividad = document.getElementById("saveConvenioActividad");
      const version = document.getElementById("saveConvenioVersion");
      const descripcion = document.getElementById("saveConvenioDescripcion");
      const allowIncrement = document.getElementById("saveConvenioAllowIncrement");

      importerState.saveDraft = {
        nombre: String(nombre?.value || "").trim(),
        slug: target === nombre ? normalizeSlug(nombre?.value || "") : String(slug?.value || "").trim(),
        actividad: String(actividad?.value || "").trim(),
        version: Number(version?.value || 1),
        descripcion: String(descripcion?.value || "").trim(),
        allowIncrementSlug: allowIncrement?.value === "true",
      };
      persistImporter(importerState);
      renderSavePanel();
    });

    saveConvenioPanel.addEventListener("change", () => {
      const nombre = document.getElementById("saveConvenioNombre");
      const slug = document.getElementById("saveConvenioSlug");
      const actividad = document.getElementById("saveConvenioActividad");
      const version = document.getElementById("saveConvenioVersion");
      const descripcion = document.getElementById("saveConvenioDescripcion");
      const allowIncrement = document.getElementById("saveConvenioAllowIncrement");

      importerState.saveDraft = {
        nombre: String(nombre?.value || "").trim(),
        slug: String(slug?.value || "").trim(),
        actividad: String(actividad?.value || "").trim(),
        version: Number(version?.value || 1),
        descripcion: String(descripcion?.value || "").trim(),
        allowIncrementSlug: allowIncrement?.value === "true",
      };
      persistImporter(importerState);
      renderSavePanel();
    });

    registerSearch((value) => {
      searchInput.value = value;
      applyFilters();
    });

    window.addEventListener("convenios:changed", refreshConveniosView);
    renderImporter();
  },
};
    const clearSlot = (slotKey) => {
      importerState.slots[slotKey] = {
        fileName: "",
        document: null,
        review: null,
        validation: null,
        jsonFiles: null,
        logs: [],
        progress: null,
        isLoading: false,
      };
      importerState.previews[slotKey] = null;

      MODULE_SECTIONS.filter((section) => section.slotKey === slotKey).forEach((section) => {
        importerState.moduleSections[section.key] = createModuleSection(section.key, section.title);
      });

      if (slotKey === "formulas") {
        importerState.moduleSections.adicionales = createModuleSection("adicionales", "Adicionales");
        importerState.moduleSections.zonas = createModuleSection("zonas", "Zonas");
      }

      persistImporter(importerState);
      renderImporter();
    };
