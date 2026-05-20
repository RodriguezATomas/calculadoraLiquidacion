import { getCategoria, loadConvenio, loadEscalas, loadFormulas } from "./convenio-engine.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isActiveFormula = (formula) => normalizeText(formula?.estado || "activo") !== "inactivo";

const getFormulaBaseValue = (formula, bases) => {
  const baseKey = normalizeText(formula?.base || "basico");
  return normalizeNumber(bases[baseKey] ?? bases.basico, 0);
};

const buildFormulaItem = (formula, amount, meta = {}) => ({
  id: formula.id,
  nombre: formula.nombre,
  tipo: formula.tipo,
  base: formula.base,
  valor: formula.valor,
  monto: amount,
  ...meta,
});

const matchFormula = (formula, matcher) => {
  const normalizedMatcher = normalizeText(matcher);
  return normalizedMatcher && [
    formula.id,
    formula.nombre,
    formula.base,
  ].some((value) => normalizeText(value).includes(normalizedMatcher));
};

const resolveEscalaItem = (convenioId, categoriaId, escala, zona) => {
  if (escala && typeof escala === "object" && escala.monto != null) {
    return escala;
  }

  const escalas = loadEscalas(convenioId);
  const categoria = getCategoria(convenioId, categoriaId);
  const escalaId = typeof escala === "string" ? escala : escala?.periodo;
  const zonaId = normalizeText(zona?.id || zona || escala?.zona || "general");

  return escalas.find((item) => (
    item.categoriaId === categoria?.id
    && (!escalaId || item.periodo === escalaId)
    && (!zonaId || normalizeText(item.zona || "general") === zonaId)
  )) || escalas.find((item) => item.categoriaId === categoria?.id) || null;
};

const resolveSelectedAdditionalIds = (adicionales) => {
  if (Array.isArray(adicionales)) {
    return adicionales
      .map((item) => (typeof item === "string" ? item : item?.id))
      .filter(Boolean);
  }

  if (adicionales && typeof adicionales === "object") {
    return Object.entries(adicionales)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }

  return [];
};

export const applyAdditional = (formula, context = {}) => {
  if (!formula || !isActiveFormula(formula) || normalizeText(formula.tipo) !== "percentage") {
    return null;
  }

  const multiplier = normalizeNumber(context.multiplier, 1);
  const baseValue = getFormulaBaseValue(formula, context.bases || {});
  const amount = baseValue * (normalizeNumber(formula.valor, 0) / 100) * multiplier;

  return buildFormulaItem(formula, amount, {
    multiplier,
    kind: context.kind || "additional",
  });
};

export const applyZona = (zona, context = {}) => {
  const zonaId = normalizeText(zona?.id || zona);
  if (!zonaId || zonaId === "general") {
    return null;
  }

  const formula = (context.formulas || []).find((item) => matchFormula(item, "zona"));
  return applyAdditional(formula, {
    ...context,
    kind: "zona",
    bases: {
      ...(context.bases || {}),
      total_remunerativo: normalizeNumber(context.totalRemunerativo, 0),
    },
  });
};

export const applyHorasExtras = (horas, context = {}) => {
  const normalizedHoras = typeof horas === "number" ? { ordinarias: horas } : (horas || {});
  const divisor = Math.max(1, normalizeNumber(normalizedHoras.divisor, normalizedHoras.ordinarias || context.totalRemunerativo || 1));
  const remunerativo = normalizeNumber(context.totalRemunerativo, 0);
  const valorHora = normalizeNumber(context.valorHora, remunerativo / divisor);
  const cantidad50 = normalizeNumber(normalizedHoras.extra50, 0);
  const cantidad100 = normalizeNumber(normalizedHoras.extra100, 0);
  const factor50 = normalizeNumber(normalizedHoras.factor50, 1.5);
  const factor100 = normalizeNumber(normalizedHoras.factor100, 2);
  const extra50 = cantidad50 * valorHora * factor50;
  const extra100 = cantidad100 * valorHora * factor100;

  return {
    valorHora,
    divisor,
    items: [
      { id: "horas-extra-50", nombre: "Horas extra 50%", monto: extra50, cantidad: cantidad50, factor: factor50 },
      { id: "horas-extra-100", nombre: "Horas extra 100%", monto: extra100, cantidad: cantidad100, factor: factor100 },
    ].filter((item) => item.cantidad > 0),
    total: extra50 + extra100,
  };
};

