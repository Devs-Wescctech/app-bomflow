import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware, requireSalesContractPrinting } from '../middleware/permissions.js';
import { query } from '../config/database.js';
import { getErpPool, getOrcamentoDetalhe } from '../services/erpDbService.js';
import { sendTemplate } from '../services/attendanceWhuClient.js';
import {
  getContactByPhone,
  getMessageDeliveryInfo,
  setContactAttributes,
} from '../services/whatsappService.js';
import { emitAttendanceEvent } from '../services/attendanceEvents.js';
import {
  deleteContractFromStorage,
  createContractObjectPath,
  isContractStorageConfigured,
  scheduleContractDeletion,
  storeContractForWhatsApp,
  readLocalContract,
} from '../services/contractObjectStorage.js';
import { normalizeBrazilPhone } from '../utils/phone.js';
import { decrypt } from '../utils/encryption.js';
import {
  CONTRACT_PRODUCTS,
  BOM_PET_BASE_PRODUCT_IDS,
  BOM_PET_HEALTH_INDIVIDUAL_PRODUCT_IDS,
  BOM_PET_HEALTH_THREE_PRODUCT_IDS,
  ESSENTIAL_BASE_PRODUCT_IDS,
  buildBomPetContractData,
  buildBomPetHealthIndividualContractData,
  buildBomPetHealthThreeContractData,
  buildEssentialContractData,
  contractProductLabel,
  detailMatchesContractProduct,
  normalizeContractProduct,
  renderBomPetPdf,
  renderBomPetHealthPdf,
  renderEssentialPdf,
  validateBomPetContractData,
  validateBomPetHealthContractData,
  validateEssentialContractData,
} from '../services/salesContractModels.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPages = path.resolve(__dirname, '../../public/bom-auto-contract');
const SUBMENU = 'SalesContractPrinting';
export const CONTRACT_WHATSAPP_TEMPLATES = Object.freeze({
  [CONTRACT_PRODUCTS.BOM_AUTO]: Object.freeze({
    id: '69ed0d552e1d23a0987f4340',
    name: 'bom_auto_boas_vindas',
  }),
  [CONTRACT_PRODUCTS.ESSENCIAL]: Object.freeze({
    id: '69ed0d552e1d23a0987f433d',
    name: 'bom_vindas_funeral',
  }),
  [CONTRACT_PRODUCTS.BOM_PET]: Object.freeze({
    id: '69ed0d552e1d23a0987f433f',
    name: 'bom_pet_boas_vindas',
  }),
  [CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL]: Object.freeze({
    id: '69ed0d552e1d23a0987f4330',
    name: 'boas_vindas_bom_pet_saude',
  }),
  [CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS]: Object.freeze({
    id: '69ed0d552e1d23a0987f4330',
    name: 'boas_vindas_bom_pet_saude',
  }),
});
const secret = () => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET não configurado.');
    error.statusCode = 503;
    throw error;
  }
  return process.env.JWT_SECRET;
};

router.get('/contracts/temporary/:encoded', async (req, res) => {
  try {
    const pdf = await readLocalContract(req.params.encoded, req.query.expires, req.query.signature);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.send(pdf);
  } catch (error) {
    return res.status(error.statusCode || 404).json({ message: error.message });
  }
});
const cpfDigits = (value) => String(value || '').replace(/\D/g, '');
export const normalizeCpf = (value) => {
  const cpf = cpfDigits(value);
  return cpf.length === 11 ? cpf : null;
};
export const normalizeCnpj = (value) => {
  const cnpj = cpfDigits(value);
  return cnpj.length === 14 ? cnpj : null;
};
export const protectCpf = (cpf) => crypto.createHash('sha256')
  .update(`${process.env.CPF_AUDIT_PEPPER || secret()}:${cpf}`)
  .digest('hex');
export const isValidCpf = (value) => {
  const cpf = normalizeCpf(value);
  if (!cpf || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split('').map(Number);
  const calc = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === digits[9] && calc(10) === digits[10];
};
export const isValidCnpj = (value) => {
  const cnpj = normalizeCnpj(value);
  if (!cnpj || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculateDigit = (length) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) =>
      total + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculateDigit(12) === Number(cnpj[12])
    && calculateDigit(13) === Number(cnpj[13]);
};
export const isValidWhatsappRecipient = (value) => {
  return /^\d{10,11}$/.test(String(value ?? ''));
};
export const legacyCivilStatus = (value) => String(value || '').trim() || 'OUTROS';
export const legacyProfession = (value) => String(value || '').trim() || 'Outros';
export const bomAutoPaymentCategory = (value) => {
  const payment = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/BOLETO|CARNE|BANCARI/.test(payment)) return 'bank';
  if (/CARTAO.*CREDITO/.test(payment)) return 'credit_card';
  return null;
};
export const classifyDocument = (row) => {
  const kind = row.contrato ? 'contrato' : 'pedido';
  const displayNumber = row.contrato || row.numero_pedido || row.pedido;
  const productKey = normalizeContractProduct(
    row.product_key || row.productKey || CONTRACT_PRODUCTS.BOM_AUTO,
  );
  return {
    ...row,
    productKey,
    product: contractProductLabel(productKey),
    kind,
    displayNumber: displayNumber ? String(displayNumber) : null,
    label: `${kind === 'contrato' ? 'Contrato' : 'Pedido'} ${displayNumber}`,
    date: row.issue_date || row.order_date || null,
  };
};

