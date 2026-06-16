import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Usa backend/public/uploads (mesmo padrão de proposals/ e signatures/)
// Garante funcionamento mesmo quando /app/uploads é sobrescrito por volume Docker
const uploadDir = path.join(__dirname, '../../public/uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.error('[Upload] Falha ao criar diretório de uploads:', uploadDir, e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
      'video/mp4', 'video/webm',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`), false);
    }
  }
});

// Handler helper que captura tanto erros do multer quanto erros da rota
function handleUpload(multerMiddleware, handler) {
  return (req, res) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        console.error('[Upload] Erro no multer:', err.message);
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ message: err.message });
      }
      try {
        handler(req, res);
      } catch (handlerErr) {
        console.error('[Upload] Erro no handler:', handlerErr.message);
        res.status(500).json({ message: handlerErr.message });
      }
    });
  };
}

router.post('/', authMiddleware, handleUpload(upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo enviado' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  console.log('[Upload] Arquivo salvo:', req.file.filename, '→', uploadDir);

  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: fileUrl
    }
  });
}));

router.post('/multiple', authMiddleware, handleUpload(upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'Nenhum arquivo enviado' });
  }

  const files = req.files.map(file => ({
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`
  }));

  res.json({ success: true, files });
}));

export default router;
