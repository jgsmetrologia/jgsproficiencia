let adminPassword = null;
let allSubmissions = [];
let allClients = [];
let clientRodadasUsername = null;

function parseXlsxNumber(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatXlsxDisplayNumber(value) {
  const number = parseXlsxNumber(value);
  if (number === null) return String(value ?? '').trim();
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 10,
    useGrouping: false
  });
}

function buildXlsxWorkbook(rows, codigo, submission) {
  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    if (!current || current.name !== sec) {
      current = { name: sec, items: [] };
      sections.push(current);
    }
    const isMeasurement = label.startsWith('Medição — ') || label.startsWith('Tempo de Escoamento');
    const raw = value != null ? String(value).trim() : '';
    const looksDecimal = /^[+-]?\d+[.,]\d+$/.test(raw); // ex.: 15.65 ou 15,65
    const number = raw !== '' && (isMeasurement || looksDecimal) ? parseXlsxNumber(raw) : null;
    const displayValue = value != null && String(value).trim() !== ''
      ? (number !== null ? formatXlsxDisplayNumber(number) : String(value).trim())
      : '—';
    current.items.push([label, displayValue]);
  });

  const aoa = [
    ['Código do participante', codigo],
    ['Cliente', submission.clientNome || submission.clientUsername || ''],
    ['Enviado em', fmtDate(submission.createdAt)],
    [],
    ['Seção', 'Campo', 'Valor']
  ];
  sections.forEach(sec => {
    sec.items.forEach(([label, value]) => {
      aoa.push([sec.name, label, value]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  Object.keys(ws).forEach(address => {
    if (address[0] === '!') return;
    if (ws[address].t === 'n') ws[address].z = '#,##0.############';
  });
  ws['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  return wb;
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function flashButtonCopied(btn, originalText) {
  const prev = originalText !== undefined ? originalText : btn.textContent;
  btn.textContent = 'Copiado!';
  setTimeout(() => { btn.textContent = prev; }, 1600);
}

function buildClientWelcomeMessage(username, password) {
  return `Bem vindo ao nosso site, seu login é "${username}" e sua senha temporaria é "${password}"

Após o 1° Login você ira poder definir sua senha definitiva

https://jgsproficiencia.com.br/`;
}

document.getElementById('copyTempPwBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyTempPwBtn');
  const username = document.getElementById('tempPwTitle').textContent.split('—').pop().trim();
  const password = document.getElementById('tempPwValue').textContent;
  const value = buildClientWelcomeMessage(username, password);
  const ok = await copyToClipboard(value);
  flashButtonCopied(btn, 'Copiar');
  if (!ok) alert('Não foi possível copiar automaticamente. Selecione a senha manualmente.');
});

const TEMP_PW_CACHE_KEY = 'admin_temp_pw_cache';

function getTempPwCache() {
  try {
    return JSON.parse(localStorage.getItem(TEMP_PW_CACHE_KEY) || '{}');
  } catch (e) { return {}; }
}
function setTempPwCache(username, password) {
  const cache = getTempPwCache();
  cache[username] = password;
  localStorage.setItem(TEMP_PW_CACHE_KEY, JSON.stringify(cache));
}
function removeTempPwCache(username) {
  const cache = getTempPwCache();
  delete cache[username];
  localStorage.setItem(TEMP_PW_CACHE_KEY, JSON.stringify(cache));
}

async function tryLogin() {
  const usernameInput = document.getElementById('usernameInput');
  const input = document.getElementById('passwordInput');
  const errorBox = document.getElementById('loginError');
  const username = usernameInput.value.trim();
  const pwd = input.value.trim();
  errorBox.textContent = '';

  if (!username) {
    errorBox.textContent = 'Digite o usuário.';
    return;
  }
  if (!pwd) {
    errorBox.textContent = 'Digite a senha.';
    return;
  }

  try {
    const resp = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pwd })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Senha incorreta.';
      return;
    }
    adminPassword = pwd;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('panelScreen').style.display = 'block';
    loadSubmissions();
    loadClients();
    loadRodadas();
  } catch (e) {
    errorBox.textContent = 'Erro de conexão. Tente novamente.';
  }
}

document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('usernameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin();
});
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch (e) { return '—'; }
}

