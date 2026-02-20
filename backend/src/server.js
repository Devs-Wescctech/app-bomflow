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
  .then(() => {
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
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
