import { extractApiError, apiErrorMessage } from '@/utils/apiError';

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function buscarClienteERP(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  
  if (cpfLimpo.length !== 11) {
    throw new Error('CPF inválido');
  }
  
  const response = await fetch(`${API_BASE}/functions/get-customer-from-erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ cpf: cpfLimpo }),
  });
  
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(apiErrorMessage(response.status, data, 'Erro ao buscar cliente no ERP'));
    error.status = response.status;
    error.data = data || {};
    throw error;
  }
  
  return data;
}

export async function buscarReativacaoERP(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');

  if (cpfLimpo.length !== 11) {
    throw new Error('CPF inválido');
  }

  const response = await fetch(`${API_BASE}/functions/get-customer-from-erp-reactivation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ cpf: cpfLimpo }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(apiErrorMessage(response.status, data, 'Erro ao buscar cliente de reativação no ERP'));
    error.status = response.status;
    error.data = data || {};
    throw error;
  }

  return data;
}

export async function buscarIndicadorERP(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');

  if (cpfLimpo.length !== 11) {
    throw new Error('CPF inválido');
  }

  const response = await fetch(`${API_BASE}/functions/get-indicador-from-erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ cpf: cpfLimpo }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(apiErrorMessage(response.status, data, 'Erro ao buscar indicador no ERP'));
    error.status = response.status;
    error.data = data || {};
    throw error;
  }

  return data;
}

export async function buscarIndicadorPorTelefoneERP(phone) {
  let smsLimpo = String(phone || '').replace(/\D/g, '');
  if (smsLimpo.startsWith('0')) smsLimpo = smsLimpo.replace(/^0+/, '');
  if (!smsLimpo.startsWith('55')) smsLimpo = '55' + smsLimpo;
  if (smsLimpo.length < 12 || smsLimpo.length > 13) {
    throw new Error('Telefone inválido (use DDD + número)');
  }

  const response = await fetch(`${API_BASE}/functions/get-indicador-from-erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ sms: smsLimpo }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(apiErrorMessage(response.status, data, 'Erro ao buscar indicador no ERP por telefone'));
    error.status = response.status;
    error.data = data || {};
    throw error;
  }

  return data;
}

export async function buscarHistoricoIndicacoes(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  
  const response = await fetch(`${API_BASE}/referrals/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      referrer_cpf: cpfLimpo,
      status: 'convertido'
    }),
  });
  
  if (!response.ok) {
    return [];
  }
  
  return response.json();
}

// Pré-visualiza a sincronização ERP dos agentes (não grava nada).
// agentIds opcional; sem ele o backend usa o escopo informado para auditar agentes ativos.
// scope: "pending" (padrão) consulta quem ainda não tem os dois vínculos locais;
// "all" permite a auditoria completa em busca de divergências.
export async function previewSyncAgentesErp(agentIds, { scope = 'pending' } = {}) {
  const response = await fetch('/api/erp/sync-agentes/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ agentIds: agentIds || null, scope }),
  });
  if (!response.ok) {
    const error = new Error(await extractApiError(response, 'Erro ao pré-visualizar a sincronização ERP'));
    error.status = response.status;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  return data; // { items: [...] }
}

// Grava ou reconcilia o vínculo ERP dos agentes selecionados.
// items: [{ agentId, provision?, preferredLogin?, reconcileOnly? }]
// reconcileOnly apenas espelha um canal único já confirmado no ERP.
export async function commitSyncAgentesErp(items) {
  const response = await fetch('/api/erp/sync-agentes/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const error = new Error(await extractApiError(response, 'Erro ao gravar a sincronização ERP'));
    error.status = response.status;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  return data; // { results: [...] }
}

export async function buscarCanaisVenda() {
  const response = await fetch('/api/erp/canais-venda', {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = new Error(await extractApiError(response, 'Erro ao buscar canais de venda no ERP'));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function buscarConversoesPorCpf(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');

  const response = await fetch(`${API_BASE}/functions/indicador-historico/${cpfLimpo}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    return { totalConversions: 0, fromReferrals: 0, fromCpc: 0 };
  }

  return response.json();
}
