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

const createConversationId = () => `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalizeConversationBucket = (contextKey, bucket) => {
  if (bucket?.messages) {
    const legacyId = createConversationId();
    return {
      activeId: legacyId,
      items: [
        {
          id: legacyId,
          context: bucket.context || { key: contextKey },
          title: bucket.messages.find((message) => message.role === "user")?.text || "Nueva conversación",
          createdAt: bucket.messages[0]?.createdAt || bucket.updatedAt || new Date().toISOString(),
          updatedAt: bucket.updatedAt || new Date().toISOString(),
          messages: Array.isArray(bucket.messages) ? bucket.messages : [],
        },
      ],
    };
  }

  return {
    activeId: bucket?.activeId || null,
    items: Array.isArray(bucket?.items) ? bucket.items : [],
  };
};

export const loadConversations = (contextKey) => {
  const store = loadStore();
  return normalizeConversationBucket(contextKey, store.conversations[contextKey]);
};

export const saveConversations = (contextKey, bucket) => {
  const store = loadStore();
  store.conversations[contextKey] = normalizeConversationBucket(contextKey, bucket);
  saveStore(store);
};

export const deleteConversation = (contextKey, conversationId) => {
  const bucket = loadConversations(contextKey);
  const nextItems = bucket.items.filter((item) => item.id !== conversationId);
  saveConversations(contextKey, {
    activeId: bucket.activeId === conversationId ? null : bucket.activeId,
    items: nextItems,
  });
};

export const clearConversations = (contextKey) => {
  saveConversations(contextKey, {
    activeId: null,
    items: [],
  });
};

const trimCache = (cache) => {
  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, MAX_CACHE_ITEMS);

  return Object.fromEntries(entries);
};

export const getConversationRecord = (contextKey) => {
  const bucket = loadConversations(contextKey);
  return bucket.items.find((item) => item.id === bucket.activeId) || null;
};

export const saveConversationRecord = (contextKey, record) => {
  const bucket = loadConversations(contextKey);
  const currentId = record?.id || bucket.activeId || createConversationId();
  const nextRecord = {
    id: currentId,
    context: record.context,
    title: record.title || record.messages?.find((message) => message.role === "user")?.text || "Nueva conversación",
    createdAt: record.createdAt || bucket.items.find((item) => item.id === currentId)?.createdAt || record.updatedAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    messages: Array.isArray(record.messages) ? record.messages : [],
  };
  const nextItems = [
    nextRecord,
    ...bucket.items.filter((item) => item.id !== currentId),
  ].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  saveConversations(contextKey, {
    activeId: currentId,
    items: nextItems,
  });
};

export const clearConversationRecord = (contextKey) => {
  const bucket = loadConversations(contextKey);
  if (!bucket.activeId) {
    return;
  }
  deleteConversation(contextKey, bucket.activeId);
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
