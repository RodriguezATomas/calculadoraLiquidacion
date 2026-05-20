import { validateConvenioImportFiles } from "../../../core/convenio-validator.js";

const buildJsonFilesShape = (bundle) => ({
  "metadata.json": bundle.metadata,
  "categorias.json": bundle.categorias,
  "escalas.json": bundle.escalas,
  "formulas.json": bundle.formulas,
});

export const validateNormalizedConvenio = (bundle) => {
  const result = validateConvenioImportFiles(buildJsonFilesShape(bundle));
  const warnings = [...result.warnings];
  const errors = [...result.errors];
  const blockedFields = ["text", "rawText", "texto"];

  ["categorias", "escalas", "adicionales", "formulas", "zonas"].forEach((sectionKey) => {
    (bundle[sectionKey] || []).forEach((item, index) => {
      blockedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(item || {}, field)) {
          errors.push(`${sectionKey}: el item ${index + 1} no puede incluir ${field}.`);
        }
      });
    });
  });

  if (!bundle.adicionales?.length) {
    warnings.push("No se detectaron adicionales en forma estructurada.");
  }

  if ((bundle.categorias?.length || 0) <= 1) {
    warnings.push("Se detectaron muy pocas categorias. Revisar parser estructural.");
  }

  if (!bundle.zonas?.length) {
    warnings.push("No se detectaron zonas en forma estructurada.");
  }

  if ((bundle.metadata?.nombre || "").length < 3) {
    errors.push("No se pudo inferir un nombre de convenio confiable.");
  }

  if ((bundle.categorias || []).some((item) => !String(item?.periodo || "").trim())) {
    warnings.push("Hay categorias sin periodo inferido.");
  }

  if ((bundle.escalas || []).some((item) => !String(item?.periodo || "").trim())) {
    warnings.push("Hay escalas sin periodo inferido.");
  }

  if ((bundle.zonas || []).some((item) => item?.porcentaje == null || Number.isNaN(Number(item.porcentaje)))) {
    warnings.push("Hay zonas sin porcentaje valido.");
  }

  if (!(bundle.escalas || []).some((item) => Number(item?.monto) > 0)) {
    warnings.push("No se detectaron montos validos en escalas.");
  }

  if (!(bundle.formulas || []).some((item) => Number(item?.valor) > 0)) {
    warnings.push("No se detectaron porcentajes o valores validos en formulas.");
  }

  return {
    ...result,
    errors,
    warnings,
    stats: {
      categorias: bundle.categorias?.length || 0,
      escalas: bundle.escalas?.length || 0,
      adicionales: bundle.adicionales?.length || 0,
      formulas: bundle.formulas?.length || 0,
      zonas: bundle.zonas?.length || 0,
    },
  };
};
