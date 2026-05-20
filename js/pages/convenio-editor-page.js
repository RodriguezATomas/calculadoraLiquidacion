import { actions } from "../app-state.js";
import {
  autosaveConvenioEditor,
  loadConvenioEditor,
  publishConvenioEditor,
  validateConvenioEditor,
} from "../services/convenio-editor.js";
import { icon } from "../ui/icons.js";

const SECTION_CONFIG = [
  { key: "categorias", title: "Categorias" },
  { key: "escalas", title: "Escalas" },
  { key: "adicionales", title: "Adicionales" },
  { key: "formulas", title: "Formulas" },
  { key: "zonas", title: "Zonas" },
];

const readConvenioId = () => new URLSearchParams(window.location.search).get("id") || "";

const createEmptyItem = () => ({
  id: `item-${Date.now()}`,
  nombre: "",
  monto: "",
  porcentaje: "",
  regla: "",
  zona: "",
  estado: "activo",
  text: "",
});

const renderSection = (section, searchValue) => {
  const normalized = (searchValue || "").trim().toLowerCase();
  const items = section.items.filter((item) => (
    !normalized || `${item.nombre} ${item.text} ${item.regla} ${item.zona}`.toLowerCase().includes(normalized)
  ));

  return `
    <section class="table-panel editor-section">
      <div class="panel-header">
        <div>
          <span class="panel-eyebrow">${section.title}</span>
          <h3 class="panel-title">${items.length} registro(s)</h3>
        </div>
        <button type="button" class="outline-button" data-editor-add="${section.key}">${icon("plus")} Agregar</button>
      </div>
      <div class="table-wrap">
        <table class="data-table editor-table">
          <thead>
            <tr>
              <th>${section.title.slice(0, -1) || "Item"}</th>
              <th>Basico</th>
              <th>Porcentaje</th>
              <th>Zona</th>
              <th>Estado</th>
              <th>Regla</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr data-editor-row="${section.key}" data-editor-id="${item.id}">
                <td><input class="editor-input" data-field="nombre" value="${item.nombre || ""}"></td>
                <td><input class="editor-input" data-field="monto" value="${item.monto || ""}"></td>
                <td><input class="editor-input" data-field="porcentaje" value="${item.porcentaje || ""}"></td>
                <td><input class="editor-input" data-field="zona" value="${item.zona || ""}"></td>
                <td>
                  <select class="editor-input" data-field="estado">
                    <option value="activo" ${item.estado === "activo" ? "selected" : ""}>Activo</option>
                    <option value="revision" ${item.estado === "revision" ? "selected" : ""}>Revision</option>
                  </select>
                </td>
                <td><input class="editor-input" data-field="regla" value="${item.regla || item.text || ""}"></td>
                <td>
                  <div class="table-actions">
                    <button type="button" class="table-action" data-editor-duplicate="${section.key}" data-editor-id="${item.id}" aria-label="Duplicar">${icon("plus")}</button>
                    <button type="button" class="table-action" data-editor-delete="${section.key}" data-editor-id="${item.id}" aria-label="Eliminar">${icon("trash")}</button>
                  </div>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="7" class="editor-empty">Sin registros para mostrar.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
};

export const convenioEditorPage = {
  title: "Editor de Convenio",
  description: "Administra convenios importados sin editar JSON manualmente.",
  hidePageHeader: true,
  render() {
    return `
      <div class="convenios-layout">
        <section class="convenios-heading">
          <div>
            <h2>Editor de Convenio</h2>
            <p>Administra categorias, escalas, adicionales, formulas y zonas con un editor visual estable.</p>
          </div>
          <div class="convenios-actions">
            <button type="button" class="outline-button" id="backToConveniosButton">${icon("open")} Volver</button>
            <button type="button" class="button" id="publishConvenioButton">${icon("shield")} Publicar convenio</button>
          </div>
        </section>

        <section class="table-panel editor-toolbar">
          <div class="filters-row">
            <label class="field table-search">
              <input id="editorSearch" type="search" placeholder="Buscar registros...">
            </label>
            <label class="field">
              <select id="editorSectionFilter">
                <option value="">Todas las secciones</option>
                ${SECTION_CONFIG.map((section) => `<option value="${section.key}">${section.title}</option>`).join("")}
              </select>
            </label>
            <label class="import-review-check">
              <input type="checkbox" id="editorAutosaveToggle">
              <span>Autosave opcional</span>
            </label>
          </div>
        </section>

        <section class="table-panel editor-summary" id="editorSummary"></section>
        <section id="editorValidation"></section>
        <section id="editorSections"></section>
      </div>
    `;
  },
  init({ registerSearch }) {
    const convenioId = readConvenioId();
    const editorState = loadConvenioEditor(convenioId);
    const searchInput = document.getElementById("editorSearch");
    const sectionFilter = document.getElementById("editorSectionFilter");
    const autosaveToggle = document.getElementById("editorAutosaveToggle");
    const summaryRoot = document.getElementById("editorSummary");
    const validationRoot = document.getElementById("editorValidation");
    const sectionsRoot = document.getElementById("editorSections");

    if (!editorState) {
      summaryRoot.innerHTML = `<div class="import-preview__empty"><strong>Convenio no encontrado</strong><p>No se pudo cargar el convenio solicitado.</p></div>`;
      return;
    }

    const state = editorState;

    const maybeAutosave = () => {
      if (state.autosave) {
        autosaveConvenioEditor(convenioId, state);
      }
    };

    const render = () => {
      const errors = validateConvenioEditor(state);
      const selectedSection = sectionFilter.value;
      const visibleSections = SECTION_CONFIG.filter((section) => !selectedSection || section.key === selectedSection)
        .map((section) => ({
          ...section,
          items: state[section.key],
        }));

      autosaveToggle.checked = Boolean(state.autosave);
      summaryRoot.innerHTML = `
        <div class="import-review-summary">
          <article class="import-review-stat"><span class="import-review-stat__label">Nombre</span><strong>${state.metadata.nombre}</strong></article>
          <article class="import-review-stat"><span class="import-review-stat__label">Slug</span><strong>${state.metadata.slug}</strong></article>
          <article class="import-review-stat"><span class="import-review-stat__label">Version</span><strong>${state.metadata.version}</strong></article>
          <article class="import-review-stat"><span class="import-review-stat__label">Estado</span><strong>${state.metadata.estado}</strong></article>
        </div>
        <div class="filters-row" style="margin-top:16px;">
          <label class="field"><span>Nombre</span><input id="editorMetaNombre" type="text" value="${state.metadata.nombre || ""}"></label>
          <label class="field"><span>Slug</span><input id="editorMetaSlug" type="text" value="${state.metadata.slug || ""}"></label>
        </div>
      `;

      validationRoot.innerHTML = errors.length
        ? `<div class="callout warn">${errors.join(" | ")}</div>`
        : `<div class="callout ok">Validaciones correctas. El convenio esta listo para publicar.</div>`;

      sectionsRoot.innerHTML = visibleSections.map((section) => renderSection(section, searchInput.value)).join("");
    };

    const updateItem = (sectionKey, itemId, field, value) => {
      state[sectionKey] = state[sectionKey].map((item) => (
        item.id === itemId ? { ...item, [field]: value, text: field === "regla" ? value : item.text } : item
      ));
      maybeAutosave();
      render();
    };

    document.getElementById("publishConvenioButton")?.addEventListener("click", () => {
      try {
        publishConvenioEditor(convenioId, state);
        actions.addNotification("Convenio publicado", `${state.metadata.nombre} se actualizo correctamente.`);
      } catch (error) {
        actions.addNotification("Error de validacion", error.message || "No se pudo publicar el convenio.");
      }
    });

    document.getElementById("backToConveniosButton")?.addEventListener("click", () => {
      window.location.href = "convenios.html";
    });

    autosaveToggle?.addEventListener("change", () => {
      state.autosave = autosaveToggle.checked;
      maybeAutosave();
    });

    searchInput?.addEventListener("input", render);
    sectionFilter?.addEventListener("change", render);

    summaryRoot.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.id === "editorMetaNombre") {
        state.metadata.nombre = target.value;
      }

      if (target.id === "editorMetaSlug") {
        state.metadata.slug = target.value;
      }

      maybeAutosave();
      render();
    });

    sectionsRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const addKey = target.getAttribute("data-editor-add");
      if (addKey) {
        state[addKey] = [...state[addKey], createEmptyItem()];
        maybeAutosave();
        render();
        return;
      }

      const deleteKey = target.getAttribute("data-editor-delete");
      const deleteId = target.getAttribute("data-editor-id");
      if (deleteKey && deleteId) {
        state[deleteKey] = state[deleteKey].filter((item) => item.id !== deleteId);
        maybeAutosave();
        render();
        return;
      }

      const duplicateKey = target.getAttribute("data-editor-duplicate");
      const duplicateId = target.getAttribute("data-editor-id");
      if (duplicateKey && duplicateId) {
        const item = state[duplicateKey].find((entry) => entry.id === duplicateId);
        if (item) {
          state[duplicateKey] = [...state[duplicateKey], { ...item, id: `dup-${Date.now()}`, nombre: `${item.nombre} copia` }];
          maybeAutosave();
          render();
        }
      }
    });

    sectionsRoot.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return;
      }

      const row = target.closest("[data-editor-row]");
      if (!row) {
        return;
      }

      updateItem(row.getAttribute("data-editor-row"), row.getAttribute("data-editor-id"), target.getAttribute("data-field"), target.value);
    });

    document.title = `${state.metadata.nombre} | Editor de Convenio`;

    registerSearch((value) => {
      searchInput.value = value;
      render();
    });

    render();
  },
};
