import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import uploadRoutes from './routes/upload.js';
import functionRoutes from './routes/functions.js';
import whatsappRoutes from './routes/whatsapp.js';
import attendanceConnectionsRoutes from './routes/attendanceConnections.js';
import attendanceChatRoutes from './routes/attendanceChat.js';
import attendanceWebhookRoutes from './routes/attendanceWebhook.js';
import bomAutoRoutes from './routes/bomAuto.js';
import bomPetRoutes from './routes/bomPet.js';
import erpProxyRoutes from './routes/erpProxy.js';
import apiKeyRoutes from './routes/apiKeys.js';
import externalRoutes from './routes/external.js';
import orcamentoDocumentosRoutes from './routes/orcamentoDocumentos.js';
import presalesAjustesRoutes from './routes/presalesAjustes.js';
import postsalesRoutes, {
  runPostsalesCongelarVencidas,
  runPostsalesReconciliarResolvidas,
} from './routes/postsales.js';
import leadImportsRoutes from './routes/leadImports.js';
import erpAuditLogsRoutes from './routes/erpAuditLogs.js';
import { installErpFetchAudit, erpOriginMiddleware, withErpOrigin, cleanupErpRequestLogs } from './services/erpAuditService.js';
import { runAllAutomations, checkValidacaoPagamento } from './services/automationService.js';
import { syncDeliveryStatuses } from './services/deliveryStatusService.js';
import cron from 'node-cron';
import { runLeadGeneratorAudit, runCommissionReconciliation, runWeeklyCommissionBatch, sendCommissionReport, runPerspectivaBatch, sendPerspectivaReport, runPresalesAjusteAutoCancel, runPresalesAjusteAvisoPrazo } from './routes/functions.js';
import { recoverStuckQueues } from './services/whatsappQueueService.js';
import { deactivateInactiveAgents } from './services/inactivityService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

// Auditoria de chamadas de saída ao ERP: intercepta o fetch global para os hosts
// do ERP e propaga a origem (rota HTTP + usuário) via AsyncLocalStorage.
installErpFetchAudit();
app.use(erpOriginMiddleware);

const distPath = path.join(__dirname, '../../dist');
let indexHtml = '<!DOCTYPE html><html><head><title>Wescctech CRM</title></head><body><h1>OK</h1></body></html>';

try {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    console.log('Loaded index.html from dist');
  }
} catch (err) {
  console.log('Using fallback HTML');
}

app.get('/', (req, res) => {
  res.status(200).type('html').send(indexHtml);
});

app.get('/api/health', (req, res) => {
  // smoke: 'ok' | 'stale' | 'pending' — 'stale' indica processo rodando código
  // desatualizado (rota crítica ausente). Consultável para monitoramento.
  const stale = smokeCheckState.failures.length > 0;
  res.status(stale ? 500 : 200).json({
    status: stale ? 'stale' : 'ok',
    smoke: smokeCheckState.done ? (stale ? 'stale' : 'ok') : 'pending',
    ...(stale && { smoke_failures: smokeCheckState.failures }),
    started_at: smokeCheckState.startedAt,
  });
});

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/data/bom-auto-images', express.static(path.join(__dirname, '../../data/bom-auto-images')));
app.use('/proposals', express.static(path.join(__dirname, '../public/proposals')));

