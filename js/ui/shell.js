import { getRouteForPage } from "../router.js";
import { icon } from "./icons.js";

const NAV_ITEMS = [
  { label: "Inicio", href: "index.html", page: "dashboard", iconName: "home" },
  { label: "Centro IA", href: "ia-center.html", page: "ia-center", iconName: "panel" },
  { label: "Convenios", href: "convenios.html", page: "convenios", iconName: "folder" },
  { label: "Configuración", href: "configuracion.html", page: "configuracion", iconName: "settings" },
];

export const renderShell = ({ page, title, description, content, actionMarkup = "", hidePageHeader = false }) => {
  const route = getRouteForPage(page);
  const helperLink = page === "ia-center" ? "index.html" : "ia-center.html";

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand__main">
            <div class="brand__icon">${icon("app")}</div>
            <div class="brand__copy">
              <h1>Calculadora<br>de Convenios</h1>
              <p>${title}</p>
            </div>
          </div>
         
        </div>

        <nav class="sidebar-nav">
          ${NAV_ITEMS.map((item) => `
            <a class="nav-link ${item.page === page ? "is-active" : ""}" href="${item.href}" data-nav-page="${item.page}">
              <span class="nav-link__icon">${icon(item.iconName)}</span>
              <span>${item.label}</span>
            </a>
          `).join("")}
        </nav>
          
        <div class="helper-card">
          <div class="helper-visual"><div class="assistant-orb assistant-orb--helper"><span></span><span></span><span></span></div></div>
          <div class="helper-card__content">
            <h3>¿Necesitás ayuda?</h3>
            <p>Nuestro asistente virtual está disponible 24/7 para resolver tus consultas.</p>
          </div>
          <a class="helper-card__action" href="${helperLink}">Chatear ahora</a>
        </div>
      </aside>
        
      <main class="main-shell">
        <div class="workspace">
          <header class="topbar">
            <label class="searchbar" for="globalSearch">
              ${icon("search")}
              <input id="globalSearch" type="search" placeholder="${route.searchPlaceholder}" aria-label="Buscar">
              <span class="searchbar__hint">Ctrl + K</span>
            </label>

            <div class="topbar-actions">
              <div class="notifications">
                <button type="button" class="icon-button" id="notificationsButton" aria-expanded="false" aria-label="Notificaciones">
                  ${icon("bell")}
                  <span class="icon-button__badge" id="notificationsBadge">0</span>
                </button>
                <div class="notifications__dropdown" id="notificationsDropdown" hidden>
                  <div class="notifications__header">
                    <strong>Notificaciones</strong>
                    <button type="button" class="ghost-button" id="markAllNotificationsRead">Marcar todas</button>
                  </div>
                  <div class="notifications__list" id="notificationsList"></div>
                </div>
              </div>

              <button type="button" class="icon-button" id="themeToggleButton" aria-label="Cambiar tema">
                ${icon("sun")}
              </button>

              <div class="profile-chip">
                <div class="profile-chip__avatar">TR</div>
                <div class="profile-chip__info">
                  <strong>Tomás Rodríguez</strong>
                  <span>Administrador</span>
                </div>
              </div>
            </div>
          </header>

          ${hidePageHeader ? "" : `
            <section class="page-header">
              <div class="page-header__title">
                <h2>${title}</h2>
                <p>${description}</p>
              </div>
              ${actionMarkup}
            </section>
          `}

          <section class="page-content">
            ${content}
          </section>
        </div>
      </main>
    </div>
  `;
};