async function loadSubmissions() {
  try {
    const resp = await fetch('/api/admin/submissions', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao carregar os dados.');
      return;
    }
    allSubmissions = data.submissions || [];
    renderTable(allSubmissions);
  } catch (e) {
    alert('Erro de conexão ao carregar os dados.');
  }
}

function renderTable(list) {
  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const countLabel = document.getElementById('countLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} envio(s)`;

  if (!list.length) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  list.forEach(sub => {
    const tr = document.createElement('tr');
    const razaoSocial = sub.clientNome || sub.clientUsername || '—';
    const tecnico = (sub.fields && sub.fields.tecnico_nome) || '—';
    const dataCalib = (sub.fields && sub.fields.data_calibracao) || '—';
    const cliente = sub.clientUsername || '—';
    const rodada = sub.rodadaNome || 'Legado';
    tr.innerHTML = `
      <td class="codigo">${sub.codigo}</td>
      <td>${razaoSocial}</td>
      <td class="muted">${tecnico}</td>
      <td class="muted">${cliente}</td>
      <td class="muted">${escapeHtmlAdmin(rodada)}</td>
      <td class="muted">${dataCalib}</td>
      <td class="muted">${fmtDate(sub.createdAt)}</td>
      <td class="actions">
        <button class="view-btn" data-codigo="${sub.codigo}">Ver</button>
        <button class="pdf-btn" data-codigo="${sub.codigo}">PDF</button>
        <button class="xlsx-btn" data-codigo="${sub.codigo}">XLSX</button>
        <button class="del-btn" data-codigo="${sub.codigo}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadPdfFor(btn)));
  tbody.querySelectorAll('.xlsx-btn').forEach(btn => btn.addEventListener('click', () => downloadXlsxFor(btn)));
  tbody.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => viewSubmission(btn)));
  tbody.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', () => deleteSubmission(btn)));
}

async function fetchSubmission(codigo) {
  const resp = await fetch(`/api/admin/submissions/${encodeURIComponent(codigo)}`, {
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar os dados desse envio.');
  return data.submission;
}

async function downloadPdfFor(btn) {
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try {
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const doc = buildPdf(rows, codigo);
    doc.save(`resultados_${codigo.replace(/\s+/g, '-')}.pdf`);
  } catch (e) {
    alert(e.message || 'Erro de conexão ao gerar o PDF.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'PDF';
  }
}

async function downloadXlsxFor(btn) {
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try {
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const wb = buildXlsxWorkbook(rows, codigo, submission);
    XLSX.writeFile(wb, `resultados_${codigo.replace(/\s+/g, '-')}.xlsx`);
  } catch (e) {
    alert(e.message || 'Erro de conexão ao gerar o XLSX.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'XLSX';
  }
}

async function viewSubmission(btn) {
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  try {
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

    document.getElementById('viewTitle').textContent = `Envio — ${codigo}`;
    const cliente = submission.clientNome || submission.clientUsername || '—';
    document.getElementById('viewSub').textContent = `Cliente: ${cliente} · Enviado em: ${fmtDate(submission.createdAt)}`;

    const content = document.getElementById('viewContent');
    content.innerHTML = sections.map(sec => `
      <div class="detail-section">
        <h4>${sec.name}</h4>
        <table class="detail-table">
          ${sec.items.map(([label, value]) => `
            <tr><td>${label}</td><td>${value && String(value).trim() !== '' ? value : '—'}</td></tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    openModal('viewModal');
  } catch (e) {
    alert(e.message || 'Erro de conexão ao carregar o envio.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ver';
  }
}

async function deleteSubmission(btn) {
  const codigo = btn.dataset.codigo;
  if (!confirm(`Excluir o envio "${codigo}"? Essa ação não pode ser desfeita.`)) return;

  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const resp = await fetch(`/api/admin/submissions/${encodeURIComponent(codigo)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao excluir o envio.');
      btn.disabled = false;
      btn.textContent = 'Excluir';
      return;
    }
    allSubmissions = allSubmissions.filter(s => s.codigo !== codigo);
    renderTable(allSubmissions);
  } catch (e) {
    alert('Erro de conexão ao excluir o envio.');
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderTable(allSubmissions);
    return;
  }
  const filtered = allSubmissions.filter(sub => {
    const razaoSocial = ((sub.clientNome || sub.clientUsername) || '').toLowerCase();
    const tecnico = ((sub.fields && sub.fields.tecnico_nome) || '').toLowerCase();
    const cliente = (sub.clientUsername || '').toLowerCase();
    return sub.codigo.toLowerCase().includes(q) || razaoSocial.includes(q) || tecnico.includes(q) || cliente.includes(q);
  });
  renderTable(filtered);
});

document.getElementById('refreshBtn').addEventListener('click', loadSubmissions);

async function loadClients() {
  try {
    const resp = await fetch('/api/admin/clients', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao carregar os clientes.');
      return;
    }
    allClients = data.clients || [];
    renderClientsTable(allClients);
  } catch (e) {
    alert('Erro de conexão ao carregar os clientes.');
  }
}

function renderClientsTable(list) {
  const tbody = document.getElementById('clientsTableBody');
  const emptyState = document.getElementById('clientsEmptyState');
  const countLabel = document.getElementById('clientCountLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} cliente(s)`;

  if (!list.length) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const pwCache = getTempPwCache();

  list.forEach(client => {
    const tr = document.createElement('tr');
    const statusBadge = client.active
      ? '<span class="badge ok">Ativo</span>'
      : '<span class="badge off">Inativo</span>';
    const pwBadge = client.mustChangePassword
      ? '<span class="badge warn">Aguardando 1º acesso</span>'
      : '<span class="badge ok">Definida</span>';
    const hasCachedPw = client.mustChangePassword && pwCache[client.username];
    if (!client.mustChangePassword && pwCache[client.username]) {
      removeTempPwCache(client.username);
    }
    const copyPwBtn = hasCachedPw
      ? `<button class="view-btn" data-action="copypw" data-username="${client.username}">Copiar senha</button>`
      : '';
    const copyWelcomeBtn = hasCachedPw
      ? `<button class="view-btn" data-action="copywelcome" data-username="${client.username}">Copiar mensagem</button>`
      : '';

    tr.innerHTML = `
      <td class="codigo">${client.username}</td>
      <td>${client.nome || '—'}</td>
      <td>${statusBadge}</td>
      <td>${pwBadge}</td>
      <td class="muted">${fmtDate(client.createdAt)}</td>
      <td class="actions">
        ${copyPwBtn}
        ${copyWelcomeBtn}
        <button class="view-btn" data-action="reset" data-username="${client.username}">Resetar senha</button>
        <button class="view-btn" data-action="rodadas" data-username="${client.username}">Rodadas</button>
        <button class="view-btn" data-action="toggle" data-username="${client.username}" data-active="${client.active}">${client.active ? 'Desativar' : 'Ativar'}</button>
        <button class="del-btn" data-action="delete" data-username="${client.username}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="copypw"]').forEach(btn => btn.addEventListener('click', () => copyClientTempPassword(btn)));
  tbody.querySelectorAll('[data-action="copywelcome"]').forEach(btn => btn.addEventListener('click', () => copyClientWelcomeMessage(btn)));
  tbody.querySelectorAll('[data-action="reset"]').forEach(btn => btn.addEventListener('click', () => resetClientPassword(btn)));
  tbody.querySelectorAll('[data-action="rodadas"]').forEach(btn => btn.addEventListener('click', () => openClientRodadas(btn.dataset.username)));
  tbody.querySelectorAll('[data-action="toggle"]').forEach(btn => btn.addEventListener('click', () => toggleClientActive(btn)));
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteClient(btn)));
}

function openClientRodadas(username) {
  const client = allClients.find(item => item.username === username);
  if (!client) return;

  clientRodadasUsername = username;
  document.getElementById('clientRodadasTitle').textContent = `Rodadas — ${username}`;
  document.getElementById('clientRodadasError').textContent = '';

  const assigned = new Set(Array.isArray(client.rodadaIds) ? client.rodadaIds.map(String) : []);
  const list = document.getElementById('clientRodadasList');
  list.innerHTML = allRodadas.length
    ? allRodadas.map(rodada => `
      <label class="client-rodada-option">
        <input type="checkbox" value="${rodada._id}" ${assigned.has(String(rodada._id)) ? 'checked' : ''}>
        <span><strong>${escapeHtmlAdmin(rodada.nome)}</strong><small>${rodada.ativo ? 'Ativa' : 'Inativa'}</small></span>
      </label>`).join('')
    : '<p class="hint">Cadastre uma rodada antes de atribuí-la.</p>';

  openModal('clientRodadasModal');
}

document.getElementById('saveClientRodadasBtn').addEventListener('click', async () => {
  if (!clientRodadasUsername) return;

  const btn = document.getElementById('saveClientRodadasBtn');
  const errorBox = document.getElementById('clientRodadasError');
  const rodadaIds = Array.from(document.querySelectorAll('#clientRodadasList input[type="checkbox"]:checked'))
    .map(input => input.value);

  btn.disabled = true;
  errorBox.textContent = '';
  try {
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(clientRodadasUsername)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ rodadaIds })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Erro ao salvar as rodadas.';
      return;
    }
    closeModal('clientRodadasModal');
    loadClients();
  } catch (e) {
    errorBox.textContent = 'Erro de conexão ao salvar as rodadas.';
  } finally {
    btn.disabled = false;
  }
});

async function copyClientTempPassword(btn) {
  const username = btn.dataset.username;
  const cache = getTempPwCache();
  const pwd = cache[username];
  if (!pwd) { alert('Senha temporária não disponível neste navegador. Use "Resetar senha" para gerar uma nova.'); return; }
  const ok = await copyToClipboard(pwd);
  flashButtonCopied(btn, 'Copiar senha');
  if (!ok) alert('Não foi possível copiar automaticamente.');
}

async function copyClientWelcomeMessage(btn) {
  const username = btn.dataset.username;
  const cache = getTempPwCache();
  const pwd = cache[username];
  if (!pwd) { alert('Senha temporária não disponível neste navegador. Use "Resetar senha" para gerar uma nova.'); return; }
  const ok = await copyToClipboard(buildClientWelcomeMessage(username, pwd));
  flashButtonCopied(btn, 'Copiar mensagem');
  if (!ok) alert('Não foi possível copiar automaticamente.');
}

document.getElementById('createClientBtn').addEventListener('click', async () => {
  const usernameInput = document.getElementById('newClientUsername');
  const nomeInput = document.getElementById('newClientNome');
  const errorBox = document.getElementById('newClientError');
  const btn = document.getElementById('createClientBtn');
  errorBox.textContent = '';

  const username = usernameInput.value.trim();
  const nome = nomeInput.value.trim();

  if (!username) {
    errorBox.textContent = 'Informe um nome de usuário.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando...';
  try {
    const resp = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ username, nome })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Erro ao criar o cliente.';
      return;
    }
    usernameInput.value = '';
    nomeInput.value = '';
    setTempPwCache(data.username, data.tempPassword);
    loadClients();

    document.getElementById('tempPwTitle').textContent = `Senha temporária — ${data.username}`;
    document.getElementById('tempPwValue').textContent = data.tempPassword;
    openModal('tempPwModal');
  } catch (e) {
    errorBox.textContent = 'Erro de conexão ao criar o cliente.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar cliente';
  }
});

async function resetClientPassword(btn) {
  const username = btn.dataset.username;
  if (!confirm(`Gerar uma nova senha temporária para "${username}"? A sessão atual dele será encerrada.`)) return;

  btn.disabled = true;
  try {
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ resetPassword: true })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao resetar a senha.');
      return;
    }
    setTempPwCache(username, data.tempPassword);
    loadClients();
    document.getElementById('tempPwTitle').textContent = `Nova senha temporária — ${username}`;
    document.getElementById('tempPwValue').textContent = data.tempPassword;
    openModal('tempPwModal');
  } catch (e) {
    alert('Erro de conexão ao resetar a senha.');
  } finally {
    btn.disabled = false;
  }
}

async function toggleClientActive(btn) {
  const username = btn.dataset.username;
  const isActive = btn.dataset.active === 'true';
  const nextActive = !isActive;

  btn.disabled = true;
  try {
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ active: nextActive })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao atualizar o cliente.');
      return;
    }
    loadClients();
  } catch (e) {
    alert('Erro de conexão ao atualizar o cliente.');
  } finally {
    btn.disabled = false;
  }
}

async function deleteClient(btn) {
  const username = btn.dataset.username;
  if (!confirm(`Excluir o cliente "${username}"? Ele perderá o acesso ao formulário. Os envios já feitos não serão apagados.`)) return;

  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao excluir o cliente.');
      btn.disabled = false;
      btn.textContent = 'Excluir';
      return;
    }
    allClients = allClients.filter(c => c.username !== username);
    renderClientsTable(allClients);
  } catch (e) {
    alert('Erro de conexão ao excluir o cliente.');
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
}

document.getElementById('clientSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderClientsTable(allClients);
    return;
  }
  const filtered = allClients.filter(c =>
    c.username.toLowerCase().includes(q) || (c.nome || '').toLowerCase().includes(q)
  );
  renderClientsTable(filtered);
});

document.getElementById('refreshClientsBtn').addEventListener('click', loadClients);

let allRodadas = [];
let editingRodadaId = null;

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/"/g, '&quot;');
}

function escapeHtmlAdmin(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createOptionRow(nome = '', unidade = '', tipo = 'numero', repetir = true) {
  const row = document.createElement('div');
  row.className = 'rodada-opcao-row';
  row.innerHTML = `
    <input class="rodada-opcao-nome" type="text" placeholder="Nome da opção" value="${escapeAttr(nome)}">
    <input class="rodada-opcao-unidade" type="text" placeholder="Unidade" value="${escapeAttr(unidade)}">
    <select class="rodada-opcao-tipo" aria-label="Tipo da opção">
      <option value="numero" ${tipo === 'numero' ? 'selected' : ''}>Número</option>
      <option value="texto" ${tipo === 'texto' ? 'selected' : ''}>Texto</option>
    </select>
    <select class="rodada-opcao-aplicacao" aria-label="Aplicação da opção">
      <option value="todos" ${repetir !== false ? 'selected' : ''}>Todos os pontos</option>
      <option value="uma" ${repetir === false ? 'selected' : ''}>Uma vez</option>
    </select>
    <button type="button" class="del-btn remove-rodada-opcao">Remover</button>`;
  row.querySelector('.remove-rodada-opcao').addEventListener('click', () => row.remove());
  return row;
}

function createOptionList(options = []) {
  const list = document.createElement('div');
  list.className = 'rodada-opcoes-list';
  options.forEach(option => {
    list.appendChild(createOptionRow(option.nome || '', option.unidade || '', option.tipo || 'numero', option.repetir !== false));
  });
  if (!options.length) list.appendChild(createOptionRow());
  return list;
}

function createPointPanel(point = {}) {
  const panel = document.createElement('div');
  panel.className = 'rodada-ponto-panel';
  panel.innerHTML = `
    <div class="rodada-ponto-head">
      <input class="rodada-ponto-nome" type="text" placeholder="Nome do ponto (ex.: 1 mL)" value="${escapeAttr(point.nome || '')}">
      <button type="button" class="del-btn remove-rodada-ponto">Remover ponto</button>
    </div>
    <div class="rodada-ponto-opcoes"></div>
    <button type="button" class="secondary add-rodada-opcao">+ Nova linha</button>`;
  const optionsList = createOptionList(point.opcoes || []);
  panel.querySelector('.rodada-ponto-opcoes').appendChild(optionsList);
  panel.querySelector('.add-rodada-opcao').addEventListener('click', () => optionsList.appendChild(createOptionRow()));
  panel.querySelector('.remove-rodada-ponto').addEventListener('click', () => panel.remove());
  return panel;
}

function createRodadaItemRow(titulo, descricao, opcoes, pontos) {
  const row = document.createElement('div');
  row.className = 'rodada-item-row';
  row.innerHTML = `
    <button type="button" class="rodada-item-tab">${escapeHtmlAdmin(titulo || 'Novo equipamento')}</button>
    <div class="rodada-item-panel">
      <div class="rodada-item-fields">
        <input type="text" class="rodada-item-titulo" placeholder="Nome do equipamento" value="${escapeAttr(titulo)}">
        <input type="text" class="rodada-item-descricao" placeholder="Descrição do equipamento" value="${escapeAttr(descricao)}">
      </div>
      <label class="rodada-multi-label"><input type="checkbox" class="rodada-item-multi" ${pontos && pontos.length ? 'checked' : ''}> Este equipamento possui múltiplos pontos</label>
      <div class="rodada-item-opcoes-diretas"></div>
      <button type="button" class="secondary add-rodada-opcao-direta">+ Nova linha</button>
      <div class="rodada-pontos-wrap" ${pontos && pontos.length ? '' : 'hidden'}>
        <div class="rodada-pontos-list"></div>
        <button type="button" class="secondary add-rodada-ponto">+ Novo ponto</button>
      </div>
      <button type="button" class="del-btn remove-rodada-item">Remover equipamento</button>
    </div>`;

  const tab = row.querySelector('.rodada-item-tab');
  const panel = row.querySelector('.rodada-item-panel');
  const titleInput = row.querySelector('.rodada-item-titulo');
  const directOptions = row.querySelector('.rodada-item-opcoes-diretas');
  const directOptionsList = createOptionList(Array.isArray(opcoes) ? opcoes : []);
  const pointsWrap = row.querySelector('.rodada-pontos-wrap');
  const pointsList = row.querySelector('.rodada-pontos-list');
  const directAddButton = row.querySelector('.add-rodada-opcao-direta');
  row.classList.add('active');
  directOptions.appendChild(directOptionsList);
  (pontos || []).forEach(point => pointsList.appendChild(createPointPanel(typeof point === 'string' ? { nome: point } : point)));
  directOptions.insertAdjacentHTML('beforebegin', '<div class="rodada-options-title">Opções gerais do equipamento</div>');

  tab.addEventListener('click', () => {
    row.parentElement.querySelectorAll('.rodada-item-row').forEach(item => item.classList.remove('active'));
    row.classList.add('active');
  });
  titleInput.addEventListener('input', () => { tab.textContent = titleInput.value.trim() || 'Novo equipamento'; });
  row.querySelector('.rodada-item-multi').addEventListener('change', event => {
    const enabled = event.target.checked;
    pointsWrap.hidden = !enabled;
    if (enabled && !pointsList.children.length) pointsList.appendChild(createPointPanel());
  });
  row.querySelector('.add-rodada-opcao-direta').addEventListener('click', () => directOptionsList.appendChild(createOptionRow()));
  row.querySelector('.add-rodada-ponto').addEventListener('click', () => pointsList.appendChild(createPointPanel()));
  row.querySelector('.remove-rodada-item').addEventListener('click', () => row.remove());
  return row;
}

document.getElementById('addRodadaItemBtn').addEventListener('click', () => {
  const list = document.getElementById('rodadaItensList');
  list.querySelectorAll('.rodada-item-row').forEach(item => item.classList.remove('active'));
  list.appendChild(createRodadaItemRow('', ''));
});

function resetRodadaForm() {
  editingRodadaId = null;
  document.getElementById('rodadaFormTitle').textContent = 'Nova rodada';
  document.getElementById('rodadaNomeInput').value = '';
  document.getElementById('rodadaDescricaoInput').value = '';
  document.getElementById('rodadaAtivaInput').checked = true;

  const list = document.getElementById('rodadaItensList');
  list.innerHTML = '';
  list.appendChild(createRodadaItemRow('', ''));

  document.getElementById('saveRodadaBtn').textContent = 'Criar rodada';
  document.getElementById('cancelRodadaEditBtn').style.display = 'none';
  document.getElementById('rodadaError').textContent = '';
  document.getElementById('rodadaSaveStatus').textContent = '';
}

document.getElementById('cancelRodadaEditBtn').addEventListener('click', resetRodadaForm);

async function loadRodadas() {
  const errorBox = document.getElementById('rodadaError');
  errorBox.textContent = '';
  try {
    const resp = await fetch('/api/admin/rodadas', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Erro ao carregar as rodadas.';
      return;
    }
    allRodadas = data.rodadas || [];
    renderRodadasTable(allRodadas);
    if (!document.getElementById('rodadaItensList').children.length) {
      resetRodadaForm();
    }
  } catch (e) {
    errorBox.textContent = 'Erro de conexão ao carregar as rodadas.';
  }
}

function renderRodadasTable(list) {
  const tbody = document.getElementById('rodadasTableBody');
  const emptyState = document.getElementById('rodadasEmptyState');
  const countLabel = document.getElementById('rodadaCountLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} rodada(s)`;

  if (!list.length) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  list.forEach(rodada => {
    const tr = document.createElement('tr');
    const statusBadge = rodada.ativo
      ? '<span class="badge ok">Ativa</span>'
      : '<span class="badge off">Inativa</span>';
    const qtdItens = (rodada.itens || []).length;

    tr.innerHTML = `
      <td>${escapeHtmlAdmin(rodada.nome)}</td>
      <td class="muted">${qtdItens} item(ns)</td>
      <td>${statusBadge}</td>
      <td class="muted">${fmtDate(rodada.createdAt)}</td>
      <td class="actions">
        <button class="view-btn" data-action="edit" data-id="${rodada._id}">Editar</button>
        <button class="view-btn" data-action="toggle" data-id="${rodada._id}" data-active="${rodada.ativo}">${rodada.ativo ? 'Desativar' : 'Ativar'}</button>
        <button class="del-btn" data-action="delete" data-id="${rodada._id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => editRodada(btn.dataset.id)));
  tbody.querySelectorAll('[data-action="toggle"]').forEach(btn => btn.addEventListener('click', () => toggleRodadaAtiva(btn)));
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteRodada(btn.dataset.id)));
}

function editRodada(id) {
  const rodada = allRodadas.find(r => r._id === id);
  if (!rodada) return;

  editingRodadaId = id;
  document.getElementById('rodadaFormTitle').textContent = `Editando: ${rodada.nome}`;
  document.getElementById('rodadaNomeInput').value = rodada.nome || '';
  document.getElementById('rodadaDescricaoInput').value = rodada.descricaoCta || '';
  document.getElementById('rodadaAtivaInput').checked = !!rodada.ativo;

  const list = document.getElementById('rodadaItensList');
  list.innerHTML = '';
  const itens = rodada.itens || [];
  if (itens.length) {
    itens.forEach(item => list.appendChild(createRodadaItemRow(item.titulo || '', item.descricao || '', item.opcoes || [], item.pontos || [])));
  } else {
    list.appendChild(createRodadaItemRow('', ''));
  }

  document.getElementById('saveRodadaBtn').textContent = 'Salvar alterações';
  document.getElementById('cancelRodadaEditBtn').style.display = 'inline-block';
  document.getElementById('rodadaError').textContent = '';
  document.getElementById('rodadaSaveStatus').textContent = '';

  document.getElementById('tab-rodada').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleRodadaAtiva(btn) {
  const id = btn.dataset.id;
  const isActive = btn.dataset.active === 'true';

  btn.disabled = true;
  try {
    const resp = await fetch(`/api/admin/rodadas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ ativo: !isActive })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao atualizar a rodada.');
      return;
    }
    loadRodadas();
  } catch (e) {
    alert('Erro de conexão ao atualizar a rodada.');
  } finally {
    btn.disabled = false;
  }
}

async function deleteRodada(id) {
  const rodada = allRodadas.find(r => r._id === id);
  const nome = rodada ? rodada.nome : 'esta rodada';
  if (!confirm(`Excluir a rodada "${nome}"? Essa ação não pode ser desfeita.`)) return;

  try {
    const resp = await fetch(`/api/admin/rodadas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Erro ao excluir a rodada.');
      return;
    }
    if (editingRodadaId === id) resetRodadaForm();
    loadRodadas();
  } catch (e) {
    alert('Erro de conexão ao excluir a rodada.');
  }
}

document.getElementById('saveRodadaBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveRodadaBtn');
  const errorBox = document.getElementById('rodadaError');
  const statusLabel = document.getElementById('rodadaSaveStatus');
  errorBox.textContent = '';
  statusLabel.textContent = '';

  const nome = document.getElementById('rodadaNomeInput').value.trim();
  const descricaoCta = document.getElementById('rodadaDescricaoInput').value.trim();
  const ativo = document.getElementById('rodadaAtivaInput').checked;

  const readOptions = list => Array.from(list.querySelectorAll(':scope > .rodada-opcao-row'))
    .map(option => ({
      nome: option.querySelector('.rodada-opcao-nome').value.trim(),
      unidade: option.querySelector('.rodada-opcao-unidade').value.trim(),
      tipo: option.querySelector('.rodada-opcao-tipo').value,
      repetir: option.querySelector('.rodada-opcao-aplicacao').value === 'todos',
    }))
    .filter(option => option.nome);

  const itens = Array.from(document.querySelectorAll('#rodadaItensList .rodada-item-row')).map(row => {
    const multi = row.querySelector('.rodada-item-multi').checked;
    const item = {
      titulo: row.querySelector('.rodada-item-titulo').value.trim(),
      descricao: row.querySelector('.rodada-item-descricao').value.trim(),
      opcoes: readOptions(row.querySelector('.rodada-item-opcoes-diretas .rodada-opcoes-list')),
      pontos: [],
    };

    if (multi) {
      item.pontos = Array.from(row.querySelectorAll('.rodada-pontos-list > .rodada-ponto-panel')).map(point => ({
        nome: point.querySelector('.rodada-ponto-nome').value.trim(),
        opcoes: readOptions(point.querySelector('.rodada-opcoes-list')),
      })).filter(point => point.nome);
    }

    return item;
  }).filter(it => it.titulo);

  if (!nome) {
    errorBox.textContent = 'Informe o nome da rodada.';
    return;
  }
  if (!itens.length) {
    errorBox.textContent = 'Adicione ao menos um item/equipamento.';
    return;
  }

  const isEditing = !!editingRodadaId;

  btn.disabled = true;
  btn.textContent = isEditing ? 'Salvando...' : 'Criando...';
  try {
    const url = isEditing ? `/api/admin/rodadas/${encodeURIComponent(editingRodadaId)}` : '/api/admin/rodadas';
    const method = isEditing ? 'PUT' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ nome, descricaoCta, itens, ativo })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Erro ao salvar a rodada.';
      return;
    }

    resetRodadaForm();
    statusLabel.textContent = isEditing ? 'Alterações salvas!' : 'Rodada criada!';
    loadRodadas();
  } catch (e) {
    errorBox.textContent = 'Erro de conexão ao salvar a rodada.';
  } finally {
    btn.disabled = false;
    btn.textContent = isEditing ? 'Salvar alterações' : 'Criar rodada';
  }
});

document.getElementById('refreshRodadasBtn').addEventListener('click', loadRodadas);

prepareLogoForPdf();