// Mídia do WhatsApp Chat via Object Storage foi removida a pedido do usuário
// (produção usa o storage do próprio servidor). A rota permanece só para
// responder de forma clara a links antigos.
app.get('/api/whatsapp-media/:objectId', (req, res) => {
  res.status(410).json({ message: 'Mídia indisponível: armazenamento externo removido.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/external', externalRoutes);
app.use('/api', entityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/attendance/connections', attendanceConnectionsRoutes);
app.use('/api/attendance', attendanceChatRoutes);
app.use('/api/webhooks/attendance', attendanceWebhookRoutes);
app.use('/api/bom-auto', bomAutoRoutes);
app.use('/api/bom-pet', bomPetRoutes);
app.use('/api/erp', erpProxyRoutes);
app.use('/api/orcamento-documentos', orcamentoDocumentosRoutes);
app.use('/api/presales-ajustes', presalesAjustesRoutes);
app.use('/api/postsales', postsalesRoutes);
app.use('/api/lead-imports', leadImportsRoutes);
app.use('/api/erp-audit', erpAuditLogsRoutes);

app.use(express.static(distPath));

app.post('/api/api_chatid_indicacoes', async (req, res) => {
  try {
    const apiHash = req.headers['x-api-hash'];
    const expectedHash = process.env.API_HASH_WHU;

    if (!expectedHash || apiHash !== expectedHash) {
      console.log('[api_chatid_indicacoes] Unauthorized request (invalid or missing x-api-hash)');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'chatId é obrigatório' });
    }

    const { query: dbQuery } = await import('./config/database.js');

    const result = await dbQuery(
      'SELECT id FROM gerador_leads_whatsapp_logs WHERE whu_chat_id = $1 LIMIT 1',
      [String(chatId)]
    );

    const found = result.rows.length > 0;

    if (found) {
      await dbQuery(
        'UPDATE gerador_leads_whatsapp_logs SET retorno_whu = true WHERE whu_chat_id = $1',
        [String(chatId)]
      );
    }

    // Vendas PF: resposta do cliente também interrompe as automações PF
    // (leads.automation_responded_at). Fallback por telefone quando o chat
    // não bate (o WHU pode reciclar o chatId entre disparos).
    let pfFound = false;
    try {
      const { markLeadRespondedByChat } = await import('./services/pfAutomationCycle.js');
      const rawPhone = req.body.phone || req.body.number || req.body.contactNumber || null;
      pfFound = await markLeadRespondedByChat(chatId, rawPhone, dbQuery);
    } catch (pfError) {
      console.error('[api_chatid_indicacoes] Erro ao marcar resposta PF:', pfError.message);
    }

    console.log(`[api_chatid_indicacoes] chatId=${chatId} → retorno_whu=${found}, lead_pf=${pfFound}`);

    return res.json({
      success: found || pfFound,
      message: (found || pfFound) ? 'Chat encontrado' : 'Chat não encontrado'
    });
  } catch (error) {
    console.error('[api_chatid_indicacoes] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.status(200).type('html').send(indexHtml);
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  runBootSmokeCheck();
});

// ── Smoke check de boot ────────────────────────────────────────────────────
// Detecta processo desatualizado (rotas montadas no disco mas ausentes no
// processo em execução) — causa do incidente "Bom Pet 404". Uma rota crítica
// respondendo 404 no próprio processo indica build/deploy defasado.
const smokeCheckState = { done: false, failures: [], startedAt: new Date().toISOString() };

const SMOKE_ROUTES = [
  '/api/health',
  '/api/bom-pet/consulta',
  '/api/bom-auto/consulta',
];

async function runBootSmokeCheck() {
  for (const route of SMOKE_ROUTES) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}${route}`);
      // 401/400/etc = rota montada (middleware respondeu); 404 = rota ausente.
      if (res.status === 404) {
        smokeCheckState.failures.push(route);
        console.error(`[SmokeCheck] FALHA: rota ${route} respondeu 404 — processo pode estar desatualizado (recarregue/republique o backend).`);
      } else {
        console.log(`[SmokeCheck] OK: ${route} (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error(`[SmokeCheck] Erro ao verificar ${route}:`, err.message);
    }
  }
  smokeCheckState.done = true;
  if (smokeCheckState.failures.length > 0) {
    console.error(`[SmokeCheck] ATENÇÃO: ${smokeCheckState.failures.length} rota(s) crítica(s) ausente(s) — /api/health passa a responder 500 (status "stale") até o processo ser recarregado com o código atual.`);
  }
}

initDatabase()
  .then(async () => {
    console.log('Database schema initialized successfully');

    try {
      const reconciliation = await runPostsalesReconciliarResolvidas();
      console.log(
        `[PosVendas ReconciliarResolvidas] Inicialização concluída. verificadas=${reconciliation.checked} ` +
        `reconciliadas=${reconciliation.reconciled} ambíguas=${reconciliation.ambiguous.length} ` +
        `sem_evidência=${reconciliation.pending_without_evidence} erros=${reconciliation.errors}`
      );
    } catch (error) {
      console.error('[PosVendas ReconciliarResolvidas] Erro na inicialização:', error.message);
    }
    
    const AUTOMATION_INTERVAL = 60 * 60 * 1000;
    
    setTimeout(() => {
      console.log('[Automations] Starting initial automation check...');
      withErpOrigin('cron:runAllAutomations', () => runAllAutomations().catch(console.error));
    }, 30000);
    
    setInterval(() => {
      console.log('[Automations] Running scheduled automation check...');
      withErpOrigin('cron:runAllAutomations', () => runAllAutomations().catch(console.error));
    }, AUTOMATION_INTERVAL);
    
    console.log(`[Automations] Scheduler initialized. Running every ${AUTOMATION_INTERVAL / 60000} minutes.`);

    // Retaguarda: mantém os status de entrega/leitura (WHU) dos logs recentes
    // atualizados mesmo sem ninguém abrir o painel — captura o erro -1 assíncrono
    // da Meta. Rotina leve: poucas dezenas de mensagens por ciclo.
    const DELIVERY_SYNC_INTERVAL = 12 * 60 * 1000;
    setInterval(() => {
      syncDeliveryStatuses({ limit: 40 })
        .then((r) => {
          if (r.eligible) console.log(`[DeliverySync] Ciclo periódico: ${r.synced}/${r.eligible} logs sincronizados.`);
        })
        .catch((err) => console.error('[DeliverySync] Erro no ciclo periódico:', err.message));
    }, DELIVERY_SYNC_INTERVAL);
    console.log(`[DeliverySync] Rotina periódica agendada a cada ${DELIVERY_SYNC_INTERVAL / 60000} minutos.`);

    // Validação de pagamento (API_VALIDACAO_PAGAMENTO): fora do ciclo horário.
    // Roda apenas 2x/dia — 01:00 e 22:00 no horário de Brasília — porque a
    // liquidação muda no máximo 1x/dia e a comissão só é apurada no lote de quarta.
    cron.schedule('0 1,22 * * *', () => withErpOrigin('cron:checkValidacaoPagamento', async () => {
      console.log('[ValidacaoPagamento] Iniciando execução agendada (2x/dia)...');
      try {
        await checkValidacaoPagamento();
      } catch (error) {
        console.error('[ValidacaoPagamento] Erro na execução agendada:', error.message);
      }
    }), { timezone: 'America/Sao_Paulo' });
    console.log('[ValidacaoPagamento] Cron agendado: 01:00 e 22:00 (horário de Brasília).');

    cron.schedule('0 3 * * *', () => withErpOrigin('cron:runLeadGeneratorAudit', async () => {
      console.log('[Lead Generator Audit] Iniciando auditoria automática diária...');
      try {
        const { divergencias } = await runLeadGeneratorAudit();
        console.log(`[Lead Generator Audit] Auditoria diária concluída. Divergências: ${divergencias}`);
      } catch (error) {
        console.error('[Lead Generator Audit] Erro na auditoria automática:', error.message);
      }
    }));
    console.log('[Lead Generator Audit] Cron agendado: todos os dias às 03:00.');

    cron.schedule('0 4 * * *', () => withErpOrigin('cron:runCommissionReconciliation', async () => {
      console.log('[Commission Reconciliation] Iniciando reconciliação automática diária...');
      try {
        const result = await runCommissionReconciliation();
        console.log(`[Commission Reconciliation] Reconciliação concluída. Inconsistências: ${result.issuesFound || 0}`);
      } catch (error) {
        console.error('[Commission Reconciliation] Erro na reconciliação automática:', error.message);
      }
    }));
    console.log('[Commission Reconciliation] Cron agendado: todos os dias às 04:00.');

    cron.schedule('0 5 * * 3', () => withErpOrigin('cron:runWeeklyCommissionBatch', async () => {
      console.log('[Commission Batch] Iniciando geração de lote semanal (quarta-feira)...');
      try {
        const result = await runWeeklyCommissionBatch();
        console.log(`[Commission Batch] Lote gerado. Novas comissões: ${result.newCommissions || 0}, Lote: ${result.batchId || 'N/A'}`);
      } catch (error) {
        console.error('[Commission Batch] Erro na geração de lote:', error.message);
      }
    }));
    console.log('[Commission Batch] Cron agendado: quartas-feiras às 05:00.');

    cron.schedule('30 5 * * 3', () => withErpOrigin('cron:runPerspectivaBatch', async () => {
      console.log('[Perspectiva Batch] Iniciando geração de lote ERP (quarta-feira)...');
      try {
        const result = await runPerspectivaBatch();
        console.log(`[Perspectiva Batch] Lote gerado. Novas comissões: ${result.newCommissions || 0}, Lote: ${result.batchId || 'N/A'}`);
      } catch (error) {
        console.error('[Perspectiva Batch] Erro na geração de lote:', error.message);
      }
    }));
    console.log('[Perspectiva Batch] Cron agendado: quartas-feiras às 05:30.');

    cron.schedule('0 8 * * 3', () => withErpOrigin('cron:sendPerspectivaReport', async () => {
      console.log('[Perspectiva Email] Iniciando envio automático de relatório semanal (ERP)...');
      try {
        const result = await sendPerspectivaReport({ tipo_envio: 'automatico', usuario_envio: 'system' });
        if (result.skipped) {
          console.log(`[Perspectiva Email] Envio pulado: ${result.message}`);
        } else {
          console.log(`[Perspectiva Email] Relatório enviado. Indicadores: ${result.totalIndicadores}, Valor: R$ ${result.valorTotal?.toFixed(2)}`);
        }
      } catch (error) {
        console.error('[Perspectiva Email] Erro no envio automático:', error.message);
      }
    }));
    console.log('[Perspectiva Email] Cron agendado: quartas-feiras às 08:00 (ERP).');

    cron.schedule('0 7 * * *', () => withErpOrigin('cron:presalesAjustes', async () => {
      // Aviso antecipado primeiro (não-destrutivo): avisa o vendedor cujo prazo vence
      // no próximo dia útil, dando chance de evitar o cancelamento no ciclo seguinte.
      console.log('[PreSales AvisoPrazo] Iniciando verificação diária de aviso antecipado de prazo...');
      try {
        const w = await runPresalesAjusteAvisoPrazo();
        console.log(`[PreSales AvisoPrazo] Concluído. verificados=${w.checked} avisados=${w.warned} pulados=${w.skipped} erros=${w.errors}`);
      } catch (error) {
        console.error('[PreSales AvisoPrazo] Erro na verificação automática:', error.message);
      }

      console.log('[PreSales AutoCancel] Iniciando verificação diária de auto-cancelamento de ajustes...');
      try {
        const r = await runPresalesAjusteAutoCancel();
        console.log(`[PreSales AutoCancel] Concluído. dryRun=${r.dryRun} verificados=${r.checked} vencidos=${r.overdue} cancelados=${r.cancelled} simulados=${r.simulated} pulados=${r.skipped} erros=${r.errors}`);
      } catch (error) {
        console.error('[PreSales AutoCancel] Erro na verificação automática:', error.message);
      }
      // Pós-Vendas: congela devoluções com prazo (3 dias úteis) vencido sem resolução.
      // A reconciliação vem antes para não congelar uma devolução que já tenha
      // evidência inequívoca de resolução na trilha.
      console.log('[PosVendas ReconciliarResolvidas] Iniciando reconciliação histórica...');
      try {
        const reconciliation = await runPostsalesReconciliarResolvidas();
        console.log(
          `[PosVendas ReconciliarResolvidas] Concluído. verificadas=${reconciliation.checked} ` +
          `reconciliadas=${reconciliation.reconciled} ambíguas=${reconciliation.ambiguous.length} ` +
          `sem_evidência=${reconciliation.pending_without_evidence} erros=${reconciliation.errors}`
        );
      } catch (error) {
        console.error('[PosVendas ReconciliarResolvidas] Erro na reconciliação:', error.message);
      }

      console.log('[PosVendas CongelarVencidas] Iniciando verificação diária de devoluções vencidas...');
      try {
        const p = await runPostsalesCongelarVencidas();
        console.log(`[PosVendas CongelarVencidas] Concluído. verificadas=${p.checked} congeladas=${p.frozen} erros=${p.errors}`);
      } catch (error) {
        console.error('[PosVendas CongelarVencidas] Erro na verificação automática:', error.message);
      }
    }));
    console.log('[PreSales AutoCancel] Cron agendado: todos os dias às 07:00 (aviso antecipado + auto-cancelamento + congelamento Pós-Vendas).');

    // Retenção do log de auditoria ERP: remove registros com mais de 30 dias.
    cron.schedule('30 2 * * *', () => {
      cleanupErpRequestLogs(30).catch((e) => console.error('[erpAudit] Cron de limpeza falhou:', e.message));
    });
    console.log('[erpAudit] Cron de retenção agendado: todos os dias às 02:30 (30 dias).');

    // Inativação automática: agentes com 30+ dias sem atividade registrada
    // (exceto o usuário master) viram active=false com motivo 'inatividade'.
    cron.schedule('15 6 * * *', () => {
      console.log('[Inatividade] Iniciando rotina diária de inativação por inatividade...');
      deactivateInactiveAgents()
        .then((r) => console.log(`[Inatividade] Rotina concluída: ${r.deactivated} agente(s) inativado(s).`))
        .catch((e) => console.error('[Inatividade] Rotina diária falhou:', e.message));
    }, { timezone: 'America/Sao_Paulo' });
    console.log('[Inatividade] Cron agendado: todos os dias às 06:15 (horário de Brasília).');

    try {
      await recoverStuckQueues();
    } catch (err) {
      console.error('[Recovery] Falha no recovery de itens presos (não impede inicialização):', err.message);
    }
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
