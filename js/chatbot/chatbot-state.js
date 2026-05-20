import {
  clearAllConversationRecords,
  clearConversations,
  clearConversationRecord,
  deleteConversation,
  exportConversationRecord,
  getCachedAnswer,
  getConversationRecord,
  loadConversations,
  saveConversationRecord,
  saveConversations,
  setCachedAnswer,
} from "./chatbot-storage.js";

const listeners = new Set();
const MIN_REQUEST_GAP_MS = 1200;
const MAX_HISTORY_MESSAGES = 24;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;

const normalizeText = (text) => text.trim().replace(/\s+/g, " ");

const hashString = (value) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return `cache_${Math.abs(hash)}`;
};

const resolveContext = () => {
  const contextKey = document.body.dataset.chatContext || window.location.pathname.split("/").pop()?.replace(".html", "") || "dashboard";
  const label = document.body.dataset.chatLabel || document.title || "Chat";

  return {
    key: contextKey,
    label,
    path: window.location.pathname.split("/").pop() || "index.html",
    description: window.location.pathname,
  };
};

const now = () => new Date().toISOString();

const state = {
  context: resolveContext(),
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  lastRequestAt: 0,
};

const emit = () => {
  listeners.forEach((listener) => listener({ ...state }));
};

const persistMessages = () => {
  const persistedMessages = state.messages
    .filter((message) => !message.transient)
    .slice(-MAX_HISTORY_MESSAGES);

  saveConversationRecord(state.context.key, {
    id: state.activeConversationId || undefined,
    context: state.context,
    updatedAt: now(),
    title: persistedMessages.find((message) => message.role === "user")?.text || "Nueva conversación",
    messages: persistedMessages,
  });
  syncConversationBucket();
};

const syncConversationBucket = () => {
  const bucket = loadConversations(state.context.key);
  state.conversations = bucket.items;
  state.activeConversationId = bucket.activeId || null;
};

const loadMessages = (conversationId = null) => {
  syncConversationBucket();
  const targetId = conversationId || state.activeConversationId;
  const record = state.conversations.find((item) => item.id === targetId) || null;
  state.activeConversationId = record?.id || null;
  state.messages = record?.messages || [];
};

loadMessages();

export const subscribeChatbotState = (listener) => {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
};

export const getChatbotState = () => ({ ...state });

export const setActiveConversation = (conversationId) => {
  const bucket = loadConversations(state.context.key);
  saveConversations(state.context.key, {
    ...bucket,
    activeId: conversationId,
  });
  loadMessages(conversationId);
  emit();
};

export const createNewConversation = () => {
  state.activeConversationId = null;
  state.messages = [];
  emit();
};

export const deleteChatConversation = (conversationId) => {
  deleteConversation(state.context.key, conversationId);
  loadMessages();
  emit();
};

export const clearChatConversations = () => {
  clearConversations(state.context.key);
  loadMessages();
  emit();
};

export const setChatbotLoading = (isLoading) => {
  state.isLoading = isLoading;
  emit();
};

export const addChatbotMessage = (message) => {
  state.messages = [...state.messages, message];
  if (!message.transient) {
    persistMessages();
  }
  emit();
};

export const updateChatbotMessage = (messageId, patch) => {
  state.messages = state.messages.map((message) => (
    message.id === messageId ? { ...message, ...patch } : message
  ));
  if (!patch.transient) {
    persistMessages();
  }
  emit();
};

export const removeChatbotMessage = (messageId) => {
  state.messages = state.messages.filter((message) => message.id !== messageId);
  persistMessages();
  emit();
};

export const finalizeChatbotMessage = (messageId) => {
  state.messages = state.messages.map((message) => (
    message.id === messageId ? { ...message, transient: false } : message
  ));
  persistMessages();
  emit();
};

export const clearCurrentConversation = () => {
  state.messages = [];
  clearConversationRecord(state.context.key);
  syncConversationBucket();
  emit();
};

export const clearAllChatbotData = () => {
  state.conversations = [];
  state.activeConversationId = null;
  state.messages = [];
  state.isLoading = false;
  state.lastRequestAt = 0;
  clearAllConversationRecords();
  emit();
};

export const exportCurrentConversation = () => {
  exportConversationRecord(state.context.key);
};

export const getConversationForApi = () => state.messages
  .filter((message) => !message.transient && (message.role === "user" || message.role === "bot"))
  .slice(-12)
  .map((message) => ({
    role: message.role,
    text: message.text,
  }));

export const canSendChatbotMessage = () => !state.isLoading && (Date.now() - state.lastRequestAt >= MIN_REQUEST_GAP_MS);

export const markChatbotRequest = () => {
  state.lastRequestAt = Date.now();
};

export const getChatbotCacheKey = (prompt) => hashString(`${state.context.key}:${normalizeText(prompt).toLowerCase()}`);

export const getCachedChatbotAnswer = (prompt) => {
  const cacheKey = getChatbotCacheKey(prompt);
  const cacheEntry = getCachedAnswer(cacheKey);

  if (!cacheEntry) {
    return null;
  }

  if ((Date.now() - new Date(cacheEntry.createdAt).getTime()) > CACHE_TTL_MS) {
    return null;
  }

  return cacheEntry.text;
};

export const setCachedChatbotAnswer = (prompt, text) => {
  setCachedAnswer(getChatbotCacheKey(prompt), text);
};
