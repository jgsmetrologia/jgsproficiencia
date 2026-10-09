const TOKEN_KEY = 'client_token';
const NOME_KEY = 'client_nome';

function getClientToken(){ return localStorage.getItem(TOKEN_KEY); }

function logoutClient(){
  const token = getClientToken();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NOME_KEY);
  if (token) {
    fetch('/api/client/logout', { method:'POST', headers:{ 'x-client-token': token } }).catch(() => {});
  }
  window.location.replace('login.html');
}

async function verifyClientSession(){
  const token = getClientToken();
  if (!token) { window.location.replace('login.html'); return; }

  try{
    const resp = await fetch('/api/client/me', { headers: { 'x-client-token': token } });
    const data = await resp.json();
    if (!resp.ok || !data.ok || data.mustChangePassword) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NOME_KEY);
      window.location.replace('login.html');
      return;
    }
    localStorage.setItem(NOME_KEY, data.nome);
    const nameEl = document.getElementById('clientBarName');
    if (nameEl) nameEl.textContent = `Olá, ${data.nome}`;
    loadSubmissions();
  }catch(e){
    window.location.replace('login.html');
  }
}
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.me-modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

function fmtDate(iso){
  if(!iso) return '—';
  try{
    return new Date(iso).toLocaleString('pt-BR');
  }catch(e){ return '—'; }
}

let allSubmissions = [];

async function loadSubmissions(){
  try{
    const resp = await fetch('/api/client/submissions', {
      headers: { 'x-client-token': getClientToken() }
    });
    const data = await resp.json();
    if (resp.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NOME_KEY);
      window.location.replace('login.html');
      return;
    }
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao carregar os seus envios.');
      return;
    }
    allSubmissions = data.submissions || [];
    renderTable(allSubmissions);
  }catch(e){
    alert('Erro de conexão ao carregar os seus envios.');
  }
}

function renderTable(list){
  const tbody = document.getElementById('meTableBody');
  const emptyState = document.getElementById('meEmptyState');
  const countLabel = document.getElementById('meCountLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} envio(s)`;

  if(!list.length){
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  list.forEach(sub => {
    const tr = document.createElement('tr');
    const tecnico = (sub.fields && sub.fields.tecnico_nome) || '—';
    const dataCalib = (sub.fields && sub.fields.data_calibracao) || '—';
    const rodada = sub.rodadaNome || 'Legado';

    tr.innerHTML = `
      <td class="codigo">${sub.codigo}</td>
      <td>${rodada}</td>
      <td class="muted">${tecnico}</td>
      <td class="muted">${dataCalib}</td>
      <td class="muted">${fmtDate(sub.createdAt)}</td>
      <td class="actions">
        <button class="me-view-btn" data-codigo="${sub.codigo}">Ver</button>
        <button class="me-pdf-btn" data-codigo="${sub.codigo}">PDF</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.me-view-btn').forEach(btn => btn.addEventListener('click', () => viewSubmission(btn)));
  tbody.querySelectorAll('.me-pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadPdfFor(btn)));
}

async function fetchSubmission(codigo){
  const resp = await fetch(`/api/client/submissions/${encodeURIComponent(codigo)}`, {
    headers: { 'x-client-token': getClientToken() }
  });
  const data = await resp.json();
  if(!resp.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar os dados desse envio.');
  return data.submission;
}

async function viewSubmission(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];

    const sections = [];
    let current = null;
    rows.slice(1).forEach(([sec, label, value]) => {
      if (!current || current.name !== sec) {
        current = { name: sec, items: [] };
        sections.push(current);
      }
      current.items.push([label, value]);
    });

    document.getElementById('meViewTitle').textContent = `Envio — ${codigo}`;
    const tecnico = (submission.fields && submission.fields.tecnico_nome) || '—';
    const rodada = submission.rodadaNome || 'Legado';
    document.getElementById('meViewSub').textContent = `Rodada: ${rodada} · Código do participante: ${codigo} · Técnico: ${tecnico} · Enviado em: ${fmtDate(submission.createdAt)}`;

    const content = document.getElementById('meViewContent');
    content.innerHTML = sections.map(sec => `
      <div class="me-detail-section">
        <h4>${sec.name}</h4>
        <table class="me-detail-table">
          ${sec.items.map(([label, value]) => `
            <tr><td>${label}</td><td>${value && String(value).trim() !== '' ? value : '—'}</td></tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    openModal('meViewModal');
  }catch(e){
    alert(e.message || 'Erro de conexão ao carregar o envio.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'Ver';
  }
}

async function downloadPdfFor(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const doc = buildPdf(rows, codigo);
    doc.save(`resultados_${codigo.replace(/\s+/g,'-')}.pdf`);
  }catch(e){
    alert(e.message || 'Erro de conexão ao gerar o PDF.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'PDF';
  }
}

document.getElementById('meSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){
    renderTable(allSubmissions);
    return;
  }
  const filtered = allSubmissions.filter(sub => {
    const codigo = sub.codigo.toLowerCase();
    const tecnico = ((sub.fields && sub.fields.tecnico_nome) || '').toLowerCase();
    return codigo.includes(q) || tecnico.includes(q);
  });
  renderTable(filtered);
});

document.getElementById('logoutBtn').addEventListener('click', logoutClient);

prepareLogoForPdf();
verifyClientSession();
