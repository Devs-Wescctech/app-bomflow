function asPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sameNullableNumber(a, b) {
  return asPositiveNumber(a) === asPositiveNumber(b);
}

function sameAgentSnapshot(current, expected, erpAgentId) {
  return (
    String(current?.cpf ?? '') === String(expected?.cpf ?? '') &&
    asPositiveNumber(current?.erp_agent_id) === asPositiveNumber(erpAgentId) &&
    sameNullableNumber(current?.canal_venda_id, expected?.canal_venda_id) &&
    sameNullableNumber(current?.canal_venda_grupo_id, expected?.canal_venda_grupo_id)
  );
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

export const MISSING_ERP_CANAL_MESSAGE =
  'Falta o vínculo de canal de venda no ERP para seu agente. Peça a um administrador para sincronizá-lo em Configurações → Agentes.';

export function createMissingErpCanalError() {
  const error = validationError(MISSING_ERP_CANAL_MESSAGE);
  error.code = 'canal_nao_confirmado';
  return error;
}

const MANAGED_ERP_AGENT_FIELDS = new Set([
  'erpAgentId',
  'erp_agent_id',
  'erpAgenteVendaId',
  'erp_agente_venda_id',
]);

const ERP_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
]);

const ERP_SYNC_STAGE_LABELS = {
  consulta_identidade_erp: 'consultar a Pessoa e o Usuário no ERP',
  validar_usuario_erp_salvo: 'validar o Usuário ERP já salvo',
  auditoria_canal_erp: 'auditar o vínculo de canal no banco do ERP',
  persistencia_vinculo_erp: 'gravar o vínculo de canal no banco do ERP',
  sincronizacao_erp: 'sincronizar o agente com o ERP',
};

