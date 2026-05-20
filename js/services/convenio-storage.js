import { readJSON, removeKey, writeJSON } from "../storage.js";

const INDEX_STORAGE_KEY = "convenios-index.json";
const DATA_STORAGE_PREFIX = "convenio-data:";
const LEGACY_STORAGE_KEYS = [
  "mockConvenios",
  "conveniosDemo",
  "defaultConvenios",
  "fakeConvenios",
  "sampleData",
];
const DEFAULT_INDEX = {
  updatedAt: null,
  convenios: [],
  history: [],
};

const now = () => new Date().toISOString();

const slugify = (value) => (
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);

const clone = (value) => JSON.parse(JSON.stringify(value));
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const getVersion = (index, slug) => {
  const versions = index.convenios
    .filter((item) => item.slug === slug)
    .map((item) => Number(item.version) || 1);

  return (versions.length ? Math.max(...versions) : 0) + 1;
};

const normalizeSection = (reviewState, key) => {
  const section = reviewState.sections.find((item) => item.key === key);
  if (!section || !section.enabled) {
    return [];
  }

  return section.items.map((item) => ({
    title: item.title,
    text: item.text,
    pageNumber: item.pageNumber,
    score: item.score,
  }));
};

const buildConvenioRecord = ({ document, reviewState, slug, version }) => ({
  metadata: {
    id: `${slug}-v${version}`,
    slug,
    nombre: document.fileName.replace(/\.pdf$/i, ""),
    fechaImportacion: reviewState.importedAt,
    version,
    estado: "active",
    activo: true,
    historial: [],
    documentoFuente: {
      fileName: document.fileName,
      totalPages: document.totalPages,
    },
  },
  categorias: normalizeSection(reviewState, "categorias"),
  adicionales: normalizeSection(reviewState, "adicionales"),
  escalas: normalizeSection(reviewState, "escalas"),
  formulas: normalizeSection(reviewState, "formulas"),
  zonas: normalizeSection(reviewState, "zonas"),
});

const buildIndexEntry = ({
  id,
  slug,
  nombre,
  actividad = "",
  version,
  sourceFileName,
  importedAt,
  updatedAt,
  status = "active",
  active = true,
  isCurrent = false,
  restoredFrom = null,
}) => ({
  id,
  slug,
  nombre,
  actividad,
  version,
  importedAt,
  updatedAt,
  status,
  active,
  isCurrent,
  restoredFrom,
  sourceFileName,
});

const appendHistory = (index, payload) => {
  const entry = {
    id: `hist-${Date.now()}`,
    createdAt: now(),
    ...payload,
  };

  return {
    ...index,
    updatedAt: entry.createdAt,
    history: [entry, ...(index.history || [])].slice(0, 200),
  };
};

const updateSiblingCurrentFlags = (index, slug, activeId) => index.convenios.map((item) => (
  item.slug === slug
    ? {
        ...item,
        isCurrent: item.id === activeId,
        active: item.id === activeId ? true : item.active,
        status: item.id === activeId ? "active" : item.status === "active" ? "inactive" : item.status,
      }
    : item
));

const persistRecord = (id, record) => {
  writeJSON(`${DATA_STORAGE_PREFIX}${id}`, record);
  return record;
};

const readRecord = (id) => readJSON(`${DATA_STORAGE_PREFIX}${id}`, null);

const isLegacyIndexEntry = (item) => {
  if (!isNonEmptyString(item?.id) || !item.id.includes("-v")) {
    return true;
  }

  const record = readRecord(item.id);
  return !record || !record.metadata || !isNonEmptyString(record.metadata.nombre);
};

const cleanupLegacyStorage = (index) => {
  LEGACY_STORAGE_KEYS.forEach((key) => removeKey(key));

  const removedIds = [];
  const nextConvenios = (Array.isArray(index?.convenios) ? index.convenios : []).filter((item) => {
    if (!isLegacyIndexEntry(item)) {
      return true;
    }

    if (isNonEmptyString(item?.id)) {
      removedIds.push(item.id);
      removeKey(`${DATA_STORAGE_PREFIX}${item.id}`);
    }
    return false;
  });

  return {
    ...DEFAULT_INDEX,
    ...index,
    convenios: nextConvenios,
    history: Array.isArray(index?.history) ? index.history : [],
    updatedAt: index?.updatedAt || null,
    removedIds,
  };
};

