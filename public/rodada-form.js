const ROUND_TOKEN_KEY = 'client_token';

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeCode(){
  return `JGS-${Math.floor(100000 + Math.random() * 900000)}`;
}

function logout(){
  const token = localStorage.getItem(ROUND_TOKEN_KEY);
  localStorage.removeItem(ROUND_TOKEN_KEY);
  localStorage.removeItem('client_nome');
  if(token) fetch('/api/client/logout', { method:'POST', headers:{ 'x-client-token': token } }).catch(() => {});
  window.location.replace('/login.html');
}

function fieldHtml(id, label, type = 'text', required = true){
  return `<label>${label}<input id="${id}" type="${type}" ${type === 'number' ? 'step="any"' : ''} ${required ? 'required' : ''}></label>`;
}

function renderPointFields(prefix){
  return `
    <div class="dynamic-fields">
      ${fieldHtml(`${prefix}_massa_vazia`, 'Massa vazia e seca (g)', 'number', false)}
      ${fieldHtml(`${prefix}_massa_cheia`, 'Massa média cheia (g)', 'number', false)}
      ${fieldHtml(`${prefix}_volume`, 'Volume medido', 'number')}
      ${fieldHtml(`${prefix}_incerteza`, 'Incerteza de medição', 'number')}
      ${fieldHtml(`${prefix}_k`, 'k', 'number')}
      ${fieldHtml(`${prefix}_veff`, 'Veff', 'text')}
      ${fieldHtml(`${prefix}_temp_agua`, 'Temperatura da água (°C)', 'number')}
      ${fieldHtml(`${prefix}_temp_amb`, 'Temperatura ambiente (°C)', 'number')}
      ${fieldHtml(`${prefix}_umidade`, 'Umidade relativa (%)', 'number')}
      ${fieldHtml(`${prefix}_pressao`, 'Pressão atmosférica (hPa)', 'number')}
      ${fieldHtml(`${prefix}_massa_esp`, 'Massa específica da água (g/mL)', 'number')}
    </div>`;
}

function renderOptionFields(item, index){
  return item.opcoes.map((opcao, optionIndex) => {
    const type = opcao.tipo === 'numero' ? 'number' : 'text';
    const label = `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`;
    return fieldHtml(`item_${index}_opcao_${optionIndex}`, escapeHtml(label), type);
  }).join('');
}

function renderItem(item, index){
  if(Array.isArray(item.pontos) && item.pontos.length){
    return `
      <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, '0')} — Item de ensaio</div>
        <div class="dynamic-section-title">${escapeHtml(item.titulo)}</div>
        ${item.opcoes && item.opcoes.length
          ? `<div class="dynamic-general-fields">${item.opcoes.filter(opcao => opcao.repetir === false).map((opcao, optionIndex) => fieldHtml(
              `item_${index}_geral_${optionIndex}`,
              `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`,
              opcao.tipo === 'numero' ? 'number' : 'text'
            )).join('')}</div>`
          : ''}
        ${item.pontos.map((ponto, pointIndex) => {
          const point = typeof ponto === 'string' ? { nome: ponto, opcoes: [] } : ponto;
          const pointPrefix = `item_${index}_ponto_${pointIndex}`;
          const repeatedOptions = (item.opcoes || []).filter(opcao => opcao.repetir !== false);
          const pointOptions = [...repeatedOptions, ...(point.opcoes || [])];
          return `<div class="dynamic-point">
            <h3>${escapeHtml(point.nome)}</h3>
            ${pointOptions.length
              ? `<div class="dynamic-fields">${pointOptions.map((opcao, optionIndex) => fieldHtml(
                  `${pointPrefix}_opcao_${optionIndex}`,
                  `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`,
                  opcao.tipo === 'numero' ? 'number' : 'text'
                )).join('')}</div>`
              : renderPointFields(pointPrefix)}
          </div>`;
        }).join('')}
      </section>`;
  }

  if(Array.isArray(item.opcoes) && item.opcoes.length){
    return `
      <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, '0')} — Item de ensaio</div>
        <div class="dynamic-section-title">${escapeHtml(item.titulo)}</div>
        <div class="dynamic-fields">${renderOptionFields(item, index)}</div>
      </section>`;
  }

  const pontos = Array.isArray(item.pontos) && item.pontos.length ? item.pontos : ['Medição'];
  return `
    <section class="dynamic-section is-open">
        <div class="dynamic-section-tag">${String(index + 1).padStart(2, '0')} — Item de ensaio</div>
      <div class="dynamic-section-title">${escapeHtml(item.titulo)}</div>
      ${pontos.map((ponto, pointIndex) => `
        <div class="dynamic-point">
          <h3>${escapeHtml(ponto || `Medição ${pointIndex + 1}`)}</h3>
          ${renderPointFields(`item_${index}_ponto_${pointIndex}`)}
        </div>`).join('')}
    </section>`;
}