function diagnosticMessage(error) {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (!error || typeof error !== 'object') return '';

  for (const value of [error.message, error.error, error.detail, error.reason]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function hasManagedErpAgentField(body = {}) {
  return Object.keys(body || {}).some((key) => MANAGED_ERP_AGENT_FIELDS.has(key));
}

export function classifyErpSyncError(error, { stage = null } = {}) {
  const code = String(error?.code || '');
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const detail = diagnosticMessage(error);
  const stageLabel = stage ? (ERP_SYNC_STAGE_LABELS[stage] || stage) : null;
  const message = detail
    ? `${stageLabel ? `Não foi possível ${stageLabel}: ` : ''}${detail}`
    : (stageLabel
      ? `Não foi possível ${stageLabel}; o ERP não retornou detalhes para o diagnóstico.`
      : 'Falha desconhecida ao consultar o ERP.');
  const unavailable = (
    error?.isErpUpstream === true ||
    code === 'erp_indisponivel' ||
    ERP_UNAVAILABLE_CODES.has(code) ||
    statusCode === 429 ||
    statusCode >= 500 ||
    /fetch failed|connection terminated|connection timeout|connect timeout|timeout (?:expired|exceeded)|query read timeout|socket hang up/i.test(message)
  );

  if (unavailable) {
    const result = {
      status: 'erp_indisponivel',
      retryable: true,
      erro: message,
    };
    if (stage) result.etapa = stage;
    return result;
  }

  const result = {
    status: code || 'erro',
    retryable: false,
    erro: message,
  };
  if (stage) result.etapa = stage;
  return result;
}

export function sameCpf(a, b) {
  return String(a ?? '').replace(/\D/g, '') === String(b ?? '').replace(/\D/g, '');
}

/**
 * Classifica o vínculo salvo sem permitir que a resolução por CPF substitua uma
 * identidade já persistida. A cadeia CPF -> Pessoa -> Usuário ERP apenas valida
 * o primeiro vínculo; divergências posteriores exigem investigação.
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
    return { status: 'id_pessoa_legado', repairable: false };
  }
  if (!storedUsuario) {
    return { status: 'usuario_inexistente', repairable: false };
  }
  if (
    resolution?.pessoaCodigo &&
    String(storedUsuario.pessoa ?? '') !== String(resolution.pessoaCodigo)
  ) {
    return { status: 'usuario_outro_cpf', repairable: false };
  }
  return { status: 'vinculo_incorreto', repairable: false };
}

/**
 * Combina o estado da identidade com o vínculo efetivamente encontrado no ERP.
 * A inspeção do canal também ocorre no primeiro vínculo, quando os dois espelhos
 * locais ainda podem estar vazios.
 */
export function classifyAgentCanalAudit({
  status,
  repairable,
  currentErpAgenteVendaId,
  inspection,
}) {
  const effectiveErpAgenteVendaId = asPositiveNumber(inspection?.effectiveId);
  const currentId = asPositiveNumber(currentErpAgenteVendaId);

  if (!['ok', 'ja_vinculado'].includes(status)) {
    return { status, repairable, effectiveErpAgenteVendaId, canalErro: null };
  }
  if (inspection?.ambiguous) {
    return {
      status: 'canal_ambiguo',
      repairable: false,
      effectiveErpAgenteVendaId: null,
      canalErro: `Há ${inspection.ids?.length || 0} vínculos para esta Pessoa, canal e grupo no ERP.`,
    };
  }

  // No primeiro vínculo, "ok" continua indicando que o Usuário ERP ainda será
  // espelhado. O canal efetivo já é devolvido para a UI, sem ser tratado como ausente.
  if (status === 'ok') {
    if (currentId && currentId !== effectiveErpAgenteVendaId) {
      return {
        status: 'canal_incorreto',
        repairable: true,
        effectiveErpAgenteVendaId,
        canalErro: null,
      };
    }
    return { status, repairable, effectiveErpAgenteVendaId, canalErro: null };
  }

  if (!effectiveErpAgenteVendaId) {
    return {
      status: currentId ? 'canal_incorreto' : 'canal_pendente',
      repairable: true,
      effectiveErpAgenteVendaId: null,
      canalErro: null,
    };
  }
  if (!currentId) {
    return {
      status: 'canal_nao_espelhado',
      repairable: true,
      effectiveErpAgenteVendaId,
      canalErro: null,
    };
  }
  if (currentId !== effectiveErpAgenteVendaId) {
    return {
      status: 'canal_incorreto',
      repairable: true,
      effectiveErpAgenteVendaId,
      canalErro: null,
    };
  }
  return { status, repairable, effectiveErpAgenteVendaId, canalErro: null };
}

/**
 * Expõe o estado do canal separadamente da identidade do Usuário ERP. Um canal
 * só é considerado confirmado quando uma leitura direta no ERP encontra um
 * único pessoas_contratos para a Pessoa e o canal configurado.
 */
export function classifyCanalSyncState({
  hasCanal,
  currentErpAgenteVendaId,
  inspection,
}) {
  if (!hasCanal) {
    return {
      status: 'sem_canal_configurado',
      repairable: false,
      confirmed: false,
      effectiveErpAgenteVendaId: null,
    };
  }

  if (inspection?.ambiguous) {
    return {
      status: 'canal_ambiguo',
      repairable: false,
      confirmed: false,
      effectiveErpAgenteVendaId: null,
    };
  }

  const effectiveErpAgenteVendaId = asPositiveNumber(inspection?.effectiveId);
  const currentId = asPositiveNumber(currentErpAgenteVendaId);
  if (!effectiveErpAgenteVendaId) {
    return {
      status: 'canal_pendente',
      repairable: true,
      confirmed: false,
      effectiveErpAgenteVendaId: null,
    };
  }
  if (!currentId) {
    return {
      status: 'canal_confirmado_nao_espelhado',
      repairable: true,
      confirmed: true,
      effectiveErpAgenteVendaId,
    };
  }
  if (currentId !== effectiveErpAgenteVendaId) {
    return {
      status: 'canal_divergente',
      repairable: true,
      confirmed: true,
      effectiveErpAgenteVendaId,
    };
  }
  return {
    status: 'canal_confirmado',
    repairable: false,
    confirmed: true,
    effectiveErpAgenteVendaId,
  };
}

/**
 * Registra ou reaproveita o vínculo de canal já resolvido no servidor.
 * O espelho local só é alterado após registerCanal confirmar uma leitura ou
 * escrita efetiva no ERP. Não há limpeza inferida quando o canal é removido
 * do cadastro local: isso exige uma operação de negócio própria no ERP.
 */
export async function syncResolvedAgentCanal({
  agent,
  resolution,
  queryDb,
  registerCanal,
}) {
  const agentId = agent?.id;
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  const canalId = asPositiveNumber(agent?.canal_venda_id);
  const currentErpAgenteVendaId = asPositiveNumber(agent?.erp_agente_venda_id);
  if (!agentId || resolution?.status !== 'ok' || !resolvedId) {
    throw new Error('Usuário ERP não pôde ser validado antes de sincronizar o canal.');
  }
  if (!canalId) {
    return {
      status: 'sem_canal_configurado',
      confirmed: false,
      erpAgenteVendaId: currentErpAgenteVendaId,
      actions: [],
    };
  }

  const pessoaId = asPositiveNumber(resolution.pessoaInternalId);
  if (!pessoaId) {
    const error = new Error('A Pessoa do ERP não foi localizada para registrar o canal de vendas.');
    error.code = 'pessoa_nao_encontrada';
    throw error;
  }

  const current = (await queryDb(
    `SELECT cpf, erp_agent_id, canal_venda_id, canal_venda_grupo_id
       FROM agents
      WHERE id = $1`,
    [agentId]
  )).rows[0];
  if (!sameAgentSnapshot(current, agent, resolvedId)) {
    const error = new Error(
      'O CPF ou o canal do agente mudou durante a sincronização. Nenhum vínculo de canal foi gravado.'
    );
    error.code = 'agente_alterado_durante_sync';
    throw error;
  }

  const confirmedErpAgenteVendaId = asPositiveNumber(await registerCanal(
    pessoaId,
    canalId,
    asPositiveNumber(agent.canal_venda_grupo_id)
  ));
  if (!confirmedErpAgenteVendaId) {
    const error = new Error('O ERP não retornou um vínculo válido para o canal de vendas.');
    error.code = 'canal_invalido';
    throw error;
  }

  const actions = [];
  if (confirmedErpAgenteVendaId !== currentErpAgenteVendaId) {
    const linkedCanal = await queryDb(
      `UPDATE agents
          SET erp_agente_venda_id = $1, updated_at = NOW()
        WHERE id = $2
          AND erp_agent_id = $3
          AND cpf IS NOT DISTINCT FROM $4
          AND canal_venda_id = $5
          AND canal_venda_grupo_id IS NOT DISTINCT FROM $6
        RETURNING id`,
      [
        confirmedErpAgenteVendaId,
        agentId,
        resolvedId,
        agent.cpf ?? null,
        canalId,
        asPositiveNumber(agent.canal_venda_grupo_id),
      ]
    );
    if (linkedCanal.rowCount === 0) {
      const error = new Error(
        'O CPF ou o canal do agente mudou durante a sincronização. O novo vínculo não foi associado ao cadastro local.'
      );
      error.code = 'agente_alterado_durante_sync';
      throw error;
    }
    actions.push('canal');
  }

  return {
    status: 'canal_confirmado',
    confirmed: true,
    erpAgenteVendaId: confirmedErpAgenteVendaId,
    actions,
  };
}

/**
 * Espelha no Bom Flow somente um vínculo de canal que já esteja confirmado no
 * ERP. É usado no pré-processamento de orçamento para recuperar um espelho
 * local ausente sem criar Pessoa×Canal como efeito colateral da venda.
 */
export async function mirrorConfirmedAgentCanal({
  agent,
  resolution,
  queryDb,
  inspectCanal,
}) {
  const agentId = agent?.id;
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  const canalId = asPositiveNumber(agent?.canal_venda_id);
  const pessoaId = asPositiveNumber(resolution?.pessoaInternalId);
  if (!agentId || resolution?.status !== 'ok' || !resolvedId || !pessoaId) {
    throw new Error('Usuário e Pessoa ERP precisam estar confirmados antes de recuperar o canal.');
  }
  if (!canalId) {
    const error = new Error(
      'Seu cadastro não possui um canal de vendas configurado para confirmar no ERP.'
    );
    error.code = 'sem_canal_configurado';
    error.statusCode = 422;
    throw error;
  }

  const current = (await queryDb(
    `SELECT cpf, erp_agent_id, erp_agente_venda_id, canal_venda_id, canal_venda_grupo_id
       FROM agents
      WHERE id = $1`,
    [agentId]
  )).rows[0];
  if (!sameAgentSnapshot(current, agent, resolvedId)) {
    const error = new Error(
      'O CPF ou o canal do agente mudou durante a reconciliação automática. O orçamento não foi enviado.'
    );
    error.code = 'agente_alterado_durante_sync';
    throw error;
  }

  const inspection = await inspectCanal(
    pessoaId,
    canalId,
    asPositiveNumber(agent.canal_venda_grupo_id)
  );
  const canal = classifyCanalSyncState({
    hasCanal: true,
    currentErpAgenteVendaId: current?.erp_agente_venda_id,
    inspection,
  });
  if (canal.status === 'canal_ambiguo') {
    const error = new Error(
      'Há mais de um vínculo para este canal no ERP. O orçamento não pode escolher um deles automaticamente.'
    );
    error.code = 'canal_ambiguo';
    error.statusCode = 422;
    throw error;
  }
  if (!canal.confirmed || !canal.effectiveErpAgenteVendaId) {
    throw createMissingErpCanalError();
  }

  const currentErpAgenteVendaId = asPositiveNumber(current?.erp_agente_venda_id);
  if (
    currentErpAgenteVendaId
    && currentErpAgenteVendaId !== canal.effectiveErpAgenteVendaId
  ) {
    const error = new Error(
      'O espelho local do canal diverge do vínculo confirmado no ERP. O orçamento não o substituirá automaticamente.'
    );
    error.code = 'canal_divergente';
    error.statusCode = 422;
    throw error;
  }
  if (currentErpAgenteVendaId) {
    return {
      status: 'canal_confirmado',
      confirmed: true,
      erpAgenteVendaId: currentErpAgenteVendaId,
      actions: [],
    };
  }

  const mirrored = await queryDb(
    `UPDATE agents
        SET erp_agente_venda_id = $1, updated_at = NOW()
      WHERE id = $2
        AND erp_agent_id = $3
        AND erp_agente_venda_id IS NULL
        AND cpf IS NOT DISTINCT FROM $4
        AND canal_venda_id = $5
        AND canal_venda_grupo_id IS NOT DISTINCT FROM $6
      RETURNING id`,
    [
      canal.effectiveErpAgenteVendaId,
      agentId,
      resolvedId,
      agent.cpf ?? null,
      canalId,
      asPositiveNumber(agent.canal_venda_grupo_id),
    ]
  );
  if (mirrored.rowCount === 0) {
    const error = new Error(
      'O cadastro do agente mudou durante a reconciliação automática. O canal confirmado não foi espelhado.'
    );
    error.code = 'agente_alterado_durante_sync';
    throw error;
  }

  return {
    status: 'canal_confirmado',
    confirmed: true,
    erpAgenteVendaId: canal.effectiveErpAgenteVendaId,
    actions: ['canal'],
  };
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
  syncCanal = true,
}) {
  const agentId = agent?.id;
  const resolvedId = asPositiveNumber(resolution?.usuarioId);
  if (!agentId || resolution?.status !== 'ok' || !resolvedId) {
    throw new Error('Vínculo ERP não pôde ser validado de forma inequívoca pelo CPF.');
  }

  let erpAgentId = asPositiveNumber(agent.erp_agent_id);
  let erpAgenteVendaId = asPositiveNumber(agent.erp_agente_venda_id);
  const actions = [];

  if (erpAgentId && erpAgentId !== resolvedId) {
    const error = new Error(
      `O ID de Usuário ERP já salvo (${erpAgentId}) diverge do usuário resolvido pelo CPF (${resolvedId}). O ID existente é imutável e o caso exige investigação.`
    );
    error.code = 'usuario_id_divergente';
    throw error;
  }

  if (!erpAgentId) {
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

    const linked = await queryDb(
      `UPDATE agents
          SET erp_agent_id = $1, updated_at = NOW()
        WHERE id = $2
          AND erp_agent_id IS NULL
          AND cpf IS NOT DISTINCT FROM $3
          AND canal_venda_id IS NOT DISTINCT FROM $4
          AND canal_venda_grupo_id IS NOT DISTINCT FROM $5
        RETURNING erp_agent_id`,
      [
        resolvedId,
        agentId,
        agent.cpf ?? null,
        asPositiveNumber(agent.canal_venda_id),
        asPositiveNumber(agent.canal_venda_grupo_id),
      ]
    );
    if (linked.rowCount === 0) {
      const current = (await queryDb(
        `SELECT cpf, erp_agent_id, canal_venda_id, canal_venda_grupo_id
           FROM agents
          WHERE id = $1`,
        [agentId]
      )).rows[0];
      if (!sameAgentSnapshot(current, agent, resolvedId)) {
        const error = new Error(
          'O CPF ou o canal do agente mudou durante a sincronização. A operação foi interrompida sem sobrescrever o vínculo.'
        );
        error.code = 'agente_alterado_durante_sync';
        throw error;
      }
    }
    erpAgentId = resolvedId;
    actions.push('vinculo');
  }

  // A sincronização principal usa somente a API REST do ERP. Sem acesso direto
  // ao banco ERP, o canal permanece pendente e seus espelhos locais não são
  // alterados por inferência.
  if (!syncCanal) {
    return { erpAgentId, erpAgenteVendaId, actions };
  }

  const canal = await syncResolvedAgentCanal({
    agent,
    resolution,
    queryDb,
    registerCanal,
  });
  erpAgenteVendaId = canal.erpAgenteVendaId;
  actions.push(...canal.actions);

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