import { CONVENIO_REGISTRY } from "../../convenios/registry.js";
import { actions, selectors } from "../app-state.js";
import { icon } from "../ui/icons.js";

const formatDate = (value) => {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

const renderRow = (item) => `
  <tr data-convenio-row data-name="${`${item.label} ${item.activity}`.toLowerCase()}" data-status="${item.status}" data-activity="${item.activity}">
    <td>
      <strong class="table-row__name">${item.label}</strong>
    </td>
    <td><span class="table-row__activity">${item.activity}</span></td>
    <td><span class="table-status ${item.status === "review" ? "table-status--review" : "table-status--active"}">${item.status === "review" ? "En revisión" : "Activo"}</span></td>
    <td>${formatDate(item.updatedAt)}</td>
    <td>
      <div class="table-actions">
        <button type="button" class="table-action" data-action="open" data-source="${item.source}" data-title="${item.label}" aria-label="Abrir">${icon("open")}</button>
        <button type="button" class="table-action" data-action="view" data-source="${item.source}" data-title="${item.label}" aria-label="Visualizar">${icon("eye")}</button>
        <button type="button" class="table-action" data-action="edit" data-source="${item.source}" data-title="${item.label}" aria-label="Editar">${icon("pencil")}</button>
      </div>
    </td>
  </tr>
`;

export const conveniosPage = {
  title: "Convenios",
  description: "Gestioná y explorá todos los convenios disponibles en el sistema.",
  hidePageHeader: true,
  render() {
    return `
      <div class="convenios-layout">
        <section class="convenios-heading">
          <div>
            <h2>Convenios</h2>
            <p>Gestioná y explorá todos los convenios disponibles en el sistema.</p>
          </div>
          <div class="convenios-actions"><button type="button" class="button" id="addConvenioButton">${icon("plus")} Agregar convenio</button></div>
        </section>

        <section class="stats-row">
          <article class="stats-card">
            <div class="stats-card__icon icon-blue">${icon("folder")}</div>
            <div><strong class="stats-card__value">${CONVENIO_REGISTRY.length}</strong><span class="stats-card__label">Total convenios</span></div>
          </article>
          <article class="stats-card">
            <div class="stats-card__icon icon-green">${icon("shield")}</div>
            <div><strong class="stats-card__value">${selectors.activeConventions()}</strong><span class="stats-card__label">Convenios activos</span></div>
          </article>
          <article class="stats-card">
            <div class="stats-card__icon icon-violet">${icon("sparkles")}</div>
            <div><strong class="stats-card__value">${selectors.conventionsUpdatedThisMonth()}</strong><span class="stats-card__label">Actualizados este mes</span></div>
          </article>
          <article class="stats-card">
            <div class="stats-card__icon icon-orange">${icon("eye")}</div>
            <div><strong class="stats-card__value">${selectors.conventionsInReview()}</strong><span class="stats-card__label">En revisión</span></div>
          </article>
        </section>

        <section class="table-panel">
          <div class="table-toolbar">
            <div class="filters-row">
              <label class="field table-search">
                <input id="conveniosSearch" type="search" placeholder="Buscar convenio...">
              </label>
              <label class="field">
                <select id="statusFilter">
                  <option value="">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="review">En revisión</option>
                </select>
              </label>
              <label class="field">
                <select id="activityFilter">
                  <option value="">Todas las actividades</option>
                  ${[...new Set(CONVENIO_REGISTRY.map((item) => item.activity))].map((activity) => `<option value="${activity}">${activity}</option>`).join("")}
                </select>
              </label>
              <button type="button" class="outline-button" id="resetConvenioFilters">${icon("panel")} Filtros</button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Convenio</th>
                  <th>Actividad</th>
                  <th>Estado</th>
                  <th>Última actualización</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="conveniosTableBody">
                ${CONVENIO_REGISTRY.map(renderRow).join("")}
              </tbody>
            </table>
          </div>

          <div class="table-footer">
            <span class="table-meta" id="conveniosCountLabel">Mostrando 1 a ${CONVENIO_REGISTRY.length} de ${CONVENIO_REGISTRY.length} convenios</span>
            <div class="pagination">
              <button type="button" class="is-active">1</button>
              <button type="button">2</button>
              <button type="button">›</button>
            </div>
          </div>
        </section>
      </div>
    `;
  },
  init({ registerSearch }) {
    const searchInput = document.getElementById("conveniosSearch");
    const statusFilter = document.getElementById("statusFilter");
    const activityFilter = document.getElementById("activityFilter");
    const rows = [...document.querySelectorAll("[data-convenio-row]")];
    const countLabel = document.getElementById("conveniosCountLabel");

    const applyFilters = () => {
      const normalized = (searchInput.value || "").trim().toLowerCase();
      const selectedStatus = statusFilter.value;
      const selectedActivity = activityFilter.value;
      let visibleCount = 0;

      rows.forEach((row) => {
        const matchesSearch = row.dataset.name.includes(normalized);
        const matchesStatus = !selectedStatus || row.dataset.status === selectedStatus;
        const matchesActivity = !selectedActivity || row.dataset.activity === selectedActivity;
        const show = matchesSearch && matchesStatus && matchesActivity;
        row.style.display = show ? "" : "none";
        if (show) {
          visibleCount += 1;
        }
      });

      countLabel.textContent = `Mostrando 1 a ${visibleCount} de ${CONVENIO_REGISTRY.length} convenios`;
    };

    [searchInput, statusFilter, activityFilter].forEach((element) => {
      element.addEventListener("input", applyFilters);
      element.addEventListener("change", applyFilters);
    });

    document.getElementById("resetConvenioFilters")?.addEventListener("click", () => {
      searchInput.value = "";
      statusFilter.value = "";
      activityFilter.value = "";
      applyFilters();
    });

    document.getElementById("addConvenioButton")?.addEventListener("click", () => {
      actions.addNotification("Acción requerida", "La carga de nuevos convenios está lista para conectarse a tu flujo administrativo.");
    });

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.getAttribute("data-source");
        const title = button.getAttribute("data-title");
        const action = button.getAttribute("data-action");
        actions.addHistoryEntry({
          type: "convention",
          title,
          detail: `Acción ${action} ejecutada sobre ${title}.`,
        });
        actions.addNotification("Acción sobre convenio", `${title}: ${action}.`);

        if (action === "view") {
          window.open(source, "_blank", "noopener");
          return;
        }

        window.location.href = source;
      });
    });

    registerSearch((value) => {
      searchInput.value = value;
      applyFilters();
    });
  },
};
