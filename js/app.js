import { actions, getState, subscribe } from "./app-state.js";
import { initChatbot } from "./chatbot.js";
import { initNotifications } from "./notifications.js";
import { dashboardPage } from "./pages/dashboard-page.js";
import { conveniosPage } from "./pages/convenios-page.js";
import { convenioEditorPage } from "./pages/convenio-editor-page.js";
import { iaCenterPage } from "./pages/ia-center-page.js";
import { configuracionPage } from "./pages/configuracion-page.js";
import { getRouteForPage } from "./router.js";
import { renderShell } from "./ui/shell.js";

const pageMap = {
  dashboard: dashboardPage,
  convenios: conveniosPage,
  "convenio-editor": convenioEditorPage,
  "ia-center": iaCenterPage,
  configuracion: configuracionPage,
};

const pageId = document.body.dataset.page || "dashboard";
const pageModule = pageMap[pageId] || dashboardPage;

document.getElementById("app").innerHTML = renderShell({
  page: pageId,
  title: pageModule.title,
  description: pageModule.description,
  actionMarkup: pageModule.actionMarkup || "",
  hidePageHeader: pageModule.hidePageHeader || false,
  content: pageModule.render(),
});

const searchInput = document.getElementById("globalSearch");
let onSearch = () => {};

const registerSearch = (handler) => {
  onSearch = handler;
};

const applyUiState = (state) => {
  document.body.classList.toggle("theme-dark", state.ui.theme === "dark");
  document.body.classList.toggle("sidebar-compact", state.ui.sidebarCompact);
  const systemBadge = document.getElementById("systemStatusBadge");

  if (systemBadge) {
    const connected = state.system.geminiConnected;
    systemBadge.textContent = connected ? "Sistema online" : "Sin API";
    systemBadge.className = `system-status ${connected ? "system-status--connected" : "system-status--disconnected"}`;
  }
};

subscribe(applyUiState);

actions.setLastVisitedPage(getRouteForPage(pageId).href);

document.getElementById("themeToggleButton")?.addEventListener("click", () => {
  actions.toggleTheme();
});

document.getElementById("sidebarToggleButton")?.addEventListener("click", () => {
  actions.toggleSidebarCompact();
});

searchInput?.addEventListener("input", (event) => {
  onSearch(event.target.value);
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput?.focus();
  }
});

document.querySelectorAll("[data-nav-page]").forEach((link) => {
  link.addEventListener("click", () => {
    actions.setLastVisitedPage(link.getAttribute("href"));
  });
});

pageModule.init?.({ registerSearch, state: getState });
initNotifications();

if (pageId === "ia-center") {
  initChatbot();
}
