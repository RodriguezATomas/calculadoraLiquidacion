import { readJSON, removeKey, writeJSON } from "../storage.js";
import { getConvenioById, updateConvenioById } from "./convenio-storage.js";

const AUTOSAVE_PREFIX = "convenio-editor-draft:";
const SECTIONS = ["categorias", "escalas", "adicionales", "formulas", "zonas"];
const normalizeText = (value) => String(value || "").trim();
const slugify = (value) => (
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);
const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapItems = (items = []) => items.map((item, index) => ({
  id: item.id || `${Date.now()}-${index}`,
  nombre: item.title || item.nombre || item.categoriaId || `Item ${index + 1}`,
  monto: item.monto ?? (item.tipo === "fixed" ? item.valor ?? "" : ""),
  porcentaje: item.porcentaje ?? (item.tipo === "percentage" ? item.valor ?? "" : ""),
  periodo: item.periodo || "",
  base: item.base || "",
  tipo: item.tipo || "",
  categoriaId: item.categoriaId || "",
  regla: item.regla || "",
  zona: item.zona || "",
  estado: item.estado || "activo",
  text: item.text || "",
}));

export const loadConvenioEditor = (id) => {
  const convenio = getConvenioById(id);
  if (!convenio) {
    return null;
  }

  const draft = readJSON(`${AUTOSAVE_PREFIX}${id}`, null);
  if (draft) {
    console.info(`[convenio-editor] draft cargado: ${id}`);
    return draft;
  }

  return {
    metadata: {
      ...convenio.metadata,
    },
    categorias: mapItems(convenio.categorias),
    escalas: mapItems(convenio.escalas),
    adicionales: mapItems(convenio.adicionales),
    formulas: mapItems(convenio.formulas),
    zonas: mapItems(convenio.zonas),
    autosave: false,
  };
};

export const validateConvenioEditor = (state) => {
  const errors = [];

  if (!normalizeText(state?.metadata?.nombre)) {
    errors.push("metadata: nombre obligatorio");
  }

  if (!slugify(state?.metadata?.slug || state?.metadata?.nombre || "")) {
    errors.push("metadata: slug invalido");
  }

  SECTIONS.forEach((sectionKey) => {
    const items = state[sectionKey] || [];
    const names = new Set();

    items.forEach((item, index) => {
      const name = String(item.nombre || "").trim();
      if (!name) {
        errors.push(`${sectionKey}: fila ${index + 1} sin nombre`);
      }

      const normalized = name.toLowerCase();
      if (name && names.has(normalized)) {
        errors.push(`${sectionKey}: nombre duplicado "${name}"`);
      }
      names.add(normalized);

      if (item.porcentaje !== "" && Number.isNaN(Number(item.porcentaje))) {
        errors.push(`${sectionKey}: porcentaje invalido en "${name || index + 1}"`);
      }

      if (item.monto !== "" && Number.isNaN(Number(item.monto))) {
        errors.push(`${sectionKey}: monto invalido en "${name || index + 1}"`);
      }
    });
  });

  return errors;
};

export const autosaveConvenioEditor = (id, state) => {
  writeJSON(`${AUTOSAVE_PREFIX}${id}`, state);
  console.info(`[convenio-editor] autosave: ${id}`);
};

export const clearConvenioEditorAutosave = (id) => {
  removeKey(`${AUTOSAVE_PREFIX}${id}`);
};

export const publishConvenioEditor = (id, state) => {
  const errors = validateConvenioEditor(state);
  if (errors.length) {
    console.error("[convenio-editor] validacion fallida", errors);
    throw new Error(errors.join(" | "));
  }

  const categorias = state.categorias.map((item, index) => {
    const nombre = normalizeText(item.nombre) || `Categoria ${index + 1}`;
    return {
      id: slugify(item.id || nombre || `categoria-${index + 1}`),
      nombre,
      estado: item.estado || "activo",
      text: normalizeText(item.text || item.regla || nombre),
    };
  });

  const categoryIds = new Set(categorias.map((item) => item.id));

  const escalas = state.escalas.map((item, index) => {
    const fallbackName = normalizeText(item.nombre) || `Categoria ${index + 1}`;
    const rawCategoriaId = normalizeText(item.categoriaId || item.id || fallbackName || `categoria-${index + 1}`);
    const categoriaId = slugify(rawCategoriaId);
    return {
      categoriaId: categoryIds.has(categoriaId) ? categoriaId : categorias[index]?.id || categoriaId,
      periodo: normalizeText(item.periodo || ""),
      monto: toNumberOrZero(item.monto),
      zona: normalizeText(item.zona || "general") || "general",
      estado: item.estado || "activo",
      text: normalizeText(item.text || item.regla || fallbackName),
    };
  });

  const adicionales = state.adicionales.map((item, index) => {
    const nombre = normalizeText(item.nombre) || `Adicional ${index + 1}`;
    const porcentaje = normalizeText(item.porcentaje);
    const monto = normalizeText(item.monto);
    const tipo = porcentaje ? "percentage" : "fixed";
    return {
      id: slugify(item.id || nombre || `adicional-${index + 1}`),
      nombre,
      tipo,
      base: normalizeText(item.base || "basico") || "basico",
      valor: tipo === "percentage" ? toNumberOrZero(porcentaje) : toNumberOrZero(monto),
      estado: item.estado || "activo",
      text: normalizeText(item.text || item.regla || nombre),
    };
  });

  const formulas = state.formulas.map((item, index) => {
    const nombre = normalizeText(item.nombre) || `Formula ${index + 1}`;
    const porcentaje = normalizeText(item.porcentaje);
    const monto = normalizeText(item.monto);
    const tipo = porcentaje ? "percentage" : "fixed";
    return {
      id: slugify(item.id || nombre || `formula-${index + 1}`),
      nombre,
      tipo,
      base: normalizeText(item.base || "basico") || "basico",
      valor: tipo === "percentage" ? toNumberOrZero(porcentaje) : toNumberOrZero(monto),
      estado: item.estado || "activo",
      text: normalizeText(item.text || item.regla || nombre),
    };
  });

  const zonas = state.zonas.map((item, index) => {
    const nombre = normalizeText(item.nombre) || `Zona ${index + 1}`;
    const porcentaje = normalizeText(item.porcentaje);
    const monto = normalizeText(item.monto);
    const tipo = porcentaje ? "percentage" : "fixed";
    const zonaId = slugify(item.zona || item.id || nombre || `zona-${index + 1}`);
    return {
      id: slugify(item.id || nombre || `zona-${index + 1}`),
      nombre,
      tipo,
      base: normalizeText(item.base || "total_remunerativo") || "total_remunerativo",
      valor: tipo === "percentage" ? toNumberOrZero(porcentaje) : toNumberOrZero(monto),
      zona: zonaId,
      estado: item.estado || "activo",
      text: normalizeText(item.text || item.regla || nombre),
    };
  });

  const convenio = {
    metadata: {
      ...state.metadata,
      slug: slugify(state.metadata.slug || state.metadata.nombre || ""),
      updatedAt: new Date().toISOString(),
    },
    categorias,
    escalas,
    adicionales,
    formulas,
    zonas,
  };

  const saved = updateConvenioById(id, convenio);
  clearConvenioEditorAutosave(id);
  console.info(`[convenio-editor] convenio publicado: ${id}`);
  return saved;
};
