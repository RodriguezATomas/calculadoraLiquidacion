const formatDateTime = (value) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("es-AR")} ${date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
};

export const renderReviewSummary = ({ document, reviewState }) => `
  <section class="import-review-summary">
    <article class="import-review-stat">
      <span class="import-review-stat__label">PDF</span>
      <strong>${document.fileName}</strong>
    </article>
    <article class="import-review-stat">
      <span class="import-review-stat__label">Paginas</span>
      <strong>${document.totalPages}</strong>
    </article>
    <article class="import-review-stat">
      <span class="import-review-stat__label">Importacion</span>
      <strong>${formatDateTime(reviewState.importedAt)}</strong>
    </article>
    <article class="import-review-stat">
      <span class="import-review-stat__label">Bloques detectados</span>
      <strong>${reviewState.summary.detectedBlocks}</strong>
    </article>
  </section>
`;
