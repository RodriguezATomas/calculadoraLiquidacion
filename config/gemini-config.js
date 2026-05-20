(function bootstrapGeminiConfig() {
  const STORAGE_KEY = "gemini_runtime_config_v1";
  const fallbackConfig = {
    API_KEY: "AIzaSyDEu2oN7HT6FpCFLkoGSuSEYqU0NlwIRVU",
    MODEL: "gemini-2.5-flash",
  };

  const readStoredConfig = function readStoredConfig() {
    try {
      const rawValue = localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        return {};
      }

      const parsed = JSON.parse(rawValue);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  };

  const buildConfig = function buildConfig() {
    return {
      ...fallbackConfig,
      ...readStoredConfig(),
    };
  };

  window.GEMINI_CONFIG_STORAGE_KEY = STORAGE_KEY;
  window.getGeminiConfig = buildConfig;
  window.setGeminiConfig = function setGeminiConfig(nextConfig) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
    } catch {
      // noop
    }

    window.GEMINI_CONFIG = buildConfig();
  };
  window.GEMINI_CONFIG = buildConfig();
})();
