// Teste empírico do endpoint PrePropostaUsuarioSgprc.
// Objetivo: descobrir EXATAMENTE o que dispara o erro do bloco FECHAMENTO.
// Roda variações controladas de payload e mostra a resposta do ERP para cada uma.

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api';
const token = process.env.ERP_AUTH_TOKEN;

if (!token) {
  console.error('ERP_AUTH_TOKEN não configurado.');
  process.exit(1);
}

const base = {
  tipo_pedido: 'ORÇAMENTO',
  nome_estabelecimento: 'LIMEIRA - CNPA',
  agente_venda_id: 302508396,
  contratante_pessoa: '2',
  cpf: '008.452.460-03',
  pessoa_contato: 'TAIS DEQUI',
  telefone: '51997720611',
  un_codigo_postal: '92310150',
  un_lougradouro: 'RUA BRASIL',
  un_bairro: 'CENTRO',
  un_cidade: 'CANOAS - RS',
  titulo_contrato: 'BOM PASTOR - BOM PET',
  produtos: 47225213,
  preco_informado: 12,
  plano_pagamento: 'PIX',
  numero_parcelas: 3,
};

const beneficiario = {
  usua_nome_completo: 'LOLA',
  usua_data_nascimento: '2023-09-21',
  usua_sexo: 'F',
  usua_parentesco: 'F',
  usua_papeis: 'B',
};

async function call(label, payload) {
  console.log('\n========================================');
  console.log('TESTE:', label);
  console.log('payload keys:', Object.keys(payload).join(', '));
  try {
    const r = await fetch(`${ERP_BASE}/PrePropostaUsuarioSgprc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    console.log('HTTP:', r.status);
    console.log('resposta:', typeof data === 'string' ? data.slice(0, 600) : JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('ERRO de rede:', err.message);
  }
}

(async () => {
  // 1. Só cabeçalho — SEM nenhum campo de beneficiário (usua_*)
  await call('1) Cabeçalho puro (sem usua_*)', { ...base });

  // 2. Cabeçalho + beneficiário (como o form envia hoje)
  await call('2) Cabeçalho + beneficiário (estado atual)', { ...base, ...beneficiario });

  // 3. Beneficiário COM CPF do contratante (talvez usua_cpf seja obrigatório)
  await call('3) Beneficiário + usua_cpf (do contratante)', {
    ...base, ...beneficiario, usua_cpf: '008.452.460-03',
  });

  // 4. Beneficiário + usua_produtos (link produto-beneficiário)
  await call('4) Beneficiário + usua_produtos', {
    ...base, ...beneficiario, usua_produtos: 47225213,
  });

  console.log('\n========================================');
  console.log('FIM dos testes.');
})();
