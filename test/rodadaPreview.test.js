const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../public/rodada-renderer');
const protocol = require('../public/rodada-preview-protocol');

const draft = {
  roundId: 'draft-id',
  nome: 'Rodada teste',
  descricaoCta: '',
  ativo: true,
  selectedItemIndex: 0,
  itens: [{
    titulo: '<img src=x onerror=alert(1)>',
    descricao: '',
    opcoes: [{
      nome: '<script>alert(1)</script>',
      unidade: 'g',
      tipo: 'numero',
      repetir: true,
    }],
    pontos: [],
  }],
};

test('renderer compartilhado mantém a mesma saída para cliente e prévia', () => {
  const publicOutput = renderer.renderRoundItems(draft.itens);
  const previewOutput = renderer.renderRoundItems(draft.itens);

  assert.equal(previewOutput, publicOutput);
  assert.match(publicOutput, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(publicOutput, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(publicOutput, /<script>|<img/);
});

test('protocolo valida o rascunho completo e rejeita mensagens malformadas', () => {
  assert.equal(protocol.isValidPreviewMessage({
    version: 1,
    type: 'draft',
    draft,
  }), true);
  assert.equal(protocol.isValidPreviewMessage({
    version: 1,
    type: 'draft',
    draft: { ...draft, itens: [{ ...draft.itens[0], campos: ['inesperado'] }] },
  }), false);
  assert.equal(protocol.isValidPreviewMessage({
    version: 1,
    type: 'draft',
    draft: { ...draft, selectedItemIndex: 50 },
  }), false);
});

test('prévia aceita rodadas sem itens e campos incompletos', () => {
  const partialDraft = {
    roundId: '',
    nome: '',
    descricaoCta: '',
    ativo: true,
    selectedItemIndex: 0,
    itens: [{
      titulo: '',
      descricao: '',
      opcoes: [],
      pontos: [],
    }],
  };

  assert.equal(protocol.isDraft(partialDraft), true);
  assert.doesNotThrow(() => renderer.renderRoundItems(partialDraft.itens));
  const emptyDraft = { ...partialDraft, selectedItemIndex: -1, itens: [] };
  assert.equal(protocol.isDraft(emptyDraft), true);
  assert.equal(renderer.renderRoundItems(emptyDraft.itens), '');
});

test('rota de prévia exige sessão administrativa', async () => {
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.ADMIN_USERNAME = 'TestAdmin';
  const app = require('../server');
  const server = app.listen(0);

  try {
    await new Promise(resolve => server.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const denied = await fetch(`${baseUrl}/admin/previa`);
    assert.equal(denied.status, 401);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'TestAdmin',
        password: 'test-admin-password',
      }),
    });
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get('set-cookie').split(';')[0];

    const allowed = await fetch(`${baseUrl}/admin/previa`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /PRÉVIA/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});
