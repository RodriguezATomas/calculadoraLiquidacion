import { buildGeminiContents, buildSystemInstruction } from "./chatbot-prompts.js";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 30000;

class ChatbotApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "ChatbotApiError";
    this.code = code;
    this.status = status;
  }
}

const createTimeoutController = () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  return { controller, timeoutId };
};

const extractResponseText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new ChatbotApiError("empty_response", "Gemini no devolvió texto en la respuesta.");
  }

  return text;
};

const mapHttpError = async (response) => {
  let detail = "";

  try {
    const payload = await response.json();
    detail = payload?.error?.message || "";
  } catch {
    detail = "";
  }

  if (response.status === 400) {
    throw new ChatbotApiError("bad_request", detail || "La solicitud a Gemini fue rechazada.", 400);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ChatbotApiError("invalid_key", detail || "La API key de Gemini es inválida o no tiene permisos.", response.status);
  }

  if (response.status === 429) {
    throw new ChatbotApiError("rate_limited", detail || "Se alcanzó el límite de requests de Gemini.", 429);
  }

  if (response.status >= 500) {
    throw new ChatbotApiError("api_unavailable", detail || "Gemini no está disponible en este momento.", response.status);
  }

  throw new ChatbotApiError("request_failed", detail || "No se pudo completar la consulta a Gemini.", response.status);
};

export const requestGeminiAnswer = async ({ context, messages }) => {
  const geminiConfig = window.GEMINI_CONFIG || {};
  const apiKey = (geminiConfig.API_KEY || "").trim();
  const model = (geminiConfig.MODEL || "gemini-2.5-flash").trim() || "gemini-2.5-flash";

  if (!apiKey) {
    throw new ChatbotApiError("missing_key", "Completá `config/gemini-config.js` con tu API key de Gemini.");
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(context) }],
        },
        contents: buildGeminiContents(messages),
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          topK: 32,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      await mapHttpError(response);
    }

    const payload = await response.json();
    return extractResponseText(payload);
  } catch (error) {
    if (error instanceof ChatbotApiError) {
      throw error;
    }

    if (error?.name === "AbortError" || error === "timeout") {
      throw new ChatbotApiError("timeout", "Gemini tardó demasiado en responder. Intentá de nuevo.");
    }

    throw new ChatbotApiError("network_error", "No se pudo conectar con Gemini. Revisá tu conexión a internet.");
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getChatbotErrorMessage = (error) => {
  if (error instanceof ChatbotApiError) {
    return error.message;
  }

  return "Ocurrió un error inesperado al consultar Gemini.";
};

export const testGeminiConnection = async () => {
  const response = await requestGeminiAnswer({
    context: {
      key: "config-test",
      label: "Prueba de conexión",
      path: "configuracion.html",
      description: "Validación manual desde configuración",
    },
    messages: [
      { role: "user", text: "Respondé solo con OK." },
    ],
  });

  return response;
};
