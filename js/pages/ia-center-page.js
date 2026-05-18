import { getState, subscribe } from "../app-state.js";
import { icon } from "../ui/icons.js";

const IA_TABS = [
  { id: "chat", label: "Chat inteligente" },
  { id: "documento", label: "Analizar documento" },
  { id: "articulo", label: "Explicar artículo" },
  { id: "adicionales", label: "Detectar adicionales" },
  { id: "resumen", label: "Generar resumen" },
];

const escapeAttribute = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const renderConversation = (entry, index) => `
  <article class="conversation-item ${index === 0 ? "is-active" : ""}" data-history-item data-prompt="${escapeAttribute(entry.detail || entry.title)}">
    <div class="conversation-item__header">
      <div class="conversation-item__icon icon-violet">${icon("chat")}</div>
      <div>
        <h4 class="conversation-item__title">${entry.detail || entry.title}</h4>
        <p class="conversation-item__meta">${new Date(entry.createdAt).toLocaleDateString("es-AR")}</p>
      </div>
    </div>
  </article>
`;

export const iaCenterPage = {
  title: "Centro IA",
  description: "Consultas, análisis y obtención de insights inteligentes sobre convenios y liquidaciones.",
  hidePageHeader: true,
  render() {
    return `
      <div class="ia-page">
        <section class="ia-heading">
          <div>
            <h2>Centro IA</h2>
            <p>Consultas, análisis y obtención de insights inteligentes sobre convenios y liquidaciones.</p>
          </div>
        </section>

        <div class="ia-layout">
        <aside class="panel history-panel">
          <div class="panel-header">
            <div>
              <span class="panel-eyebrow">Conversaciones recientes</span>
              <h3 class="panel-title">Historial</h3>
            </div>
            <button type="button" class="outline-button" id="newConversationButton">Nueva conversación</button>
          </div>
          <div class="conversation-list" id="conversationHistoryList"></div>
          <div class="history-panel__footer">
            <button type="button" class="outline-button" id="chatExportButton">${icon("download")} Ver todas las conversaciones</button>
          </div>
        </aside>

        <section class="chat-workspace">
          <div class="prompt-tabs" id="iaPromptTabs">
            ${IA_TABS.map((tab, index) => `<button type="button" class="prompt-tab ${index === 0 ? "is-active" : ""}" data-ia-tab="${tab.id}">${icon(index === 0 ? "chat" : "sparkles")}${tab.label}</button>`).join("")}
          </div>

          <section class="chat-panel">
            <div class="chat-panel__hero">
              <div>
                <h3>Asistente avanzado</h3>
                <span class="chat-context" id="chatContextLabel">Centro IA</span>
              </div>
              <div class="chat-context">Gemini listo</div>
            </div>

            <div class="chat-card">
              <h4>¿Cómo se calculó el adicional por zona desfavorable en el convenio UOCRA?</h4>
              <p>Usá los prompts rápidos o escribí una consulta concreta para obtener una respuesta contextualizada.</p>
              <div class="chat-shortcuts">
                <button type="button" class="shortcut-chip question-chip">Ejemplo práctico</button>
                <button type="button" class="shortcut-chip question-chip">Ver artículo del convenio</button>
                <button type="button" class="shortcut-chip question-chip">Comparar zonas</button>
              </div>
            </div>

            <div class="message-list" id="chatMessages"></div>

            <div class="chat-shortcuts">
              <button type="button" class="shortcut-chip question-chip">Analizar documento adjunto</button>
              <button type="button" class="shortcut-chip question-chip">Explicar artículo 40</button>
              <button type="button" class="shortcut-chip question-chip">Detectar adicionales omitidos</button>
              <button type="button" class="shortcut-chip question-chip">Generar resumen ejecutivo</button>
            </div>

            <form class="chat-input-row" id="chatForm">
              <input id="chatInput" type="text" placeholder="Escribí tu consulta...">
              <button type="button" class="outline-button" id="chatClearButton">${icon("trash")}</button>
              <button type="submit" class="chat-send-button" id="chatSubmitButton">${icon("send")}</button>
            </form>
            <p class="message-footer">La IA puede cometer errores. Verificá siempre la información.</p>
          </section>
        </section>
        </div>
      </div>
    `;
  },
  init({ registerSearch }) {
    const historyList = document.getElementById("conversationHistoryList");
    const promptTabs = [...document.querySelectorAll("[data-ia-tab]")];
    const input = document.getElementById("chatInput");

    const renderHistory = (state, query = "") => {
      const normalized = query.trim().toLowerCase();
      const items = state.history
        .filter((entry) => entry.type === "chat")
        .filter((entry) => !normalized || (entry.detail || "").toLowerCase().includes(normalized))
        .slice(0, 6);

      historyList.innerHTML = items.length
        ? items.map(renderConversation).join("")
        : `<div class="empty-state">${icon("chat")}<p>No hay conversaciones recientes para mostrar.</p></div>`;

      historyList.querySelectorAll("[data-history-item]").forEach((item) => {
        item.addEventListener("click", () => {
          input.value = item.getAttribute("data-prompt") || "";
          input.focus();
        });
      });
    };

    subscribe((state) => renderHistory(state));

    promptTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        promptTabs.forEach((item) => item.classList.remove("is-active"));
        tab.classList.add("is-active");
        document.getElementById("chatContextLabel").textContent = tab.textContent.trim();
      });
    });

    document.getElementById("newConversationButton")?.addEventListener("click", () => {
      input.value = "";
      input.focus();
    });

    registerSearch((value) => {
      renderHistory(getState(), value);
    });
  },
};
