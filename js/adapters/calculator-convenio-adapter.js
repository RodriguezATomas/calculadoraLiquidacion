import {
  calculateSalary,
  getEscala,
  listConveniosDisponibles,
  loadConvenio,
} from "../services/convenio-engine.js";

const inferConvenioFromTitle = () => {
  const title = document.title.toLowerCase();
  const convenios = listConveniosDisponibles();

  return convenios.find((item) => title.includes(String(item.nombre || "").toLowerCase()) || title.includes(String(item.id || "").toLowerCase())) || convenios[0] || null;
};

const buildField = (labelText, id) => {
  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<label>${labelText}</label><select id="${id}"></select>`;
  return field;
};

const renderEnginePreview = (container, convenioId, categoriaValue) => {
  const escala = getEscala(convenioId, categoriaValue);
  const salary = calculateSalary({
    convenio: convenioId,
    categoria: categoriaValue,
    escala: escala.item || { monto: escala.value || 0 },
  });
  const warnings = [...escala.warnings, ...salary.warnings];

  container.innerHTML = `
    <strong>Motor de convenio</strong>
    <div class="prev-grid">
      <div class="pi"><span>Escala</span><span class="pv">${escala.value || 0}</span></div>
      <div class="pi"><span>Adicionales</span><span class="pv">${Math.round(salary.totales.adicionales || 0)}</span></div>
      <div class="pi"><span>Remunerativo</span><span class="pv">${Math.round(salary.totales.remunerativo || 0)}</span></div>
      <div class="pi"><span>Fuente</span><span class="pv">${convenioId}</span></div>
    </div>
    ${warnings.length ? `<div class="hint" style="margin-top:10px;color:#E65100">${warnings.join(" | ")}</div>` : `<div class="hint ok" style="margin-top:10px">Convenio cargado correctamente.</div>`}
  `;
  container.classList.add("show");
};

const initConvenioAdapter = () => {
  const categorySelect = document.getElementById("p1cat");
  if (!categorySelect || !window.ConvenioEngine) {
    return;
  }

  const initialConvenio = inferConvenioFromTitle();
  if (!initialConvenio) {
    return;
  }

  const categoryField = categorySelect.closest(".field");
  if (!categoryField || categoryField.parentElement?.querySelector("#dynamicConvenioSelect")) {
    return;
  }

  const convenioField = buildField("Convenio dinamico", "dynamicConvenioSelect");
  categoryField.parentElement.insertBefore(convenioField, categoryField);
  const convenioSelect = document.getElementById("dynamicConvenioSelect");
  const preview = document.createElement("div");
  preview.id = "dynamicConvenioPreview";
  preview.className = "prev";
  categoryField.parentElement.appendChild(preview);

  listConveniosDisponibles().forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.nombre} (${item.source})`;
    convenioSelect.appendChild(option);
  });

  convenioSelect.value = initialConvenio.id;

  const syncCategories = () => {
    const convenio = loadConvenio(convenioSelect.value);
    const previousValue = categorySelect.value;
    const currentOptions = [{ value: "", label: "Seleccione categoria" }];
    const importedCategories = convenio?.categorias || [];

    if (importedCategories.length) {
      importedCategories.forEach((item, index) => {
        currentOptions.push({
          value: item.id || item.nombre || `categoria-${index + 1}`,
          label: item.nombre || item.title || `Categoria ${index + 1}`,
        });
      });
    } else {
      console.warn("[calculator-convenio-adapter] Convenio sin categorias estructuradas. Se mantiene fallback actual.");
      return;
    }

    categorySelect.innerHTML = currentOptions.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
    categorySelect.value = currentOptions.some((item) => item.value === previousValue) ? previousValue : "";
    renderEnginePreview(preview, convenioSelect.value, categorySelect.value);
  };

  convenioSelect.addEventListener("change", syncCategories);
  categorySelect.addEventListener("change", () => {
    renderEnginePreview(preview, convenioSelect.value, categorySelect.value);
  });

  syncCategories();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initConvenioAdapter);
} else {
  initConvenioAdapter();
}
