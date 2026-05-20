import { getAllConvenios } from "./services/convenio-storage.js";
import { downloadJSON, readJSON, removeKey, writeJSON } from "./storage.js";

const STORAGE_KEY = "dashboard_app_state_v2";

const now = () => new Date().toISOString();

const defaultNotifications = [
  { id: "n1", title: "Nuevo convenio agregado", body: "Se incorporó un nuevo acceso rápido al panel.", read: false, createdAt: now() },
  { id: "n2", title: "Escala salarial actualizada", body: "Se actualizaron valores de un convenio importado.", read: false, createdAt: now() },
  { id: "n3", title: "Liquidación guardada", body: "Tu último cálculo quedó disponible en el historial.", read: true, createdAt: now() },
  { id: "n4", title: "Centro IA listo", body: "La conexión con Gemini está disponible para nuevas consultas.", read: true, createdAt: now() },
];

const defaultSettings = {
  theme: "Claro",
  currency: "Peso Argentino (ARS)",
  dateFormat: "DD/MM/YYYY",
  language: "Español",
  timezone: "(GMT-03:00) Buenos Aires",
  companyName: "e-Sueldos",
  companyEmail: "admin@esueldos.com",
  systemMode: "Producción",
  geminiModel: (window.GEMINI_CONFIG?.MODEL || "gemini-2.5-flash"),
  geminiApiKey: (window.GEMINI_CONFIG?.API_KEY || ""),
  notificationsEmail: true,
  notificationsBrowser: true,
  autoSave: true,
  tipsEnabled: true,
  confirmDelete: true,
  developerMode: false,
  backupFrequency: "Semanal",
};

const defaultState = {
  ui: {
    lastSection: "#inicio",
    theme: "light",
    sidebarCompact: false,
    lastVisitedPage: "index.html",
  },
  notifications: defaultNotifications,
  history: [],
  chatbot: {
    queryCount: 0,
  },
  stats: {
    reportsGenerated: 0,
  },
  settings: defaultSettings,
  system: {
    geminiConnected: Boolean((window.GEMINI_CONFIG?.API_KEY || "").trim()),
    lastApiTestAt: null,
  },
};

const mergeState = (stored) => {
  const merged = {
    ...defaultState,
    ...stored,
    ui: {
      ...defaultState.ui,
      ...(stored?.ui || {}),
    },
    chatbot: {
      ...defaultState.chatbot,
      ...(stored?.chatbot || {}),
    },
    stats: {
      ...defaultState.stats,
      ...(stored?.stats || {}),
    },
    settings: {
      ...defaultSettings,
      ...(stored?.settings || {}),
    },
    system: {
      ...defaultState.system,
      ...(stored?.system || {}),
    },
    notifications: Array.isArray(stored?.notifications) ? stored.notifications : defaultNotifications,
    history: Array.isArray(stored?.history) ? stored.history : [],
  };

  if (merged.settings.theme === "light") {
    merged.settings.theme = "Claro";
  }

  if (merged.settings.theme === "dark") {
    merged.settings.theme = "Oscuro";
  }

  return merged;
};

let state = mergeState(readJSON(STORAGE_KEY, defaultState));
const listeners = new Set();

const emit = () => {
  writeJSON(STORAGE_KEY, state);
  listeners.forEach((listener) => listener(state));
};

const patch = (updater) => {
  state = updater(state);
  emit();
};

export const subscribe = (listener) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

export const getState = () => state;

export const actions = {
  setLastSection(section) {
    patch((current) => ({
      ...current,
      ui: { ...current.ui, lastSection: section },
    }));
  },
  setLastVisitedPage(page) {
    patch((current) => ({
      ...current,
      ui: { ...current.ui, lastVisitedPage: page },
    }));
  },
  toggleTheme() {
    patch((current) => ({
      ...current,
      ui: { ...current.ui, theme: current.ui.theme === "dark" ? "light" : "dark" },
      settings: { ...current.settings, theme: current.ui.theme === "dark" ? "Claro" : "Oscuro" },
    }));
  },
  setTheme(theme) {
    patch((current) => ({
      ...current,
      ui: { ...current.ui, theme },
      settings: { ...current.settings, theme: theme === "dark" ? "Oscuro" : "Claro" },
    }));
  },
  toggleSidebarCompact() {
    patch((current) => ({
      ...current,
      ui: { ...current.ui, sidebarCompact: !current.ui.sidebarCompact },
    }));
  },
  addNotification(title, body) {
    patch((current) => ({
      ...current,
      notifications: [
        { id: `n-${Date.now()}`, title, body, read: false, createdAt: now() },
        ...current.notifications,
      ].slice(0, 24),
    }));
  },
  markNotificationRead(id) {
    patch((current) => ({
      ...current,
      notifications: current.notifications.map((item) => (
        item.id === id ? { ...item, read: true } : item
      )),
    }));
  },
  markAllNotificationsRead() {
    patch((current) => ({
      ...current,
      notifications: current.notifications.map((item) => ({ ...item, read: true })),
    }));
  },
  addHistoryEntry(entry) {
    patch((current) => ({
      ...current,
      history: [{ id: `h-${Date.now()}`, createdAt: now(), ...entry }, ...current.history].slice(0, 80),
    }));
  },
  incrementChatQueries() {
    patch((current) => ({
      ...current,
      chatbot: {
        ...current.chatbot,
        queryCount: current.chatbot.queryCount + 1,
      },
    }));
  },
  incrementReports(type) {
    patch((current) => ({
      ...current,
      stats: { ...current.stats, reportsGenerated: current.stats.reportsGenerated + 1 },
      history: [
        { id: `h-${Date.now()}`, createdAt: now(), type: "report", title: "Reporte generado", detail: type },
        ...current.history,
      ].slice(0, 80),
    }));
  },
  updateSettings(nextSettings) {
    patch((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...nextSettings,
      },
      ui: {
        ...current.ui,
        theme: nextSettings.theme === "Oscuro" ? "dark" : nextSettings.theme === "Claro" ? "light" : current.ui.theme,
      },
    }));
  },
  toggleSetting(key) {
    patch((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: !current.settings[key],
      },
    }));
  },
  setSystemStatus(statusPatch) {
    patch((current) => ({
      ...current,
      system: {
        ...current.system,
        ...statusPatch,
      },
    }));
  },
  resetAllData() {
    state = mergeState(defaultState);
    removeKey(STORAGE_KEY);
    emit();
  },
  exportHistory() {
    downloadJSON("historial-dashboard.json", state.history);
  },
};

export const selectors = {
  unreadNotifications(current = state) {
    return current.notifications.filter((item) => !item.read).length;
  },
  uniqueConventions(current = state) {
    return new Set(current.history.filter((item) => item.type === "convention").map((item) => item.title)).size;
  },
  calculationsCount(current = state) {
    return current.history.filter((item) => item.type === "calculation").length;
  },
  activeConventions() {
    return getAllConvenios().filter((item) => item.isValid && item.status === "active").length;
  },
  conventionsUpdatedThisMonth() {
    return getAllConvenios().filter((item) => item.isValid && (item.updatedAt || "").startsWith("2026-05")).length;
  },
  conventionsInReview() {
    return getAllConvenios().filter((item) => item.isValid && item.status === "review").length;
  },
};
