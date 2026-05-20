import {
  getActiveConvenioVersion,
  getConvenioById,
  listStoredConvenios,
  saveConvenioJsonImport,
} from "./convenio-storage.js";

const REGISTRY_PATH = "/convenios/registry.json";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const normalizeSlug = (value) => (
  String(value || "convenio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);

const now = () => new Date().toISOString();

const readModuleArray = (value) => Array.isArray(value) ? value : [];

const matchAny = (text, patterns) => patterns.some((pattern) => text.includes(pattern));

const deriveZonas = (escalas) => {
  const zonas = [...new Set(readModuleArray(escalas).map((item) => item.zona || "general"))];
  return zonas.map((zona) => ({
    id: zona,
    nombre: zona === "general" ? "Zona general" : String(zona),
    porcentaje: 0,
  }));
};

const isSpecialFormula = (formula) => {
  const text = `${formula?.id || ""} ${formula?.nombre || ""}`.toLowerCase();
  return ["antig", "present", "asistencia", "zona", "extra 50", "extra 100", "hora extra", "horas extra"].some((pattern) => text.includes(pattern));
};

const deriveAdicionales = (formulas) => readModuleArray(formulas)
  .filter((formula) => !isSpecialFormula(formula))
  .map((formula) => ({
    id: formula.id,
    nombre: formula.nombre,
    tipo: formula.tipo,
    valor: formula.valor,
    base: formula.base,
  }));

const buildDefaultUi = ({ metadata, config }) => ({
  titulo: `Liquidacion ${metadata.nombre || "de convenio"}`,
  colorPrimario: "#5f67ff",
  mostrarZona: Boolean(config.usaZona),
  mostrarHorasExtra: Boolean(config.usaHorasExtra),
  mostrarPresentismo: Boolean(config.usaPresentismo),
  mostrarAntiguedad: Boolean(config.usaAntiguedad),
  modoBase: "mensual",
  horasBaseMensual: 200,
  netoEstimadoPorcentaje: 83,
});

const createSlugCandidates = (value) => {
  const normalized = normalizeSlug(value || "");
  return normalized ? [normalized] : [];
};

const buildConvenioAliases = (metadata, registryEntry = {}) => {
  const aliases = new Set([
    ...createSlugCandidates(metadata?.slug),
    ...createSlugCandidates(metadata?.id),
    ...createSlugCandidates(metadata?.nombre),
    ...createSlugCandidates(registryEntry?.slug),
    ...createSlugCandidates(registryEntry?.nombre),
  ]);

  return [...aliases];
};

export const detectConvenioConfig = ({ categorias, escalas, formulas }) => {
  const serialized = JSON.stringify({
    categorias: readModuleArray(categorias),
    escalas: readModuleArray(escalas),
    formulas: readModuleArray(formulas),
  }).toLowerCase();

  return {
    usaZona: matchAny(serialized, ["zona", "desfavorable"]),
    usaPresentismo: matchAny(serialized, ["presentismo", "asistencia"]),
    usaAntiguedad: matchAny(serialized, ["antiguedad", "antig"]),
    usaHorasExtra: matchAny(serialized, ["hora extra", "horas extra", "extra 50", "extra 100", "valor hora", "horaria", "jornal"]),
  };
};

const getImporterMetadata = (importerState) => (
  importerState?.previews?.categorias?.metadata
  || importerState?.previews?.escalas?.metadata
  || importerState?.previews?.formulas?.metadata
  || {}
);

const createFriendlyError = (code, message, extra = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
};

export const buildConvenioDraft = (importerState) => {
  const metadataSource = getImporterMetadata(importerState);
  const nombre = String(metadataSource.nombre || "").trim();
  const categorias = readModuleArray(importerState?.previews?.categorias?.categorias);
  const escalas = readModuleArray(importerState?.previews?.escalas?.escalas);
  const formulas = readModuleArray(importerState?.previews?.formulas?.formulas || importerState?.previews?.formulas?.adicionales);
  const adicionales = readModuleArray(importerState?.previews?.formulas?.adicionales);
  const zonas = readModuleArray(importerState?.previews?.formulas?.zonas);

  return {
    metadata: {
      nombre,
      actividad: String(metadataSource.actividad || "").trim(),
      version: Number(metadataSource.version) || 1,
      descripcion: String(metadataSource.descripcion || "").trim(),
    },
    categorias,
    escalas,
    adicionales,
    formulas,
    zonas,
  };
};

export const buildConvenioFromImporter = (importerState, metadataInput = {}) => {
  const draft = buildConvenioDraft(importerState);
  const nombre = String(metadataInput.nombre || draft.metadata.nombre || "").trim();
  const slug = normalizeSlug(metadataInput.slug || nombre || "convenio");
  const actividad = String(metadataInput.actividad || draft.metadata.actividad || "").trim();
  const version = Number(metadataInput.version) || draft.metadata.version || 1;
  const descripcion = String(metadataInput.descripcion || draft.metadata.descripcion || "").trim();
  const timestamp = now();
  const config = detectConvenioConfig({
    categorias: draft.categorias,
    escalas: draft.escalas,
    formulas: draft.formulas,
  });

  return {
    metadata: {
      slug,
      nombre,
      actividad,
      descripcion,
      description: descripcion,
      createdAt: timestamp,
      updatedAt: timestamp,
      version,
      config,
    },
    categorias: draft.categorias,
    escalas: draft.escalas,
    formulas: draft.formulas,
    adicionales: draft.adicionales,
    zonas: draft.zonas,
  };
};

const writeJsonFile = async (directoryHandle, fileName, value) => {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
};

const readJsonFile = async (directoryHandle, fileName, fallback) => {
  try {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  } catch {
    return fallback;
  }
};

const buildRegistryEntries = (registry, metadata) => (
  [
    ...registry.filter((item) => normalizeText(item.slug) !== metadata.slug),
    {
      slug: metadata.slug,
      nombre: metadata.nombre,
      actividad: metadata.actividad || "",
    },
  ].sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")))
);

const getStoredConvenioRecord = (slug) => {
  const activeVersion = getActiveConvenioVersion(normalizeSlug(slug));
  if (!activeVersion?.id) {
    return null;
  }

  const record = getConvenioById(activeVersion.id);
  if (!record) {
    return null;
  }

  return {
    ...record,
    metadata: {
      ...record.metadata,
      slug: normalizeSlug(record?.metadata?.slug || slug),
    },
  };
};

const buildStoredRegistryEntries = () => listStoredConvenios()
  .filter((item) => item.isCurrent)
  .map((item) => {
    const record = getConvenioById(item.id);
    const metadata = record?.metadata || {};
    return {
      slug: normalizeSlug(metadata.slug || item.slug),
      nombre: metadata.nombre || item.nombre || item.slug,
      actividad: metadata.actividad || item.actividad || "",
      aliases: buildConvenioAliases(metadata, item),
    };
  });

export const saveConvenioModular = async (importerState) => {
  return saveConvenioModularWithMetadata(importerState, {});
};

export const resolveConvenioSlug = (registry, slug, { allowIncrement = true } = {}) => {
  const normalizedSlug = normalizeSlug(slug);
  const registryItems = Array.isArray(registry) ? registry : [];
  const exists = registryItems.some((item) => normalizeText(item.slug) === normalizedSlug);

  if (!exists) {
    return {
      slug: normalizedSlug,
      duplicated: false,
    };
  }

  if (!allowIncrement) {
    throw createFriendlyError("duplicate-slug", `El slug "${normalizedSlug}" ya existe.`, {
      slug: normalizedSlug,
    });
  }

  let suffix = 2;
  let candidate = `${normalizedSlug}-${suffix}`;
  while (registryItems.some((item) => normalizeText(item.slug) === candidate)) {
    suffix += 1;
    candidate = `${normalizedSlug}-${suffix}`;
  }

  return {
    slug: candidate,
    duplicated: true,
    originalSlug: normalizedSlug,
  };
};

export const saveConvenioModularWithMetadata = async (importerState, metadataInput = {}) => {
  const draft = buildConvenioDraft(importerState);
  if (!draft.categorias.length || !draft.escalas.length || !draft.formulas.length) {
    throw createFriendlyError("invalid-convenio-modules", "Faltan categorias, escalas o formulas para guardar el convenio.");
  }

  let currentRegistry = [];
  const resolvedSlug = resolveConvenioSlug(currentRegistry, metadataInput.slug || draft.metadata.nombre || "convenio", {
    allowIncrement: Boolean(metadataInput.allowIncrementSlug),
  });
  const convenio = buildConvenioFromImporter(importerState, {
    ...metadataInput,
    slug: resolvedSlug.slug,
  });
  const ui = {
    ...buildDefaultUi({
      metadata: convenio.metadata,
      config: convenio.metadata.config,
    }),
    ...(metadataInput.ui || {}),
  };

  if (!convenio.metadata.nombre || !convenio.metadata.slug) {
    throw createFriendlyError("invalid-convenio-metadata", "Completa nombre y slug antes de guardar.");
  }

  let nextRegistry = buildRegistryEntries(currentRegistry, convenio.metadata);

  if (typeof window.showDirectoryPicker === "function") {
    try {
      const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const conveniosHandle = await rootHandle.getDirectoryHandle("convenios", { create: true });
      currentRegistry = await readJsonFile(conveniosHandle, "registry.json", []);
      nextRegistry = buildRegistryEntries(currentRegistry, convenio.metadata);
      const convenioHandle = await conveniosHandle.getDirectoryHandle(convenio.metadata.slug, { create: true });
      await writeJsonFile(convenioHandle, "metadata.json", convenio.metadata);
      await writeJsonFile(convenioHandle, "categorias.json", convenio.categorias);
      await writeJsonFile(convenioHandle, "escalas.json", convenio.escalas);
      await writeJsonFile(convenioHandle, "formulas.json", convenio.formulas);
      await writeJsonFile(convenioHandle, "ui.json", ui);
      await writeJsonFile(conveniosHandle, "registry.json", nextRegistry);
    } catch (error) {
      console.warn("[convenio-modular] guardado en carpeta omitido", error);
    }
  }

  saveConvenioJsonImport({
    convenio: {
      ...convenio,
      adicionales: convenio.adicionales?.length ? convenio.adicionales : deriveAdicionales(convenio.formulas),
      zonas: convenio.zonas?.length ? convenio.zonas : deriveZonas(convenio.escalas),
      ui,
    },
    sourceFiles: ["metadata.json", "categorias.json", "escalas.json", "formulas.json"],
  });
  console.log("CONVENIO GUARDADO", convenio);

  return {
    convenio,
    registry: nextRegistry,
    duplicatedSlug: resolvedSlug.duplicated,
    originalSlug: resolvedSlug.originalSlug || null,
    ui,
  };
};

export const readConveniosRegistry = async () => {
  try {
    const response = await fetch(`${REGISTRY_PATH}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("registry-not-found");
    }

    const registry = await response.json();
    return Array.isArray(registry) ? registry : [];
  } catch (error) {
    const storedRegistry = buildStoredRegistryEntries();
    if (storedRegistry.length) {
      return storedRegistry;
    }
    throw error;
  }
};

const readConvenioMetadataBySlug = async (slug) => {
  const response = await fetch(`/convenios/${encodeURIComponent(slug)}/metadata.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw createFriendlyError("metadata-not-found", `No se pudo validar metadata.json para "${slug}".`, {
      slug,
      status: response.status,
    });
  }

  return response.json();
};

export const getValidatedConveniosRegistry = async () => {
  const registry = await readConveniosRegistry();
  const validated = await Promise.all(registry.map(async (entry) => {
    let metadata = null;
    try {
      metadata = await readConvenioMetadataBySlug(entry.slug);
    } catch (error) {
      metadata = getStoredConvenioRecord(entry.slug)?.metadata || entry;
    }
    const canonicalSlug = normalizeSlug(metadata?.slug || entry.slug);
    const validatedEntry = {
      slug: canonicalSlug,
      nombre: metadata?.nombre || entry.nombre || canonicalSlug,
      actividad: metadata?.actividad || entry.actividad || "",
      aliases: buildConvenioAliases(metadata, entry),
    };

    console.info("[convenio-modular] registry:validated", validatedEntry);
    return validatedEntry;
  }));

  const merged = [...validated];
  buildStoredRegistryEntries().forEach((entry) => {
    const index = merged.findIndex((item) => item.slug === entry.slug);
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...entry,
        aliases: [...new Set([...(merged[index].aliases || []), ...(entry.aliases || [])])],
      };
      return;
    }
    merged.push(entry);
  });

  const deduped = [];
  const seen = new Set();
  merged.forEach((entry) => {
    if (seen.has(entry.slug)) {
      return;
    }
    seen.add(entry.slug);
    deduped.push(entry);
  });

  return deduped;
};

export const resolveConvenioReference = async (slug) => {
  const requestedSlug = normalizeSlug(slug || "");
  const registry = await getValidatedConveniosRegistry();
  const exact = registry.find((item) => item.slug === requestedSlug);

  if (exact) {
    return {
      registry,
      requestedSlug,
      resolvedSlug: exact.slug,
      redirectSlug: null,
      entry: exact,
    };
  }

  const legacyMatch = registry.find((item) => (item.aliases || []).includes(requestedSlug));
  if (legacyMatch) {
    console.warn("[convenio-modular] slug legacy redirigido", {
      requestedSlug,
      resolvedSlug: legacyMatch.slug,
    });
    return {
      registry,
      requestedSlug,
      resolvedSlug: legacyMatch.slug,
      redirectSlug: legacyMatch.slug,
      entry: legacyMatch,
    };
  }

  console.error("[convenio-modular] slug invalido", {
    requestedSlug,
    availableSlugs: registry.map((item) => item.slug),
  });
  throw createFriendlyError("convenio-not-found", `No existe un convenio válido para "${requestedSlug}".`, {
    requestedSlug,
    availableSlugs: registry.map((item) => item.slug),
    registry,
  });
};

export const loadConvenio = async (slug) => {
  const requestedSlug = normalizeSlug(slug || "");
  console.info("[convenio-modular] loadConvenio:start", {
    requestedSlug,
    originalSlug: slug,
  });
  const resolved = await resolveConvenioReference(requestedSlug);
  const registry = resolved.registry;
  const selected = resolved.entry;
  const storedConvenio = getStoredConvenioRecord(resolved.resolvedSlug);

  if (storedConvenio) {
    const categorias = readModuleArray(storedConvenio.categorias);
    const escalas = readModuleArray(storedConvenio.escalas);
    const formulas = readModuleArray(storedConvenio.formulas);
    const metadata = storedConvenio.metadata || {};
    const config = metadata.config || detectConvenioConfig({ categorias, escalas, formulas });
    const convenio = {
      metadata: {
        ...metadata,
        slug: metadata.slug || selected.slug,
        nombre: metadata.nombre || selected.nombre,
        actividad: metadata.actividad || selected.actividad || "",
        config,
      },
      categorias,
      escalas,
      formulas,
      adicionales: Array.isArray(storedConvenio.adicionales)
        ? storedConvenio.adicionales
        : deriveAdicionales(formulas),
      zonas: Array.isArray(storedConvenio.zonas)
        ? storedConvenio.zonas
        : deriveZonas(escalas),
      ui: {
        ...buildDefaultUi({
          metadata: {
            ...metadata,
            nombre: metadata.nombre || selected.nombre,
          },
          config,
        }),
        ...(storedConvenio.ui || {}),
      },
      registry,
      redirectSlug: resolved.redirectSlug,
    };
    console.log("CONVENIO CARGADO", convenio);
    return convenio;
  }

  const basePath = `/convenios/${encodeURIComponent(resolved.resolvedSlug)}`;
  const readRemoteJson = async (fileName) => {
    const response = await fetch(`${basePath}/${fileName}?t=${Date.now()}`, { cache: "no-store" });
    if (fileName === "ui.json" && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      console.error("[convenio-modular] loadConvenio:file-error", {
        requestedSlug: resolved.resolvedSlug,
        fileName,
        status: response.status,
      });
      throw createFriendlyError("convenio-file-not-found", `No se pudo cargar ${fileName} para "${resolved.resolvedSlug}".`, {
        requestedSlug: resolved.resolvedSlug,
        fileName,
        status: response.status,
      });
    }
    return response.json();
  };

  const [metadata, categorias, escalas, formulas, ui] = await Promise.all([
    readRemoteJson("metadata.json"),
    readRemoteJson("categorias.json"),
    readRemoteJson("escalas.json"),
    readRemoteJson("formulas.json"),
    readRemoteJson("ui.json"),
  ]);

  console.info("[convenio-modular] loadConvenio:success", {
    requestedSlug,
    resolvedSlug: resolved.resolvedSlug,
    nombre: metadata?.nombre || selected.nombre,
    categorias: readModuleArray(categorias).length,
    escalas: readModuleArray(escalas).length,
    formulas: readModuleArray(formulas).length,
  });

  const convenio = {
    metadata: {
      ...metadata,
      slug: metadata.slug || selected.slug,
      nombre: metadata.nombre || selected.nombre,
      actividad: metadata.actividad || selected.actividad || "",
      config: metadata.config || detectConvenioConfig({ categorias, escalas, formulas }),
    },
    categorias: readModuleArray(categorias),
    escalas: readModuleArray(escalas),
    formulas: readModuleArray(formulas),
    adicionales: deriveAdicionales(formulas),
    zonas: deriveZonas(escalas),
    ui: {
      ...buildDefaultUi({
        metadata: {
          ...metadata,
          nombre: metadata.nombre || selected.nombre,
        },
        config: metadata.config || detectConvenioConfig({ categorias, escalas, formulas }),
      }),
      ...(ui || {}),
    },
    registry,
    redirectSlug: resolved.redirectSlug,
  };
  console.log("CONVENIO CARGADO", convenio);
  return convenio;
};
