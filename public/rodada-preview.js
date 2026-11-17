(function () {
  const channelName = 'previa-rodada';
  const protocol = window.JgsRodadaPreviewProtocol;
  const renderer = window.JgsRodadaRenderer;
  const emptyState = document.getElementById('previewEmptyState');
  const formWrap = document.getElementById('dynamic-form-wrap');
  const itemContainer = document.getElementById('itensContainer');
  const saveState = document.getElementById('previewSaveState');
  const connectionState = document.getElementById('previewConnectionState');
  const channel = 'BroadcastChannel' in window
    ? new BroadcastChannel(channelName)
    : null;
  let lastHeartbeat = 0;
  let draft = null;

  function setConnectionState(message) {
    connectionState.textContent = message;
  }

  function renderDraft(nextDraft, saved) {
    const scrollPosition = window.scrollY;
    const openSections = Array.from(itemContainer.querySelectorAll('.dynamic-section'))
      .map(section => section.classList.contains('is-open'));
    const oldSelected = draft && Number.isInteger(draft.selectedItemIndex)
      ? draft.selectedItemIndex
      : -1;

    draft = nextDraft;
    emptyState.hidden = true;
    formWrap.hidden = false;
    document.getElementById('rodadaNome').textContent = draft.nome;
    itemContainer.innerHTML = renderer.renderRoundItems(draft.itens);
    renderer.bindSectionToggles(itemContainer);

    const sections = itemContainer.querySelectorAll('.dynamic-section');
    sections.forEach((section, index) => {
      if (index < openSections.length) {
        section.classList.toggle('is-open', openSections[index]);
      }
    });
    const selectedIndex = draft.selectedItemIndex >= 0
      ? draft.selectedItemIndex
      : oldSelected;
    if (selectedIndex >= 0 && sections[selectedIndex]) {
      sections[selectedIndex].classList.add('is-open');
    }

    formWrap.querySelectorAll('input, button, select, textarea').forEach(control => {
      control.disabled = true;
    });
    saveState.textContent = saved
      ? 'Salvo'
      : 'PRÉVIA — alterações ainda não salvas';
    window.scrollTo(0, scrollPosition);
  }

  if (!protocol || !renderer || !channel) {
    setConnectionState('Prévia em tempo real indisponível neste navegador.');
    return;
  }

  document.getElementById('previewForm').addEventListener('submit', event => {
    event.preventDefault();
  });

  channel.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;
    if (!protocol.isValidPreviewMessage(event.data)) return;

    if (event.data.type === 'draft') {
      lastHeartbeat = Date.now();
      setConnectionState('Conectado ao editor');
      renderDraft(event.data.draft, false);
    } else if (event.data.type === 'saved') {
      lastHeartbeat = Date.now();
      setConnectionState('Conectado ao editor');
      renderDraft(event.data.draft, true);
    } else if (event.data.type === 'heartbeat') {
      lastHeartbeat = Date.now();
      setConnectionState('Conectado ao editor');
    } else if (event.data.type === 'closed') {
      setConnectionState('Conexão com o editor encerrada');
    }
  });

  window.setInterval(() => {
    if (lastHeartbeat && Date.now() - lastHeartbeat > 3000) {
      setConnectionState('Conexão com o editor encerrada');
    }
  }, 1000);

  channel.postMessage({ version: 1, type: 'ready' });
}());
