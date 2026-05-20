import { loadConvenio, getValidatedConveniosRegistry } from "../services/convenio-modular.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const currency = (value) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
}).format(normalizeNumber(value, 0));

const getQuerySlug = () => new URLSearchParams(window.location.search).get("convenio") || "";

const replaceConvenioUrl = (slug) => {
  window.history.replaceState({}, "", `calculadora.html?convenio=${encodeURIComponent(slug)}`);
};

const matchFormula = (formula, matcher) => {
  const normalizedMatcher = normalizeText(matcher);
  return normalizedMatcher && [formula?.id, formula?.nombre, formula?.base].some((value) => normalizeText(value).includes(normalizedMatcher));
};

const isActiveFormula = (formula) => normalizeText(formula?.estado || "activo") !== "inactivo";

const getCategoria = (convenio, categoriaId) => convenio.categorias.find((item) => (
  item.id === categoriaId || normalizeText(item.nombre) === normalizeText(categoriaId)
)) || null;

const getEscala = (convenio, categoriaId, periodo, zona) => {
  const categoria = getCategoria(convenio, categoriaId);
  return convenio.escalas.find((item) => (
    item.categoriaId === categoria?.id
    && (!periodo || item.periodo === periodo)
    && (!zona || normalizeText(item.zona || "general") === normalizeText(zona))
  )) || convenio.escalas.find((item) => item.categoriaId === categoria?.id) || null;
};

const applyPercentageFormula = (formula, baseValue, multiplier = 1) => ({
  id: formula.id,
  nombre: formula.nombre,
  monto: baseValue * (normalizeNumber(formula.valor, 0) / 100) * multiplier,
});

const buildState = () => ({
  registry: [],
  convenio: null,
  step: 1,
  tab: "calculadora",
  loadError: "",
  worker: {
    nombre: "Juan Pérez",
    cuil: "20-12345678-0",
    ingreso: "",
    estadoCivil: "soltero",
    categoria: "",
    zona: "general",
    contratacion: "convencional",
  },
  periodo: {
    periodo: "",
    dias: 30,
  },
  horas: {
    normales: 0,
    feriadosTrabajados: 0,
    feriadosNoTrabajados: 0,
  },
  adicionales: {},
  flags: {
    presentismo: true,
    zona: false,
  },
  extras: {
    extra50: 0,
    extra100: 0,
  },
});

const state = buildState();

const getPrimaryColor = () => state.convenio?.ui?.colorPrimario || "#5f67ff";

const getVisibleSteps = () => [
  { id: 1, label: "Trabajador" },
  { id: 2, label: "Período" },
  { id: 3, label: "Horas" },
  { id: 4, label: "Adicionales" },
  { id: 5, label: "H. Extra" },
  { id: 6, label: "Resultado" },
];

const getPeriods = (convenio) => [...new Set(convenio.escalas.map((item) => item.periodo).filter(Boolean))];

const getDynamicFormulas = (convenio) => (convenio.formulas || [])
  .filter(isActiveFormula)
  .filter((formula) => ![
    "antig",
    "present",
    "asistencia",
    "zona",
    "extra 50",
    "extra 100",
    "hora extra",
    "horas extra",
  ].some((pattern) => matchFormula(formula, pattern)));

