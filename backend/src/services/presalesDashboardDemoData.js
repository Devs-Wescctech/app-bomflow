const AUDITORS = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Ana Martins' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Bruno Souza' },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Carla Nunes' },
];

function ago(days, hours = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(date.getUTCHours() - hours);
  return date.toISOString();
}

export function buildPresalesDashboardDemoRows() {
  const definitions = [
    [1, 0, 3, 'concluida', 'aprovado', null, 'Clínica Horizonte', 0],
    [2, 1, 8, 'concluida', 'aprovado', null, 'Grupo Primavera', 1],
    [3, 2, 13, 'concluida', 'aprovado', null, 'Instituto Aliança', 2],
    [4, 0, 2, 'em_auditoria', null, null, 'Comercial Vitória', null],
    [5, 1, 4, 'em_auditoria', null, 'pendente', 'Rede Nova Vida', null],
    [6, 2, 6, 'em_auditoria', null, null, 'Clínica Horizonte', null],
    [7, 0, 10, 'concluida', 'liberada', null, 'Grupo Primavera', 8],
    [8, 1, 16, 'concluida', 'aprovado', null, 'Rede Nova Vida', 13],
  ];
  return definitions.map(([number, auditorIndex, entryDays, status, resultado, adjustmentStatus, client, completionDays]) => {
    const auditor = AUDITORS[auditorIndex];
    const entryAt = ago(entryDays);
    const concludedAt = completionDays === null ? null : ago(completionDays);
    return {
      id: `DEMO-PRE-${String(number).padStart(3, '0')}`,
      erp_pedido_id: 9_900_000 + number,
      erp_numero: `DEMO-${String(number).padStart(3, '0')}`,
      auditor_id: auditor.id,
      auditor_nome: auditor.name,
      cliente_nome: client,
      status,
      resultado,
      assumido_at: entryAt,
      concluida_at: concludedAt,
      created_at: ago(entryDays),
      updated_at: concludedAt || ago(Math.max(0, entryDays - 1)),
      orcamento_criado_at: ago(entryDays, 5 + number),
      adjustment_status: adjustmentStatus,
      adjustment_updated_at: adjustmentStatus ? ago(Math.max(0, entryDays - 2)) : null,
    };
  });
}