const findDuplicateSlugEntry = (index, slug, excludedId = "") => (
  index.convenios.find((item) => item.slug === slug && item.id !== excludedId) || null
);

const assertUniqueStoredSlug = (index, slug, excludedId = "") => {
  if (!slug) {
    return;
  }

  const duplicate = findDuplicateSlugEntry(index, slug, excludedId);
  if (duplicate) {
    console.error("[convenio-storage] slug duplicado", { slug, excludedId, duplicateId: duplicate.id });
    throw new Error("duplicate-convenio-slug");
  }
};

const withRecordHistory = (record, action, detail = {}) => ({
  ...record,
  metadata: {
    ...record.metadata,
    historial: [
      {
        action,
        createdAt: now(),
        detail,
      },
      ...(record.metadata.historial || []),
    ].slice(0, 100),
  },
});

const setVersionState = (record, { active, status }) => ({
  ...record,
  metadata: {
    ...record.metadata,
    activo: active,
    estado: status,
    updatedAt: now(),
  },
});

const ensureCurrentForSlug = (index, slug) => {
  const versions = index.convenios.filter((item) => item.slug === slug);
  if (!versions.length || versions.some((item) => item.isCurrent)) {
    return index;
  }

  const newest = [...versions].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0];
  return {
    ...index,
    convenios: index.convenios.map((item) => (
      item.slug === slug ? { ...item, isCurrent: item.id === newest.id } : item
    )),
  };
};

export const getConveniosIndex = () => {
  const stored = readJSON(INDEX_STORAGE_KEY, DEFAULT_INDEX);
  const cleaned = cleanupLegacyStorage(stored);

  if (cleaned.removedIds.length || cleaned.convenios.length !== (stored.convenios || []).length) {
    writeJSON(INDEX_STORAGE_KEY, {
      updatedAt: now(),
      convenios: cleaned.convenios,
      history: cleaned.history,
    });
  }

  return {
    updatedAt: cleaned.updatedAt,
    convenios: cleaned.convenios,
    history: cleaned.history,
  };
};

export const listStoredConvenios = () => {
  let index = getConveniosIndex();
  const slugs = [...new Set(index.convenios.map((item) => item.slug))];
  slugs.forEach((slug) => {
    index = ensureCurrentForSlug(index, slug);
  });
  return index.convenios;
};

export const listStoredConvenioVersions = (slugOrId) => {
  const index = getConveniosIndex();
  const current = index.convenios.find((item) => item.id === slugOrId);
  const slug = current?.slug || slugOrId;
  return index.convenios
    .filter((item) => item.slug === slug)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
};

export const getConvenioById = (id) => {
  const convenio = readRecord(id);
  console.info(`[convenio-storage] getConvenioById ${id}: ${convenio ? "ok" : "no-encontrado"}`);
  return convenio;
};

export const getConvenioHistory = (id) => {
  const convenio = getConvenioById(id);
  return convenio?.metadata?.historial || [];
};

export const isRenderableConvenio = (item) => {
  const slug = slugify(item?.metadata?.slug || item?.slug || "");
  const nombre = String(item?.metadata?.nombre || item?.nombre || "").trim();
  const actividad = String(item?.metadata?.actividad || item?.actividad || "").trim();
  return Boolean(slug && nombre && actividad && item?.metadata);
};

export const getAllConvenios = () => {
  return listStoredConvenios().map((item) => {
    const record = getConvenioById(item.id);
    const slug = slugify(record?.metadata?.slug || item.slug || "");
    const nombre = String(record?.metadata?.nombre || item.nombre || "").trim();
    const actividad = String(record?.metadata?.actividad || item.actividad || "General").trim();
    const metadata = record?.metadata || null;
    const valid = isRenderableConvenio({
      slug,
      nombre,
      actividad,
      metadata,
    });

    if (!valid) {
      console.warn("[convenio-storage] convenio omitido por metadata incompleta", {
        id: item.id,
        slug,
        nombre,
        actividad,
      });
    }

    return {
      id: item.id,
      label: `${nombre} v${item.version}`,
      nombre,
      cct: `Importado v${item.version}`,
      activity: actividad,
      icon: "folder",
      iconTone: "blue",
      source: slug ? `calculadora.html?convenio=${encodeURIComponent(slug)}` : "",
      description: item.sourceFileName ? `Convenio importado desde ${item.sourceFileName}.` : "Convenio importado.",
      status: item.isCurrent ? "active" : (item.status || "inactive"),
      rawStatus: item.status,
      isCurrent: Boolean(item.isCurrent),
      version: item.version,
      slug,
      metadata,
      versionsCount: listStoredConvenioVersions(slug).length,
      updatedAt: (item.updatedAt || metadata?.updatedAt || "").slice(0, 10),
      isValid: valid,
    };
  });
};