const calculateConvenio = () => {
  const convenio = state.convenio;
  if (!convenio) {
    return null;
  }

  const categoria = getCategoria(convenio, state.worker.categoria);
  const escala = getEscala(convenio, state.worker.categoria, state.periodo.periodo, state.worker.zona);
  const formulas = (convenio.formulas || []).filter(isActiveFormula);
  const ui = convenio.ui || {};
  const baseMonto = normalizeNumber(escala?.monto, 0);
  const horasBaseMensual = Math.max(1, normalizeNumber(ui.horasBaseMensual, 200));
  const horasNormales = normalizeNumber(state.horas.normales, 0);
  const baseSalary = ui.modoBase === "horario" ? baseMonto * horasNormales : baseMonto;

  const antigFormula = formulas.find((formula) => matchFormula(formula, "antig"));
  const presentismoFormula = formulas.find((formula) => matchFormula(formula, "present") || matchFormula(formula, "asistencia"));
  const zonaFormula = formulas.find((formula) => matchFormula(formula, "zona"));
  const extra50Formula = formulas.find((formula) => matchFormula(formula, "extra 50"));
  const extra100Formula = formulas.find((formula) => matchFormula(formula, "extra 100"));
  const years = state.worker.ingreso
    ? Math.max(0, new Date().getFullYear() - new Date(state.worker.ingreso).getFullYear())
    : 0;

  const antiguedadItem = ui.mostrarAntiguedad && antigFormula && years > 0
    ? applyPercentageFormula(antigFormula, baseSalary, years)
    : null;

  const presentismoBase = baseSalary + normalizeNumber(antiguedadItem?.monto, 0);
  const presentismoItem = ui.mostrarPresentismo && state.flags.presentismo && presentismoFormula
    ? applyPercentageFormula(presentismoFormula, presentismoBase)
    : null;

  const dynamicAdditionalItems = getDynamicFormulas(convenio)
    .filter((formula) => state.adicionales[formula.id])
    .map((formula) => applyPercentageFormula(formula, baseSalary))
    .filter(Boolean);

  const subtotal = baseSalary
    + normalizeNumber(antiguedadItem?.monto, 0)
    + normalizeNumber(presentismoItem?.monto, 0)
    + dynamicAdditionalItems.reduce((sum, item) => sum + normalizeNumber(item.monto, 0), 0);

  const zonaItem = ui.mostrarZona && state.flags.zona && zonaFormula
    ? applyPercentageFormula(zonaFormula, subtotal)
    : null;

  const valorHora = ui.modoBase === "horario"
    ? baseMonto
    : subtotal / horasBaseMensual;
  const feriadosNoTrabajados = normalizeNumber(state.horas.feriadosNoTrabajados, 0) * valorHora;
  const feriadosTrabajados = normalizeNumber(state.horas.feriadosTrabajados, 0) * valorHora * 2;
  const extra50Factor = extra50Formula ? 1 + (normalizeNumber(extra50Formula.valor, 50) / 100) : 1.5;
  const extra100Factor = extra100Formula ? 1 + (normalizeNumber(extra100Formula.valor, 100) / 100) : 2;
  const horasExtra50 = ui.mostrarHorasExtra ? normalizeNumber(state.extras.extra50, 0) * valorHora * extra50Factor : 0;
  const horasExtra100 = ui.mostrarHorasExtra ? normalizeNumber(state.extras.extra100, 0) * valorHora * extra100Factor : 0;

  const totalBruto = subtotal
    + normalizeNumber(zonaItem?.monto, 0)
    + feriadosNoTrabajados
    + feriadosTrabajados
    + horasExtra50
    + horasExtra100;

  const netoEstimado = totalBruto * (normalizeNumber(ui.netoEstimadoPorcentaje, 83) / 100);

  return {
    convenio,
    categoria,
    escala,
    years,
    baseSalary,
    valorHora,
    antiguedadItem,
    presentismoItem,
    dynamicAdditionalItems,
    zonaItem,
    feriadosNoTrabajados,
    feriadosTrabajados,
    horasExtra50,
    horasExtra100,
    totalAdicionales: normalizeNumber(antiguedadItem?.monto, 0)
      + normalizeNumber(presentismoItem?.monto, 0)
      + dynamicAdditionalItems.reduce((sum, item) => sum + normalizeNumber(item.monto, 0), 0),
    totalZonaExtras: normalizeNumber(zonaItem?.monto, 0) + feriadosNoTrabajados + feriadosTrabajados + horasExtra50 + horasExtra100,
    totalBruto,
    netoEstimado,
  };
};

