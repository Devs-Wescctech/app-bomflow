import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POSTSALES_MOTIVOS,
  buildPostsalesReturnNotification,
  getPostsalesReasonLabel,
  normalizePostsalesObservation,
  validatePostsalesReturn,
} from './postsalesReasons.js';

test('preserva os motivos antigos e expõe os oito novos motivos', () => {
  const antigos = [
    'telefone_incorreto',
    'email_incorreto',
    'inscritos_divergentes',
    'solicitacao_cancelamento',
    'falta_indicacao_carencia',
  ];
  const novos = [
    'valor_divergente',
    'produtos_divergentes',
    'termo_cancelamento_nao_anexado',
    'solicitacao_cancelamento_planilha',
    'excesso_dependentes',
    'autorizacao_gestor_ausente',
    'titular_contrato_ativo_pendencia',
    'outros',
  ];

  assert.deepEqual(Object.keys(POSTSALES_MOTIVOS).slice(0, antigos.length), antigos);
  assert.deepEqual(Object.keys(POSTSALES_MOTIVOS).slice(antigos.length), novos);
  assert.equal(Object.keys(POSTSALES_MOTIVOS).length, 13);
  assert.ok(Object.keys(POSTSALES_MOTIVOS).every((key) => key.length <= 40));
});

test('aceita motivos conhecidos e rejeita valores desconhecidos', () => {
  assert.equal(validatePostsalesReturn('valor_divergente', null), null);
  assert.equal(validatePostsalesReturn('telefone_incorreto', null), null);
  assert.match(validatePostsalesReturn('motivo_inventado', null), /motivos padronizados/);
});

test('exige observação não vazia apenas para Outros', () => {
  assert.match(validatePostsalesReturn('outros', null), /observação/);
  assert.match(validatePostsalesReturn('outros', '   '), /observação/);
  assert.equal(validatePostsalesReturn('outros', 'Documento pendente'), null);
  assert.equal(validatePostsalesReturn('valor_divergente', null), null);
});

test('normaliza observação e limita o tamanho armazenado', () => {
  assert.equal(normalizePostsalesObservation('  pendência  '), 'pendência');
  assert.equal(normalizePostsalesObservation('   '), null);
  assert.equal(normalizePostsalesObservation('a'.repeat(1200)).length, 1000);
});

test('propaga o rótulo na resposta e preserva fallback para dados históricos', () => {
  assert.equal(getPostsalesReasonLabel('produtos_divergentes'), 'Produtos Divergentes');
  assert.equal(getPostsalesReasonLabel('motivo_historico'), 'motivo_historico');
  assert.equal(getPostsalesReasonLabel(null), null);
});

test('notificação inclui o motivo e a orientação informada em Outros', () => {
  const message = buildPostsalesReturnNotification({
    numero: '123',
    clienteNome: 'Cliente Teste',
    motivo: 'outros',
    prazoYmd: '2026-09-03',
    observacao: '  Corrigir documento anexado.  ',
  });

  assert.match(message, /Motivo: Outros/);
  assert.match(message, /Observação: Corrigir documento anexado\./);
  assert.match(message, /Prazo para resolução: 2026-09-03 \(3 dias úteis\)/);
});