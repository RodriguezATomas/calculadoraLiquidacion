import { downloadJSON, readJSON, writeJSON } from "../storage.js";

const STORAGE_KEY = "gemini_chatbot_store_v1";
const MAX_CACHE_ITEMS = 60;

const defaultStore = {
  conversations: {},
  cache: {},
};

const loadStore = () => readJSON(STORAGE_KEY, defaultStore);

const saveStore = (store) => {
  writeJSON(STORAGE_KEY, store);
};

const trimCache = (cache) => {
  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, MAX_CACHE_ITEMS);

  return Object.fromEntries(entries);
};

export const getConversationRecord = (contextKey) => {
  const store = loadStore();
  return store.conversations[contextKey] || null;
};

export const saveConversationRecord = (contextKey, record) => {
  const store = loadStore();
  store.conversations[contextKey] = record;
  saveStore(store);
};

export const clearConversationRecord = (contextKey) => {
  const store = loadStore();
  delete store.conversations[contextKey];
  saveStore(store);
};

export const clearAllConversationRecords = () => {
  saveStore(defaultStore);
};

export const getCachedAnswer = (cacheKey) => {
  const store = loadStore();
  return store.cache[cacheKey] || null;
};

export const setCachedAnswer = (cacheKey, text) => {
  const store = loadStore();
  store.cache[cacheKey] = {
    text,
    createdAt: new Date().toISOString(),
  };
  store.cache = trimCache(store.cache);
  saveStore(store);
};

export const exportConversationRecord = (contextKey) => {
  const record = getConversationRecord(contextKey);
  downloadJSON(`chat-${contextKey}.json`, record || { contextKey, messages: [] });
};