const renderSidebar = () => {
  const convenio = state.convenio;
  return `
    <aside class="sidebar">
      <div class="brand-card">
        <div class="brand-icon">📁</div>
        <div>
          <div class="brand-title">Calculadora de Convenios</div>
          <div class="brand-sub">Panel principal</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <a class="sidebar-link is-active" href="index.html">Inicio</a>
        <a class="sidebar-link" href="convenios.html">Convenios</a>
        <a class="sidebar-link" href="configuracion.html">Configuración</a>
      </nav>
      <div class="side-panel">
        <div class="side-label">Convenio activo</div>
        <div class="side-name">${convenio?.metadata?.nombre || "-"}</div>
        <div class="side-sub">${convenio?.metadata?.actividad || "Actividad general"}</div>
        <a class="side-button" href="convenios.html">Cambiar convenio</a>
      </div>
      <div class="side-panel">
        <div class="side-name">${convenio?.ui?.titulo || "Calculadora dinámica"}</div>
        <div class="side-sub">Misma interfaz visual, datos cargados por JSON.</div>
      </div>
    </aside>
  `;
};

const renderHeader = () => {
  const convenio = state.convenio;
  const result = calculateConvenio();
  return `
    <section class="page-header">
      <div>
        <h1>${convenio?.ui?.titulo || "Liquidación de sueldos"}</h1>
        <p>${convenio?.metadata?.actividad || "Convenio"} • ${convenio?.metadata?.slug || ""} • ${state.periodo.periodo || "Período a definir"} • ${state.worker.categoria || "Categoría a definir"}</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" data-nav-tab="calculadora">Panel</button>
        <button class="ghost-btn" data-nav-tab="guia">Guía</button>
        <button class="ghost-btn" onclick="window.print()">Imprimir</button>
        <div class="header-badge">
          <span class="badge-avatar">${String(convenio?.metadata?.nombre || "CV").slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>${convenio?.metadata?.nombre || "Convenio"}</strong>
            <small>${currency(result?.totalBruto || 0)}</small>
          </div>
        </div>
      </div>
    </section>
  `;
};

const renderTopTabs = () => `
  <div class="top-tabs">
    <button class="top-tab ${state.tab === "calculadora" ? "is-active" : ""}" data-tab="calculadora">Calculadora</button>
    <button class="top-tab ${state.tab === "guia" ? "is-active" : ""}" data-tab="guia">Guía del Convenio</button>
  </div>
`;

const renderStepper = () => `
  <div class="stepper">
    ${getVisibleSteps().map((step, index) => `
      <div class="step ${state.step === step.id ? "is-active" : state.step > step.id ? "is-done" : ""}">
        <span class="step-number">${step.id}</span>
        <span class="step-label">${step.label}</span>
      </div>
      ${index < getVisibleSteps().length - 1 ? `<div class="step-line ${state.step > step.id ? "is-done" : ""}"></div>` : ""}
    `).join("")}
  </div>
`;

const renderWorkerStep = () => {
  const convenio = state.convenio;
  return `
    <section class="content-card ${state.step === 1 ? "is-active" : ""}" data-step-panel="1">
      <div class="card-head">
        <div class="card-title"><span class="card-index">1</span>Datos del trabajador</div>
        <span class="step-pill">Paso 1 de 6</span>
      </div>
      <div class="field-grid">
        <label class="field"><span>Nombre y apellido</span><input id="workerNombre" value="${state.worker.nombre}"></label>
        <label class="field"><span>CUIL</span><input id="workerCuil" value="${state.worker.cuil}"></label>
        <label class="field"><span>Fecha de ingreso</span><input id="workerIngreso" type="date" value="${state.worker.ingreso}"></label>
        <label class="field"><span>Estado civil / cargas</span><select id="workerEstadoCivil"><option value="soltero" ${state.worker.estadoCivil === "soltero" ? "selected" : ""}>Soltero/a</option><option value="casado" ${state.worker.estadoCivil === "casado" ? "selected" : ""}>Casado/a / cargas</option></select></label>
        <label class="field"><span>Categoría laboral</span><select id="workerCategoria">${convenio.categorias.map((item) => `<option value="${item.id}" ${state.worker.categoria === item.id ? "selected" : ""}>${item.nombre}</option>`).join("")}</select></label>
        <label class="field"><span>Zona</span><select id="workerZona">${convenio.zonas.map((item) => `<option value="${item.id}" ${state.worker.zona === item.id ? "selected" : ""}>${item.nombre}</option>`).join("")}</select></label>
      </div>
      <div class="card-actions"><button class="primary-btn" data-step-next="2">Continuar →</button></div>
    </section>
  `;
};

