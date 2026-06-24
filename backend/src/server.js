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
import bomAutoRoutes from './routes/bomAuto.js';
import erpProxyRoutes from './routes/erpProxy.js';
import apiKeyRoutes from './routes/apiKeys.js';
import externalRoutes from './routes/external.js';
import orcamentoDocumentosRoutes from './routes/orcamentoDocumentos.js';
import presalesAjustesRoutes from './routes/presalesAjustes.js';
import { runAllAutomations } from './services/automationService.js';
import cron from 'node-cron';
import { runLeadGeneratorAudit, runCommissionReconciliation, runWeeklyCommissionBatch, sendCommissionReport, runPerspectivaBatch, sendPerspectivaReport } from './routes/functions.js';
import { recoverStuckQueues } from './services/whatsappQueueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

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
  res.status(200).json({ status: 'ok' });
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

app.use('/api/auth', authRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/external', externalRoutes);
app.use('/api', entityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/bom-auto', bomAutoRoutes);
app.use('/api/erp', erpProxyRoutes);
app.use('/api/orcamento-documentos', orcamentoDocumentosRoutes);
app.use('/api/presales-ajustes', presalesAjustesRoutes);

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

    console.log(`[api_chatid_indicacoes] chatId=${chatId} → retorno_whu=${found}`);

    return res.json({
      success: found,
      message: found ? 'Chat encontrado' : 'Chat não encontrado'
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
});

initDatabase()
  .then(async () => {
    console.log('Database schema initialized successfully');
    
    const AUTOMATION_INTERVAL = 60 * 60 * 1000;
    
    setTimeout(() => {
      console.log('[Automations] Starting initial automation check...');
      runAllAutomations().catch(console.error);
    }, 30000);
    
    setInterval(() => {
      console.log('[Automations] Running scheduled automation check...');
      runAllAutomations().catch(console.error);
    }, AUTOMATION_INTERVAL);
    
    console.log(`[Automations] Scheduler initialized. Running every ${AUTOMATION_INTERVAL / 60000} minutes.`);

    cron.schedule('0 3 * * *', async () => {
      console.log('[Lead Generator Audit] Iniciando auditoria automática diária...');
      try {
        const { divergencias } = await runLeadGeneratorAudit();
        console.log(`[Lead Generator Audit] Auditoria diária concluída. Divergências: ${divergencias}`);
      } catch (error) {
        console.error('[Lead Generator Audit] Erro na auditoria automática:', error.message);
      }
    });
    console.log('[Lead Generator Audit] Cron agendado: todos os dias às 03:00.');

    cron.schedule('0 4 * * *', async () => {
      console.log('[Commission Reconciliation] Iniciando reconciliação automática diária...');
      try {
        const result = await runCommissionReconciliation();
        console.log(`[Commission Reconciliation] Reconciliação concluída. Inconsistências: ${result.issuesFound || 0}`);
      } catch (error) {
        console.error('[Commission Reconciliation] Erro na reconciliação automática:', error.message);
      }
    });
    console.log('[Commission Reconciliation] Cron agendado: todos os dias às 04:00.');

    cron.schedule('0 5 * * 3', async () => {
      console.log('[Commission Batch] Iniciando geração de lote semanal (quarta-feira)...');
      try {
        const result = await runWeeklyCommissionBatch();
        console.log(`[Commission Batch] Lote gerado. Novas comissões: ${result.newCommissions || 0}, Lote: ${result.batchId || 'N/A'}`);
      } catch (error) {
        console.error('[Commission Batch] Erro na geração de lote:', error.message);
      }
    });
    console.log('[Commission Batch] Cron agendado: quartas-feiras às 05:00.');

    cron.schedule('30 5 * * 3', async () => {
      console.log('[Perspectiva Batch] Iniciando geração de lote ERP (quarta-feira)...');
      try {
        const result = await runPerspectivaBatch();
        console.log(`[Perspectiva Batch] Lote gerado. Novas comissões: ${result.newCommissions || 0}, Lote: ${result.batchId || 'N/A'}`);
      } catch (error) {
        console.error('[Perspectiva Batch] Erro na geração de lote:', error.message);
      }
    });
    console.log('[Perspectiva Batch] Cron agendado: quartas-feiras às 05:30.');

    cron.schedule('0 8 * * 3', async () => {
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
    });
    console.log('[Perspectiva Email] Cron agendado: quartas-feiras às 08:00 (ERP).');

    try {
      await recoverStuckQueues();
    } catch (err) {
      console.error('[Recovery] Falha no recovery de itens presos (não impede inicialização):', err.message);
    }
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
