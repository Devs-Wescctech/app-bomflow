function asPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

/**
 * Classifica o vínculo salvo sem confiar no id vindo do Bom Flow.
 * A resolução por CPF é a fonte de verdade: CPF -> Pessoa -> Usuário ERP.
 */
export function classifyAgentErpLink({ agent, resolution, storedUsuario = null }) {
  const storedId = asPositiveNumber(agent?.erp_agent_id);
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  const pessoaId = asPositiveNumber(resolution?.pessoaInternalId);

  if (resolution?.status === 'usuarios_ambiguos') {
    return { status: 'usuarios_ambiguos', repairable: false };
  }
  if (resolution?.status !== 'ok' || !resolvedId) {
    return { status: resolution?.status || 'usuario_nao_encontrado', repairable: false };
  }
  if (!storedId) {
    return { status: 'ok', repairable: true };
  }
  if (storedId === resolvedId) {
    return { status: 'ja_vinculado', repairable: false };
  }
  if (pessoaId && storedId === pessoaId) {
    return { status: 'id_pessoa_legado', repairable: true };
  }
  if (!storedUsuario) {
    return { status: 'usuario_inexistente', repairable: true };
  }
  if (
    resolution?.pessoaCodigo &&
    String(storedUsuario.pessoa ?? '') !== String(resolution.pessoaCodigo)
  ) {
    return { status: 'usuario_outro_cpf', repairable: true };
  }
  return { status: 'vinculo_incorreto', repairable: true };
}

/**
 * Persiste somente ids já resolvidos no servidor. O caller continua responsável
 * por resolver CPF/Pessoa/Usuário no ERP e por tratar status ambíguos.
 */
export async function persistResolvedAgentErpLink({
  agent,
  resolution,
  queryDb,
  registerCanal,
}) {
  const agentId = agent?.id;
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  if (!agentId || resolution?.status !== 'ok' || !resolvedId) {
    throw new Error('Vínculo ERP não pôde ser validado de forma inequívoca pelo CPF.');
  }

  let erpAgentId = asPositiveNumber(agent.erp_agent_id);
  let erpAgenteVendaId = asPositiveNumber(agent.erp_agente_venda_id);
  const actions = [];

  if (erpAgentId !== resolvedId) {
    const duplicate = (await queryDb(
      'SELECT id, name FROM agents WHERE erp_agent_id = $1 AND id <> $2 LIMIT 1',
      [resolvedId, agentId]
    )).rows[0];
    if (duplicate) {
      const error = new Error(
        `Usuário do ERP (login ${resolution.login || resolvedId}) já vinculado ao agente ${duplicate.name}.`
      );
      error.code = 'usuario_ja_vinculado';
      throw error;
    }

    await queryDb(
      'UPDATE agents SET erp_agent_id = $1, updated_at = NOW() WHERE id = $2',
      [resolvedId, agentId]
    );
    erpAgentId = resolvedId;
    actions.push(agent.erp_agent_id ? 'reparo_vinculo' : 'vinculo');
  }

  const canalId = asPositiveNumber(agent.canal_venda_id);
  if (!canalId && erpAgenteVendaId) {
    await queryDb(
      'UPDATE agents SET erp_agente_venda_id = NULL, updated_at = NOW() WHERE id = $1',
      [agentId]
    );
    erpAgenteVendaId = null;
    actions.push('canal_removido');
  }
  if (canalId) {
    const pessoaId = asPositiveNumber(resolution.pessoaInternalId);
    if (!pessoaId) {
      const error = new Error('A Pessoa do ERP não foi localizada para registrar o canal de vendas.');
      error.code = 'pessoa_nao_encontrada';
      throw error;
    }

    const novoVendaId = asPositiveNumber(await registerCanal(
      pessoaId,
      canalId,
      asPositiveNumber(agent.canal_venda_grupo_id)
    ));
    if (!novoVendaId) {
      const error = new Error('O ERP não retornou um vínculo válido para o canal de vendas.');
      error.code = 'canal_invalido';
      throw error;
    }
    if (novoVendaId !== erpAgenteVendaId) {
      await queryDb(
        'UPDATE agents SET erp_agente_venda_id = $1, updated_at = NOW() WHERE id = $2',
        [novoVendaId, agentId]
      );
      actions.push('canal');
    }
    erpAgenteVendaId = novoVendaId;
  }

  return { erpAgentId, erpAgenteVendaId, actions };
}

/**
 * Sobrescreve os campos de autoria forjáveis do navegador com valores validados
 * a partir do agente autenticado e da resolução ERP por CPF.
 */
export function buildAuthenticatedOrcamentoPayload(rawPayload, agent, resolution) {
  const erpAgentId = asPositiveNumber(agent?.erp_agent_id);
  const erpAgenteVendaId = asPositiveNumber(agent?.erp_agente_venda_id);
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  const login = String(resolution?.login || '').trim();

  if (!erpAgentId) {
    throw validationError(
      'Seu usuário ainda não está vinculado a um Usuário do ERP. Solicite a sincronização em Configurações > Agentes.'
    );
  }
  if (!erpAgenteVendaId) {
    throw validationError(
      'Seu usuário ainda não possui vínculo com um canal de vendas no ERP. Solicite a correção em Configurações > Agentes.'
    );
  }
  if (resolution?.status !== 'ok' || !resolvedId || resolvedId !== erpAgentId || !login) {
    throw validationError(
      'O vínculo do seu Usuário ERP não corresponde ao CPF cadastrado. Solicite a revisão em Configurações > Agentes.'
    );
  }

  return {
    ...rawPayload,
    usuario_inclusao: login,
    agente_venda_id: erpAgenteVendaId,
  };
}