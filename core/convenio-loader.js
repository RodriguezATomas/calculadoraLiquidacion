import { assertConvenioData } from "./convenio-validator.js";
import { CONVENIOS_INDEX } from "../storage/convenios-index.js";
import {
  getActiveConvenioVersion,
  getConvenioById,
  listStoredConvenios,
} from "../js/services/convenio-storage.js";
import afaCategorias from "../convenios/afa/categorias.json" with { type: "json" };
import afaEscalas from "../convenios/afa/escalas.json" with { type: "json" };
import afaFormulas from "../convenios/afa/formulas.json" with { type: "json" };
import afaMetadata from "../convenios/afa/metadata.json" with { type: "json" };
import callcenterCategorias from "../convenios/callcenter/categorias.json" with { type: "json" };
import callcenterEscalas from "../convenios/callcenter/escalas.json" with { type: "json" };
import callcenterFormulas from "../convenios/callcenter/formulas.json" with { type: "json" };
import callcenterMetadata from "../convenios/callcenter/metadata.json" with { type: "json" };
import clinicasCategorias from "../convenios/clinicas/categorias.json" with { type: "json" };
import clinicasEscalas from "../convenios/clinicas/escalas.json" with { type: "json" };
import clinicasFormulas from "../convenios/clinicas/formulas.json" with { type: "json" };
import clinicasMetadata from "../convenios/clinicas/metadata.json" with { type: "json" };
import gimnasiosCategorias from "../convenios/gimnasios/categorias.json" with { type: "json" };
import gimnasiosEscalas from "../convenios/gimnasios/escalas.json" with { type: "json" };
import gimnasiosFormulas from "../convenios/gimnasios/formulas.json" with { type: "json" };
import gimnasiosMetadata from "../convenios/gimnasios/metadata.json" with { type: "json" };
import uocraCategorias from "../convenios/uocra/categorias.json" with { type: "json" };
import uocraEscalas from "../convenios/uocra/escalas.json" with { type: "json" };
import uocraFormulas from "../convenios/uocra/formulas.json" with { type: "json" };
import uocraMetadata from "../convenios/uocra/metadata.json" with { type: "json" };

const CONVENIO_MODULES = {
  afa: {
    metadata: afaMetadata,
    categorias: afaCategorias,
    escalas: afaEscalas,
    formulas: afaFormulas,
  },
  callcenter: {
    metadata: callcenterMetadata,
    categorias: callcenterCategorias,
    escalas: callcenterEscalas,
    formulas: callcenterFormulas,
  },
  clinicas: {
    metadata: clinicasMetadata,
    categorias: clinicasCategorias,
    escalas: clinicasEscalas,
    formulas: clinicasFormulas,
  },
  gimnasios: {
    metadata: gimnasiosMetadata,
    categorias: gimnasiosCategorias,
    escalas: gimnasiosEscalas,
    formulas: gimnasiosFormulas,
  },
  uocra: {
    metadata: uocraMetadata,
    categorias: uocraCategorias,
    escalas: uocraEscalas,
    formulas: uocraFormulas,
  },
};

const STATIC_CONVENIO_IDS = new Set(Object.keys(CONVENIO_MODULES));

const buildConvenio = (id) => {
  const module = CONVENIO_MODULES[id];
  if (!module) {
    console.error(`[convenio-loader] convenio no encontrado: ${id}`);
    throw new Error(`convenio-not-found:${id}`);
  }

  return assertConvenioData(id, {
    metadata: module.metadata,
    categorias: module.categorias,
    escalas: module.escalas,
    formulas: module.formulas,
  });
};

const buildStoredConvenio = (idOrSlug) => {
  const directRecord = getConvenioById(idOrSlug);
  const activeVersion = directRecord ? null : getActiveConvenioVersion(idOrSlug);
  const record = directRecord || (activeVersion ? getConvenioById(activeVersion.id) : null);

  if (!record) {
    return null;
  }

  return assertConvenioData(record.metadata?.id || idOrSlug, {
    metadata: record.metadata,
    categorias: record.categorias,
    escalas: record.escalas,
    formulas: record.formulas,
    adicionales: record.adicionales || [],
    zonas: record.zonas || [],
  });
};

export const listConvenioModules = () => {
  const staticModules = CONVENIOS_INDEX.convenios
    .filter((item) => STATIC_CONVENIO_IDS.has(item.id))
    .map((item) => buildConvenio(item.id));

  const storedModules = listStoredConvenios()
    .filter((item) => item.isCurrent)
    .map((item) => {
      try {
        return buildStoredConvenio(item.id);
      } catch (error) {
        console.warn(`[convenio-loader] convenio almacenado omitido: ${item.id}`, error);
        return null;
      }
    })
    .filter(Boolean);

  return [...staticModules, ...storedModules];
};

export const loadConvenio = (id) => {
  const convenio = CONVENIO_MODULES[id] ? buildConvenio(id) : buildStoredConvenio(id);

  if (!convenio) {
    console.error(`[convenio-loader] convenio no encontrado: ${id}`);
    throw new Error(`convenio-not-found:${id}`);
  }

  console.info(`[convenio-loader] convenio cargado: ${id}`);
  return convenio;
};

export const loadCategorias = (id) => loadConvenio(id).categorias;

export const loadEscalas = (id) => loadConvenio(id).escalas;

export const loadFormulas = (id) => loadConvenio(id).formulas;
