import { listConvenioModules } from "../core/convenio-loader.js";

export const CONVENIO_REGISTRY = listConvenioModules().map((convenio) => ({
  id: convenio.metadata.id,
  label: convenio.metadata.nombre,
  cct: convenio.metadata.cct,
  activity: convenio.metadata.activity,
  icon: convenio.metadata.icon,
  iconTone: convenio.metadata.iconTone,
  source: convenio.metadata.source,
  description: convenio.metadata.description,
  status: convenio.metadata.status,
  updatedAt: convenio.metadata.updatedAt,
}));

window.CONVENIO_REGISTRY = CONVENIO_REGISTRY;
