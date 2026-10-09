const CLIENT_TOKEN_KEY = 'client_token';
const CLIENT_NOME_KEY = 'client_nome';

  let clientNome = '';

function getClientToken(){ return localStorage.getItem(CLIENT_TOKEN_KEY); }

function logoutClient(){
  const token = getClientToken();
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_NOME_KEY);
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
      localStorage.removeItem(CLIENT_TOKEN_KEY);
      localStorage.removeItem(CLIENT_NOME_KEY);
      window.location.replace('login.html');
      return;
    }
    localStorage.setItem(CLIENT_NOME_KEY, data.nome);
    clientNome = data.nome || data.username || '';
    const nameEl = document.getElementById('clientBarName');
    if (nameEl) nameEl.textContent = `Olá, ${data.nome}`;
    const razaoInput = document.getElementById('razao_social');
    if (razaoInput) razaoInput.value = clientNome;
    updateProgress();
  }catch(e){
    window.location.replace('login.html');
  }
}

const USED_CODES_KEY = 'pt_used_codes_v1';

function getUsedCodes(){
  try{
    const raw = localStorage.getItem(USED_CODES_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}

function saveUsedCode(code){
  try{
    const codes = getUsedCodes();
    codes.push(code);
    localStorage.setItem(USED_CODES_KEY, JSON.stringify(codes));
  }catch(e){
  }
}

function generateCode(){
  const usedCodes = getUsedCodes();
  let code;
  let attempts = 0;
  do{
    const n = Math.floor(100000 + Math.random() * 900000);
    code = `JGS-${n}`;
    attempts++;
  } while(usedCodes.includes(code) && attempts < 2000);
  if(usedCodes.includes(code)){
    code = `PT-${Date.now().toString(36).toUpperCase()}`;
  }

  saveUsedCode(code);
  const input = document.getElementById('codigo');
  input.value = code;
  input.classList.remove('missing');
  updateProgress();
}

function buildCycleFields(prefix, sectionKey, placeholder, withMass, unit = 'mL'){
  const massFields = withMass ? `
          <div class="field"><label>Massa vazio e seco (g)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_vazia" 123="51,86"></div>
          <div class="field"><label>Média massa cheio (g)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_cheia" 123="151,56"></div>` : '';
  return `
    <div class="split">
      <div>
        <p class="subhead">Medição</p>
        <div class="field-grid">${massFields}
          <div class="field"><label>Volume medido (${unit})</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_volume" 123="${placeholder.volume}"></div>
          <div class="field"><label>Incerteza de medição (${unit})</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_incerteza" 123="${placeholder.incerteza}"></div>
          <div class="field"><label>k</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_k" 123="${placeholder.k}"></div>
          <div class="field"><label>Veff</label><input type="text" data-section="${sectionKey}" id="${prefix}_veff" 123="ex.: 2 ou infinito"></div>
        </div>
      </div>
      <div>
        <p class="subhead">Condições ambientais</p>
        <div class="field-grid">
          <div class="field"><label>Temperatura água (°C)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_temp_agua" 123="19,8"></div>
          <div class="field"><label>Temperatura ambiente (°C)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_temp_amb" 123="19,5"></div>
          <div class="field"><label>Umidade relativa (%)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_umidade" 123="73"></div>
          <div class="field"><label>Pressão atmosférica (hPa)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_pressao" 123="924,65"></div>
          <div class="field"><label>Massa específica da água (g/mL)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_esp" 123="0,9982"></div>
        </div>
      </div>
    </div>
  `;
}

function buildCycleBlock(container, prefix, sectionKey, label, placeholder, withMass, unit = 'mL'){
  const div = document.createElement('div');
  div.className = 'point';
  div.innerHTML = `<div class="point-title">${label}</div>` + buildCycleFields(prefix, sectionKey, placeholder, withMass, unit);
  container.appendChild(div);
}
function buildCycles(container, idPrefix, sectionKey, placeholder, withMass, unit = 'mL'){
  buildCycleBlock(container, `${idPrefix}_c1`, sectionKey, 'Medição', placeholder, withMass, unit);
}
function buildPointGroup(container, pointPrefix, sectionKey, pointLabel, placeholder, unit = 'mL'){
  const wrapper = document.createElement('div');
  wrapper.className = 'point-group';
  wrapper.innerHTML = `<div class="point-group-title">${pointLabel}</div>`;
  container.appendChild(wrapper);
  buildCycleBlock(wrapper, `${pointPrefix}_c1`, sectionKey, 'Medição', placeholder, false, unit);
}
function buildBuretaEscoamentoField(container){
  const div = document.createElement('div');
  div.className = 'field-grid';
  div.style.marginBottom = '4px';
  div.innerHTML = `
    <div class="field"><label>Tempo de Escoamento (s) — vale para todos os pontos</label><input type="number" step="any" data-section="bureta" id="bureta_tempo_escoamento" 123="28,5"></div>
  `;
  container.appendChild(div);
}

function toggleSection(headEl){
  headEl.parentElement.classList.toggle('open');
}

const allInputs = () => Array.from(document.querySelectorAll('.field-grid input'));

function updateProgress(){
  const inputs = allInputs();
  const filled = inputs.filter(i => i.value.trim() !== '').length;
  const pct = inputs.length ? Math.round((filled / inputs.length) * 100) : 0;

  document.getElementById('gaugePct').textContent = pct + '%';
  document.getElementById('mobilePct').textContent = pct + '%';
  document.getElementById('mobileFill').style.width = pct + '%';

  const liquid = document.getElementById('liquidRect');
  const maxH = 128;
  const h = Math.round((pct/100) * maxH);
  liquid.setAttribute('height', h);
  liquid.setAttribute('y', 8 + (maxH - h));
  const sections = {};
  inputs.forEach(i => {
    const s = i.dataset.section;
    if(!sections[s]) sections[s] = {total:0, filled:0};
    sections[s].total++;
    if(i.value.trim() !== '') sections[s].filled++;
  });
  Object.keys(sections).forEach(s => {
    const el = document.querySelector(`[data-status="${s}"]`);
    if(el) el.textContent = `${sections[s].filled}/${sections[s].total}`;
  });
}
function validate(){
  return allInputs().filter(i => i.value.trim() === '');
}

function collectRows(){
  const g = id => (document.getElementById(id) ? document.getElementById(id).value : '');
  const rows = [];
  rows.push(['Seção','Campo','Valor']);

  rows.push(['Identificação','Código do participante', g('codigo')]);
  rows.push(['Identificação','Data da chegada', g('data_chegada')]);
  rows.push(['Identificação','Data da calibração', g('data_calibracao')]);
  rows.push(['Identificação','Data da saída', g('data_saida')]);

  const cycleFields = (prefix, withMass, unit = 'mL') => {
    const f = [];
    if (withMass) {
      f.push(['Massa vazio e seco (g)', `${prefix}_massa_vazia`]);
      f.push(['Média massa cheio (g)', `${prefix}_massa_cheia`]);
    }
    f.push(
      [`Volume medido (${unit})`, `${prefix}_volume`],
      [`Incerteza de medição (${unit})`, `${prefix}_incerteza`],
      ['k', `${prefix}_k`],
      ['Veff', `${prefix}_veff`],
      ['Temperatura água (°C)', `${prefix}_temp_agua`],
      ['Temperatura ambiente (°C)', `${prefix}_temp_amb`],
      ['Umidade relativa (%)', `${prefix}_umidade`],
      ['Pressão atmosférica (hPa)', `${prefix}_pressao`],
      ['Massa específica da água (g/mL)', `${prefix}_massa_esp`]
    );
    return f;
  };

  const addCycle = (sectionLabel, idPrefix, withMass, unit = 'mL') => {
    const p = `${idPrefix}_c1`;
    cycleFields(p, withMass, unit).forEach(([label, id]) => rows.push([sectionLabel, `Medição — ${label}`, g(id)]));
  };

  addCycle('Balão Volumétrico de 100 mL', 'balao', true);
  addCycle('Pipeta Volumétrica de 10 mL', 'pipeta', false);

  rows.push(['Bureta de Vidro de 10 mL', 'Tempo de Escoamento (s) — vale para todos os pontos', g('bureta_tempo_escoamento')]);
  ['1','5','10'].forEach(pt => {
    addCycle(`Bureta de Vidro de 10 mL — ${pt} mL`, `bureta_${pt}`, false, 'mL');
  });

  ['10','50','100'].forEach(pt => {
    addCycle(`Micropipeta Graduada de 10 μL a 100 μL — ${pt} μL`, `micro_${pt}`, false, 'μL');
  });

  rows.push(['Contato','Razão social', clientNome]);
  rows.push(['Contato','Técnico responsável', g('tecnico_nome')]);

  return rows;
}

function collectFieldsAsObject(){
  const obj = {};
  allInputs().forEach(i => { obj[i.id] = i.value; });
  return obj;
}

async function saveResultsToDatabase(rows, codigo){
  try{
    const resp = await fetch('/api/save-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-token': getClientToken() },
      body: JSON.stringify({
        codigo,
        fields: collectFieldsAsObject(),
        rows
      })
    });
    if(!resp.ok){
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        localStorage.removeItem(CLIENT_TOKEN_KEY);
        localStorage.removeItem(CLIENT_NOME_KEY);
        window.location.replace('login.html');
        return false;
      }
      console.error('Falha ao salvar no banco de dados:', errData.error || resp.status);
      return false;
    }
    return true;
  }catch(e){
    console.error('Erro de rede ao salvar no banco de dados:', e);
    return false;
  }
}

