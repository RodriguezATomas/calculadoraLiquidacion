import { listConvenioModules, loadCategorias, loadConvenio, loadEscalas, loadFormulas } from "./convenio-loader.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const getCategoria = (convenioId, categoriaId) => {
  const categoria = loadCategorias(convenioId).find((item) => (
    item.id === categoriaId || normalizeText(item.nombre) === normalizeText(categoriaId)
  )) || null;

  console.info(`[core/convenio-engine] categoría aplicada: ${categoria?.nombre || "default"}`);
  return categoria;
};

export const getEscala = (convenioId, categoriaId, options = {}) => {
  const periodo = options.periodo || null;
  const categoria = getCategoria(convenioId, categoriaId);
  const warnings = [];
  const escalas = loadEscalas(convenioId);
  const matched = escalas.find((item) => (
    item.categoriaId === categoria?.id && (!periodo || item.periodo === periodo)
  )) || escalas.find((item) => item.categoriaId === categoria?.id) || null;

  if (!matched) {
    warnings.push("No se encontró escala. Se usa monto seguro 0.");
  }

  console.info(`[core/convenio-engine] escala aplicada: ${matched?.categoriaId || "default"} -> ${matched?.monto || 0}`);
  return {
    item: matched,
    value: matched?.monto || 0,
    warnings,
  };
};

export const applyFormulas = (convenioId, context = {}) => {
  const formulas = loadFormulas(convenioId);
  const warnings = [];
  const applied = [];

  formulas.forEach((formula) => {
    if (formula.tipo !== "percentage" || typeof formula.valor !== "number") {
      warnings.push(`Fórmula inválida o no soportada: ${formula.nombre}`);
      return;
    }

    const baseValue = formula.base === "total_remunerativo"
      ? Number(context.totalRemunerativo || context.baseSalary || 0)
      : Number(context.baseSalary || 0);

    const amount = baseValue * (formula.valor / 100);
    applied.push({
      id: formula.id,
      nombre: formula.nombre,
      amount,
      base: formula.base,
      valor: formula.valor,
    });
    console.info(`[core/convenio-engine] fórmula utilizada: ${formula.nombre}`);
  });

  return {
    items: applied,
    total: applied.reduce((sum, item) => sum + item.amount, 0),
    warnings,
  };
};

export const listConveniosDisponibles = () => {
  return listConvenioModules().map((current) => {
    return {
      id: current.metadata.id,
      nombre: current.metadata.nombre,
      version: current.metadata.version,
      status: current.metadata.status,
      source: current.metadata.sourceType || "module",
    };
  });
};

window.ConvenioCore = {
  loadConvenio,
  loadCategorias,
  loadEscalas,
  loadFormulas,
  getCategoria,
  getEscala,
  applyFormulas,
  listConveniosDisponibles,
};
