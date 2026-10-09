const CLIENT_TOKEN_KEY = 'client_token';
const CLIENT_NOME_KEY = 'client_nome';

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logout(){
  const token = localStorage.getItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_NOME_KEY);
  if(token) fetch('/api/client/logout', { method:'POST', headers:{ 'x-client-token': token } }).catch(() => {});
  window.location.replace('/login.html');
}

async function readJsonResponse(resp){
  const contentType = resp.headers.get('content-type') || '';
  if(!contentType.includes('application/json')){
    throw new Error('O servidor não publicou a API deste site. Faça o deploy/restart do servidor Node e tente novamente.');
  }
  return resp.json();
}

async function loadRodadas(){
  const token = localStorage.getItem(CLIENT_TOKEN_KEY);
  if(!token){ window.location.replace('/login.html'); return; }

  document.getElementById('clientName').textContent = `Olá, ${localStorage.getItem(CLIENT_NOME_KEY) || ''}`;
  try{
    const resp = await fetch('/api/client/rodadas', { headers:{ 'x-client-token': token } });
    const data = await readJsonResponse(resp);
    if(!resp.ok || !data.ok){
      if(resp.status === 401) return logout();
      throw new Error(data.error || 'Não foi possível carregar as rodadas.');
    }

    const rodadas = data.rodadas || [];
    if(rodadas.length === 1){
      window.location.replace(`/rodada-form.html?rodadaId=${encodeURIComponent(rodadas[0]._id)}`);
      return;
    }
    document.getElementById('rodadasEmpty').hidden = rodadas.length > 0;
    document.getElementById('rodadasList').innerHTML = rodadas.map(rodada => `
      <a class="client-round-card" href="/rodada-form.html?rodadaId=${encodeURIComponent(rodada._id)}">
        <span class="badge badge-alt">Rodada disponível</span>
        <h2>${escapeHtml(rodada.nome)}</h2>
        <span class="client-round-items-title">Instrumentos</span>
        <ul class="client-round-items">
          ${(rodada.itens || []).map(item => `<li>${escapeHtml(item.titulo)}</li>`).join('')}
        </ul>
        <strong>Escolher rodada →</strong>
      </a>`).join('');
  }catch(error){
    document.getElementById('rodadasError').textContent = error.message;
  }
}

document.getElementById('logoutBtn').addEventListener('click', logout);
loadRodadas();