const renderPeriodStep = () => `
  <section class="content-card ${state.step === 2 ? "is-active" : ""}" data-step-panel="2">
    <div class="card-head">
      <div class="card-title"><span class="card-index">2</span>Período</div>
      <span class="step-pill">Paso 2 de 6</span>
    </div>
    <div class="field-grid">
      <label class="field"><span>Período</span><select id="periodoSelect">${getPeriods(state.convenio).map((periodo) => `<option value="${periodo}" ${state.periodo.periodo === periodo ? "selected" : ""}>${periodo}</option>`).join("")}</select></label>
      <label class="field"><span>Días trabajados</span><input id="periodoDias" type="number" min="0" max="31" value="${state.periodo.dias}"></label>
    </div>
    <div class="card-actions"><button class="ghost-btn" data-step-prev="1">← Anterior</button><button class="primary-btn" data-step-next="3">Continuar →</button></div>
  </section>
`;

const renderHoursStep = () => {
  const horario = state.convenio.ui?.modoBase === "horario";
  return `
    <section class="content-card ${state.step === 3 ? "is-active" : ""}" data-step-panel="3">
      <div class="card-head">
        <div class="card-title"><span class="card-index">3</span>Horas</div>
        <span class="step-pill">Paso 3 de 6</span>
      </div>
      <div class="callout">La base ${horario ? "se calcula por horas normales trabajadas." : "usa el básico mensual de la escala cargada."}</div>
      <div class="field-grid">
        <label class="field"><span>Horas normales</span><input id="horasNormales" type="number" min="0" value="${state.horas.normales}"></label>
        <label class="field"><span>Feriados trabajados</span><input id="horasFeriadosTrabajados" type="number" min="0" value="${state.horas.feriadosTrabajados}"></label>
        <label class="field"><span>Feriados no trabajados</span><input id="horasFeriadosNoTrabajados" type="number" min="0" value="${state.horas.feriadosNoTrabajados}"></label>
      </div>
      <div class="card-actions"><button class="ghost-btn" data-step-prev="2">← Anterior</button><button class="primary-btn" data-step-next="4">Continuar →</button></div>
    </section>
  `;
};

const renderAdditionalToggle = (formula) => `
  <div class="toggle-row">
    <div>
      <div class="toggle-title">${formula.nombre}</div>
      <div class="toggle-sub">${normalizeNumber(formula.valor, 0)}% sobre ${formula.base || "base"}</div>
    </div>
    <label class="switch"><input type="checkbox" data-formula-toggle="${formula.id}" ${state.adicionales[formula.id] ? "checked" : ""}><span></span></label>
  </div>
`;

const renderAdditionalsStep = () => `
  <section class="content-card ${state.step === 4 ? "is-active" : ""}" data-step-panel="4">
    <div class="card-head">
      <div class="card-title"><span class="card-index">4</span>Adicionales</div>
      <span class="step-pill">Paso 4 de 6</span>
    </div>
    ${state.convenio.ui?.mostrarAntiguedad ? `<div class="toggle-row"><div><div class="toggle-title">Antigüedad</div><div class="toggle-sub">Se calcula según fórmula activa y fecha de ingreso.</div></div><span class="tag-chip">Automático</span></div>` : ""}
    ${state.convenio.ui?.mostrarPresentismo ? `<div class="toggle-row"><div><div class="toggle-title">Presentismo</div><div class="toggle-sub">Controlado desde fórmulas del convenio.</div></div><label class="switch"><input type="checkbox" id="flagPresentismo" ${state.flags.presentismo ? "checked" : ""}><span></span></label></div>` : ""}
    ${state.convenio.ui?.mostrarZona ? `<div class="toggle-row"><div><div class="toggle-title">Zona</div><div class="toggle-sub">Aplicar plus por zona si corresponde.</div></div><label class="switch"><input type="checkbox" id="flagZona" ${state.flags.zona ? "checked" : ""}><span></span></label></div>` : ""}
    ${getDynamicFormulas(state.convenio).map(renderAdditionalToggle).join("")}
    <div class="card-actions"><button class="ghost-btn" data-step-prev="3">← Anterior</button><button class="primary-btn" data-step-next="5">Continuar →</button></div>
  </section>
`;

