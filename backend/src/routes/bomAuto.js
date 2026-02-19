import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/consulta', authMiddleware, async (req, res) => {
  try {
    const { documento, placa } = req.query;

    if (!documento && !placa) {
      return res.status(400).json({ message: 'Informe ao menos documento ou placa' });
    }

    if (documento && !/^\d{11}$/.test(documento.replace(/\D/g, ''))) {
      return res.status(400).json({ message: 'CPF inválido. Deve conter 11 dígitos' });
    }

    if (placa && !/^[A-Za-z]{3}\d{1}[A-Za-z0-9]{1}\d{2}$/.test(placa.replace(/[-\s]/g, ''))) {
      return res.status(400).json({ message: 'Formato de placa inválido' });
    }

    const params = new URLSearchParams();
    if (documento) params.append('documento', documento);
    if (placa) params.append('placa_ajustada', placa);

    const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_TESTE_BOM_AUTO?${params.toString()}`;

    const erpToken = process.env.ERP_AUTH_TOKEN || '58378BA0-250C-4061-AF33-A2BE38C2BC01';
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${erpToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!erpResponse.ok) {
      return res.status(erpResponse.status).json({
        message: `Erro ao consultar ERP: ${erpResponse.statusText}`
      });
    }

    const data = await erpResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Error in bom-auto consulta:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/utilizacoes/:documento', authMiddleware, async (req, res) => {
  try {
    const { documento } = req.params;

    const result = await query(
      `SELECT COUNT(*) FROM bom_auto_atendimentos
       WHERE documento_cliente = $1
       AND data_hora >= date_trunc('month', CURRENT_DATE)
       AND data_hora < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
      [documento]
    );

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Error in bom-auto utilizacoes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/atendimentos', authMiddleware, async (req, res) => {
  try {
    const { documento_cliente, nome_cliente, placa, descricao_veiculo, tipo_servico, observacoes, usuario } = req.body;

    if (!documento_cliente || !nome_cliente || !placa || !tipo_servico || !usuario) {
      return res.status(400).json({ message: 'Campos obrigatórios: documento_cliente, nome_cliente, placa, tipo_servico, usuario' });
    }

    const sanitizedObs = observacoes
      ? observacoes.replace(/<[^>]*>/g, '').trim()
      : null;

    const result = await query(
      `INSERT INTO bom_auto_atendimentos
       (documento_cliente, nome_cliente, placa, descricao_veiculo, tipo_servico, observacoes, usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [documento_cliente, nome_cliente, placa, descricao_veiculo || null, tipo_servico, sanitizedObs, usuario]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in bom-auto create atendimento:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos', authMiddleware, async (req, res) => {
  try {
    const { documento } = req.query;

    let sql = 'SELECT * FROM bom_auto_atendimentos';
    const params = [];

    if (documento) {
      sql += ' WHERE documento_cliente = $1';
      params.push(documento);
    }

    sql += ' ORDER BY data_hora DESC LIMIT 100';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in bom-auto list atendimentos:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
