import { query } from '../config/database.js';
import { getErpPool } from './erpDbService.js';

const CONFIG = {
  bom_auto: {
    table: 'bom_auto_atendimentos',
    erpTable: 'public.x_atendimentos_bom_auto',
    identityColumns: ['documento_cliente', 'placa'],
    required: ['protocolo', 'documento_cliente', 'placa', 'nome_cliente', 'tipo_servico', 'data_hora', 'usuario', 'status_atendimento'],
  },
  bom_pet: {
    table: 'bom_pet_atendimentos',
    erpTable: 'public.x_atendimentos_bom_pet',
    identityColumns: ['documento_cliente', 'pet_contrato_id', 'pet_nome', 'origem'],
    required: ['protocolo', 'documento_cliente', 'nome_cliente', 'pet_nome', 'data_hora', 'usuario', 'status_atendimento', 'origem'],
  },
};

function missingFields(modulo, row) {
  const missing = CONFIG[modulo].required.filter((field) => (
    row[field] == null || (typeof row[field] === 'string' && !row[field].trim())
  ));
  if (modulo === 'bom_pet' && row.origem === 'Plano' && row.pet_contrato_id == null) {
    missing.push('pet_contrato_id');
  }
  if (modulo === 'bom_pet' && row.origem === 'Particular' && row.valor_pago_particular == null) {
    missing.push('valor_pago_particular');
  }
  return missing;
}

export function classifyErpAtendimentoBackfillRow(modulo, row, erpRow = null) {
  const missing = missingFields(modulo, row);
  if (missing.length) {
    return { classification: 'impedido', reason: `campos_ausentes:${missing.join(',')}` };
  }
  if (row.outbox_status === 'completed') {
    return { classification: 'ja_sincronizado', reason: 'outbox_completed' };
  }
  if (erpRow) {
    const collision = CONFIG[modulo].identityColumns.some(
      (field) => String(erpRow[field] ?? '') !== String(row[field] ?? '')
    );
    return collision
      ? { classification: 'impedido', reason: 'protocolo_erp_com_identidade_divergente' }
      : { classification: 'ja_sincronizado', reason: 'protocolo_existente_no_erp' };
  }
  return {
    classification: 'elegivel',
    reason: row.outbox_id ? `outbox_${row.outbox_status}` : 'historico_sem_outbox',
  };
}

export async function buildErpAtendimentoBackfillPreview({
  localQuery = query,
  erpDb = getErpPool(),
} = {}) {
  const items = [];
  for (const [modulo, config] of Object.entries(CONFIG)) {
    const local = await localQuery(
      `SELECT a.*, o.id AS outbox_id, o.status AS outbox_status,
              COALESCE(o.attempts, 0) AS outbox_attempts, o.last_error
         FROM ${config.table} a
         LEFT JOIN erp_atendimento_outbox o
           ON o.modulo = $1 AND o.atendimento_id = a.id
        ORDER BY a.data_hora, a.id`,
      [modulo]
    );
    const protocols = local.rows.map((row) => row.protocolo).filter(Boolean);
    const erp = protocols.length
      ? await erpDb.query(
          `SELECT * FROM ${config.erpTable} WHERE protocolo = ANY($1::text[])`,
          [protocols]
        )
      : { rows: [] };
    const byProtocol = new Map(erp.rows.map((row) => [row.protocolo, row]));
    for (const row of local.rows) {
      const result = classifyErpAtendimentoBackfillRow(
        modulo,
        row,
        byProtocol.get(row.protocolo) || null
      );
      items.push({
        modulo,
        atendimento_id: Number(row.id),
        protocolo: row.protocolo,
        data_hora: row.data_hora,
        status_atendimento: row.status_atendimento,
        origem_fila: row.outbox_id ? 'ja_enfileirado' : 'historico_sem_outbox',
        outbox_status: row.outbox_status || 'sem_outbox',
        tentativas: Number(row.outbox_attempts || 0),
        ultimo_erro: row.last_error || null,
        ...result,
      });
    }
  }
  return items;
}

export async function stageErpAtendimentoBackfill(protocols, {
  limit = 20,
  localQuery = query,
  erpDb = getErpPool(),
} = {}) {
  const approved = [...new Set(protocols.map(String).filter(Boolean))];
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 20));
  if (!approved.length) return { staged: 0, protocols: [] };
  const preview = await buildErpAtendimentoBackfillPreview({ localQuery, erpDb });
  const eligible = preview
    .filter((item) => approved.includes(item.protocolo)
      && item.classification === 'elegivel'
      && item.origem_fila === 'historico_sem_outbox')
    .slice(0, safeLimit);
  if (!eligible.length) {
    return { staged: 0, protocols: [], rejected: approved };
  }
  const result = await localQuery(
    `INSERT INTO erp_atendimento_outbox (modulo, atendimento_id, protocolo, status)
     SELECT item.modulo, item.atendimento_id, item.protocolo, 'held'
       FROM jsonb_to_recordset($1::jsonb)
         AS item(modulo text, atendimento_id bigint, protocolo text)
     ON CONFLICT DO NOTHING
     RETURNING protocolo, status`,
    [JSON.stringify(eligible.map(({ modulo, atendimento_id, protocolo }) => ({
      modulo, atendimento_id, protocolo,
    })))]
  );
  return {
    staged: result.rows.length,
    protocols: result.rows.map((row) => row.protocolo),
    rejected: approved.filter((protocol) => !result.rows.some((row) => row.protocolo === protocol)),
  };
}

export async function releaseErpAtendimentoBackfill(protocols, {
  limit = 20,
  localQuery = query,
  erpDb = getErpPool(),
} = {}) {
  const approved = [...new Set(protocols.map(String).filter(Boolean))];
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 20));
  if (!approved.length) return { released: 0, protocols: [] };
  const held = [];
  for (const [modulo, config] of Object.entries(CONFIG)) {
    const local = await localQuery(
      `SELECT a.*, o.id AS outbox_id, o.status AS outbox_status
         FROM ${config.table} a
         JOIN erp_atendimento_outbox o
           ON o.modulo = $1 AND o.atendimento_id = a.id
        WHERE o.status = 'held' AND o.protocolo = ANY($2::text[])`,
      [modulo, approved]
    );
    if (!local.rows.length) continue;
    const erp = await erpDb.query(
      `SELECT * FROM ${config.erpTable} WHERE protocolo = ANY($1::text[])`,
      [local.rows.map((row) => row.protocolo)]
    );
    const byProtocol = new Map(erp.rows.map((row) => [row.protocolo, row]));
    for (const row of local.rows) {
      const classification = classifyErpAtendimentoBackfillRow(
        modulo, row, byProtocol.get(row.protocolo) || null
      );
      if (classification.classification === 'elegivel') held.push(row.protocolo);
    }
  }
  const releasable = held.slice(0, safeLimit);
  if (!releasable.length) return { released: 0, protocols: [], rejected: approved };
  const result = await localQuery(
    `WITH selected AS (
       SELECT id FROM erp_atendimento_outbox
        WHERE status = 'held' AND protocolo = ANY($1::text[])
        ORDER BY id
     )
     UPDATE erp_atendimento_outbox o
        SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP,
            last_error = NULL, updated_at = CURRENT_TIMESTAMP
       FROM selected s WHERE o.id = s.id
     RETURNING o.protocolo`,
    [releasable]
  );
  return {
    released: result.rows.length,
    protocols: result.rows.map((row) => row.protocolo),
    rejected: approved.filter((protocol) => !result.rows.some((row) => row.protocolo === protocol)),
  };
}