(function (root, factory) {
  const utils = factory();
  if (typeof module === "object" && module.exports) module.exports = utils;
  if (root) root.JgsRodadaEditorUtils = utils;
}(typeof globalThis === "object" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  }

  function normalizeOption(option) {
    const source = option && typeof option === "object" ? option : {};
    const nome = String(source.nome == null ? "" : source.nome);
    if (!nome.trim()) return null;

    return {
      nome,
      unidade: String(source.unidade == null ? "" : source.unidade),
      tipo: normalizeText(source.tipo) === "texto" || normalizeText(source.tipo) === "text"
        ? "texto"
        : "numero",
      repetir: true,
    };
  }

  function normalizeItemForEditor(rawItem) {
    const item = rawItem && typeof rawItem === "object" ? rawItem : {};
    const legacyOptions = (Array.isArray(item.opcoes) ? item.opcoes : [])
      .map(normalizeOption)
      .filter(Boolean);
    const rawPoints = Array.isArray(item.pontos)
      ? item.pontos
      : String(item.pontos || "")
        .split(",")
        .map(nome => nome.trim())
        .filter(Boolean);
    const points = rawPoints.length
      ? rawPoints.map(point => typeof point === "string"
        ? { nome: point, opcoes: [] }
        : point && typeof point === "object"
          ? point
          : { nome: "", opcoes: [] })
      : [{ nome: "Medição", opcoes: [] }];

    return {
      titulo: String(item.titulo == null ? "" : item.titulo),
      descricao: String(item.descricao == null ? "" : item.descricao),
      opcoes: [],
      pontos: points.map(point => ({
        nome: String(point.nome == null ? "" : point.nome),
        opcoes: [
          ...legacyOptions,
          ...(Array.isArray(point.opcoes) ? point.opcoes : [])
            .map(normalizeOption)
            .filter(Boolean),
        ].map(option => ({ ...option })),
      })),
    };
  }

  function buildOptionCatalog(rounds, currentItems = [], excludedRoundId = "", now = Date.now()) {
    const catalog = new Map();
    const addOption = (rawOption, timestamp) => {
      const option = normalizeOption(rawOption);
      if (!option) return;

      const key = JSON.stringify([
        normalizeText(option.nome),
        normalizeText(option.unidade),
        option.tipo,
      ]);
      const existing = catalog.get(key);
      if (existing) {
        existing.count += 1;
        if (timestamp >= existing.lastUsedAt) {
          existing.nome = option.nome;
          existing.unidade = option.unidade;
          existing.tipo = option.tipo;
          existing.lastUsedAt = timestamp;
        }
      } else {
        catalog.set(key, { ...option, count: 1, lastUsedAt: timestamp });
      }
    };
    const addItem = (item, timestamp) => {
      (Array.isArray(item && item.opcoes) ? item.opcoes : [])
        .forEach(option => addOption(option, timestamp));
      (Array.isArray(item && item.pontos) ? item.pontos : [])
        .forEach(point => (Array.isArray(point && point.opcoes) ? point.opcoes : [])
          .forEach(option => addOption(option, timestamp)));
    };

    (Array.isArray(rounds) ? rounds : []).forEach(round => {
      if (excludedRoundId && String(round && round._id) === String(excludedRoundId)) return;
      const timestamp = Date.parse(round && (round.updatedAt || round.createdAt)) || 0;
      (Array.isArray(round && round.itens) ? round.itens : [])
        .forEach(item => addItem(item, timestamp));
    });

    (Array.isArray(currentItems) ? currentItems : [])
      .forEach(item => addItem(item, now));

    return Array.from(catalog.values()).sort((a, b) =>
      b.count - a.count
      || b.lastUsedAt - a.lastUsedAt
      || normalizeText(a.nome).localeCompare(normalizeText(b.nome), "pt-BR")
      || normalizeText(a.unidade).localeCompare(normalizeText(b.unidade), "pt-BR")
      || a.tipo.localeCompare(b.tipo)
    );
  }

  return { normalizeText, normalizeItemForEditor, buildOptionCatalog };
}));