export const calculateSalary = ({
  convenio,
  categoria,
  escala,
  adicionales,
  antiguedad,
  horas,
  zona,
} = {}) => {
  const convenioId = typeof convenio === "string" ? convenio : convenio?.id;
  const convenioData = loadConvenio(convenioId);
  const categoriaData = getCategoria(convenioId, categoria);
  const escalaItem = resolveEscalaItem(convenioId, categoriaData?.id || categoria, escala, zona);
  const formulas = loadFormulas(convenioId).filter(isActiveFormula);
  const selectedAdditionalIds = resolveSelectedAdditionalIds(adicionales);
  const warnings = [];
  const basico = normalizeNumber(escalaItem?.monto, 0);
  const bases = {
    basico,
    baseSalary: basico,
    total_remunerativo: basico,
  };

  if (!categoriaData) {
    warnings.push("No se encontro la categoria solicitada.");
  }

  if (!escalaItem) {
    warnings.push("No se encontro escala para la categoria. Se uso 0.");
  }

  const antiguedadFormula = formulas.find((formula) => matchFormula(formula, "antig"));
  const antiguedadItem = normalizeNumber(antiguedad, 0) > 0
    ? applyAdditional(antiguedadFormula, {
      bases,
      multiplier: normalizeNumber(antiguedad, 0),
      kind: "antiguedad",
    })
    : null;

  const adicionalesItems = formulas
    .filter((formula) => selectedAdditionalIds.some((selectedId) => matchFormula(formula, selectedId)))
    .filter((formula) => !matchFormula(formula, "antig") && !matchFormula(formula, "zona"))
    .map((formula) => applyAdditional(formula, { bases }))
    .filter(Boolean);

  const subtotalRemunerativo = basico
    + normalizeNumber(antiguedadItem?.monto, 0)
    + adicionalesItems.reduce((sum, item) => sum + normalizeNumber(item.monto, 0), 0);

  const zonaItem = applyZona(zona, {
    formulas,
    bases: {
      ...bases,
      total_remunerativo: subtotalRemunerativo,
    },
    totalRemunerativo: subtotalRemunerativo,
  });

  const horasExtras = applyHorasExtras(horas, {
    totalRemunerativo: subtotalRemunerativo + normalizeNumber(zonaItem?.monto, 0),
  });

  const totalRemunerativo = subtotalRemunerativo
    + normalizeNumber(zonaItem?.monto, 0)
    + normalizeNumber(horasExtras.total, 0);

  return {
    convenio: {
      id: convenioData.metadata.id,
      nombre: convenioData.metadata.nombre,
      version: convenioData.metadata.version,
    },
    categoria: categoriaData ? { id: categoriaData.id, nombre: categoriaData.nombre } : null,
    escala: escalaItem ? {
      categoriaId: escalaItem.categoriaId,
      periodo: escalaItem.periodo,
      zona: escalaItem.zona || "general",
      monto: basico,
    } : null,
    input: {
      adicionales: selectedAdditionalIds,
      antiguedad: normalizeNumber(antiguedad, 0),
      horas: typeof horas === "number" ? { ordinarias: horas } : (horas || {}),
      zona: zona?.id || zona || "general",
    },
    conceptos: {
      basico,
      antiguedad: antiguedadItem,
      adicionales: adicionalesItems,
      zona: zonaItem,
      horasExtras,
    },
    totales: {
      basico,
      adicionales: adicionalesItems.reduce((sum, item) => sum + normalizeNumber(item.monto, 0), 0),
      antiguedad: normalizeNumber(antiguedadItem?.monto, 0),
      zona: normalizeNumber(zonaItem?.monto, 0),
      horasExtras: normalizeNumber(horasExtras.total, 0),
      remunerativo: totalRemunerativo,
      bruto: totalRemunerativo,
      neto: totalRemunerativo,
    },
    warnings,
  };
};

window.CalculatorEngine = {
  calculateSalary,
  applyAdditional,
  applyZona,
  applyHorasExtras,
};
