import {
  applyFormulas,
  getCategoria,
  getEscala,
  loadCategorias,
  listConveniosDisponibles,
  loadConvenio,
  loadEscalas,
  loadFormulas,
} from "../../core/convenio-engine.js";
import {
  applyAdditional,
  applyHorasExtras,
  applyZona,
  calculateSalary,
} from "../../core/calculator-engine.js";
import { getActiveConvenioVersion } from "./convenio-storage.js";

export {
  listConveniosDisponibles,
  loadConvenio,
  loadCategorias,
  loadEscalas,
  loadFormulas,
  getCategoria,
  getEscala,
  applyFormulas,
  calculateSalary,
  applyAdditional,
  applyZona,
  applyHorasExtras,
  getActiveConvenioVersion,
};

export const calculateAdicionales = (convenioId, baseSalary) => {
  const salary = calculateSalary({
    convenio: convenioId,
    escala: { monto: baseSalary },
  });
  return {
    items: salary.conceptos.adicionales,
    total: salary.totales.adicionales,
    warnings: salary.warnings,
  };
};

window.ConvenioEngine = {
  listConveniosDisponibles,
  loadConvenio,
  loadCategorias,
  loadEscalas,
  loadFormulas,
  getCategoria,
  getEscala,
  calculateSalary,
  applyAdditional,
  applyZona,
  applyHorasExtras,
  getActiveConvenioVersion,
  calculateAdicionales,
  applyFormulas,
};
