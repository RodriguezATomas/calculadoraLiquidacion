import { readJSON, writeJSON } from "../storage.js";

const STORAGE_KEY = "convenio_importer_state_v3";

const defaultSlotState = {
  fileName: "",
  document: null,
  review: null,
  validation: null,
  jsonFiles: null,
  logs: [],
  progress: null,
  isLoading: false,
};

const defaultState = {
  activeSlot: "categorias",
  activePreviewTab: "categorias",
  slots: {
    categorias: { ...defaultSlotState },
    escalas: { ...defaultSlotState },
    formulas: { ...defaultSlotState },
  },
  previews: {
    categorias: null,
    escalas: null,
    formulas: null,
  },
  moduleSections: {
    categorias: {
      key: "categorias",
      title: "Categorias",
      enabled: true,
      collapsed: false,
      items: [],
    },
    escalas: {
      key: "escalas",
      title: "Escalas",
      enabled: true,
      collapsed: false,
      items: [],
    },
    adicionales: {
      key: "adicionales",
      title: "Adicionales",
      enabled: true,
      collapsed: false,
      items: [],
    },
  },
};

export const readConvenioImportState = () => readJSON(STORAGE_KEY, defaultState);

export const writeConvenioImportState = (value) => {
  writeJSON(STORAGE_KEY, {
    ...defaultState,
    ...value,
    slots: {
      categorias: { ...defaultSlotState, ...(value?.slots?.categorias || {}) },
      escalas: { ...defaultSlotState, ...(value?.slots?.escalas || {}) },
      formulas: { ...defaultSlotState, ...(value?.slots?.formulas || {}) },
    },
    previews: {
      categorias: value?.previews?.categorias || null,
      escalas: value?.previews?.escalas || null,
      formulas: value?.previews?.formulas || null,
    },
    moduleSections: {
      categorias: { ...defaultState.moduleSections.categorias, ...(value?.moduleSections?.categorias || {}) },
      escalas: { ...defaultState.moduleSections.escalas, ...(value?.moduleSections?.escalas || {}) },
      adicionales: { ...defaultState.moduleSections.adicionales, ...(value?.moduleSections?.adicionales || {}) },
    },
  });
};
