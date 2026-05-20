const renderItems = (section) => (
  section.items.length
    ? section.items.map((item, index) => `
      <article class="review-item-card" data-review-item-card="${section.key}">
        <div class="review-item-card__header">
          <strong>${item.title || `Item ${index + 1}`}</strong>
          <button type="button" class="table-action" data-review-delete="${section.key}" data-review-index="${index}" aria-label="Eliminar">×</button>
        </div>
        <textarea class="review-item-card__textarea" data-review-text="${section.key}" data-review-index="${index}">${item.text}</textarea>
        <div class="review-item-card__meta">
          <span>${item.pageNumber ? `Pagina ${item.pageNumber}` : "Manual"}</span>
          <span>Score ${item.score ?? 0}</span>
        </div>
      </article>
    `).join("")
    : `<div class="review-item-card review-item-card--empty">Sin elementos cargados.</div>`
);

export const renderReviewSection = (section) => `
  <article class="import-review-section">
    <div class="import-review-section__header">
      <label class="import-review-section__toggle">
        <input type="checkbox" data-review-enabled="${section.key}" ${section.enabled ? "checked" : ""}>
        <span>Importar ${section.title.toLowerCase()}</span>
      </label>
      <div class="import-review-section__actions">
        <button type="button" class="outline-button" data-review-add="${section.key}">Agregar manualmente</button>
        <button type="button" class="ghost-button" data-review-collapse="${section.key}">${section.collapsed ? "Expandir" : "Colapsar"}</button>
      </div>
    </div>
    ${section.collapsed ? "" : `
      <div class="import-review-section__body">
        <div class="import-review-section__items">
          ${renderItems(section)}
        </div>
      </div>
    `}
  </article>
`;
