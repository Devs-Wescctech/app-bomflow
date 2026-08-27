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