export const getActiveConvenioVersion = (slugOrId) => {
  const index = getConveniosIndex();
  const current = index.convenios.find((item) => item.id === slugOrId);
  const slug = current?.slug || slugOrId;
  return index.convenios.find((item) => item.slug === slug && item.isCurrent) || null;
};

export const updateConvenioById = (id, convenio) => {
  if (!id || !convenio?.metadata?.nombre) {
    console.error("[convenio-storage] updateConvenioById invalido");
    throw new Error("invalid-convenio-update");
  }

  const index = getConveniosIndex();
  const previous = getConvenioById(id);
  const nextSlug = slugify(convenio?.metadata?.slug || previous?.metadata?.slug || convenio?.metadata?.nombre || "");
  assertUniqueStoredSlug(index, nextSlug, id);
  const nextRecord = withRecordHistory({
    ...convenio,
    metadata: {
      ...previous?.metadata,
      ...convenio.metadata,
      id,
      slug: nextSlug,
      updatedAt: now(),
    },
  }, "update", {
    previousUpdatedAt: previous?.metadata?.updatedAt || null,
  });

  persistRecord(id, nextRecord);

  const nextConvenios = index.convenios.map((item) => (
    item.id === id
      ? {
          ...item,
          slug: nextSlug,
          nombre: nextRecord.metadata.nombre,
          updatedAt: nextRecord.metadata.updatedAt,
          status: nextRecord.metadata.estado || item.status,
          active: nextRecord.metadata.activo ?? item.active,
        }
      : item
  ));

  const nextIndex = appendHistory({
    ...index,
    convenios: nextConvenios,
  }, {
    convenioId: id,
    slug: nextRecord.metadata.slug,
    action: "update",
    title: nextRecord.metadata.nombre,
    version: nextRecord.metadata.version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  console.log("CONVENIO GUARDADO", nextRecord);
  console.info(`[convenio-storage] Convenio actualizado: ${id}`);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return nextRecord;
};

export const getCategorias = (id) => getConvenioById(id)?.categorias || [];

export const getEscalas = (id) => getConvenioById(id)?.escalas || [];

export const getAdicionales = (id) => getConvenioById(id)?.adicionales || [];

export const saveConvenioImport = ({ document, reviewState }) => {
  if (!document || !reviewState) {
    console.error("[convenio-storage] Datos incompletos para guardar convenio");
    throw new Error("invalid-convenio-import");
  }

  const nombre = document.fileName.replace(/\.pdf$/i, "").trim();
  const slug = slugify(nombre || "convenio");
  const index = getConveniosIndex();
  const version = getVersion(index, slug);
  const record = buildConvenioRecord({ document, reviewState, slug, version });
  const id = record.metadata.id;

  if (!record.metadata.nombre || !record.metadata.slug) {
    console.error("[convenio-storage] Validacion fallida de metadata");
    throw new Error("invalid-convenio-metadata");
  }

  persistRecord(id, withRecordHistory(record, "import-pdf", { sourceFileName: document.fileName }));

  const nextEntry = buildIndexEntry({
    id,
    slug,
    nombre: record.metadata.nombre,
    version,
    importedAt: record.metadata.fechaImportacion,
    updatedAt: now(),
    status: record.metadata.estado,
    active: record.metadata.activo,
    isCurrent: true,
    sourceFileName: document.fileName,
  });

  const nextIndex = appendHistory({
    updatedAt: nextEntry.updatedAt,
    history: index.history || [],
    convenios: [
      nextEntry,
      ...updateSiblingCurrentFlags(index, slug, id).filter((item) => item.id !== id),
    ],
  }, {
    convenioId: id,
    slug,
    action: "import-pdf",
    title: record.metadata.nombre,
    version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  console.info(`[convenio-storage] Convenio guardado: ${id}`);

  return record;
};

export const saveConvenioJsonImport = ({ convenio, sourceFiles }) => {
  if (!convenio?.metadata?.nombre) {
    console.error("[convenio-storage] Convenio JSON invalido");
    throw new Error("invalid-json-convenio");
  }

  console.log("guardando convenio", convenio?.metadata?.slug || convenio?.metadata?.nombre || "convenio");
  const currentTime = now();
  const index = getConveniosIndex();
  const baseSlug = slugify(convenio.metadata.slug || convenio.metadata.id || convenio.metadata.nombre || "convenio");
  const duplicatedEntries = index.convenios.filter((item) => item.slug === baseSlug);
  duplicatedEntries.forEach((item) => removeKey(`${DATA_STORAGE_PREFIX}${item.id}`));
  const cleanIndex = duplicatedEntries.length
    ? {
        ...index,
        convenios: index.convenios.filter((item) => item.slug !== baseSlug),
      }
    : index;
  const version = 1;
  const id = `${baseSlug}-v${version}`;
  const record = withRecordHistory({
    metadata: {
      ...convenio.metadata,
      actividad: convenio.metadata.actividad || "General",
      id,
      slug: baseSlug,
      version,
      estado: convenio.metadata.estado || convenio.metadata.status || "active",
      activo: convenio.metadata.activo ?? true,
      fechaImportacion: convenio.metadata.fechaImportacion || currentTime,
      sourceType: "json",
      historial: convenio.metadata.historial || [],
    },
    categorias: Array.isArray(convenio.categorias) ? convenio.categorias : [],
    escalas: Array.isArray(convenio.escalas) ? convenio.escalas : [],
    formulas: Array.isArray(convenio.formulas) ? convenio.formulas : [],
    adicionales: Array.isArray(convenio.adicionales) ? convenio.adicionales : [],
    zonas: Array.isArray(convenio.zonas) ? convenio.zonas : [],
    ui: convenio.ui || null,
  }, "import-json", {
    sourceFiles,
  });

  persistRecord(id, record);
  console.log("CONVENIO GUARDADO", record);
  console.log("convenio persistido", id);

  const nextEntry = buildIndexEntry({
    id,
    slug: baseSlug,
    nombre: record.metadata.nombre,
    actividad: record.metadata.actividad || "General",
    version,
    importedAt: record.metadata.fechaImportacion,
    updatedAt: currentTime,
    status: record.metadata.estado,
    active: record.metadata.activo,
    isCurrent: true,
    sourceFileName: sourceFiles.join(", "),
  });

  const nextIndex = appendHistory({
    updatedAt: currentTime,
    history: cleanIndex.history || [],
    convenios: [
      nextEntry,
      ...updateSiblingCurrentFlags(cleanIndex, baseSlug, id).filter((item) => item.id !== id),
    ],
  }, {
    convenioId: id,
    slug: baseSlug,
    action: "import-json",
    title: record.metadata.nombre,
    version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  console.log("storage", nextIndex);

  console.info(`[convenio-storage] Convenio JSON guardado: ${id}`);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return record;
};

export const deleteConvenioById = (id) => {
  const index = getConveniosIndex();
  const current = index.convenios.find((item) => item.id === id);
  if (!current) {
    throw new Error("convenio-not-found");
  }

  removeKey(`${DATA_STORAGE_PREFIX}${id}`);

  const remainingConvenios = index.convenios.filter((item) => item.id !== id);
  const remainingSameSlug = remainingConvenios
    .filter((item) => item.slug === current.slug)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
  const fallbackId = current.isCurrent ? remainingSameSlug[0]?.id || null : null;
  const normalizedConvenios = remainingConvenios.map((item) => (
    fallbackId && item.slug === current.slug
      ? {
          ...item,
          isCurrent: item.id === fallbackId,
          active: item.id === fallbackId ? true : item.active,
          status: item.id === fallbackId ? "active" : item.status,
        }
      : item
  ));

  const nextIndex = appendHistory({
    ...index,
    convenios: normalizedConvenios,
  }, {
    convenioId: id,
    slug: current.slug,
    action: "delete",
    title: current.nombre,
    version: current.version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  console.info(`[convenio-storage] Convenio eliminado: ${id}`);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return current;
};

export const activateConvenioVersion = (id) => {
  const index = getConveniosIndex();
  const current = index.convenios.find((item) => item.id === id);
  if (!current) {
    throw new Error("convenio-not-found");
  }

  const record = setVersionState(withRecordHistory(getConvenioById(id), "activate"), {
    active: true,
    status: "active",
  });
  persistRecord(id, record);

  const nextIndex = appendHistory({
    ...index,
    convenios: updateSiblingCurrentFlags(index, current.slug, id),
  }, {
    convenioId: id,
    slug: current.slug,
    action: "activate",
    title: current.nombre,
    version: current.version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return record;
};

export const deactivateConvenioVersion = (id) => {
  const index = getConveniosIndex();
  const current = index.convenios.find((item) => item.id === id);
  if (!current) {
    throw new Error("convenio-not-found");
  }

  const record = setVersionState(withRecordHistory(getConvenioById(id), "deactivate"), {
    active: false,
    status: "inactive",
  });
  persistRecord(id, record);

  const siblingVersions = listStoredConvenioVersions(current.slug).filter((item) => item.id !== id);
  const fallbackId = current.isCurrent ? siblingVersions[0]?.id || null : null;
  const nextConvenios = index.convenios.map((item) => {
    if (item.slug !== current.slug) {
      return item;
    }

    if (item.id === id) {
      return {
        ...item,
        active: false,
        isCurrent: false,
        status: "inactive",
        updatedAt: record.metadata.updatedAt,
      };
    }

    if (fallbackId && item.id === fallbackId) {
      return {
        ...item,
        active: true,
        isCurrent: true,
        status: "active",
      };
    }

    return item;
  });

  const nextIndex = appendHistory({
    ...index,
    convenios: nextConvenios,
  }, {
    convenioId: id,
    slug: current.slug,
    action: "deactivate",
    title: current.nombre,
    version: current.version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return record;
};

export const duplicateConvenioVersion = (id) => {
  const current = getConvenioById(id);
  if (!current) {
    throw new Error("convenio-not-found");
  }

  const index = getConveniosIndex();
  const version = getVersion(index, current.metadata.slug);
  const nextId = `${current.metadata.slug}-v${version}`;
  const duplicated = withRecordHistory({
    ...clone(current),
    metadata: {
      ...clone(current.metadata),
      id: nextId,
      version,
      estado: "draft",
      activo: false,
      updatedAt: now(),
    },
  }, "duplicate", {
    sourceId: id,
  });

  persistRecord(nextId, duplicated);

  const nextEntry = buildIndexEntry({
    id: nextId,
    slug: duplicated.metadata.slug,
    nombre: duplicated.metadata.nombre,
    version,
    importedAt: duplicated.metadata.fechaImportacion,
    updatedAt: duplicated.metadata.updatedAt,
    status: "draft",
    active: false,
    isCurrent: false,
    sourceFileName: current.metadata.documentoFuente?.fileName || current.metadata.sourceType || "duplicado",
  });

  const nextIndex = appendHistory({
    ...index,
    convenios: [nextEntry, ...index.convenios],
  }, {
    convenioId: nextId,
    slug: duplicated.metadata.slug,
    action: "duplicate",
    title: duplicated.metadata.nombre,
    version,
  });

  writeJSON(INDEX_STORAGE_KEY, nextIndex);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return duplicated;
};

export const restoreConvenioVersion = (id) => {
  const restored = duplicateConvenioVersion(id);
  activateConvenioVersion(restored.metadata.id);

  const record = withRecordHistory(getConvenioById(restored.metadata.id), "restore", {
    restoredFrom: id,
  });
  persistRecord(restored.metadata.id, record);

  const index = appendHistory(getConveniosIndex(), {
    convenioId: restored.metadata.id,
    slug: restored.metadata.slug,
    action: "restore",
    title: restored.metadata.nombre,
    version: restored.metadata.version,
    restoredFrom: id,
  });
  writeJSON(INDEX_STORAGE_KEY, index);
  window.dispatchEvent(new CustomEvent("convenios:changed"));
  return record;
};

window.getConveniosIndex = getConveniosIndex;
window.getConvenioById = getConvenioById;
window.getCategorias = getCategorias;
window.getEscalas = getEscalas;
window.getAdicionales = getAdicionales;