const renderExtrasStep = () => `
  <section class="content-card ${state.step === 5 ? "is-active" : ""}" data-step-panel="5">
    <div class="card-head">
      <div class="card-title"><span class="card-index">5</span>Horas extra</div>
      <span class="step-pill">Paso 5 de 6</span>
    </div>
    <div class="field-grid">
      <label class="field"><span>Horas extra al 50%</span><input id="extra50" type="number" min="0" value="${state.extras.extra50}" ${state.convenio.ui?.mostrarHorasExtra ? "" : "disabled"}></label>
      <label class="field"><span>Horas extra al 100%</span><input id="extra100" type="number" min="0" value="${state.extras.extra100}" ${state.convenio.ui?.mostrarHorasExtra ? "" : "disabled"}></label>
    </div>
    <div class="card-actions"><button class="ghost-btn" data-step-prev="4">← Anterior</button><button class="primary-btn" data-step-next="6">Continuar →</button></div>
  </section>
`;

const renderResultStep = () => {
  const result = calculateConvenio();
  return `
    <section class="content-card ${state.step === 6 ? "is-active" : ""}" data-step-panel="6">
      <div class="card-head">
        <div class="card-title"><span class="card-index">6</span>Resultado</div>
        <span class="step-pill">Paso 6 de 6</span>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><span>Sueldo básico</span><strong>${currency(result?.baseSalary || 0)}</strong></div>
        <div class="stat-card"><span>Total adicionales</span><strong>${currency(result?.totalAdicionales || 0)}</strong></div>
        <div class="stat-card"><span>Zona y extras</span><strong>${currency(result?.totalZonaExtras || 0)}</strong></div>
        <div class="stat-card"><span>Total bruto</span><strong>${currency(result?.totalBruto || 0)}</strong></div>
      </div>
      <div class="result-grid">
        <div class="summary-card">
          <h3>Resumen de Liquidación</h3>
          <div class="summary-row"><span>Sueldo básico</span><strong>${currency(result?.baseSalary || 0)}</strong></div>
          <div class="summary-row"><span>Total adicionales</span><strong>${currency(result?.totalAdicionales || 0)}</strong></div>
          <div class="summary-row"><span>Zona y extras</span><strong>${currency(result?.totalZonaExtras || 0)}</strong></div>
          <div class="summary-total">
            <span>Total bruto</span>
            <strong>${currency(result?.totalBruto || 0)}</strong>
          </div>
          <div class="summary-neto">
            <span>Total neto estimado</span>
            <strong>${currency(result?.netoEstimado || 0)}</strong>
          </div>
        </div>
        <div class="summary-card">
          <h3>Desglose rápido</h3>
          <div class="summary-row"><span>Básico</span><strong>${currency(result?.baseSalary || 0)}</strong></div>
          ${result?.antiguedadItem ? `<div class="summary-row"><span>${result.antiguedadItem.nombre}</span><strong>${currency(result.antiguedadItem.monto)}</strong></div>` : ""}
          ${result?.presentismoItem ? `<div class="summary-row"><span>${result.presentismoItem.nombre}</span><strong>${currency(result.presentismoItem.monto)}</strong></div>` : ""}
          ${(result?.dynamicAdditionalItems || []).map((item) => `<div class="summary-row"><span>${item.nombre}</span><strong>${currency(item.monto)}</strong></div>`).join("")}
          ${result?.zonaItem ? `<div class="summary-row"><span>${result.zonaItem.nombre}</span><strong>${currency(result.zonaItem.monto)}</strong></div>` : ""}
          <div class="summary-row"><span>Horas extra 50%</span><strong>${currency(result?.horasExtra50 || 0)}</strong></div>
          <div class="summary-row"><span>Horas extra 100%</span><strong>${currency(result?.horasExtra100 || 0)}</strong></div>
        </div>
      </div>
      <div class="info-card">
        <h3>Información del Convenio</h3>
        <div class="info-grid">
          <div class="info-item"><span>Convenio</span><strong>${state.convenio.metadata.nombre}</strong></div>
          <div class="info-item"><span>Actividad</span><strong>${state.convenio.metadata.actividad || "General"}</strong></div>
          <div class="info-item"><span>Vigencia</span><strong>${state.periodo.periodo || "-"}</strong></div>
          <div class="info-item"><span>Modalidad</span><strong>${state.convenio.ui.modoBase === "horario" ? "Por horas" : "Mensual"}</strong></div>
        </div>
      </div>
      <div class="card-actions"><button class="ghost-btn" data-step-prev="5">← Anterior</button><button class="primary-btn" data-step-set="1">Nueva liquidación</button></div>
    </section>
  `;
};

