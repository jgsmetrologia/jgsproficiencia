(function (root, factory) {
  const renderer = factory();
  if (typeof module === "object" && module.exports) module.exports = renderer;
  if (root) root.JgsRodadaRenderer = renderer;
}(typeof globalThis === "object" ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fieldHtml(id, label, type = "text", required = true) {
    const safeType = type === "number" ? "number" : "text";
    return `<label>${escapeHtml(label)}<input id="${id}" type="${safeType}" ${safeType === "number" ? 'step="any"' : ""} ${required ? "required" : ""}></label>`;
  }

  function renderPointFields(prefix) {
    return `
    <div class="dynamic-fields">
      ${fieldHtml(`${prefix}_massa_vazia`, "Massa vazia e seca (g)", "number", false)}
      ${fieldHtml(`${prefix}_massa_cheia`, "Massa média cheia (g)", "number", false)}
      ${fieldHtml(`${prefix}_volume`, "Volume medido", "number")}
      ${fieldHtml(`${prefix}_incerteza`, "Incerteza de medição", "number")}
      ${fieldHtml(`${prefix}_k`, "k", "number")}
      ${fieldHtml(`${prefix}_veff`, "Veff", "text")}
      ${fieldHtml(`${prefix}_temp_agua`, "Temperatura da água (°C)", "number")}
      ${fieldHtml(`${prefix}_temp_amb`, "Temperatura ambiente (°C)", "number")}
      ${fieldHtml(`${prefix}_umidade`, "Umidade relativa (%)", "number")}
      ${fieldHtml(`${prefix}_pressao`, "Pressão atmosférica (hPa)", "number")}
      ${fieldHtml(`${prefix}_massa_esp`, "Massa específica da água (g/mL)", "number")}
    </div>`;
  }

  function normalizeOption(option) {
    return option && typeof option === "object" && !Array.isArray(option)
      ? option
      : {};
  }

  function renderOptionFields(options, index) {
    return options.map((rawOption, optionIndex) => {
      const option = normalizeOption(rawOption);
      const name = String(option.nome == null ? "" : option.nome);
      const unit = String(option.unidade == null ? "" : option.unidade);
      const label = `${name}${unit ? ` (${unit})` : ""}`;
      const type = option.tipo === "numero" ? "number" : "text";
      return fieldHtml(`item_${index}_opcao_${optionIndex}`, label, type);
    }).join("");
  }

  function renderItem(rawItem, index) {
    const item = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)
      ? rawItem
      : {};
    const title = String(item.titulo == null ? "" : item.titulo);
    const options = Array.isArray(item.opcoes) ? item.opcoes : [];
    const points = Array.isArray(item.pontos) ? item.pontos : [];

    if (points.length) {
      return `
      <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, "0")} — Item de ensaio</div>
        <div class="dynamic-section-title">${escapeHtml(title)}</div>
        ${options.length
          ? `<div class="dynamic-general-fields">${options.filter(option => normalizeOption(option).repetir === false).map((rawOption, optionIndex) => {
              const option = normalizeOption(rawOption);
              const label = `${option.nome || ""}${option.unidade ? ` (${option.unidade})` : ""}`;
              return fieldHtml(`item_${index}_geral_${optionIndex}`, label, option.tipo === "numero" ? "number" : "text");
            }).join("")}</div>`
          : ""}
        ${points.map((rawPoint, pointIndex) => {
          const point = typeof rawPoint === "string"
            ? { nome: rawPoint, opcoes: [] }
            : rawPoint && typeof rawPoint === "object" && !Array.isArray(rawPoint)
              ? rawPoint
              : { nome: "", opcoes: [] };
          const pointPrefix = `item_${index}_ponto_${pointIndex}`;
          const repeatedOptions = options.filter(option => normalizeOption(option).repetir !== false);
          const pointOptions = [...repeatedOptions, ...(Array.isArray(point.opcoes) ? point.opcoes : [])];
          return `<div class="dynamic-point">
            <h3>${escapeHtml(point.nome)}</h3>
            ${pointOptions.length
              ? `<div class="dynamic-fields">${pointOptions.map((rawOption, optionIndex) => {
                  const option = normalizeOption(rawOption);
                  const label = `${option.nome || ""}${option.unidade ? ` (${option.unidade})` : ""}`;
                  return fieldHtml(`${pointPrefix}_opcao_${optionIndex}`, label, option.tipo === "numero" ? "number" : "text");
                }).join("")}</div>`
              : renderPointFields(pointPrefix)}
          </div>`;
        }).join("")}
      </section>`;
    }

    if (options.length) {
      return `
      <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, "0")} — Item de ensaio</div>
        <div class="dynamic-section-title">${escapeHtml(title)}</div>
        <div class="dynamic-fields">${renderOptionFields(options, index)}</div>
      </section>`;
    }

    return `
    <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, "0")} — Item de ensaio</div>
      <div class="dynamic-section-title">${escapeHtml(title)}</div>
      ${["Medição"].map((point, pointIndex) => `
        <div class="dynamic-point">
          <h3>${escapeHtml(point)}</h3>
          ${renderPointFields(`item_${index}_ponto_${pointIndex}`)}
        </div>`).join("")}
    </section>`;
  }

  function renderRoundItems(items) {
    return (Array.isArray(items) ? items : []).map(renderItem).join("");
  }

  function bindSectionToggles(root = document) {
    root.querySelectorAll(".dynamic-section-title").forEach(title => {
      title.setAttribute("role", "button");
      title.setAttribute("tabindex", "0");
      title.setAttribute("aria-expanded", "true");
      const toggle = () => {
        const section = title.closest(".dynamic-section");
        const expanded = section.classList.toggle("is-open");
        title.setAttribute("aria-expanded", String(expanded));
      };
      title.addEventListener("click", toggle);
      title.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  return { escapeHtml, fieldHtml, renderPointFields, renderRoundItems, bindSectionToggles };
}));