function showSuccessScreen(codigo, fileName){
  document.getElementById('successCodigo').textContent = codigo;
  document.getElementById('successFileName').textContent = fileName;
  document.getElementById('successScreen').classList.add('show');
}

document.getElementById('successNewBtn') && document.getElementById('successNewBtn').addEventListener('click', () => {
  window.location.reload();
});

async function handleSubmit(){
  document.querySelectorAll('.field-grid input.missing').forEach(i => i.classList.remove('missing'));

  const missingInputs = validate();
  const errorBox = document.getElementById('errorList');

  if(missingInputs.length){
    missingInputs.forEach(i => {
      i.classList.add('missing');
      const sectionEl = i.closest('.section');
      if(sectionEl) sectionEl.classList.add('open');
    });

    errorBox.classList.add('show');
    errorBox.innerHTML = `<strong>Ainda há ${missingInputs.length} campo(s) não preenchido(s).</strong> Eles foram destacados em amarelo no formulário.`;
    missingInputs[0].scrollIntoView({behavior:'smooth', block:'center'});
    missingInputs[0].focus();
    return;
  }
  errorBox.classList.remove('show');

  const rows = collectRows();
  const codigo = document.getElementById('codigo').value.trim() || 'participante';
  const fileName = `resultados_${codigo.replace(/\s+/g,'-')}.pdf`;
  const doc = buildPdf(rows, codigo);
  doc.save(fileName);

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  const saved = await saveResultsToDatabase(rows, codigo);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Enviar resultados';

  if (saved) {
    showSuccessScreen(codigo, fileName);
  } else {
    errorBox.classList.add('show');
    errorBox.innerHTML = `<strong>O PDF foi baixado, mas houve uma falha ao enviar os resultados para a JGS.</strong> Verifique sua conexão e clique em "Enviar resultados" novamente.`;
    errorBox.scrollIntoView({behavior:'smooth', block:'center'});
  }
}

