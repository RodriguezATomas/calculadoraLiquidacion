import { actions, getState, selectors, subscribe } from "./app-state.js";
import { initChatbot, resetChatbotData } from "./chatbot.js";
import { initNotifications } from "./notifications.js";

const convenioCards = [...document.querySelectorAll(".convenio-card")];
const convenioSearch = document.getElementById("convenioSearch");
const historySearch = document.getElementById("historySearch");
const historyList = document.getElementById("historyList");
const navItems = [...document.querySelectorAll(".nav-item")];

const renderStats = (state) => {
  const stats = {
    calculations: selectors.calculationsCount(state),
    activeConventions: selectors.uniqueConventions(state),
    chatQueries: state.chatbot.queryCount,
    reports: state.stats.reportsGenerated,
  };

  document.querySelectorAll("[data-stat-value]").forEach((node) => {
    const key = node.getAttribute("data-stat-value");
    node.textContent = `${stats[key] ?? 0}`;
  });
};

const renderHistory = (state, query = "") => {
  if (!historyList) {
    return;
  }

  const normalized = query.trim().toLowerCase();
  const items = state.history.filter((entry) => (
    !normalized
    || entry.title.toLowerCase().includes(normalized)
    || (entry.detail || "").toLowerCase().includes(normalized)
    || new Date(entry.createdAt).toLocaleString("es-AR").toLowerCase().includes(normalized)
  ));

  historyList.innerHTML = items.length
    ? items.map((entry) => `
      <article class="history-item">
        <strong>${entry.title}</strong>
        <p>${entry.detail || "Sin detalle adicional."}</p>
        <small>${new Date(entry.createdAt).toLocaleString("es-AR")}</small>
      </article>
    `).join("")
    : `<article class="history-item"><strong>Sin resultados</strong><p>No hay actividad que coincida con tu búsqueda.</p></article>`;
};

const applyUiState = (state) => {
  document.body.classList.toggle("theme-dark", state.ui.theme === "dark");
  document.body.classList.toggle("sidebar-compact", state.ui.sidebarCompact);
};

const updateActiveSidebar = () => {
  const hash = window.location.hash || getState().ui.lastSection || "#inicio";
  let activeRoute = hash;

  navItems.forEach((item) => {
    const href = item.getAttribute("href");
    if (!href?.startsWith("#")) {
      return;
    }

    const section = document.querySelector(href);
    if (!section) {
      return;
    }

    const rect = section.getBoundingClientRect();
    if (rect.top <= 140 && rect.bottom >= 140) {
      activeRoute = href;
    }
  });

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.getAttribute("href") === activeRoute);
  });
};

const initSidebarNavigation = () => {
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const href = item.getAttribute("href");
      if (href?.startsWith("#")) {
        actions.setLastSection(href);
      }
    });
  });

  window.addEventListener("scroll", () => {
    updateActiveSidebar();
    const active = navItems.find((item) => item.classList.contains("is-active"))?.getAttribute("href");
    if (active?.startsWith("#")) {
      actions.setLastSection(active);
    }
  });

  window.addEventListener("hashchange", () => {
    updateActiveSidebar();
    if (window.location.hash) {
      actions.setLastSection(window.location.hash);
    }
  });

  updateActiveSidebar();
};

const initConvenios = () => {
  const openConvenio = (card) => {
    const target = card.getAttribute("href") || card.dataset.url;
    const title = card.querySelector("h4")?.textContent?.trim() || "Convenio";
    if (!target) {
      return;
    }

    actions.addHistoryEntry({
      type: "convention",
      title,
      detail: `Se abrió ${title} desde el dashboard.`,
    });
    actions.addNotification("Convenio abierto", `${title} quedó registrado en tu historial.`);
  };

  convenioCards.forEach((card) => {
    card.addEventListener("click", () => openConvenio(card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openConvenio(card);
        window.location.href = card.getAttribute("href") || card.dataset.url || "index.html";
      }
    });
  });
};

const initSearch = () => {
  if (!convenioSearch) {
    return;
  }

  const applyFilter = (query) => {
    const normalized = query.trim().toLowerCase();
    convenioCards.forEach((card) => {
      const name = (card.dataset.name || "").toLowerCase();
      card.style.display = name.includes(normalized) ? "" : "none";
    });
  };

  convenioSearch.addEventListener("input", (event) => {
    applyFilter(event.target.value);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      convenioSearch.focus();
    }
  });
};

const initHistory = () => {
  if (!historySearch) {
    return;
  }

  historySearch.addEventListener("input", () => {
    renderHistory(getState(), historySearch.value);
  });

  document.getElementById("exportHistoryButton")?.addEventListener("click", () => {
    actions.exportHistory();
    actions.addNotification("Historial exportado", "Se descargó el historial del dashboard en formato JSON.");
  });
};

const initSettings = () => {
  document.getElementById("toggleThemeButton")?.addEventListener("click", () => {
    actions.toggleTheme();
  });

  document.getElementById("toggleSidebarButton")?.addEventListener("click", () => {
    actions.toggleSidebarCompact();
  });

  document.getElementById("resetDataButton")?.addEventListener("click", () => {
    actions.resetAllData();
    resetChatbotData();
  });
};

const initActionButtons = () => {
  document.querySelectorAll("[data-generate-report]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      const type = trigger.getAttribute("data-generate-report") || "general";
      actions.incrementReports(type);
      actions.addNotification("Reporte generado", `Se generó el reporte ${type}.`);

      const href = trigger.getAttribute("href");
      if (href?.startsWith("#")) {
        window.location.hash = href;
      } else {
        event.preventDefault();
      }
    });
  });

  document.querySelectorAll("[data-route-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const route = trigger.getAttribute("data-route-target");
      if (route?.startsWith("#")) {
        actions.setLastSection(route);
      }
    });
  });
};

subscribe((state) => {
  renderStats(state);
  renderHistory(state, historySearch?.value || "");
  applyUiState(state);
});

initNotifications();
initChatbot();
initSidebarNavigation();
initConvenios();
initSearch();
initHistory();
initSettings();
initActionButtons();
