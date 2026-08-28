export function isPostsalesAuditorIdentity({ role, agentType, modules } = {}) {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedType = String(agentType || '').toLowerCase();
  const normalizedModules = Array.isArray(modules) ? modules : [];
  return normalizedRole === 'admin'
    || normalizedType === 'admin'
    || normalizedType === 'post_sales'
    || normalizedModules.includes('post_sales');
}

export function classifyPostsalesDetail(detalhe, error = null) {
  if (error) return 'error';
  const hasData = !!(
    detalhe
    && (
      (Array.isArray(detalhe.pessoas) && detalhe.pessoas.length)
      || (Array.isArray(detalhe.produtos) && detalhe.produtos.length)
      || detalhe.email
      || detalhe.endereco
      || detalhe.plano_pagamento
    )
  );
  return hasData ? 'ok' : 'empty';
}

export function selectTrackedClientName(payload = {}) {
  return payload.pessoa_contato
    || payload.nome_contratante
    || payload.contratante_nome
    || null;
}

export function missingPostsalesClientPedidoIds(rows = []) {
  return [...new Set(
    rows
      .filter((row) => !String(row?.cliente_nome || '').trim())
      .map((row) => Number(row?.erp_pedido_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  )];
}

export function mergePostsalesClientIdentities(rows = [], identities = {}) {
  return rows.map((row) => {
    const identity = identities[Number(row?.erp_pedido_id)] || {};
    const clienteNome = String(row?.cliente_nome || '').trim()
      || String(identity.cliente_nome || '').trim()
      || null;
    const clienteCpf = String(row?.cliente_cpf || '').trim()
      || String(identity.cliente_cpf || '').trim()
      || null;
    return {
      ...row,
      cliente_nome: clienteNome,
      cliente_cpf: clienteCpf,
    };
  });
}