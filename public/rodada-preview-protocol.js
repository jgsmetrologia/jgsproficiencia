(function (root, factory) {
  const protocol = factory();
  if (typeof module === "object" && module.exports) module.exports = protocol;
  if (root) root.JgsRodadaPreviewProtocol = protocol;
}(typeof globalThis === "object" ? globalThis : this, function () {
  const MAX_ITEMS = 500;
  const MAX_OPTIONS = 500;
  const MAX_POINTS = 500;

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isText(value, maxLength) {
    return typeof value === "string" && value.length <= maxLength;
  }

  function hasKeys(value, keys) {
    const actual = Object.keys(value).sort();
    return actual.length === keys.length
      && actual.every((key, index) => key === keys.slice().sort()[index]);
  }

  function isOption(value) {
    return isPlainObject(value)
      && hasKeys(value, ["nome", "unidade", "tipo", "repetir"])
      && isText(value.nome, 10000)
      && isText(value.unidade, 1000)
      && (value.tipo === "numero" || value.tipo === "texto")
      && typeof value.repetir === "boolean";
  }

  function isPoint(value) {
    return isPlainObject(value)
      && hasKeys(value, ["nome", "opcoes"])
      && isText(value.nome, 10000)
      && Array.isArray(value.opcoes)
      && value.opcoes.length <= MAX_OPTIONS
      && value.opcoes.every(isOption);
  }

  function isItem(value) {
    return isPlainObject(value)
      && hasKeys(value, ["titulo", "descricao", "opcoes", "pontos"])
      && isText(value.titulo, 10000)
      && isText(value.descricao, 10000)
      && Array.isArray(value.opcoes)
      && value.opcoes.length <= MAX_OPTIONS
      && value.opcoes.every(isOption)
      && Array.isArray(value.pontos)
      && value.pontos.length <= MAX_POINTS
      && value.pontos.every(isPoint);
  }

  function isDraft(value) {
    return isPlainObject(value)
      && hasKeys(value, ["roundId", "nome", "descricaoCta", "ativo", "selectedItemIndex", "itens"])
      && isText(value.roundId, 256)
      && isText(value.nome, 10000)
      && isText(value.descricaoCta, 10000)
      && typeof value.ativo === "boolean"
      && Array.isArray(value.itens)
      && value.itens.length <= MAX_ITEMS
      && value.itens.every(isItem)
      && Number.isInteger(value.selectedItemIndex)
      && value.selectedItemIndex >= -1
      && (value.selectedItemIndex === -1 || value.selectedItemIndex < value.itens.length);
  }

  function isValidPreviewMessage(value) {
    if (!isPlainObject(value) || value.version !== 1 || typeof value.type !== "string") {
      return false;
    }

    if (value.type === "ready" || value.type === "heartbeat" || value.type === "closed") {
      return Object.keys(value).length === 2;
    }

    return (value.type === "draft" || value.type === "saved")
      && Object.keys(value).length === 3
      && isDraft(value.draft);
  }

  return { isDraft, isValidPreviewMessage };
}));
