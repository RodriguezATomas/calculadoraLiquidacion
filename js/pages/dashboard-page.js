import { actions, getState, selectors, subscribe } from "../app-state.js";
import { navigateTo } from "../router.js";
import { getAllConvenios } from "../services/convenio-storage.js";
import { icon } from "../ui/icons.js";

const renderConvenioCard = (item) => `
  <article class="convenio-tile" data-convenio-card data-name="${`${item.label} ${item.activity}`.toLowerCase()}" data-convenio-id="${item.id}">
    <div class="convenio-tile__icon icon-${item.iconTone}">${icon(item.icon)}</div>
    <div class="convenio-tile__meta">
      <div>
        <h4>${item.label}</h4>
        <p>${item.activity}</p>
      </div>
      <span class="status-pill ${item.status === "review" ? "status-pill--review" : "status-pill--active"}">${item.status === "review" ? "En revisión" : "Activo"}</span>
    </div>
  </article>
`;

export const dashboardPage = {
  title: "¡Hola, Tomás! 👋",
  description: "Gestioná tus convenios, hacé cálculos y obtené respuestas al instante.",
  hidePageHeader: true,
  render() {
    const convenios = getAllConvenios().filter((item) => item.isValid);

    return `
      <div class="dashboard-layout">
        <div class="dashboard-grid">
          <div class="dashboard-main">
            <section class="hero-banner">
              <div>
                <span class="panel-eyebrow">Panel principal</span>
                <h2>¡Hola, Tomás! 👋</h2>
                <p>Gestioná tus convenios, hacé cálculos y obtené respuestas al instante.</p>
              </div>
              <div class="hero-banner__badge">${convenios.length} convenios activos</div>
            </section>

            <section class="panel dashboard-convenios">
              <div class="panel-header">
                <div>
                  <span class="panel-eyebrow">Elegir convenio</span>
                  <h3 class="panel-title">Elegí el convenio con el que querés trabajar</h3>
                </div>
                <a class="panel-link" href="convenios.html">Ver todos</a>
              </div>
              <div class="convenios-grid" id="dashboardConveniosGrid">
                ${convenios.map(renderConvenioCard).join("")}
              </div>
            </section>

            <section class="quick-grid dashboard-quick-grid">
              <article class="quick-card" data-dashboard-link="ia-center.html">
                <div class="quick-card__icon icon-violet">${icon("sparkles")}</div>
                <div class="quick-card__meta">
                  <div>
                    <h4>Centro IA</h4>
                    <p>Consultas inteligentes y análisis avanzado</p>
                  </div>
                </div>
              </article>
              <article class="quick-card" data-dashboard-link="convenios.html">
                <div class="quick-card__icon icon-blue">${icon("folder")}</div>
                <div class="quick-card__meta">
                  <div>
                    <h4>Convenios</h4>
                    <p>Explorá y gestioná todos tus convenios</p>
                  </div>
                </div>
              </article>
              <article class="quick-card" data-dashboard-link="configuracion.html">
                <div class="quick-card__icon icon-green">${icon("settings")}</div>
                <div class="quick-card__meta">
                  <div>
                    <h4>Configuración</h4>
                    <p>Personalizá el sistema a tus necesidades</p>
                  </div>
                </div>
              </article>
            </section>

            <section class="stats-row">
              <article class="stats-card">
                <div class="stats-card__icon icon-blue">${icon("briefcase")}</div>
                <div>
                  <strong class="stats-card__value" data-stat="calculations">0</strong>
                  <span class="stats-card__label">Cálculos realizados</span>
                  <small class="stats-card__meta">Este mes</small>
                </div>
              </article>
              <article class="stats-card">
                <div class="stats-card__icon icon-green">${icon("folder")}</div>
                <div>
                  <strong class="stats-card__value" data-stat="activeConventions">${selectors.activeConventions()}</strong>
                  <span class="stats-card__label">Convenios activos</span>
                  <small class="stats-card__meta">Disponibles</small>
                </div>
              </article>
              <article class="stats-card">
                <div class="stats-card__icon icon-violet">${icon("chat")}</div>
                <div>
                  <strong class="stats-card__value" data-stat="chatQueries">0</strong>
                  <span class="stats-card__label">Consultas al chatbot</span>
                  <small class="stats-card__meta">Hoy</small>
                </div>
              </article>
              <article class="stats-card">
                <div class="stats-card__icon icon-orange">${icon("sparkles")}</div>
                <div>
                  <strong class="stats-card__value" data-stat="reports">0</strong>
                  <span class="stats-card__label">Reportes generados</span>
                  <small class="stats-card__meta">Esta semana</small>
                </div>
              </article>
            </section>
          </div>

          <aside class="dashboard-aside">
            <section class="assistant-banner">
              <div>
                <h3>Asistente de convenios</h3>
                <span>En línea</span>
              </div>
              <div class="assistant-banner__visual"><div class="assistant-orb assistant-orb--banner"><span></span><span></span><span></span></div></div>
            </section>

            <section class="assistant-panel">
              <div class="assistant-panel__welcome">
                <h4>¡Hola! Soy tu asistente virtual 🤖</h4>
                <p>Estoy acá para ayudarte con información sobre convenios, categorías, cálculos y mucho más.</p>
                <strong>¿En qué puedo ayudarte hoy?</strong>
              </div>
              <button type="button" class="assistant-question" data-dashboard-link="ia-center.html">¿Cómo se calcula el adicional por zona?</button>
              <button type="button" class="assistant-question" data-dashboard-link="ia-center.html">¿Qué incluye el presentismo?</button>
              <button type="button" class="assistant-question" data-dashboard-link="ia-center.html">¿Cuál es la diferencia entre bruto y neto?</button>
              <button type="button" class="assistant-question" data-dashboard-link="ia-center.html">¿Cómo se aplica el descuento sindical?</button>
              <div class="assistant-input">
                <input type="text" placeholder="Escribí tu consulta..." readonly>
                <button type="button" class="assistant-send" data-dashboard-link="ia-center.html">${icon("send")}</button>
              </div>
              <p class="assistant-disclaimer">El asistente puede cometer errores.</p>
            </section>
          </aside>
        </div>
      </div>
    `;
  },
  init({ registerSearch }) {
    const convenios = getAllConvenios().filter((item) => item.isValid);
    const convenioCards = [...document.querySelectorAll("[data-convenio-card]")];

    const openConvenio = (convenioId) => {
      const convenio = convenios.find((item) => item.id === convenioId && item.slug);
      if (!convenio) {
        console.warn("[dashboard] convenio invalido omitido", { convenioId });
        return;
      }

      actions.addHistoryEntry({
        type: "convention",
        title: convenio.label,
        detail: `Se abrió ${convenio.label} desde el dashboard.`,
      });
      actions.addNotification("Convenio abierto", `${convenio.label} quedó registrado en tu historial.`);
      navigateTo(convenio.source);
    };

    convenioCards.forEach((card) => {
      card.addEventListener("click", () => openConvenio(card.dataset.convenioId));
    });

    document.querySelectorAll("[data-dashboard-link]").forEach((item) => {
      item.addEventListener("click", () => navigateTo(item.getAttribute("data-dashboard-link")));
    });

    const renderStats = (state) => {
      const values = {
        calculations: selectors.calculationsCount(state),
        activeConventions: selectors.activeConventions(state),
        chatQueries: state.chatbot.queryCount,
        reports: state.stats.reportsGenerated,
      };

      document.querySelectorAll("[data-stat]").forEach((node) => {
        node.textContent = `${values[node.getAttribute("data-stat")] ?? 0}`;
      });
    };

    subscribe(renderStats);

    registerSearch((value) => {
      const normalized = value.trim().toLowerCase();
      convenioCards.forEach((card) => {
        card.style.display = card.dataset.name.includes(normalized) ? "" : "none";
      });
    });
  },
};
