const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const validateConvenioData = (id, convenio) => {
  const errors = [];

  if (!convenio || !isObject(convenio)) {
    return [`${id}: convenio invalido`];
  }

  if (!isObject(convenio.metadata)) {
    errors.push(`${id}: metadata invalida`);
  }

  if (!Array.isArray(convenio.categorias)) {
    errors.push(`${id}: categorias invalidas`);
  }

  if (!Array.isArray(convenio.escalas)) {
    errors.push(`${id}: escalas invalidas`);
  }

  if (!Array.isArray(convenio.formulas) || convenio.formulas.length === 0) {
    errors.push(`${id}: formulas faltantes`);
  }

  const categoryNames = new Set();
  (convenio.categorias || []).forEach((item) => {
    const normalized = normalizeText(item.nombre);
    if (!normalized) {
      errors.push(`${id}: categoria vacia`);
      return;
    }

    if (categoryNames.has(normalized)) {
      errors.push(`${id}: categoria repetida "${item.nombre}"`);
    }
    categoryNames.add(normalized);
  });

  return errors;
};

export const assertConvenioData = (id, convenio) => {
  const errors = validateConvenioData(id, convenio);
  if (errors.length) {
    console.error("[convenio-validator] validacion fallida", errors);
    throw new Error(errors.join(" | "));
  }

  return convenio;
};

export const validateConvenioImportFiles = (filesByName) => {
  const errors = [];
  const warnings = [];
  const requiredFiles = ["metadata.json", "categorias.json", "escalas.json", "formulas.json"];

  requiredFiles.forEach((fileName) => {
    if (!filesByName[fileName]) {
      errors.push(`Falta ${fileName}.`);
    }
  });

  if (errors.length) {
    return { errors, warnings, convenio: null };
  }

  const metadata = filesByName["metadata.json"];
  const categorias = filesByName["categorias.json"];
  const escalas = filesByName["escalas.json"];
  const formulas = filesByName["formulas.json"];

  if (!isObject(metadata)) {
    errors.push("metadata.json debe ser un objeto.");
  }

  if (!Array.isArray(categorias)) {
    errors.push("categorias.json debe ser un array.");
  }

  if (!Array.isArray(escalas)) {
    errors.push("escalas.json debe ser un array.");
  }

  if (!Array.isArray(formulas)) {
    errors.push("formulas.json debe ser un array.");
  }

  if (errors.length) {
    return { errors, warnings, convenio: null };
  }

  if (!String(metadata.id || metadata.slug || "").trim()) {
    errors.push("metadata.json debe incluir id o slug.");
  }

  if (!String(metadata.nombre || "").trim()) {
    errors.push("metadata.json debe incluir nombre.");
  }

  if (escalas.length === 0) {
    errors.push("escalas.json no puede estar vacio.");
  }

  if (formulas.length === 0) {
    errors.push("formulas.json no puede estar vacio.");
  }

  const categoriaIds = new Set();
  categorias.forEach((item, index) => {
    const id = String(item?.id || "").trim();
    const nombre = String(item?.nombre || "").trim();

    if (!id) {
      errors.push(`categorias.json: la categoria ${index + 1} no tiene id.`);
      return;
    }

    if (!nombre) {
      errors.push(`categorias.json: la categoria ${id} no tiene nombre.`);
    }

    if (categoriaIds.has(id)) {
      errors.push(`categorias.json: el id ${id} esta repetido.`);
      return;
    }

    categoriaIds.add(id);
  });

  const formulaIds = new Set();
  formulas.forEach((item, index) => {
    const id = String(item?.id || "").trim();
    if (!id) {
      errors.push(`formulas.json: la formula ${index + 1} no tiene id.`);
      return;
    }

    if (formulaIds.has(id)) {
      errors.push(`formulas.json: el id ${id} esta repetido.`);
      return;
    }

    formulaIds.add(id);

    if (!String(item?.nombre || "").trim()) {
      warnings.push(`formulas.json: la formula ${id} no tiene nombre visible.`);
    }
  });

  escalas.forEach((item, index) => {
    const categoriaId = String(item?.categoriaId || "").trim();
    if (!categoriaId) {
      errors.push(`escalas.json: la escala ${index + 1} no tiene categoriaId.`);
      return;
    }

    if (!categoriaIds.has(categoriaId)) {
      errors.push(`escalas.json: la categoria ${categoriaId} no existe en categorias.json.`);
    }

    if (item?.monto == null || Number.isNaN(Number(item.monto))) {
      errors.push(`escalas.json: la escala de ${categoriaId} no tiene monto valido.`);
    }
  });

  const normalizedFormulas = formulas.map((item) => normalizeText(item?.id));
  if (!normalizedFormulas.some((id) => id.includes("antig") || id.includes("present") || id.includes("zona"))) {
    warnings.push("No se detectaron formulas frecuentes como antiguedad, presentismo o zona.");
  }

  const convenio = {
    metadata,
    categorias,
    escalas,
    formulas,
  };

  const structuralErrors = validateConvenioData(metadata.id || metadata.slug || "importado", convenio);
  structuralErrors.forEach((error) => {
    if (!errors.includes(error)) {
      errors.push(error);
    }
  });

  return {
    errors,
    warnings,
    convenio: errors.length ? null : convenio,
  };
};