const renderGuide = () => `
  <section class="guide-layout ${state.tab === "guia" ? "is-active" : ""}">
    <div class="content-card is-active">
      <div class="card-head">
        <div class="card-title"><span class="card-index">📘</span>Guía del Convenio</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Categoría</th><th>Período</th><th>Zona</th><th>Monto</th></tr></thead>
          <tbody>${state.convenio.escalas.map((item) => `<tr><td>${item.categoriaId}</td><td>${item.periodo || "-"}</td><td>${item.zona || "general"}</td><td>${currency(item.monto)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:16px;">
        <table class="data-table">
          <thead><tr><th>Fórmula</th><th>Tipo</th><th>Base</th><th>Valor</th></tr></thead>
          <tbody>${state.convenio.formulas.map((item) => `<tr><td>${item.nombre}</td><td>${item.tipo || "-"}</td><td>${item.base || "-"}</td><td>${normalizeNumber(item.valor, 0)}%</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  </section>
`;

const renderCalculator = () => `
  <section class="calculator-layout ${state.tab === "calculadora" ? "is-active" : ""}">
    ${renderStepper()}
    ${renderWorkerStep()}
    ${renderPeriodStep()}
    ${renderHoursStep()}
    ${renderAdditionalsStep()}
    ${renderExtrasStep()}
    ${renderResultStep()}
  </section>
`;

const renderApp = () => {
  const root = document.getElementById("app");
  const color = getPrimaryColor();
  document.documentElement.style.setProperty("--primary", color);
  document.title = state.convenio?.ui?.titulo || "Calculadora de Convenios";

  root.innerHTML = `
    <div class="layout-shell">
      ${renderSidebar()}
      <main class="main-content">
        ${renderHeader()}
        ${state.loadError ? `<div class="page-error">${state.loadError}</div>` : ""}
        ${renderTopTabs()}
        ${renderCalculator()}
        ${renderGuide()}
      </main>
    </div>
  `;

  bindEvents();
};

const syncWorker = () => {
  state.worker = {
    nombre: document.getElementById("workerNombre")?.value || state.worker.nombre,
    cuil: document.getElementById("workerCuil")?.value || state.worker.cuil,
    ingreso: document.getElementById("workerIngreso")?.value || "",
    estadoCivil: document.getElementById("workerEstadoCivil")?.value || state.worker.estadoCivil,
    categoria: document.getElementById("workerCategoria")?.value || state.worker.categoria,
    zona: document.getElementById("workerZona")?.value || state.worker.zona,
    contratacion: state.worker.contratacion,
  };
};

const syncPeriodo = () => {
  state.periodo = {
    periodo: document.getElementById("periodoSelect")?.value || state.periodo.periodo,
    dias: normalizeNumber(document.getElementById("periodoDias")?.value, state.periodo.dias),
  };
};

const syncHoras = () => {
  state.horas = {
    normales: normalizeNumber(document.getElementById("horasNormales")?.value, state.horas.normales),
    feriadosTrabajados: normalizeNumber(document.getElementById("horasFeriadosTrabajados")?.value, state.horas.feriadosTrabajados),
    feriadosNoTrabajados: normalizeNumber(document.getElementById("horasFeriadosNoTrabajados")?.value, state.horas.feriadosNoTrabajados),
  };
};

const syncExtras = () => {
  state.extras = {
    extra50: normalizeNumber(document.getElementById("extra50")?.value, state.extras.extra50),
    extra100: normalizeNumber(document.getElementById("extra100")?.value, state.extras.extra100),
  };
};

const bindEvents = () => {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.getAttribute("data-tab");
      renderApp();
    });
  });

  document.querySelectorAll("[data-nav-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.getAttribute("data-nav-tab");
      renderApp();
    });
  });

  document.querySelectorAll("[data-step-next]").forEach((button) => {
    button.addEventListener("click", () => {
      syncWorker();
      syncPeriodo();
      syncHoras();
      syncExtras();
      state.step = normalizeNumber(button.getAttribute("data-step-next"), state.step);
      renderApp();
    });
  });

  document.querySelectorAll("[data-step-prev]").forEach((button) => {
    button.addEventListener("click", () => {
      syncWorker();
      syncPeriodo();
      syncHoras();
      syncExtras();
      state.step = normalizeNumber(button.getAttribute("data-step-prev"), state.step);
      renderApp();
    });
  });

  document.querySelectorAll("[data-step-set]").forEach((button) => {
    button.addEventListener("click", () => {
      state.step = normalizeNumber(button.getAttribute("data-step-set"), 1);
      renderApp();
    });
  });

  document.getElementById("workerCategoria")?.addEventListener("change", () => {
    syncWorker();
    renderApp();
  });
  document.getElementById("workerZona")?.addEventListener("change", () => {
    syncWorker();
    renderApp();
  });
  document.getElementById("workerIngreso")?.addEventListener("change", () => {
    syncWorker();
    renderApp();
  });
  document.getElementById("periodoSelect")?.addEventListener("change", () => {
    syncPeriodo();
    renderApp();
  });
  document.getElementById("periodoDias")?.addEventListener("input", () => {
    syncPeriodo();
    renderApp();
  });
  document.getElementById("horasNormales")?.addEventListener("input", () => {
    syncHoras();
    renderApp();
  });
  document.getElementById("horasFeriadosTrabajados")?.addEventListener("input", () => {
    syncHoras();
    renderApp();
  });
  document.getElementById("horasFeriadosNoTrabajados")?.addEventListener("input", () => {
    syncHoras();
    renderApp();
  });
  document.getElementById("flagPresentismo")?.addEventListener("change", (event) => {
    state.flags.presentismo = event.target.checked;
    renderApp();
  });
  document.getElementById("flagZona")?.addEventListener("change", (event) => {
    state.flags.zona = event.target.checked;
    renderApp();
  });
  document.querySelectorAll("[data-formula-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.adicionales[checkbox.getAttribute("data-formula-toggle")] = checkbox.checked;
      renderApp();
    });
  });
  document.getElementById("extra50")?.addEventListener("input", () => {
    syncExtras();
    renderApp();
  });
  document.getElementById("extra100")?.addEventListener("input", () => {
    syncExtras();
    renderApp();
  });
};