function collectRows(rodada){
  const value = id => document.getElementById(id)?.value || '';
  const rows = [
    ['Identificação', 'Código do participante', value('codigo')],
    ['Identificação', 'Data da chegada', value('data_chegada')],
    ['Identificação', 'Data da calibração', value('data_calibracao')],
    ['Identificação', 'Data da saída', value('data_saida')],
    ['Contato', 'Técnico responsável', value('tecnico_nome')],
  ];
  rodada.itens.forEach((item, index) => {
    if(Array.isArray(item.opcoes) && item.opcoes.length){
      item.opcoes.filter(opcao => opcao.repetir === false).forEach((opcao, optionIndex) => {
        const label = `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`;
        rows.push([item.titulo, label, value(`item_${index}_geral_${optionIndex}`)]);
      });
    }

    if(Array.isArray(item.pontos) && item.pontos.length){
      item.pontos.forEach((ponto, pointIndex) => {
        const point = typeof ponto === 'string' ? { nome: ponto, opcoes: [] } : ponto;
        const prefix = `item_${index}_ponto_${pointIndex}`;
        const repeatedOptions = (item.opcoes || []).filter(opcao => opcao.repetir !== false);
        const pointOptions = [...repeatedOptions, ...(point.opcoes || [])];
        if(pointOptions.length){
          pointOptions.forEach((opcao, optionIndex) => {
            const label = `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`;
            rows.push([`${item.titulo} — ${point.nome}`, label, value(`${prefix}_opcao_${optionIndex}`)]);
          });
        }else{
          ['massa_vazia','massa_cheia','volume','incerteza','k','veff','temp_agua','temp_amb','umidade','pressao','massa_esp']
            .forEach(field => rows.push([`${item.titulo} — ${point.nome}`, field, value(`${prefix}_${field}`)]));
        }
      });
      return;
    }

    if(Array.isArray(item.opcoes) && item.opcoes.length){
      item.opcoes.forEach((opcao, optionIndex) => {
        const label = `${opcao.nome}${opcao.unidade ? ` (${opcao.unidade})` : ''}`;
        rows.push([item.titulo, label, value(`item_${index}_opcao_${optionIndex}`)]);
      });
      return;
    }

    const pontos = Array.isArray(item.pontos) && item.pontos.length ? item.pontos : ['Medição'];
    pontos.forEach((ponto, pointIndex) => {
      const prefix = `item_${index}_ponto_${pointIndex}`;
      ['massa_vazia','massa_cheia','volume','incerteza','k','veff','temp_agua','temp_amb','umidade','pressao','massa_esp']
        .forEach(field => rows.push([`${item.titulo} — ${ponto}`, field, value(`${prefix}_${field}`)]));
    });
  });
  return rows;
}

function bindSectionToggles(){
  document.querySelectorAll('.dynamic-section-title').forEach(title => {
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-expanded', 'true');
    const toggle = () => {
      const section = title.closest('.dynamic-section');
      const expanded = section.classList.toggle('is-open');
      title.setAttribute('aria-expanded', String(expanded));
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', event => {
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault();
        toggle();
      }
    });
  });
}