function audit(req, cpf, row, outcome, action, { required = false, recipientHash = null } = {}) {
  const isHash = String(cpf).startsWith('hash:');
  const protectedCpf = isHash ? String(cpf).slice(5) : protectCpf(cpf);
  const suffix = isHash ? null : String(cpf).slice(-2);
  const write = query(
    `INSERT INTO bom_auto_contract_audit
      (action,user_id,user_email,cpf_hash,cpf_suffix,pedido,contrato,outcome,recipient_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [action, req.user?.id || null, req.user?.email || null, protectedCpf,
      suffix, row?.pedido || null, row?.contrato || null, outcome, recipientHash]
  );
  return write.catch((error) => {
    console.error('[SalesContractPrinting] Falha ao registrar auditoria:', error.message);
    if (required) throw error;
  });
}

function issueId(req, cpf, row) {
  return jwt.sign({
    jti: crypto.randomUUID(),
    purpose: SUBMENU,
    uid: String(req.user.id),
    cpf: protectCpf(cpf),
    pedido: row.pedido || null,
    contrato: row.contrato || null,
    displayNumber: row.displayNumber || null,
    productKey: normalizeContractProduct(row.productKey || CONTRACT_PRODUCTS.BOM_AUTO),
  }, secret(), { expiresIn: '10m' });
}

const protectedRecipient = (phone) => crypto.createHash('sha256')
  .update(`${process.env.CPF_AUDIT_PEPPER || secret()}:whatsapp:${phone}`)
  .digest('hex');

export function buildBomAutoWhatsAppMessage(name) {
  const holder = String(name || '').trim();
  return `Seja muito bem-vindo(a), ${holder}!

Pode ficar tranquilo(a) 🙏, agora você conta com o Bom Auto, uma assistência completa para te socorrer nos momentos de apuros com o seu veículo.

Você tem direito a:
🔑 Chaveiro
🛞 Assistência em caso de pneu furado
🛻🚙🏍️ Guincho resgate em caso de pane mecânica, elétrica e falta de combustível.
🚕 Serviço de táxi ou aplicativo de transporte

Torcemos para que nunca precise utilizar esses serviços. Mas, quando necessário, estaremos prontos para te ajudar a sair rapidamente de uma situação emergencial, sem transtornos ☺️.

Além disso, como benefício do seu Plano, você concorre aos sorteios semanais de R$1.000,00 e semestrais de R$5.000,00 💰. Para participar, basta manter suas mensalidades em dia.

ATENÇÃO: para acionar o serviço da Assistência Veicular Bom Auto, ligue para: 0800 940 3227 (atendimento 24h).

Conte com a gente, sempre que precisar!
Bom Auto - Grupo Bom Pastor Multiassistência.`;
}

export function buildEssentialWhatsAppMessage(name) {
  const holder = String(name || '').trim();
  return `Seja muito bem-vindo(a), ${holder}!

Queremos dar os parabéns por escolher fazer parte da nossa família.👏

O Grupo Bom Pastor é uma empresa séria, que preza pelo respeito e prioriza o atendimento humanizado, qualificado em proporcionar conforto e acolhimento em diversos momentos da sua vida.

Ficamos muito felizes em te receber! 🥰

Confira a seguir alguns dos seus benefícios:
🛍️ Descontos em médicos, dentistas, exames, farmácias, óticas, academias e mais.

💻 Compras online com descontos: https://bompastordescontosonline.com.br/.

💰 Sorteios de R$1.000 e R$5.000. Para participar, basta manter suas mensalidades em dia.

👨‍🦽 Equipamentos de reabilitação, como cadeira de rodas, cadeira de banho, muleta e outros, nas modalidades Empréstimo ou Aluguel a preços simbólicos.

❤️ Instituto de Apoio ao Luto, que oferece orientação e apoio psicológico qualificado.

Obrigado por sua confiança e pode contar com a gente!
Qualquer dúvida, pode me chamar, ok?

Grupo Bom Pastor Multiassistência.`;
}

export function buildBomPetWhatsAppMessage(name) {
  const holder = String(name || '').trim();
  return `Olá, ${holder}, Seja muito bem-vindo(a) ao Plano Bom Pet!

Queremos dar os parabéns por escolher fazer parte da nossa família.👏

O Grupo Bom Pastor é uma empresa séria, que preza pelo respeito e prioriza o atendimento humanizado, qualificado em proporcionar conforto e acolhimento em diversos momentos da sua vida.

Ficamos muito felizes em receber você e seus filhos de patas! 🐶🐱🐰

Confira a seguir alguns dos seus benefícios:
🤩 Descontos em veterinários, pet shops, farmácias, serviços de recreação e muito mais.

💻 Compras online com descontos: https://bompastordescontosonline.com.br/.

💰 Sorteios de R$1.000 e R$5.000. Para participar, basta manter suas mensalidades em dia.

❤ Instituto de Apoio ao Luto, que oferece orientação e apoio psicológico qualificado.

ATENÇÃO: em caso de óbito do pet, ligue para: 0800 940 3227 (atendimento 24h).

Obrigado por sua confiança e pode contar com a gente! Qualquer dúvida, é só entrar em contato, ok?

Bom Pet - Grupo Bom Pastor Multiassistência.`;
}

export function buildBomPetHealthWhatsAppMessage(name) {
  const holder = String(name || '').trim();
  return `Olá, ${holder}, bem-vindo (a) ao Plano Bom Pet Saúde e Cremação. Ficamos muito felizes em receber você e seus filhos de patas! O Grupo Bom Pastor é uma empresa séria, que proporciona conforto e acolhimento em diversos momentos da vida.

Salve este número, ele é muito importante: https://wa.me/558007793330. Será por ele que você poderá acessar as consultas para o seu Pet através da Telemedicina Veterinária.

Em caso de óbito do Pet, ligue: 08009403227 (24h).

Conheça os benefícios:

Além de consultas ilimitadas com veterinários a qualquer hora, você ainda terá acesso a descontos em veterinários, pet shops, farmácias, recreação e muito mais.

Acesse também nosso clube de descontos online com promoções exclusivas: https://bompastordescontosonline.com.br/.

Concorra a prêmios de R$1.000 e R$5.000. Para participar, mantenha suas mensalidades em dia.

Apoio psicológico profissional do Instituto de Apoio ao Luto.

Obrigado por sua confiança e conte sempre com a gente!
Bom Pet - Grupo Bom Pastor Multiassistência`;
}

export function buildContractWhatsAppDelivery({
  productKey,
  holderName,
  displayNumber,
  documentUrl,
}) {
  const template = CONTRACT_WHATSAPP_TEMPLATES[productKey];
  if (!template) throw new Error('Produto sem template de contrato aprovado.');
  if (!template.id) throw new Error('Template WhatsApp do Bom Pet Saúde ainda não foi configurado.');
  const isEssential = productKey === CONTRACT_PRODUCTS.ESSENCIAL;
  const isBomPet = productKey === CONTRACT_PRODUCTS.BOM_PET;
  const isBomPetHealth = productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL
    || productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS;
  const productName = isEssential ? 'Essencial' : isBomPet ? 'Bom Pet'
    : isBomPetHealth ? 'Bom Pet Saúde' : 'Bom Auto';
  const fileName = `Contrato ${productName} ${displayNumber}.pdf`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '');
  return {
    templateId: template.id,
    templateName: template.name,
    fileName,
    caption: isEssential
      ? buildEssentialWhatsAppMessage(holderName)
      : isBomPetHealth
        ? buildBomPetHealthWhatsAppMessage(holderName)
        : isBomPet
        ? buildBomPetWhatsAppMessage(holderName)
        : buildBomAutoWhatsAppMessage(holderName),
    components: [
      {
        type: 'header',
        parameters: [{
          type: 'document',
          document: { link: documentUrl, fileName },
        }],
      },
      {
        type: 'body',
        parameters: [{ type: 'text', text: holderName }],
      },
    ],
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const contractWhatsAppToken = () =>
  String(process.env.BOM_AUTO_CONTRACT_WHATSAPP_TOKEN || '').trim() || null;

export async function waitForWhatsAppDelivery(
  messageId,
  {
    attempts = 5,
    delayMs = 1500,
    lookup = getMessageDeliveryInfo,
    channelToken = contractWhatsAppToken(),
  } = {},
) {
  if (!messageId) return { state: 'pending', info: null };
  let info = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    info = await lookup(messageId, { channelToken });
    if (info?.ok && info.status === -1) return { state: 'failed', info };
    if (info?.ok && info.status >= 2) return { state: 'delivered', info };
    if (attempt < attempts - 1 && delayMs > 0) await sleep(delayMs);
  }
  return { state: 'pending', info };
}

function deliveryFailureMessage(info) {
  const reason = String(info?.errorMessage || '');
  if (/131047|24 horas/i.test(reason)) {
    return 'A mensagem não foi entregue porque passaram mais de 24 horas desde a última interação do cliente. É necessário um template de contrato aprovado para iniciar esse contato.';
  }
  return 'A WHU aceitou o envio, mas o WhatsApp informou falha na entrega.';
}

function contractData(detail) {
  const titular = detail?.titular;
  return {
    name: titular?.nome, cpf: titular?.cpf, cpf_owner: titular?.cpf, rg: titular?.rg,
    birth_date: titular?.data_nascimento, sex: titular?.sexo, marital_status: titular?.estado_civil,
    profession: titular?.profissao, address: detail?.endereco?.logradouro,
    state: detail?.endereco?.uf || detail?.endereco?.estado,
    number: detail?.endereco?.numero, complement: detail?.endereco?.complemento,
    district: detail?.endereco?.bairro, city: detail?.endereco?.cidade,
    cep: detail?.endereco?.cep, phone: titular?.telefone, email: detail?.email,
    payment_plan: detail?.plano_pagamento, issue_date: detail?.data_emissao,
    vehicles: detail?.veiculos, total_valor: detail?.valor_mensal,
    adesao: 50,
  };
}

async function mirrorWhatsAppSend(
  { agentId, agentName, userEmail, phone, holderName, caption, response, fileName },
  channelToken = contractWhatsAppToken(),
) {
  const connectionRows = await query(
    `SELECT id, token FROM channel_connections
      WHERE channel = 'whatsapp' AND status = 'active'`,
  );
  const connection = connectionRows.rows.find((row) => {
    try {
      return decrypt(row.token) === channelToken;
    } catch {
      return false;
    }
  });
  if (!connection) {
    throw new Error('Canal de contratos não está vinculado ao Atendimento.');
  }

  const externalMessageId =
    response?.messageSentId || response?.message_sent_id || response?.id || null;
  const phoneKey = phone.slice(-8);
  const conversationResult = await query(
    `INSERT INTO att_conversations
       (connection_id, phone, phone_key, contact_name, assigned_user_id, status, last_message_at)
     VALUES ($1, $2, $3, $4, $5, 'aberta', NOW())
     ON CONFLICT (connection_id, phone_key) DO UPDATE SET
       phone = EXCLUDED.phone,
       contact_name = COALESCE(EXCLUDED.contact_name, att_conversations.contact_name),
       assigned_user_id = COALESCE(att_conversations.assigned_user_id, EXCLUDED.assigned_user_id),
       status = CASE WHEN att_conversations.status = 'fechada' THEN 'aberta'
                     ELSE att_conversations.status END,
       last_message_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [connection.id, phone, phoneKey, holderName, agentId || null],
  );
  const conversation = conversationResult.rows[0];
  const inserted = await query(
    `INSERT INTO att_messages
       (conversation_id, direction, content, type, user_id, external_message_id, status, sent_at)
     VALUES ($1, 'out', $2, 'document', $3, $4, 'sent', NOW())
     ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      conversation.id,
      `${caption}\n\n[Documento: ${fileName}]`,
      agentId || null,
      externalMessageId ? String(externalMessageId) : null,
    ],
  );
  const message = inserted.rows[0];
  if (message) {
    emitAttendanceEvent(
      'message',
      {
        conversationId: conversation.id,
        connectionId: connection.id,
        message: {
          id: message.id,
          direction: message.direction,
          content: message.content,
          type: message.type,
          status: message.status,
          sentAt: message.sent_at,
        },
        conversation,
      },
      { assignedUserIds: [conversation.assigned_user_id ?? null] },
    );
  }

  const contact =
    response?.contact ||
    (response?.contactId ? { id: response.contactId } : await getContactByPhone(phone).catch(() => null));
  const contactId = contact?.id || contact?._id || null;
  if (contactId && agentId && conversation.assigned_user_id === agentId) {
    await setContactAttributes(contactId, [
      { key: 'vendedor_nome', value: String(agentName || userEmail), description: 'Nome do vendedor responsável' },
      { key: 'vendedor_id', value: String(agentId), description: 'ID do vendedor no CRM' },
    ]);
  }
}

async function cleanupExpiredContractObjects() {
  const result = await query(
    `SELECT id, object_path FROM bom_auto_contract_whatsapp_sends
      WHERE object_path IS NOT NULL AND object_expires_at < NOW()
      ORDER BY object_expires_at ASC LIMIT 50`,
  );
  for (const row of result.rows) {
    try {
      await deleteContractFromStorage(row.object_path);
      await query(
        `UPDATE bom_auto_contract_whatsapp_sends
            SET object_path = NULL, object_expires_at = NULL, updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
    } catch (error) {
      console.error('[SalesContractPrinting] Falha na limpeza persistente:', error.message);
    }
  }
  const pending = await query(
    `SELECT id, mirror_payload FROM bom_auto_contract_whatsapp_sends
      WHERE status = 'sent' AND mirror_status = 'pending' AND mirror_payload IS NOT NULL
      ORDER BY updated_at ASC LIMIT 20`,
  );
  for (const row of pending.rows) {
    try {
      await mirrorWhatsAppSend(row.mirror_payload);
      await query(
        `UPDATE bom_auto_contract_whatsapp_sends
            SET mirror_status = 'complete', mirror_payload = NULL, updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
    } catch (error) {
      console.error('[SalesContractPrinting] Espelhamento pendente:', error.message);
    }
  }
}

const cleanupTimer = setInterval(
  () => cleanupExpiredContractObjects().catch((error) =>
    console.error('[SalesContractPrinting] Limpeza temporária indisponível:', error.message)),
  10 * 60 * 1000,
);
cleanupTimer.unref();

export function validateContractData(data) {
  const required = [
    ['name', 'nome do titular'], ['cpf', 'CPF'],
    ['birth_date', 'data de nascimento'], ['sex', 'sexo'],
    ['address', 'endereço'], ['state', 'UF'], ['cep', 'CEP'],
    ['phone', 'telefone'], ['email', 'e-mail'], ['payment_plan', 'plano de pagamento'],
    ['issue_date', 'data de emissão'],
  ];
  const missing = required.filter(([key]) => !String(data?.[key] ?? '').trim()).map(([, label]) => label);
  const errors = missing.length ? [`Dados obrigatórios ausentes: ${missing.join(', ')}.`] : [];
  if (!Array.isArray(data?.vehicles) || data.vehicles.length === 0) errors.push('Nenhum veículo foi encontrado no ERP.');
  if (data?.vehicles?.length > 3) errors.push('O contrato suporta no máximo 3 veículos.');
  let missingDriver = false;
  for (const [index, vehicle] of (data?.vehicles || []).entries()) {
    const prefix = `Veículo ${index + 1}`;
    for (const field of ['modelo', 'cor', 'placa', 'ano']) {
      if (!String(vehicle?.[field] || '').trim()) errors.push(`${prefix}: campo ${field} ausente.`);
    }
    const driver = vehicle?.driver;
    if (!driver) {
      missingDriver = true;
      continue;
    }
    if (!driver?.nome) errors.push(`${prefix}: nome do condutor ausente.`);
    if (!String(driver?.cpf || '').trim()) {
      errors.push(`${prefix}: o condutor não possui CPF cadastrado no ERP. A emissão do contrato permanece bloqueada até a correção do cadastro.`);
    } else if (!isValidCpf(driver.cpf)) {
      errors.push(`${prefix}: CPF do condutor inválido.`);
    }
    for (const field of ['data_nascimento', 'telefone', 'sexo']) {
      if (!String(driver?.[field] || '').trim()) errors.push(`${prefix}: campo do condutor ${field} ausente.`);
    }
  }
  if (missingDriver) errors.push('Nenhum condutor/dependente foi encontrado no ERP para este pedido.');
  if (data?.cpf && normalizeCpf(data.cpf) !== normalizeCpf(data.cpf_owner || data.cpf)) {
    errors.push('CPF do titular inconsistente com o documento consultado.');
  }
  return errors;
}

export async function findOrders(cpf, page, pageSize, reference = null) {
  const db = getErpPool();
  const offset = (page - 1) * pageSize;
  // O filtro de produto é aplicado no ERP, evitando misturar Bom Auto com
  // outros produtos do mesmo titular.
   const sql = `WITH docs AS (
     SELECT DISTINCT p.id AS pedido_id
       FROM pedidos p
       JOIN documentos_pessoas dp ON dp.pessoa_id = p.cliente_id
        AND dp.tipo_documento_id = 580
       WHERE regexp_replace(dp.documento, '\\D', '', 'g') = $1
         AND ($2::text IS NULL OR p.id::text = $2 OR p.pedido::text = $2)
  ), base AS (
    SELECT p.id pedido, p.pedido numero_pedido, p.contrato_id,
           cs.contrato_servicos contrato,
           COALESCE(cs.data_contrato, p.data_emissao, p.data_inclusao) issue_date,
           NULLIF(TRIM(holder.nome_completo), '') name,
           model.product_key
      FROM docs d JOIN pedidos p ON p.id=d.pedido_id
       JOIN pessoas holder ON holder.id = p.cliente_id
      LEFT JOIN contratos_servicos cs ON cs.id=p.contrato_id
      JOIN LATERAL (
        SELECT 'bom_auto'::text AS product_key
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip LEFT JOIN produtos pr ON pr.id=ip.produto_id
            WHERE ip.pedido_id=p.id
              AND UPPER(translate(
                COALESCE(pr.descricao,ip.descricao,''),
                'ÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ',
                'AAAAEEEIIOOOOUCN'
              )) LIKE '%BOM AUTO% DADOS DO VEICULO%'
         )
        UNION ALL
        SELECT 'essencial'::text
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip LEFT JOIN produtos pr ON pr.id=ip.produto_id
            WHERE ip.pedido_id=p.id
              AND ip.produto_id = ANY($5::bigint[])
         )
        UNION ALL
        SELECT 'bom_pet'::text
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip
            WHERE ip.pedido_id=p.id
              AND ip.produto_id = ANY($6::bigint[])
         )
         UNION ALL
         SELECT 'bom_pet_saude_individual'::text
          WHERE EXISTS (
            SELECT 1 FROM itens_pedidos ip
             WHERE ip.pedido_id=p.id AND ip.produto_id = ANY($7::bigint[])
          )
         UNION ALL
         SELECT 'bom_pet_saude_3pets'::text
          WHERE EXISTS (
            SELECT 1 FROM itens_pedidos ip
             WHERE ip.pedido_id=p.id AND ip.produto_id = ANY($8::bigint[])
          )
      ) model ON TRUE
      GROUP BY p.id,p.pedido,p.contrato_id,cs.contrato_servicos,cs.data_contrato,p.data_emissao,
               p.data_inclusao,holder.nome_completo,model.product_key
  )
  SELECT *, COUNT(*) OVER() AS total FROM base
   ORDER BY issue_date DESC NULLS LAST, pedido DESC, product_key ASC LIMIT $3 OFFSET $4`;
  const result = await db.query(sql, [
    cpf,
    reference,
    pageSize,
    offset,
    ESSENTIAL_BASE_PRODUCT_IDS,
    BOM_PET_BASE_PRODUCT_IDS,
    BOM_PET_HEALTH_INDIVIDUAL_PRODUCT_IDS,
    BOM_PET_HEALTH_THREE_PRODUCT_IDS,
  ]);
  return {
    rows: result.rows.map((r) => classifyDocument({
      pedido: r.pedido ? String(r.pedido) : null,
      numero_pedido: r.numero_pedido ? String(r.numero_pedido) : null,
      contrato: r.contrato ? String(r.contrato) : null,
       product_key: r.product_key,
      name: r.name || null,
      issue_date: r.issue_date || null,
      generationId: null,
    })),
    total: Number(result.rows[0]?.total || 0),
  };
}

export async function findOrdersByReference(reference, page, pageSize) {
  const db = getErpPool();
  const offset = (page - 1) * pageSize;
  const sql = `WITH docs AS (
     SELECT DISTINCT p.id AS pedido_id,
            regexp_replace(dp.documento, '\\D', '', 'g') AS cpf_owner
       FROM pedidos p
       JOIN documentos_pessoas dp ON dp.pessoa_id = p.cliente_id
        AND dp.tipo_documento_id = 580
      WHERE p.id::text = $1 OR p.pedido::text = $1
  ), base AS (
    SELECT p.id pedido, p.pedido numero_pedido, p.contrato_id,
           cs.contrato_servicos contrato,
           COALESCE(cs.data_contrato, p.data_emissao, p.data_inclusao) issue_date,
           NULLIF(TRIM(holder.nome_completo), '') name,
           d.cpf_owner,
           model.product_key
      FROM docs d JOIN pedidos p ON p.id=d.pedido_id
       JOIN pessoas holder ON holder.id = p.cliente_id
      LEFT JOIN contratos_servicos cs ON cs.id=p.contrato_id
      JOIN LATERAL (
        SELECT 'bom_auto'::text AS product_key
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip LEFT JOIN produtos pr ON pr.id=ip.produto_id
            WHERE ip.pedido_id=p.id
              AND UPPER(translate(
                COALESCE(pr.descricao,ip.descricao,''),
                'ÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ',
                'AAAAEEEIIOOOOUCN'
              )) LIKE '%BOM AUTO% DADOS DO VEICULO%'
         )
        UNION ALL
        SELECT 'essencial'::text
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip LEFT JOIN produtos pr ON pr.id=ip.produto_id
            WHERE ip.pedido_id=p.id
              AND ip.produto_id = ANY($4::bigint[])
         )
        UNION ALL
        SELECT 'bom_pet'::text
         WHERE EXISTS (
           SELECT 1 FROM itens_pedidos ip
            WHERE ip.pedido_id=p.id
              AND ip.produto_id = ANY($5::bigint[])
         )
         UNION ALL
         SELECT 'bom_pet_saude_individual'::text
          WHERE EXISTS (
            SELECT 1 FROM itens_pedidos ip
             WHERE ip.pedido_id=p.id AND ip.produto_id = ANY($6::bigint[])
          )
         UNION ALL
         SELECT 'bom_pet_saude_3pets'::text
          WHERE EXISTS (
            SELECT 1 FROM itens_pedidos ip
             WHERE ip.pedido_id=p.id AND ip.produto_id = ANY($7::bigint[])
          )
      ) model ON TRUE
     GROUP BY p.id,p.pedido,p.contrato_id,cs.contrato_servicos,cs.data_contrato,
               p.data_emissao,p.data_inclusao,holder.nome_completo,d.cpf_owner,model.product_key
  )
  SELECT *, COUNT(*) OVER() AS total FROM base
   ORDER BY issue_date DESC NULLS LAST, pedido DESC, product_key ASC LIMIT $2 OFFSET $3`;
  const result = await db.query(sql, [
    reference,
    pageSize,
    offset,
    ESSENTIAL_BASE_PRODUCT_IDS,
    BOM_PET_BASE_PRODUCT_IDS,
    BOM_PET_HEALTH_INDIVIDUAL_PRODUCT_IDS,
    BOM_PET_HEALTH_THREE_PRODUCT_IDS,
  ]);
  return {
    rows: result.rows.map((r) => classifyDocument({
      pedido: r.pedido ? String(r.pedido) : null,
      numero_pedido: r.numero_pedido ? String(r.numero_pedido) : null,
      contrato: r.contrato ? String(r.contrato) : null,
       product_key: r.product_key,
      name: r.name || null,
      issue_date: r.issue_date || null,
      cpfOwner: normalizeCpf(r.cpf_owner),
      generationId: null,
    })),
    total: Number(result.rows[0]?.total || 0),
  };
}

export async function findBomCorpContracts(cnpj, page, pageSize, reference = null) {
  const token = process.env.ERP_AUTH_TOKEN;
  if (!token) {
    const error = new Error('ERP_AUTH_TOKEN não configurado.');
    error.statusCode = 503;
    throw error;
  }
  const url = new URL(
    'http://erp.wescctech.com.br:8080/BOMPASTOR/api/api_super_login_bom_corp',
  );
  url.searchParams.set('cnpj', cnpj);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    const failure = new Error(error.name === 'AbortError'
      ? 'Tempo excedido ao consultar contratos Bom Corp.'
      : `Falha ao consultar contratos Bom Corp: ${error.message}`);
    failure.statusCode = 503;
    throw failure;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error(`ERP retornou HTTP ${response.status} na consulta Bom Corp.`);
    error.statusCode = 502;
    throw error;
  }
  const records = await response.json();
  if (!Array.isArray(records)) {
    const error = new Error('ERP retornou uma resposta inválida na consulta Bom Corp.');
    error.statusCode = 502;
    throw error;
  }
  const contracts = new Map();
  for (const record of records) {
    const contract = String(record?.numero_contrato || '').replace(/\D/g, '');
    if (!contract || (reference && contract !== reference)) continue;
    const existing = contracts.get(contract);
    if (existing) {
      existing.lifeCount += 1;
      continue;
    }
    contracts.set(contract, {
      contrato: contract,
      product_key: CONTRACT_PRODUCTS.BOM_CORP,
      name: String(record?.empresa_razao_social || '').trim() || null,
      issue_date: record?.data_contrato || null,
      lifeCount: 1,
      contractValue: Number(record?.valor_contrato || 0),
      pdfAvailable: false,
    });
  }
  const sorted = [...contracts.values()].sort((a, b) =>
    String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
  const offset = (page - 1) * pageSize;
  return {
    rows: sorted.slice(offset, offset + pageSize).map((row) => classifyDocument(row)),
    total: sorted.length,
  };
}

router.use(authMiddleware, loadAgentMiddleware, requireSalesContractPrinting);

router.get('/contracts/search', async (req, res) => {
  const rawDocument = String(req.query.document || req.query.cpf || '').trim();
  const cpf = normalizeCpf(rawDocument);
  const cnpj = normalizeCnpj(rawDocument);
  const reference = String(req.query.reference || '').replace(/\D/g, '').slice(0, 18);
  if (!rawDocument && !reference) {
    return res.status(422).json({ message: 'Informe um CPF, CNPJ ou número de pedido/orçamento.' });
  }
  if (rawDocument && !isValidCpf(rawDocument) && !isValidCnpj(rawDocument)) {
    return res.status(422).json({ message: 'Informe um CPF ou CNPJ válido.' });
  }
  if (reference && !/^\d{1,18}$/.test(reference)) {
    return res.status(422).json({ message: 'Informe um pedido/orçamento válido.' });
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const auditKey = cpf || cnpj || `hash:${protectCpf(`pedido:${reference}`)}`;
  try {
    const found = cnpj
      ? await findBomCorpContracts(cnpj, page, pageSize, reference || null)
      : cpf
        ? await findOrders(cpf, page, pageSize, reference || null)
        : await findOrdersByReference(reference, page, pageSize);
    found.rows = found.rows.map(({ cpfOwner, ...row }) => ({
      ...row,
      generationId: issueId(req, cpf || cnpj || cpfOwner, row),
    }));
    await audit(req, auditKey, null, found.rows.length ? 'success' : 'empty', 'lookup', { required: true });
    res.json({ ...found, page, pageSize });
  } catch (error) {
    await audit(req, auditKey, null, 'error', 'lookup');
    res.status(error.statusCode || 503).json({ message: 'Não foi possível consultar os pedidos do ERP.' });
  }
});

const buildProductContractData = (detail, productKey) => {
  if (productKey === CONTRACT_PRODUCTS.ESSENCIAL) return buildEssentialContractData(detail);
  if (productKey === CONTRACT_PRODUCTS.BOM_PET) return buildBomPetContractData(detail);
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL) {
    return buildBomPetHealthIndividualContractData(detail);
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS) {
    return buildBomPetHealthThreeContractData(detail);
  }
  return contractData(detail);
};

const validateProductContractData = (data, productKey) => {
  if (productKey === CONTRACT_PRODUCTS.ESSENCIAL) return validateEssentialContractData(data);
  if (productKey === CONTRACT_PRODUCTS.BOM_PET) return validateBomPetContractData(data);
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL) {
    return validateBomPetHealthContractData(data, 'individual');
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS) {
    return validateBomPetHealthContractData(data, 'three');
  }
  return validateContractData(data);
};

const renderProductContract = (
  data,
  productKey,
  pedido,
  { optimizeForWhatsapp = false } = {},
) => {
  if (productKey === CONTRACT_PRODUCTS.ESSENCIAL) return renderEssentialPdf(data);
  if (productKey === CONTRACT_PRODUCTS.BOM_PET) {
    return renderBomPetPdf(data, { optimizeForWhatsapp });
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL) {
    return renderBomPetHealthPdf(data, 'individual', { optimizeForWhatsapp });
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS) {
    return renderBomPetHealthPdf(data, 'three', { optimizeForWhatsapp });
  }
  return renderPdf(data, pedido);
};

const contractFileProduct = (productKey) => ({
  [CONTRACT_PRODUCTS.BOM_AUTO]: 'bom_auto',
  [CONTRACT_PRODUCTS.ESSENCIAL]: 'essencial',
  [CONTRACT_PRODUCTS.BOM_PET]: 'bom_pet',
  [CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL]: 'bom_pet_saude_individual',
  [CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS]: 'bom_pet_saude_3pets',
})[productKey];

router.post('/contracts/validate', async (req, res) => {
  const token = String(req.body?.generationId || '');
  let claims;
  try {
    claims = jwt.verify(token, secret());
    if (claims.purpose !== SUBMENU || claims.uid !== String(req.user.id)) throw new Error('invalid');
  } catch {
    await audit(req, 'hash:invalid-generation', null, 'invalid_identifier', 'validation');
    return res.status(422).json({ message: 'Identificador de geração inválido ou expirado. Faça uma nova busca.' });
  }
  try {
    const productKey = normalizeContractProduct(claims.productKey);
    if (!productKey) {
      await audit(req, `hash:${claims.cpf}`, claims, 'invalid_product', 'validation');
      return res.status(422).json({
        message: 'Identificador de produto inválido ou expirado. Faça uma nova busca.',
      });
    }
    const detail = await getOrcamentoDetalhe(Number(claims.pedido));
    const titular = detail?.titular;
    if (!detail?.titular_is_canonical
      || !titular
      || protectCpf(normalizeCpf(titular.cpf) || '') !== claims.cpf) {
      await audit(req, `hash:${claims.cpf}`, claims, 'cpf_mismatch', 'validation');
      return res.status(422).json({ message: 'O titular do pedido não corresponde ao CPF consultado.' });
    }
    if (!detailMatchesContractProduct(detail, productKey)) {
      await audit(req, `hash:${claims.cpf}`, claims, 'product_mismatch', 'validation');
      return res.status(422).json({
        message: 'Os produtos atuais do pedido não correspondem ao modelo de contrato selecionado.',
      });
    }
    const data = buildProductContractData(detail, productKey);
    const errors = validateProductContractData(data, productKey);
    if (normalizeCpf(data.cpf) && protectCpf(normalizeCpf(data.cpf)) !== claims.cpf) {
      errors.push('CPF do titular não corresponde à busca autenticada.');
    }
    if (errors.length) {
      await audit(req, `hash:${claims.cpf}`, claims, 'validation_error', 'validation');
      return res.status(422).json({ message: 'Dados do ERP incompletos ou inconsistentes.', errors });
    }
    return res.json({ valid: true });
  } catch (error) {
    await audit(req, `hash:${claims.cpf}`, claims, 'error', 'validation');
    return res.status(error.statusCode || 503).json({
      message: 'Não foi possível carregar os dados completos do ERP.',
    });
  }
});

router.post('/contracts/generate', async (req, res) => {
  const token = String(req.body?.generationId || '');
  let claims;
  try {
    claims = jwt.verify(token, secret());
    if (claims.purpose !== SUBMENU || claims.uid !== String(req.user.id)) throw new Error('invalid');
  } catch {
    await audit(req, 'hash:invalid-generation', null, 'invalid_identifier', 'generation');
    return res.status(422).json({ message: 'Identificador de geração inválido ou expirado. Faça uma nova busca.' });
  }
  try {
    const productKey = normalizeContractProduct(claims.productKey);
    if (!productKey) {
      await audit(req, `hash:${claims.cpf}`, claims, 'invalid_product', 'generation');
      return res.status(422).json({
        message: 'Identificador de produto inválido ou expirado. Faça uma nova busca.',
      });
    }
    const detail = await getOrcamentoDetalhe(Number(claims.pedido));
    // O row retornado pela busca é a autoridade do titular; não use o nome
    // agregado de outros beneficiários do mesmo pedido.
    const titular = detail?.titular;
    if (!detail?.titular_is_canonical
      || !titular
      || protectCpf(normalizeCpf(titular.cpf) || '') !== claims.cpf) {
      await audit(req, `hash:${claims.cpf}`, claims, 'cpf_mismatch', 'generation');
      return res.status(422).json({ message: 'O titular do pedido não corresponde ao CPF consultado.' });
    }
    if (!detailMatchesContractProduct(detail, productKey)) {
      await audit(req, `hash:${claims.cpf}`, claims, 'product_mismatch', 'generation');
      return res.status(422).json({
        message: 'Os produtos atuais do pedido não correspondem ao modelo de contrato selecionado.',
      });
    }
    const data = buildProductContractData(detail, productKey);
    const errors = validateProductContractData(data, productKey);
    if (normalizeCpf(data.cpf) && protectCpf(normalizeCpf(data.cpf)) !== claims.cpf) {
      errors.push('CPF do titular não corresponde à busca autenticada.');
    }
    if (errors.length) {
      await audit(req, `hash:${claims.cpf}`, claims, 'validation_error', 'generation');
      const legacyWithoutDriver = productKey === CONTRACT_PRODUCTS.BOM_AUTO
        && errors.every((error) => /nenhum condutor\/dependente/i.test(error));
      return res.status(422).json({
        message: legacyWithoutDriver
          ? 'Contrato não disponível para este pedido legado.'
          : 'Dados do ERP incompletos ou inconsistentes.',
        errors,
      });
    }
    const pdf = await renderProductContract(data, productKey, claims.pedido);
    await audit(req, `hash:${claims.cpf}`, claims, 'success', 'generation', { required: true });
    const fileProduct = contractFileProduct(productKey);
    res.type('application/pdf')
      .set('Content-Disposition', `inline; filename="contrato_${fileProduct}_${claims.pedido}.pdf"`)
      .send(pdf);
  } catch (error) {
    await audit(req, `hash:${claims.cpf}`, claims, 'error', 'generation');
    res.status(error.statusCode || 503).json({ message: 'Não foi possível carregar os dados completos do ERP.' });
  }
});

router.post('/contracts/send-whatsapp', async (req, res) => {
  const token = String(req.body?.generationId || '');
  let claims;
  try {
    claims = jwt.verify(token, secret());
    if (claims.purpose !== SUBMENU || claims.uid !== String(req.user.id)) throw new Error('invalid');
  } catch {
    await audit(req, 'hash:invalid-generation', null, 'invalid_identifier', 'whatsapp');
    return res.status(422).json({ message: 'Identificador de geração inválido ou expirado. Faça uma nova busca.' });
  }
  const productKey = normalizeContractProduct(claims.productKey);
  if (!productKey) {
    await audit(req, `hash:${claims.cpf}`, claims, 'unsupported_product', 'whatsapp');
    return res.status(422).json({
      message: 'O produto deste contrato não está disponível para envio por WhatsApp.',
    });
  }
  if (!CONTRACT_WHATSAPP_TEMPLATES[productKey]) {
    await audit(req, `hash:${claims.cpf}`, claims, 'unsupported_product', 'whatsapp');
    return res.status(422).json({
      message: 'O envio por WhatsApp ainda não está disponível para este produto.',
    });
  }

  if (!isValidWhatsappRecipient(req.body?.phone)) {
    await audit(req, `hash:${claims.cpf}`, claims, 'invalid_recipient', 'whatsapp');
    return res.status(422).json({ message: 'Informe um telefone com 10 ou 11 dígitos, usando somente números.' });
  }
  const phone = normalizeBrazilPhone(req.body.phone);
  const recipientHash = protectedRecipient(phone);
  let temporaryObject = null;
  let sendId = null;
  let deliveryStarted = false;
  let externalMessageId = null;
  try {
    if (!isContractStorageConfigured()) {
      const error = new Error('Armazenamento privado indisponível para envio.');
      error.statusCode = 503;
      throw error;
    }
    const channelToken = contractWhatsAppToken();
    if (!channelToken) {
      const error = new Error('Canal de contratos do WhatsApp não configurado.');
      error.statusCode = 503;
      throw error;
    }
    const detail = await getOrcamentoDetalhe(Number(claims.pedido));
    const titular = detail?.titular;
    if (!detail?.titular_is_canonical
      || !titular
      || protectCpf(normalizeCpf(titular.cpf) || '') !== claims.cpf) {
      await audit(req, `hash:${claims.cpf}`, claims, 'cpf_mismatch', 'whatsapp', { recipientHash });
      return res.status(422).json({ message: 'O titular do pedido não corresponde ao CPF consultado.' });
    }
    if (!detailMatchesContractProduct(detail, productKey)) {
      await audit(req, `hash:${claims.cpf}`, claims, 'product_mismatch', 'whatsapp', { recipientHash });
      return res.status(422).json({
        message: 'Os produtos atuais do pedido não correspondem ao contrato enviado.',
      });
    }
    const data = buildProductContractData(detail, productKey);
    const errors = validateProductContractData(data, productKey);
    if (errors.length) {
      await audit(req, `hash:${claims.cpf}`, claims, 'validation_error', 'whatsapp', { recipientHash });
      return res.status(422).json({ message: 'Dados do ERP incompletos ou inconsistentes.', errors });
    }
    await audit(req, `hash:${claims.cpf}`, claims, 'attempt', 'whatsapp', {
      required: true,
      recipientHash,
    });
    const claimed = await query(
      `INSERT INTO bom_auto_contract_whatsapp_sends
         (generation_jti, user_id, pedido, recipient_hash, status)
       VALUES ($1, $2, $3, $4, 'preparing')
       ON CONFLICT (generation_jti, recipient_hash) DO UPDATE
         SET status = 'preparing', error_message = NULL, updated_at = NOW()
          WHERE bom_auto_contract_whatsapp_sends.status IN ('failed_before_send', 'failed')
       RETURNING id`,
      [claims.jti, req.user.id, claims.pedido, recipientHash],
    );
    if (claimed.rows.length === 0) {
      return res.status(409).json({
        message: 'Este envio já foi solicitado. Faça uma nova busca somente se precisar realizar um novo envio.',
      });
    }
    sendId = claimed.rows[0].id;
    const pdf = await renderProductContract(
      data,
      productKey,
      claims.pedido,
      { optimizeForWhatsapp: true },
    );
    temporaryObject = createContractObjectPath();
    await query(
      `UPDATE bom_auto_contract_whatsapp_sends
          SET object_path = $2, object_expires_at = NOW() + INTERVAL '20 minutes', updated_at = NOW()
        WHERE id = $1`,
      [sendId, temporaryObject],
    );
    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
    const stored = await storeContractForWhatsApp(pdf, temporaryObject, { baseUrl });
    await query(
      `UPDATE bom_auto_contract_whatsapp_sends SET status = 'sending', updated_at = NOW() WHERE id = $1`,
      [sendId],
    );
    const displayNumber = claims.displayNumber || claims.contrato || claims.pedido;
    const deliveryConfig = buildContractWhatsAppDelivery({
      productKey,
      holderName: data.name,
      displayNumber,
      documentUrl: stored.url,
    });
    const {
      caption, components, fileName, templateId, templateName,
    } = deliveryConfig;
    deliveryStarted = true;
    const response = await sendTemplate(
      channelToken,
      phone,
      templateId,
      components,
    );
    scheduleContractDeletion(temporaryObject);
    temporaryObject = null;
    externalMessageId =
      response?.messageSentId || response?.message_sent_id || response?.id || null;
    const delivery = await waitForWhatsAppDelivery(externalMessageId, { channelToken });
    if (delivery.state === 'failed') {
      const error = new Error(deliveryFailureMessage(delivery.info));
      error.statusCode = 422;
      error.deliveryFailed = true;
      throw error;
    }
    const mirrorPayload = {
      agentId: req.agent?.id || null,
      agentName: req.agent?.name || null,
      userEmail: req.user.email,
      phone,
      holderName: data.name,
      caption,
      response,
      fileName,
      templateName,
    };
    await query(
      `WITH sent AS (
         UPDATE bom_auto_contract_whatsapp_sends
            SET status = 'sent', external_message_id = $2, mirror_status = 'pending',
                mirror_payload = $3::jsonb, updated_at = NOW()
          WHERE id = $1 RETURNING id
       )
       INSERT INTO bom_auto_contract_audit
         (action,user_id,user_email,cpf_hash,cpf_suffix,pedido,contrato,outcome,recipient_hash)
       SELECT 'whatsapp',$4,$5,$6,NULL,$7,$8,'success',$9 FROM sent`,
      [
        sendId, externalMessageId ? String(externalMessageId) : null, JSON.stringify(mirrorPayload),
        req.user.id, req.user.email, claims.cpf, claims.pedido, claims.contrato, recipientHash,
      ],
    );
    await mirrorWhatsAppSend(mirrorPayload, channelToken).then(() =>
      query(
        `UPDATE bom_auto_contract_whatsapp_sends
            SET mirror_status = 'complete', mirror_payload = NULL, updated_at = NOW()
          WHERE id = $1`,
        [sendId],
      )).catch((error) => {
      console.error('[SalesContractPrinting] Envio salvo; espelhamento ficará pendente:', error.message);
    });
    return res.json({
      success: true,
      message: delivery.state === 'delivered'
        ? 'Contrato entregue pelo WhatsApp.'
        : 'Envio processado. A entrega ainda não foi confirmada pelo WhatsApp.',
      deliveryStatus: delivery.state,
      messageId: response?.messageSentId || response?.message_sent_id || response?.id || null,
    });
  } catch (error) {
    if (temporaryObject) {
      if (deliveryStarted) scheduleContractDeletion(temporaryObject);
      else await deleteContractFromStorage(temporaryObject).catch(() => {});
    }
    if (sendId) {
      const failedStatus = error.deliveryFailed
        ? 'failed'
        : (error.statusCode
          ? 'failed_before_send'
          : (deliveryStarted ? 'unknown' : 'failed_before_send'));
      await query(
        `UPDATE bom_auto_contract_whatsapp_sends
            SET status = $2,
                object_path = CASE WHEN $2 = 'unknown' THEN object_path ELSE NULL END,
                object_expires_at = CASE WHEN $2 = 'unknown' THEN object_expires_at ELSE NULL END,
                error_message = $3,
                external_message_id = COALESCE($4, external_message_id),
                updated_at = NOW()
          WHERE id = $1`,
        [
          sendId,
          failedStatus,
          String(error.message || 'Falha no envio').slice(0, 1000),
          externalMessageId ? String(externalMessageId) : null,
        ],
      ).catch((persistenceError) => {
        console.error(
          '[SalesContractPrinting] Falha ao registrar erro do envio:',
          persistenceError.message,
        );
      });
    }
    await audit(req, `hash:${claims.cpf}`, claims, 'error', 'whatsapp', { recipientHash });
    console.error('[SalesContractPrinting] Falha no envio WhatsApp:', error.message);
    return res.status(error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502).json({
      message: error.statusCode === 503 || error.deliveryFailed
        ? error.message
        : 'Não foi possível enviar o contrato pelo WhatsApp.',
    });
  }
});

export function renderPdf(data, pedido) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const mm = (value) => value * 2.83465;
    const legacyText = (text, x, y, options = {}, size = 11) => {
      doc.font('Times-Roman').fontSize(size).text(String(text ?? ''), mm(x + 1), mm(y + 1), options);
    };
    const dateParts = (value) => {
      if (!value) return null;
      const iso = value instanceof Date ? value.toISOString() : String(value);
      const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? { year: match[1], month: match[2], day: match[3] } : null;
    };
    const generated = Object.fromEntries(
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).formatToParts(new Date()).map((part) => [part.type, part.value])
    );
    for (let page = 1; page <= 7; page += 1) {
      doc.addPage();
      const background = path.join(contractPages, `page-${page}.jpg`);
      if (fs.existsSync(background)) doc.image(background, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
      if (page === 3) {
        const maritalStatus = legacyCivilStatus(data.marital_status);
        legacyText(data.name, 25, 62, { width: mm(117) });
        const birth = dateParts(data.birth_date);
        if (birth) legacyText(`${birth.day}     ${birth.month}    ${birth.year}`, 179, 62);
        legacyText(data.cpf, 25, 69.5);
        legacyText(data.rg, 120, 69.5);
        legacyText(`${data.address}${data.complement ? ` - ${data.complement}` : ''}`, 25, 77.5, { width: mm(156) });
        legacyText(data.number, 185, 77.5, { width: mm(17) });
        legacyText(data.district, 25, 84.5, { width: mm(77) });
        legacyText(data.city, 108, 84.5);
        legacyText(data.state, 25, 92.5);
        const cep = String(data.cep || '').replace(/\D/g, '').slice(0, 8);
        [0, 5, 10, 14, 19, 27, 31, 36].forEach((offset, index) => legacyText(cep[index], 36 + offset, 92.5));
        legacyText(data.phone, 78, 92.5);
        legacyText(data.phone2, 133, 92.5);
        legacyText(legacyProfession(data.profession), 25, 100, { width: mm(74) });
        legacyText(data.email, 107, 100, { width: mm(94) });
        if (/M/i.test(data.sex || '')) legacyText('X', 147, 62);
        if (/F/i.test(data.sex || '')) legacyText('X', 152, 62);
        if (/SOLTEIR/i.test(maritalStatus)) legacyText('X', 159, 62);
        if (/CASAD/i.test(maritalStatus)) legacyText('X', 164, 62);
        if (!/SOLTEIR|CASAD/i.test(maritalStatus)) legacyText('X', 170, 62);
        (data.vehicles || []).slice(0, 3).forEach((vehicle, index) => {
          const y = 121 + index * 25;
          legacyText(vehicle.fabricante || vehicle.marca, 25, y, { width: mm(89) });
          legacyText(vehicle.modelo, 118, y, { width: mm(89) });
          legacyText(vehicle.cor, 25, y + 7);
          legacyText(vehicle.ano, 80, y + 7);
          legacyText(String(vehicle.placa || '').toUpperCase(), 115, y + 7);
          if (vehicle.driver?.nome) {
            legacyText(vehicle.driver.nome, 25, y + 14.5, { width: mm(117) });
            const driverBirth = dateParts(vehicle.driver.data_nascimento);
            if (driverBirth) legacyText(`${driverBirth.day}    ${driverBirth.month}    ${driverBirth.year}`, 179, y + 14.5);
            legacyText(vehicle.driver.cpf, 25, y + 21.5, {}, 10);
            legacyText(vehicle.driver.telefone, 117, y + 21.5);
          }
        });
        const money = (value) => value == null ? '' : Number(value).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        legacyText(money(data.adesao), 48, 218);
        legacyText(money(data.total_valor), 110, 218);
        const paymentCategory = bomAutoPaymentCategory(data.payment_plan);
        if (paymentCategory === 'bank') legacyText('X', 161, 218);
        if (paymentCategory === 'credit_card') legacyText('X', 177.5, 218);
        legacyText(generated.day, 132, 262.5);
        legacyText(generated.month, 149, 262.5);
        legacyText(generated.year.slice(-2), 190, 262.5);
      }
      if (page === 7) {
        legacyText(generated.day, 112, 240, {}, 12);
        legacyText(generated.month, 132, 240, {}, 12);
        legacyText(generated.year.slice(-2), 177, 240, {}, 12);
      }
    }
    doc.end();
  });
}

export default router;