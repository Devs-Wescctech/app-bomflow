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
import { runAllAutomations } from './services/automationService.js';
import cron from 'node-cron';
import { runLeadGeneratorAudit, runCommissionReconciliation, runWeeklyCommissionBatch, sendCommissionReport } from './routes/functions.js';
import { recoverStuckQueues } from './services/whatsappQueueService.js';
import { syncAllAgents } from './services/googleCalendarService.js';
import { createNotification } from './services/notificationService.js';
import { query as dbQuery } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

const distPath = path.join(process.cwd(), 'dist');
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

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/data/bom-auto-images', express.static(path.join(__dirname, '../../data/bom-auto-images')));
app.use('/proposals', express.static(path.join(__dirname, '../public/proposals')));
app.use(express.static(distPath));

app.use('/api/auth', authRoutes);
app.use('/api', entityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/bom-auto', bomAutoRoutes);

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

    cron.schedule('0 8 * * 3', async () => {
      console.log('[Commission Email] Iniciando envio automático de relatório semanal...');
      try {
        const result = await sendCommissionReport({ tipo_envio: 'automatico', usuario_envio: 'system' });
        if (result.skipped) {
          console.log(`[Commission Email] Envio pulado: ${result.message}`);
        } else {
          console.log(`[Commission Email] Relatório enviado. Indicadores: ${result.totalIndicadores}, Valor: R$ ${result.valorTotal?.toFixed(2)}`);
        }
      } catch (error) {
        console.error('[Commission Email] Erro no envio automático:', error.message);
      }
    });
    console.log('[Commission Email] Cron agendado: quartas-feiras às 08:00.');

    try {
      await recoverStuckQueues();
    } catch (err) {
      console.error('[Recovery] Falha no recovery de itens presos (não impede inicialização):', err.message);
    }

    setInterval(() => {
      syncAllAgents().catch(err => console.error('[GCal Sync] Erro na sincronização periódica:', err.message));
    }, 5 * 60 * 1000);
    console.log('[Google Calendar] Sync periódico agendado: a cada 5 minutos.');

    async function checkUpcomingActivities() {
      try {
        const now = new Date();
        const in15min = new Date(now.getTime() + 15 * 60 * 1000);

        const activitiesResult = await dbQuery(`
          SELECT a.id, a.title, a.description, a.type, a.scheduled_at, a.created_by, a.assigned_to,
                 ag.email as agent_email, ag.name as agent_name
          FROM activities a
          LEFT JOIN agents ag ON ag.id = a.created_by
          WHERE a.completed = false
            AND a.scheduled_at > $1
            AND a.scheduled_at <= $2
            AND a.id NOT IN (
              SELECT entity_id FROM notifications
              WHERE entity_type = 'activity_reminder'
              AND entity_id IS NOT NULL
            )
        `, [now.toISOString(), in15min.toISOString()]);

        const activitiesPJResult = await dbQuery(`
          SELECT a.id, a.description, a.type, a.scheduled_at, a.created_by,
                 ag.email as agent_email, ag.name as agent_name
          FROM activities_pj a
          LEFT JOIN agents ag ON ag.id = a.created_by
          WHERE a.completed = false
            AND a.scheduled_at > $1
            AND a.scheduled_at <= $2
            AND CAST(a.id AS TEXT) NOT IN (
              SELECT entity_id FROM notifications
              WHERE entity_type = 'activity_pj_reminder'
              AND entity_id IS NOT NULL
            )
        `, [now.toISOString(), in15min.toISOString()]);

        const allUpcoming = [
          ...activitiesResult.rows.map(r => ({ ...r, _table: 'activities' })),
          ...activitiesPJResult.rows.map(r => ({ ...r, _table: 'activities_pj' })),
        ];

        for (const act of allUpcoming) {
          const email = act.agent_email;
          if (!email) continue;

          const scheduledAt = new Date(act.scheduled_at);
          const minutesUntil = Math.round((scheduledAt - now) / 60000);
          const timeLabel = minutesUntil <= 1 ? 'em 1 minuto' : `em ${minutesUntil} minutos`;

          await createNotification({
            userEmail: email,
            type: 'activity_reminder',
            title: `Atividade ${timeLabel}`,
            message: `"${act.title || act.description || 'Atividade'}" está agendada para ${scheduledAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
            link: '/Agenda',
            entityType: act._table === 'activities' ? 'activity_reminder' : 'activity_pj_reminder',
            entityId: String(act.id),
            priority: 'high',
          });
        }

        if (allUpcoming.length > 0) {
          console.log(`[Activity Reminder] ${allUpcoming.length} notificação(ões) de atividade(s) próxima(s) enviada(s).`);
        }
      } catch (err) {
        console.error('[Activity Reminder] Erro ao verificar atividades próximas:', err.message);
      }
    }

    setInterval(checkUpcomingActivities, 5 * 60 * 1000);
    console.log('[Activity Reminder] Verificação agendada: a cada 5 minutos.');
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
