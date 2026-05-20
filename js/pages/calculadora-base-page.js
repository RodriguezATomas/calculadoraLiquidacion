import { detectConvenioConfig, getValidatedConveniosRegistry, loadConvenio } from "../services/convenio-modular.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getQuerySlug = () => new URLSearchParams(window.location.search).get("convenio") || "";

const replaceConvenioUrl = (slug) => {
  window.history.replaceState({}, "", `calculadora-base.html?convenio=${encodeURIComponent(slug)}`);
};

const matchFormula = (formula, matcher) => {
  const normalizedMatcher = normalizeText(matcher);
  return normalizedMatcher && [
    formula?.id,
    formula?.nombre,
    formula?.base,
  ].some((value) => normalizeText(value).includes(normalizedMatcher));
};

const getCategoria = (convenio, categoriaId) => convenio.categorias.find((item) => (
  item.id === categoriaId || normalizeText(item.nombre) === normalizeText(categoriaId)
)) || null;

const getEscala = (convenio, categoriaId) => {
  const categoria = getCategoria(convenio, categoriaId);
  return convenio.escalas.find((item) => item.categoriaId === categoria?.id) || null;
};

const applyFormula = (formula, baseValue, multiplier = 1) => ({
  id: formula.id,
  nombre: formula.nombre,
  monto: baseValue * (normalizeNumber(formula.valor, 0) / 100) * multiplier,
});

const calculateTotals = (convenio, formState) => {
  const categoria = getCategoria(convenio, formState.categoria);
  const escala = getEscala(convenio, formState.categoria);
  const formulas = Array.isArray(convenio.formulas) ? convenio.formulas : [];
  const basico = normalizeNumber(escala?.monto, 0);
  const antiguedadFormula = formulas.find((item) => matchFormula(item, "antig"));
  const presentismoFormula = formulas.find((item) => matchFormula(item, "present") || matchFormula(item, "asistencia"));
  const zonaFormula = formulas.find((item) => matchFormula(item, "zona"));
  const antiguedadItem = formState.antiguedad > 0 && antiguedadFormula
    ? applyFormula(antiguedadFormula, basico, formState.antiguedad)
    : null;
  const presentismoItem = formState.presentismo && presentismoFormula
    ? applyFormula(presentismoFormula, basico)
    : null;
  const subtotal = basico + normalizeNumber(antiguedadItem?.monto, 0) + normalizeNumber(presentismoItem?.monto, 0);
  const zonaItem = formState.zona && zonaFormula
    ? applyFormula(zonaFormula, subtotal)
    : null;
  const valorHora = subtotal / 200;
  const horasExtra50 = formState.horasExtra50 * valorHora * 1.5;
  const horasExtra100 = formState.horasExtra100 * valorHora * 2;
  const total = subtotal + normalizeNumber(zonaItem?.monto, 0) + horasExtra50 + horasExtra100;

  return {
    categoria,
    escala,
    basico,
    antiguedadItem,
    presentismoItem,
    zonaItem,
    horasExtra50,
    horasExtra100,
    total,
  };
};

const renderCategorias = (convenio, selectedCategoria) => `
  <option value="">Seleccione categoria</option>
  ${convenio.categorias.map((item, index) => {
    const value = item.id || item.nombre || `categoria-${index + 1}`;
    const label = item.nombre || item.title || `Categoria ${index + 1}`;
    return `<option value="${value}" ${value === selectedCategoria ? "selected" : ""}>${label}</option>`;
  }).join("")}
`;

const renderEscalas = (convenio) => convenio.escalas.map((item, index) => `
  <tr>
    <td>${item.categoriaId || `cat-${index + 1}`}</td>
    <td>${item.periodo || "-"}</td>
    <td>${item.zona || "-"}</td>
    <td>${normalizeNumber(item.monto, 0)}</td>
  </tr>
`).join("");

const renderFormulas = (convenio) => convenio.formulas.map((item, index) => `
  <tr>
    <td>${item.nombre || `Formula ${index + 1}`}</td>
    <td>${item.base || "-"}</td>
    <td>${item.tipo || "-"}</td>
    <td>${normalizeNumber(item.valor, 0)}</td>
  </tr>
`).join("");

const renderResultado = (result) => `
  <div class="stats-row">
    <article class="stats-card"><div><strong class="stats-card__value">${Math.round(result.basico || 0)}</strong><span class="stats-card__label">Basico</span></div></article>
    <article class="stats-card"><div><strong class="stats-card__value">${Math.round((result.antiguedadItem?.monto || 0) + (result.presentismoItem?.monto || 0))}</strong><span class="stats-card__label">Adicionales</span></div></article>
    <article class="stats-card"><div><strong class="stats-card__value">${Math.round((result.zonaItem?.monto || 0) + result.horasExtra50 + result.horasExtra100)}</strong><span class="stats-card__label">Zona / extras</span></div></article>
    <article class="stats-card"><div><strong class="stats-card__value">${Math.round(result.total || 0)}</strong><span class="stats-card__label">Total</span></div></article>
  </div>
`;

const state = {
  registry: [],
  convenio: null,
  loadError: "",
  form: {
    categoria: "",
    antiguedad: 0,
    presentismo: true,
    zona: false,
    horasExtra50: 0,
    horasExtra100: 0,
  },
};

const syncForm = () => {
  const categoria = document.getElementById("categoriaSelect")?.value || "";
  state.form = {
    categoria,
    antiguedad: normalizeNumber(document.getElementById("antiguedadInput")?.value, 0),
    presentismo: Boolean(document.getElementById("presentismoInput")?.checked),
    zona: Boolean(document.getElementById("zonaInput")?.checked),
    horasExtra50: normalizeNumber(document.getElementById("horasExtra50Input")?.value, 0),
    horasExtra100: normalizeNumber(document.getElementById("horasExtra100Input")?.value, 0),
  };
};

