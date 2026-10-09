(function () {
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildRodadaBlock(rodada) {
    const itensHtml = (rodada.itens || [])
      .map(
        (item) => `
          <div class="scope-card">
            <h3>${escapeHtml(item.titulo)}</h3>
            <p>${escapeHtml(item.descricao)}</p>
          </div>`
      )
      .join("");

    return `
      <div class="rodada-block">
        <span class="badge badge-alt">Itens desta rodada</span>
        <h1>${escapeHtml(rodada.nome)}</h1>
        <div class="grid-3">${itensHtml}</div>
      </div>`;
  }

  async function carregarRodadas() {
    try {
      const resp = await fetch("/api/rodadas");
      const data = await resp.json();

      const container = document.getElementById("rodadasContainer");
      if (!resp.ok || !data.ok || !Array.isArray(data.rodadas) || !data.rodadas.length) {
        return;
      }

      const rodadas = data.rodadas;
      const activeBadge = document.getElementById("rodadaAtualBadge");
      const activeDescription = document.getElementById("rodadaAtualDescricao");
      if (activeBadge) {
        const names = rodadas.map((rodada) => rodada.nome).join(", ");
        activeBadge.textContent = rodadas.length === 1
          ? `Rodada atual: ${names}`
          : `Rodadas atuais: ${names}`;
      }
      if (activeDescription) {
        const description = rodadas.length === 1 ? rodadas[0].descricaoCta : "";
        activeDescription.textContent = description ||
          "Confira abaixo as rodadas atualmente disponíveis e os itens avaliados em cada uma delas.";
      }
      if (container) {
        container.innerHTML = rodadas.map(buildRodadaBlock).join("");
        container.hidden = false;
      }
    } catch (e) {
      console.warn("Não foi possível carregar as rodadas dinamicamente.", e);
    }
  }

  document.addEventListener("DOMContentLoaded", carregarRodadas);
})();
