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
  
  const data = await response.json();
  
  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao buscar cliente no ERP');
    error.status = response.status;
    error.data = data;
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

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao buscar cliente de reativação no ERP');
    error.status = response.status;
    error.data = data;
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

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao buscar indicador no ERP');
    error.status = response.status;
    error.data = data;
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

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao buscar indicador no ERP por telefone');
    error.status = response.status;
    error.data = data;
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

export async function registrarCanalErp({ agentId, pessoaId, contratoId, grupoId }) {
  const response = await fetch('/api/erp/registrar-canal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ agentId, pessoaId, contratoId, grupoId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao registrar agente no canal de vendas do ERP');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function buscarCanaisVenda() {
  const response = await fetch('/api/erp/canais-venda', {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Erro ao buscar canais de venda no ERP');
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
