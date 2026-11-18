const test = require('node:test');
const assert = require('node:assert/strict');
const editorUtils = require('../public/rodada-editor-utils');
const renderer = require('../public/rodada-renderer');

test('migra opções antigas para cópias independentes em cada ponto', () => {
  const legacyItem = {
    titulo: 'Balança',
    descricao: '',
    opcoes: [
      { nome: 'Temp Amb', unidade: '°C', tipo: 'numero', repetir: false },
      { nome: 'Erro', unidade: 'g', tipo: 'texto', repetir: true },
    ],
    pontos: [
      { nome: '500 mg', opcoes: [{ nome: 'Leitura', unidade: 'mg', tipo: 'numero' }] },
      { nome: '10 g', opcoes: [] },
    ],
  };

  const migrated = editorUtils.normalizeItemForEditor(legacyItem);

  assert.deepEqual(migrated.opcoes, []);
  assert.deepEqual(migrated.pontos.map(point => point.opcoes.map(option => option.nome)), [
    ['Temp Amb', 'Erro', 'Leitura'],
    ['Temp Amb', 'Erro'],
  ]);
  assert.notStrictEqual(migrated.pontos[0].opcoes[0], migrated.pontos[1].opcoes[0]);
  assert.equal(legacyItem.opcoes[0].repetir, false);
});

test('migra equipamento antigo sem pontos para um ponto Medição', () => {
  const migrated = editorUtils.normalizeItemForEditor({
    titulo: 'Termômetro',
    opcoes: [{ nome: 'Temperatura', unidade: '°C', tipo: 'numero' }],
    pontos: [],
  });

  assert.equal(migrated.pontos.length, 1);
  assert.equal(migrated.pontos[0].nome, 'Medição');
  assert.equal(migrated.pontos[0].opcoes[0].nome, 'Temperatura');
});

test('preserva pontos legados armazenados como texto separado por vírgula', () => {
  const migrated = editorUtils.normalizeItemForEditor({
    titulo: 'Balança',
    opcoes: [],
    pontos: '500 mg, 10 g',
  });

  assert.deepEqual(migrated.pontos.map(point => point.nome), ['500 mg', '10 g']);
});

test('formulário público renderiza rodadas antigas e o formato novo por ponto', () => {
  const legacy = {
    titulo: 'Balança',
    opcoes: [{ nome: 'Temperatura', unidade: '°C', tipo: 'numero', repetir: false }],
    pontos: [{ nome: '500 mg', opcoes: [] }],
  };
  const current = editorUtils.normalizeItemForEditor(legacy);
  const legacyHtml = renderer.renderRoundItems([legacy]);
  const currentHtml = renderer.renderRoundItems([current]);

  assert.match(legacyHtml, /Temperatura/);
  assert.match(legacyHtml, /500 mg/);
  assert.match(currentHtml, /Temperatura/);
  assert.match(currentHtml, /500 mg/);
  assert.match(currentHtml, /item_0_ponto_0_opcao_0/);
});

test('catálogo deduplica sem acentos, conta usos e ordena por uso e recência', () => {
  const catalog = editorUtils.buildOptionCatalog([
    {
      _id: 'round-old',
      updatedAt: '2025-01-01T00:00:00.000Z',
      itens: [{
        opcoes: [{ nome: 'Temp Amb', unidade: '°C', tipo: 'numero' }],
        pontos: [
          { opcoes: [{ nome: 'Temp Amb', unidade: '°C', tipo: 'numero' }] },
          { opcoes: [{ nome: 'temp ámb', unidade: '°C', tipo: 'numero' }] },
        ],
      }],
    },
    {
      _id: 'round-new',
      updatedAt: '2025-05-01T00:00:00.000Z',
      itens: [{
        opcoes: [{ nome: 'Temp Amb', unidade: '°C', tipo: 'numero' }],
        pontos: [{ opcoes: [{ nome: 'Temp Amb', unidade: 'F', tipo: 'numero' }] }],
      }],
    },
  ], [{
    opcoes: [],
    pontos: [{ opcoes: [{ nome: 'TÉMP AMB', unidade: '°C', tipo: 'numero' }] }],
  }], '', Date.parse('2026-01-01T00:00:00.000Z'));

  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].count, 5);
  assert.equal(catalog[0].nome, 'TÉMP AMB');
  assert.equal(catalog[1].unidade, 'F');
});