buildCycles(document.getElementById('balaoCycles'), 'balao', 'balao',
  {volume:'99,995', incerteza:'0,030', k:'2,00'}, true, 'mL');

buildCycles(document.getElementById('pipetaCycles'), 'pipeta', 'pipeta',
  {volume:'10,006', incerteza:'0,011', k:'4,53'}, false, 'mL');

buildBuretaEscoamentoField(document.getElementById('buretaPoints'));
buildPointGroup(document.getElementById('buretaPoints'), 'bureta_1', 'bureta', 'Volume medido 1 mL', {volume:'1,000', incerteza:'0,010', k:'2,01'}, 'mL');
buildPointGroup(document.getElementById('buretaPoints'), 'bureta_5', 'bureta', 'Volume medido 5 mL', {volume:'4,990', incerteza:'0,010', k:'2,02'}, 'mL');
buildPointGroup(document.getElementById('buretaPoints'), 'bureta_10', 'bureta', 'Volume medido 10 mL', {volume:'9,980', incerteza:'0,010', k:'2,00'}, 'mL');

buildPointGroup(document.getElementById('microPoints'), 'micro_10', 'micro', 'Volume medido 10 μL', {volume:'10,40', incerteza:'0,20', k:'2,00'}, 'μL', false);
buildPointGroup(document.getElementById('microPoints'), 'micro_50', 'micro', 'Volume medido 50 μL', {volume:'50,50', incerteza:'0,20', k:'2,00'}, 'μL', false);
buildPointGroup(document.getElementById('microPoints'), 'micro_100', 'micro', 'Volume medido 100 μL', {volume:'100,70', incerteza:'0,20', k:'2,00'}, 'μL', false);

generateCode();
prepareLogoForPdf();
verifyClientSession();
document.getElementById('logoutBtn') && document.getElementById('logoutBtn').addEventListener('click', logoutClient);
document.addEventListener('input', (e) => {
  updateProgress();
  if(e.target.classList && e.target.classList.contains('missing') && e.target.value.trim() !== ''){
    e.target.classList.remove('missing');
  }
});
updateProgress();
