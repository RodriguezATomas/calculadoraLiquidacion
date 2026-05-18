import { actions, getState, subscribe } from "../app-state.js";
import { testGeminiConnection } from "../chatbot/chatbot-api.js";
import { icon } from "../ui/icons.js";

const SETTINGS_TABS = [
  { id: "general", label: "General", iconName: "settings" },
  { id: "empresa", label: "Empresa", iconName: "briefcase" },
  { id: "sistema", label: "Sistema", iconName: "panel" },
  { id: "ia", label: "IA y API", iconName: "sparkles" },
  { id: "notificaciones", label: "Notificaciones", iconName: "bell" },
  { id: "usuarios", label: "Usuarios", iconName: "users" },
  { id: "backup", label: "Backup", iconName: "backup" },
];

export const configuracionPage = {
  title: "Configuración",
  description: "Personalizá el sistema según tus preferencias y necesidades.",
  hidePageHeader: true,
  render() {
    return `
      <div class="config-layout">
        <section class="config-heading">
          <div>
            <h2>Configuración</h2>
            <p>Personalizá el sistema según tus preferencias y necesidades.</p>
          </div>
        </section>

        <section class="panel">
          <div class="config-tabs">
            ${SETTINGS_TABS.map((tab, index) => `<button type="button" class="config-tab ${index === 0 ? "is-active" : ""}" data-config-tab="${tab.id}">${icon(tab.iconName)}${tab.label}</button>`).join("")}
          </div>

          <div class="config-grid">
            <div class="config-column">
              <section class="config-block" data-config-panel="general">
                <h3 class="config-block__title">Ajustes generales</h3>
                <div class="field"><label>Tema</label><select id="settingTheme"><option>Claro</option><option>Oscuro</option></select></div>
                <div class="field"><label>Moneda</label><select id="settingCurrency"><option>Peso Argentino (ARS)</option><option>Dólar estadounidense (USD)</option></select></div>
                <div class="field"><label>Formato de fecha</label><select id="settingDateFormat"><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></div>
                <div class="field"><label>Idioma</label><select id="settingLanguage"><option>Español</option><option>English</option></select></div>
                <div class="field"><label>Zona horaria</label><select id="settingTimezone"><option>(GMT-03:00) Buenos Aires</option><option>(GMT-04:00) Santiago</option></select></div>
                <div class="config-actions"><button type="button" class="button" id="saveGeneralSettings">Guardar cambios</button></div>
              </section>

              <section class="config-block" data-config-panel="empresa" hidden>
                <h3 class="config-block__title">Datos de empresa</h3>
                <div class="field"><label>Nombre</label><input id="settingCompanyName" type="text"></div>
                <div class="field"><label>Email</label><input id="settingCompanyEmail" type="email"></div>
              </section>

              <section class="config-block" data-config-panel="sistema" hidden>
                <h3 class="config-block__title">Preferencias del sistema</h3>
                <div class="field"><label>Modo</label><select id="settingSystemMode"><option>Producción</option><option>Auditoría</option></select></div>
              </section>
            </div>

            <div class="config-column">
              <section class="config-block" data-config-panel="ia">
                <div class="panel-header">
                  <div>
                    <h3 class="config-block__title">API Gemini</h3>
                    <p class="config-block__text">Modelo actual y credenciales persistidas en localStorage.</p>
                  </div>
                  <span class="system-status" id="configConnectionStatus">Estado</span>
                </div>
                <div class="field"><label>Modelo actual</label><input id="settingGeminiModel" type="text"></div>
                <div class="field"><label>API Key</label><input id="settingGeminiApiKey" type="password" placeholder="Pegá tu API key"></div>
                <div class="config-actions">
                  <button type="button" class="outline-button" id="testGeminiButton">Probar conexión</button>
                  <button type="button" class="outline-button" id="saveGeminiButton">Configurar API</button>
                </div>
              </section>

              <section class="config-block" data-config-panel="notificaciones" hidden>
                <h3 class="config-block__title">Notificaciones</h3>
                <div class="toggle-row"><span>Email</span><input class="switch" id="settingNotificationsEmail" type="checkbox"></div>
                <div class="toggle-row"><span>Browser</span><input class="switch" id="settingNotificationsBrowser" type="checkbox"></div>
              </section>

              <section class="config-block" data-config-panel="usuarios" hidden>
                <h3 class="config-block__title">Usuarios</h3>
                <div class="list-row"><span>Rol actual</span><strong>Administrador</strong></div>
                <div class="list-row"><span>Permisos IA</span><strong>Habilitados</strong></div>
              </section>

              <section class="config-block" data-config-panel="backup" hidden>
                <h3 class="config-block__title">Backup</h3>
                <div class="field"><label>Frecuencia</label><select id="settingBackupFrequency"><option>Semanal</option><option>Mensual</option></select></div>
              </section>
            </div>

            <div class="config-column">
              <section class="config-block">
                <h3 class="config-block__title">Preferencias del sistema</h3>
                <div class="toggle-row"><span>Guardar liquidaciones automáticamente</span><input class="switch" id="settingAutoSave" type="checkbox"></div>
                <div class="toggle-row"><span>Mostrar consejos y tips</span><input class="switch" id="settingTipsEnabled" type="checkbox"></div>
                <div class="toggle-row"><span>Confirmar antes de eliminar</span><input class="switch" id="settingConfirmDelete" type="checkbox"></div>
                <div class="toggle-row"><span>Modo desarrollador</span><input class="switch" id="settingDeveloperMode" type="checkbox"></div>
              </section>
            </div>
          </div>
        </section>
      </div>
    `;
  },
  init({ registerSearch }) {
    const tabs = [...document.querySelectorAll("[data-config-tab]")];
    const panels = [...document.querySelectorAll("[data-config-panel]")];
    const bindStateToInputs = (state) => {
      document.getElementById("settingTheme").value = state.settings.theme;
      document.getElementById("settingCurrency").value = state.settings.currency;
      document.getElementById("settingDateFormat").value = state.settings.dateFormat;
      document.getElementById("settingLanguage").value = state.settings.language;
      document.getElementById("settingTimezone").value = state.settings.timezone;
      document.getElementById("settingCompanyName").value = state.settings.companyName;
      document.getElementById("settingCompanyEmail").value = state.settings.companyEmail;
      document.getElementById("settingSystemMode").value = state.settings.systemMode;
      document.getElementById("settingGeminiModel").value = state.settings.geminiModel;
      document.getElementById("settingGeminiApiKey").value = state.settings.geminiApiKey;
      document.getElementById("settingNotificationsEmail").checked = state.settings.notificationsEmail;
      document.getElementById("settingNotificationsBrowser").checked = state.settings.notificationsBrowser;
      document.getElementById("settingBackupFrequency").value = state.settings.backupFrequency;
      document.getElementById("settingAutoSave").checked = state.settings.autoSave;
      document.getElementById("settingTipsEnabled").checked = state.settings.tipsEnabled;
      document.getElementById("settingConfirmDelete").checked = state.settings.confirmDelete;
      document.getElementById("settingDeveloperMode").checked = state.settings.developerMode;
      document.getElementById("configConnectionStatus").textContent = state.system.geminiConnected ? "Estado: Conectado" : "Estado: Pendiente";
      document.getElementById("configConnectionStatus").className = `system-status ${state.system.geminiConnected ? "system-status--connected" : "system-status--disconnected"}`;
    };

    subscribe(bindStateToInputs);

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((item) => item.classList.remove("is-active"));
        tab.classList.add("is-active");
        const target = tab.getAttribute("data-config-tab");
        panels.forEach((panel) => {
          panel.hidden = panel.getAttribute("data-config-panel") !== target;
        });
      });
    });

    document.getElementById("saveGeneralSettings")?.addEventListener("click", () => {
      actions.updateSettings({
        theme: document.getElementById("settingTheme").value,
        currency: document.getElementById("settingCurrency").value,
        dateFormat: document.getElementById("settingDateFormat").value,
        language: document.getElementById("settingLanguage").value,
        timezone: document.getElementById("settingTimezone").value,
        companyName: document.getElementById("settingCompanyName").value,
        companyEmail: document.getElementById("settingCompanyEmail").value,
        systemMode: document.getElementById("settingSystemMode").value,
        notificationsEmail: document.getElementById("settingNotificationsEmail").checked,
        notificationsBrowser: document.getElementById("settingNotificationsBrowser").checked,
        backupFrequency: document.getElementById("settingBackupFrequency").value,
        autoSave: document.getElementById("settingAutoSave").checked,
        tipsEnabled: document.getElementById("settingTipsEnabled").checked,
        confirmDelete: document.getElementById("settingConfirmDelete").checked,
        developerMode: document.getElementById("settingDeveloperMode").checked,
      });
      actions.addNotification("Configuración guardada", "Tus preferencias del sistema fueron actualizadas.");
    });

    document.getElementById("saveGeminiButton")?.addEventListener("click", () => {
      const nextConfig = {
        API_KEY: document.getElementById("settingGeminiApiKey").value.trim(),
        MODEL: document.getElementById("settingGeminiModel").value.trim() || "gemini-2.5-flash",
      };

      window.setGeminiConfig?.(nextConfig);
      actions.updateSettings({
        geminiApiKey: nextConfig.API_KEY,
        geminiModel: nextConfig.MODEL,
      });
      actions.setSystemStatus({
        geminiConnected: Boolean(nextConfig.API_KEY),
      });
      actions.addNotification("Gemini configurado", "La configuración de la API quedó guardada localmente.");
    });

    document.getElementById("testGeminiButton")?.addEventListener("click", async () => {
      try {
        await testGeminiConnection();
        actions.setSystemStatus({ geminiConnected: true, lastApiTestAt: new Date().toISOString() });
        actions.addNotification("Conexión OK", "Gemini respondió correctamente.");
      } catch (error) {
        actions.setSystemStatus({ geminiConnected: false, lastApiTestAt: new Date().toISOString() });
        actions.addNotification("Error de conexión", error.message || "No se pudo validar Gemini.");
      }
    });

    registerSearch((value) => {
      const normalized = value.trim().toLowerCase();
      tabs.forEach((tab) => {
        tab.style.display = !normalized || tab.textContent.toLowerCase().includes(normalized) ? "" : "none";
      });
    });
  },
};