const renderPage = () => {
  const app = document.getElementById("app");
  const current = state.convenio;
  const errorMessage = state.loadError;
  const config = current?.metadata?.config || detectConvenioConfig(current || {});
  const result = current && state.form.categoria ? calculateTotals(current, state.form) : null;

  app.innerHTML = `
    <div class="dashboard-shell">
      <main class="dashboard-main">
        <section class="convenios-heading">
          <div>
            <h2>Calculadora base</h2>
            <p>Unica calculadora generica con carga dinamica por convenio.</p>
          </div>
        </section>

        <section class="table-panel">
          <div class="panel-header">
            <div>
              <span class="panel-eyebrow">Carga dinamica</span>
              <h3 class="panel-title">Seleccion de convenio</h3>
            </div>
          </div>
          ${errorMessage ? `<div class="callout warn">${errorMessage}</div>` : ""}
          <div class="filters-row">
            <label class="field">
              <span>Convenio</span>
              <select id="convenioSelect">
                ${state.registry.map((item) => `<option value="${item.slug}" ${item.slug === current?.metadata?.slug ? "selected" : ""}>${item.nombre}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Categoria</span>
              <select id="categoriaSelect">${current ? renderCategorias(current, state.form.categoria) : '<option value="">Seleccione categoria</option>'}</select>
            </label>
            ${config.usaAntiguedad ? `<label class="field"><span>Antiguedad</span><input id="antiguedadInput" type="number" min="0" value="${state.form.antiguedad}"></label>` : ""}
            ${config.usaHorasExtra ? `<label class="field"><span>HE 50%</span><input id="horasExtra50Input" type="number" min="0" value="${state.form.horasExtra50}"></label>` : ""}
            ${config.usaHorasExtra ? `<label class="field"><span>HE 100%</span><input id="horasExtra100Input" type="number" min="0" value="${state.form.horasExtra100}"></label>` : ""}
          </div>
          <div class="filters-row">
            ${config.usaPresentismo ? `<label class="field"><span>Presentismo</span><input id="presentismoInput" type="checkbox" ${state.form.presentismo ? "checked" : ""}></label>` : ""}
            ${config.usaZona ? `<label class="field"><span>Zona</span><input id="zonaInput" type="checkbox" ${state.form.zona ? "checked" : ""}></label>` : ""}
          </div>
        </section>

        ${result ? renderResultado(result) : ""}

        <section class="table-panel">
          <div class="panel-header">
            <div>
              <span class="panel-eyebrow">JSON cargados</span>
              <h3 class="panel-title">${current?.metadata?.nombre || "Convenio"}</h3>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Categoria</th><th>Periodo</th><th>Zona</th><th>Monto</th></tr></thead>
              <tbody>${current ? renderEscalas(current) : ""}</tbody>
            </table>
          </div>
          <div class="table-wrap" style="margin-top:16px;">
            <table class="data-table">
              <thead><tr><th>Formula</th><th>Base</th><th>Tipo</th><th>Valor</th></tr></thead>
              <tbody>${current ? renderFormulas(current) : ""}</tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `;

  document.getElementById("convenioSelect")?.addEventListener("change", async (event) => {
    const nextSlug = event.target.value;
    replaceConvenioUrl(nextSlug);
    state.form.categoria = "";
    state.loadError = "";
    try {
      state.convenio = await loadConvenio(nextSlug);
      if (state.convenio?.redirectSlug) {
        replaceConvenioUrl(state.convenio.redirectSlug);
      }
    } catch (error) {
      console.error("[calculadora-base] error al cambiar convenio", {
        slug: nextSlug,
        error,
      });
      state.loadError = error.message || "No se pudo cargar el convenio seleccionado.";
      state.convenio = state.registry[0]?.slug ? await loadConvenio(state.registry[0].slug) : null;
      if (state.convenio?.metadata?.slug) {
        replaceConvenioUrl(state.convenio.metadata.slug);
      }
    }
    renderPage();
  });

  ["categoriaSelect", "antiguedadInput", "horasExtra50Input", "horasExtra100Input", "presentismoInput", "zonaInput"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      syncForm();
      renderPage();
    });
    document.getElementById(id)?.addEventListener("change", () => {
      syncForm();
      renderPage();
    });
  });
};

const init = async () => {
  state.registry = await getValidatedConveniosRegistry();
  const initialSlug = getQuerySlug() || state.registry[0]?.slug || "";
  state.loadError = "";
  if (initialSlug) {
    try {
      state.convenio = await loadConvenio(initialSlug);
      if (state.convenio?.redirectSlug) {
        replaceConvenioUrl(state.convenio.redirectSlug);
      }
    } catch (error) {
      console.error("[calculadora-base] init fallback", {
        initialSlug,
        error,
      });
      state.loadError = error.message || "No se pudo cargar el convenio solicitado.";
      const fallbackSlug = state.registry[0]?.slug || "";
      state.convenio = fallbackSlug ? await loadConvenio(fallbackSlug) : null;
      if (state.convenio?.metadata?.slug) {
        replaceConvenioUrl(state.convenio.metadata.slug);
      }
    }
  }
  renderPage();
};

init().catch((error) => {
  document.getElementById("app").innerHTML = `
    <div class="dashboard-shell">
      <main class="dashboard-main">
        <section class="table-panel">
          <div class="panel-header">
            <div>
              <span class="panel-eyebrow">Error</span>
              <h3 class="panel-title">No se pudo cargar la calculadora</h3>
              <p>${error.message || "Sin detalle"}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
});
