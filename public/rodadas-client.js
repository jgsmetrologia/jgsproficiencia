const CLIENT_TOKEN_KEY = 'client_token';
const CLIENT_NOME_KEY = 'client_nome';

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logout(){
  const token = localStorage.getItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_NOME_KEY);
  if(token) fetch('/api/client/logout', { method:'POST', headers:{ 'x-client-token': token } }).catch(() => {});
  window.location.replace('/login');
}

async function readJsonResponse(resp){
  const contentType = resp.headers.get('content-type') || '';
  if(!contentType.includes('application/json')){
    throw new Error('O servidor não publicou a API deste site. Faça o deploy/restart do servidor Node e tente novamente.');
  }
  return resp.json();
}

function formatFinalizedDate(value){
  if(!value) return 'Data não informada';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleDateString('pt-BR');
}

function renderOngoingRound(rodada){
  return `
    <a class="client-round-card" href="/ensaio?rodadaId=${encodeURIComponent(rodada._id)}">
      <span class="badge badge-alt">Rodada disponível</span>
      <h2>${escapeHtml(rodada.nome)}</h2>
      <span class="client-round-items-title">Instrumentos</span>
      <ul class="client-round-items">
        ${(rodada.itens || []).map(item => `<li>${escapeHtml(item.titulo)}</li>`).join('')}
      </ul>
      <strong>Escolher rodada →</strong>
    </a>`;
}

function renderResultRound(rodada){
  const itens = (rodada.itens || []).map(item => item.titulo).filter(Boolean);
  const visibleItems = itens.slice(0, 4);
  if(itens.length > 4) visibleItems.push(`+${itens.length - 4}`);
  const resultAction = rodada.temResultado
    ? `<div class="client-result-actions">
        <button type="button" class="client-result-btn" data-result-action="view" data-id="${escapeHtml(rodada._id)}">Ver PDF</button>
        <button type="button" class="client-result-btn secondary" data-result-action="download" data-id="${escapeHtml(rodada._id)}">Baixar PDF</button>
      </div>
      <span class="client-result-status" data-result-status="${escapeHtml(rodada._id)}" role="status"></span>`
    : '<strong class="client-result-soon">Resultado em breve</strong>';

  return `
    <article class="client-round-card client-result-card">
      <span class="badge badge-alt">Finalizada</span>
      <h2>${escapeHtml(rodada.nome)}</h2>
      <span class="client-round-items-title">Instrumentos</span>
      <ul class="client-round-items">
        ${visibleItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p class="client-round-finalized">Finalizada em ${escapeHtml(formatFinalizedDate(rodada.finalizadaEm))}</p>
      ${resultAction}
    </article>`;
}

async function openResultPdf(btn){
  const token = localStorage.getItem(CLIENT_TOKEN_KEY);
  const id = btn.dataset.id;
  const action = btn.dataset.resultAction;
  const status = btn.closest('.client-result-card').querySelector(`[data-result-status="${id}"]`);
  const previewWindow = action === 'view' ? window.open('', '_blank') : null;
  if(action === 'view' && !previewWindow){
    status.textContent = 'Permita a abertura de novas abas para visualizar o PDF.';
    return;
  }

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = action === 'view' ? 'Carregando...' : 'Baixando...';
  status.textContent = '';
  try{
    const resp = await fetch(`/api/client/rodadas/${encodeURIComponent(id)}/resultado`, {
      headers: { 'x-client-token': token }
    });
    if(!resp.ok){
      if(resp.status === 401) logout();
      const data = await readJsonResponse(resp);
      throw new Error(data.error || 'Não foi possível carregar o PDF.');
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if(action === 'view'){
      previewWindow.location.href = url;
    }else{
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'resultado_ensaio.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  }catch(error){
    if(previewWindow) previewWindow.close();
    status.textContent = error.message || 'Erro de conexão ao carregar o PDF.';
  }finally{
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function showRoundPanel(panelName){
  const ongoing = panelName === 'ongoing';
  document.getElementById('ongoingPanel').hidden = !ongoing;
  document.getElementById('resultsPanel').hidden = ongoing;
  document.getElementById('showOngoingBtn').classList.toggle('active', ongoing);
  document.getElementById('showResultsBtn').classList.toggle('active', !ongoing);
  document.getElementById('showOngoingBtn').setAttribute('aria-selected', String(ongoing));
  document.getElementById('showResultsBtn').setAttribute('aria-selected', String(!ongoing));
}

async function loadRodadas(){
  const token = localStorage.getItem(CLIENT_TOKEN_KEY);
  if(!token){ window.location.replace('/login'); return; }

  document.getElementById('clientName').textContent = `Olá, ${localStorage.getItem(CLIENT_NOME_KEY) || ''}`;
  try{
    const resp = await fetch('/api/client/rodadas', { headers:{ 'x-client-token': token } });
    const data = await readJsonResponse(resp);
    if(!resp.ok || !data.ok){
      if(resp.status === 401) return logout();
      throw new Error(data.error || 'Não foi possível carregar as rodadas.');
    }

    const rodadas = data.rodadas || [];
    const ongoing = rodadas.filter(rodada => !rodada.finalizada && rodada.ativo);
    const finalized = rodadas.filter(rodada => rodada.finalizada);
    document.getElementById('rodadasEmpty').hidden = ongoing.length > 0;
    document.getElementById('resultsEmpty').hidden = finalized.length > 0;
    document.getElementById('rodadasList').innerHTML = ongoing.map(renderOngoingRound).join('');
    document.getElementById('resultRodadasList').innerHTML = finalized.map(renderResultRound).join('');
    document.querySelectorAll('[data-result-action]').forEach(btn => {
      btn.addEventListener('click', () => openResultPdf(btn));
    });
    showRoundPanel('ongoing');
  }catch(error){
    document.getElementById('rodadasError').textContent = error.message;
  }
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('showOngoingBtn').addEventListener('click', () => showRoundPanel('ongoing'));
document.getElementById('showResultsBtn').addEventListener('click', () => showRoundPanel('results'));
loadRodadas();
