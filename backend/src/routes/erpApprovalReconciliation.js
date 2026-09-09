import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getLatestErpApprovalReconciliation,
  runErpApprovalReconciliation,
} from '../services/erpApprovalReconciliationService.js';
import { withErpOrigin } from '../services/erpAuditService.js';

const router = Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores.' });
  }
  next();
}

router.use(authMiddleware, requireAdmin);

router.post('/run', async (req, res) => {
  try {
    const result = await withErpOrigin(
      'manual:erp-approval-reconciliation',
      () => runErpApprovalReconciliation({ origin: 'manual', requestedBy: req.user.id })
    );
    if (result.skipped) return res.status(409).json(result);
    return res.status(result.status === 'failed' ? 502 : 200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/latest', async (_req, res) => {
  try {
    return res.json({ run: await getLatestErpApprovalReconciliation() });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;