function restoreDraft(form, draftKey){
  try{
    const values = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if(!values || typeof values !== 'object' || Array.isArray(values)) return;
    Array.from(form.querySelectorAll('input')).forEach(input => {
      if(Object.prototype.hasOwnProperty.call(values, input.id)) input.value = values[input.id];
    });
  }catch{}
}

function saveDraft(form, draftKey){
  const values = Object.fromEntries(Array.from(form.querySelectorAll('input')).map(input => [input.id, input.value]));
  try{
    localStorage.setItem(draftKey, JSON.stringify(values));
  }catch{}
}

async function init(){
  const token = localStorage.getItem(ROUND_TOKEN_KEY);
  if(!token){ window.location.replace('/login.html'); return; }
  prepareLogoForPdf();
  document.getElementById('clientName').textContent = `Olá, ${localStorage.getItem('client_nome') || ''}`;

  const rodadaId = new URLSearchParams(window.location.search).get('rodadaId');
  if(!rodadaId){ window.location.replace('/rodadas.html'); return; }

  try{
    const resp = await fetch('/api/client/rodadas', { headers:{ 'x-client-token': token } });
    const data = await resp.json();
    if(!resp.ok || !data.ok) throw new Error(data.error || 'Não foi possível carregar a rodada.');
    const rodada = (data.rodadas || []).find(item => String(item._id) === rodadaId);
    if(!rodada) throw new Error('Esta rodada não está disponível para o seu laboratório.');

    document.getElementById('rodadaNome').textContent = rodada.nome;
    document.getElementById('codigo').value = makeCode();
    document.getElementById('itensContainer').innerHTML = rodada.itens.map(renderItem).join('');
    bindSectionToggles();

    const form = document.getElementById('rodadaForm');
    const draftKey = `rodada_draft:${token}:${rodadaId}`;
    restoreDraft(form, draftKey);
    form.addEventListener('input', () => saveDraft(form, draftKey));
    form.addEventListener('change', () => saveDraft(form, draftKey));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorBox = document.getElementById('formError');
      const requiredFields = Array.from(form.querySelectorAll('[required]'));
      requiredFields.forEach(field => field.classList.remove('missing'));
      const missingFields = requiredFields.filter(field => !field.value.trim());

      if(missingFields.length){
        missingFields.forEach(field => field.classList.add('missing'));
        errorBox.textContent = `${missingFields.length} campo(s) obrigatório(s) ainda não preenchido(s).`;
        missingFields[0].scrollIntoView({ behavior:'smooth', block:'center' });
        missingFields[0].focus();
        return;
      }
      errorBox.textContent = '';
      const codigo = document.getElementById('codigo').value;
      const rows = collectRows(rodada);
      const fields = Object.fromEntries(Array.from(form.querySelectorAll('input')).map(input => [input.id, input.value]));
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      errorBox.textContent = '';
      try{
        const saveResp = await fetch('/api/save-results', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'x-client-token': token },
          body: JSON.stringify({ codigo, fields, rows, rodadaId })
        });
        const saveData = await saveResp.json();
        if(!saveResp.ok || !saveData.ok) throw new Error(saveData.error || 'Não foi possível salvar o envio.');
        localStorage.removeItem(draftKey);
        if(window.jspdf) buildPdf(rows, codigo).save(`resultados_${codigo}.pdf`);
        document.getElementById('successCode').textContent = codigo;
        form.hidden = true;
        document.getElementById('successBox').hidden = false;
      }catch(error){
        errorBox.textContent = error.message;
        btn.disabled = false;
        btn.textContent = 'Enviar resultados';
      }
    });
  }catch(error){
    document.getElementById('formError').textContent = error.message;
  }
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.addEventListener('input', event => {
  if(event.target.matches('[required]') && event.target.value.trim()){
    event.target.classList.remove('missing');
  }
});
init();