const initConvenio = async (slug) => {
  state.loadError = "";
  try {
    state.convenio = await loadConvenio(slug);
    if (state.convenio?.redirectSlug) {
      replaceConvenioUrl(state.convenio.redirectSlug);
    }
  } catch (error) {
    console.error("[calculadora] load fallback", { slug, error });
    state.loadError = error.message || "No se pudo cargar el convenio solicitado. Se mostró un convenio disponible.";
    const fallbackSlug = state.registry[0]?.slug || "";
    state.convenio = fallbackSlug ? await loadConvenio(fallbackSlug) : null;
    if (state.convenio?.metadata?.slug) {
      replaceConvenioUrl(state.convenio.metadata.slug);
    }
  }

  if (state.convenio) {
    console.log("CATEGORIAS CALCULADORA", state.convenio.categorias);
    console.log("FORMULAS CALCULADORA", state.convenio.formulas);
    state.worker.categoria = state.convenio.categorias[0]?.id || "";
    state.worker.zona = state.convenio.zonas[0]?.id || "general";
    state.periodo.periodo = getPeriods(state.convenio)[0] || "";
    state.horas.normales = state.convenio.ui?.modoBase === "horario" ? 88 : 0;
  }
};

const init = async () => {
  state.registry = await getValidatedConveniosRegistry();
  const initialSlug = getQuerySlug() || state.registry[0]?.slug || "";
  await initConvenio(initialSlug);
  renderApp();
};

init().catch((error) => {
  document.getElementById("app").innerHTML = `<div style="padding:32px;font-family:Arial,sans-serif;">${error.message || "No se pudo iniciar la calculadora."}</div>`;
});
