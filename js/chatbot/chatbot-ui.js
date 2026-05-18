import { actions } from "../app-state.js";
import { getChatbotErrorMessage, requestGeminiAnswer } from "./chatbot-api.js";
import {
  addChatbotMessage,
  canSendChatbotMessage,
  clearAllChatbotData,
  clearCurrentConversation,
  exportCurrentConversation,
  finalizeChatbotMessage,
  getCachedChatbotAnswer,
  getChatbotState,
  getConversationForApi,
  markChatbotRequest,
  setCachedChatbotAnswer,
  setChatbotLoading,
  subscribeChatbotState,
  updateChatbotMessage,
} from "./chatbot-state.js";

const TYPING_STEP_MS = 12;

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const formatDate = (value) => new Date(value).toLocaleTimeString("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&#39;");

const renderMessage = (message) => {
  const roleLabel = message.role === "user" ? "Vos" : "Asistente";
  const loadingMarkup = `
    <div class="chat-message__dots" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  return `
    <article class="chat-message chat-message--${message.role}${message.transient ? " chat-message--transient" : ""}${message.isError ? " chat-message--error" : ""}">
      <div class="chat-message__meta">
        <strong>${roleLabel}</strong>
        <small>${formatDate(message.createdAt)}</small>
      </div>
      ${message.isLoading ? loadingMarkup : `<p>${escapeHtml(message.text).replaceAll("\n", "<br>")}</p>`}
    </article>
  `;
};

const animateBotResponse = (messageId, fullText) => new Promise((resolve) => {
  let visibleLength = 0;

  const tick = () => {
    visibleLength += Math.max(1, Math.ceil(fullText.length / 60));
    const nextText = fullText.slice(0, visibleLength);

    updateChatbotMessage(messageId, {
      text: nextText,
      isLoading: false,
      transient: true,
    });

    if (visibleLength >= fullText.length) {
      finalizeChatbotMessage(messageId);
      resolve();
      return;
    }

    window.setTimeout(tick, TYPING_STEP_MS);
  };

  tick();
});

export const initChatbot = () => {
  const messagesNode = document.getElementById("chatMessages");
  const inputNode = document.getElementById("chatInput");
  const formNode = document.getElementById("chatForm");
  const submitButton = document.getElementById("chatSubmitButton");
  const exportButton = document.getElementById("chatExportButton");
  const clearButton = document.getElementById("chatClearButton");
  const contextLabel = document.getElementById("chatContextLabel");
  const quickButtons = [...document.querySelectorAll(".question-chip")];

  if (!messagesNode || !inputNode || !formNode || !submitButton) {
    return;
  }

  const syncControls = (currentState) => {
    const disabled = currentState.isLoading;
    submitButton.disabled = disabled;
    inputNode.disabled = disabled;
    quickButtons.forEach((button) => {
      button.disabled = disabled;
    });

    if (contextLabel) {
      contextLabel.textContent = currentState.context.label;
    }
  };

  const render = (currentState) => {
    messagesNode.innerHTML = currentState.messages.map(renderMessage).join("");
    syncControls(currentState);
    messagesNode.scrollTop = messagesNode.scrollHeight;
  };

  subscribeChatbotState(render);

  const sendPrompt = async (rawPrompt) => {
    const prompt = rawPrompt.trim();
    if (!prompt || !canSendChatbotMessage()) {
      return;
    }

    const userMessage = {
      id: createId("user"),
      role: "user",
      text: prompt,
      createdAt: new Date().toISOString(),
    };

    addChatbotMessage(userMessage);
    inputNode.value = "";
    setChatbotLoading(true);
    markChatbotRequest();
    actions.incrementChatQueries();
    actions.addHistoryEntry({
      type: "chat",
      title: "Consulta al chatbot",
      detail: prompt,
    });

    const loadingMessageId = createId("bot-loading");
    addChatbotMessage({
      id: loadingMessageId,
      role: "bot",
      text: "",
      createdAt: new Date().toISOString(),
      isLoading: true,
      transient: true,
    });

    try {
      const cachedAnswer = getCachedChatbotAnswer(prompt);
      const answer = cachedAnswer || await requestGeminiAnswer({
        context: getChatbotState().context,
        messages: getConversationForApi(),
      });

      if (!cachedAnswer) {
        setCachedChatbotAnswer(prompt, answer);
      }

      updateChatbotMessage(loadingMessageId, {
        text: "",
        isLoading: false,
        transient: true,
      });

      await animateBotResponse(loadingMessageId, answer);
    } catch (error) {
      const errorMessage = getChatbotErrorMessage(error);
      updateChatbotMessage(loadingMessageId, {
        text: errorMessage,
        isLoading: false,
        transient: false,
        isError: true,
      });
      actions.addNotification("Error del chatbot", errorMessage);
    } finally {
      setChatbotLoading(false);
      inputNode.focus();
    }
  };

  formNode.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendPrompt(inputNode.value);
  });

  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void sendPrompt(button.textContent || "");
    });
  });

  clearButton?.addEventListener("click", () => {
    clearCurrentConversation();
  });

  exportButton?.addEventListener("click", () => {
    exportCurrentConversation();
  });
};

export const resetChatbotData = () => {
  clearAllChatbotData();
};
