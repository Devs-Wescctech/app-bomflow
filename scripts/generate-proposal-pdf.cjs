const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const BRAND = '#7C3AED';
const BRAND_LIGHT = '#E9D5FF';
const ACCENT = '#0F172A';
const TEXT = '#1F2937';
const MUTED = '#64748B';
const ROW_ALT = '#F8FAFC';
const BORDER = '#E2E8F0';
const GREEN = '#15803D';

const fmt = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const phases = [
  ['1', 'Planejamento & Discovery', 'Levantamento de requisitos, definição de personas, fluxos e wireframes.', 80],
  ['2', 'Arquitetura & Setup', 'Arquitetura monorepo, padrões de API REST, estrutura de pastas, ambientes.', 60],
  ['3', 'Modelagem de Banco de Dados', 'Schema PostgreSQL completo (~70 tabelas), índices, constraints, migrations idempotentes.', 80],
  ['4', 'Backend Core', 'Autenticação JWT com refresh, RBAC (7 perfis, 4 estruturas de time), middlewares, CRUD genérico, upload.', 140],
  ['5', 'Frontend Core / Design System', 'Layout responsivo, sidebar colapsável, design tokens, componentes Radix UI, dark mode.', 120],
  ['6', 'Módulo Helpdesk', 'Ticketing, SLA configurável, Kanban, distribuição dinâmica (Round Robin / Least Active).', 130],
  ['7', 'Módulo Vendas PF (B2C)', 'Pipeline, geolocalização, agenda, validação de duplicidade, propostas em PDF, metas, dashboards.', 160],
  ['8', 'Módulo Vendas PJ (B2B)', 'Módulo isolado de PF com campos B2B (CNPJ, razão social), tabelas e handlers próprios.', 90],
  ['9', 'Módulo UpCell', 'Módulo independente com dados, equipe e automações próprias.', 70],
  ['10', 'Módulo Indicações', 'Cadastro de indicadores, pipeline de conversão, chave PIX por CPF, comissões, RBAC dedicado.', 110],
  ['11', 'Gerador de Leads + Validação WhatsApp', 'Disparo em massa, fila assíncrona, rate limiting, pré-validação WHU, polling com progresso, cache 30/90 dias, auditoria.', 180],
  ['12', 'Módulo Cobrança', 'Tickets de cobrança, dashboard de inadimplência, agendamento de contatos.', 90],
  ['13', 'Módulo Bom Auto', 'Consulta veicular, integração ERP, elegibilidade, registro de serviços, dashboard operacional.', 90],
  ['14', 'Base de Conhecimento', 'Artigos categorizados com versionamento e busca.', 50],
  ['15', 'Quality Assurance', 'Monitoria de chamadas, checklists de avaliação, auditoria.', 60],
  ['16', 'Sistema de Comissões', 'Tiers por unidade, validação ERP em 6 camadas, snapshot semanal, reconciliação automática, controle de pagamentos.', 160],
  ['17', 'Integração WhatsApp (WHU)', 'Templates, parâmetros, fallback inteligente, fila de disparo, polling, painel operacional, contatos sequenciais.', 130],
  ['18', 'Integração Autentique', 'Geração de contrato, assinatura digital pública por token, callbacks.', 50],
  ['19', 'Integrações ERP', 'Bom Pastor (CPF), Bom Auto (veículos), Vendas Indicações (validação comissão).', 100],
  ['20', 'Motor de Automações', 'Triggers por estágio/inatividade, automações por canal, contatos sequenciais (2°/3°/4°), scheduler.', 110],
  ['21', 'Dashboards & Relatórios', 'Recharts, filtros padronizados, relatórios de vendas, ganhos e comissão por e-mail semanal.', 100],
  ['22', 'Responsividade Mobile', 'Hamburger menu, Kanban touch, grids responsivos.', 60],
  ['23', 'Testes & Validação', 'Cobertura de fluxos críticos (auth, CRUD, comissão, disparo WhatsApp, automações).', 120],
  ['24', 'Deploy & DevOps', 'Pipeline de deploy, banco gerenciado, monitoramento, backup automático, TLS.', 50],
  ['25', 'Documentação', 'Documentação técnica (API), manual do usuário, guias de operação.', 40],
];

const TAXA = 180;
const totalHoras = phases.reduce((s, p) => s + p[3], 0);
const totalValor = totalHoras * TAXA;
const desconto = totalValor * 0.95;
const op2_1 = totalValor * 0.4;
const op2_2 = totalValor * 0.3;
const op3_1 = totalValor * 0.25;
const op3_2 = totalValor * 0.15;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const CONTENT_BOTTOM = PAGE_H - MARGIN_BOTTOM;

const outPath = path.resolve(__dirname, '..', 'exports', 'proposta-comercial-crm-bom-flow.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X },
  info: { Title: 'Proposta Comercial — CRM Bom Flow', Author: 'Bom Flow' },
  bufferPages: true,
  autoFirstPage: false,
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

doc.addPage();

function ensureSpace(needed) {
  if (doc.y + needed > CONTENT_BOTTOM) doc.addPage();
}

function rect(x, y, w, h, fill, stroke) {
  doc.save();
  if (fill) doc.fillColor(fill).rect(x, y, w, h).fill();
  if (stroke) doc.strokeColor(stroke).lineWidth(0.5).rect(x, y, w, h).stroke();
  doc.restore();
}

function textIn(text, x, y, w, opts = {}) {
  const savedX = doc.x, savedY = doc.y;
  doc.save();
  doc.font(opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica');
  doc.fontSize(opts.size || 10).fillColor(opts.color || TEXT);
  const params = { width: w, align: opts.align || 'left', lineBreak: opts.lineBreak !== false };
  if (opts.charSpace) params.characterSpacing = opts.charSpace;
  doc.text(text, x, y, params);
  doc.restore();
  doc.x = savedX;
  doc.y = savedY;
}

function measureH(text, w, opts = {}) {
  doc.save();
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10);
  const h = doc.heightOfString(text, { width: w });
  doc.restore();
  return h;
}

function hero() {
  const x = MARGIN_X, y = doc.y, h = 96;
  rect(x, y, CONTENT_W, h, BRAND);
  textIn('PROPOSTA COMERCIAL', x + 22, y + 16, CONTENT_W - 44, { size: 9, bold: true, color: '#FFFFFF', charSpace: 2 });
  textIn('Sistema CRM Bom Flow', x + 22, y + 32, CONTENT_W - 44, { size: 24, bold: true, color: '#FFFFFF' });
  textIn('Plataforma multi-módulo pronta para entrega', x + 22, y + 68, CONTENT_W - 44, { size: 11, color: BRAND_LIGHT });
  doc.y = y + h + 18;
}

function metaBlock() {
  const colW = [CONTENT_W * 0.16, CONTENT_W * 0.34, CONTENT_W * 0.16, CONTENT_W * 0.34];
  const rows = [
    ['Cliente', '[Nome do Cliente]', 'Data', '24/04/2026'],
    ['Projeto', 'CRM Bom Flow — Sistema completo', 'Validade', '30 dias'],
    ['Status', 'Pronto e operacional — entrega imediata', 'Tipo', 'Venda definitiva'],
  ];
  let y = doc.y;
  rows.forEach((r, i) => {
    const heights = r.map((c, j) => {
      const isLabel = j % 2 === 0;
      return measureH(c, colW[j] - 8, { size: isLabel ? 8 : 10, bold: true });
    });
    const rowH = Math.max(...heights, 14) + 14;
    let x = MARGIN_X;
    r.forEach((c, j) => {
      const isLabel = j % 2 === 0;
      const isStatus = i === 2 && j === 1;
      textIn(c, x + 4, y + 7, colW[j] - 8, {
        size: isLabel ? 8 : 10,
        bold: true,
        color: isLabel ? MUTED : (isStatus ? GREEN : TEXT),
        charSpace: isLabel ? 1 : 0,
      });
      x += colW[j];
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN_X, y + rowH).lineTo(MARGIN_X + CONTENT_W, y + rowH).stroke();
    y += rowH;
  });
  doc.y = y + 14;
}

function h2(text) {
  ensureSpace(34);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(ACCENT);
  doc.text(text, MARGIN_X, doc.y, { width: CONTENT_W });
  const y = doc.y + 2;
  doc.strokeColor(BRAND).lineWidth(2).moveTo(MARGIN_X, y).lineTo(MARGIN_X + 36, y).stroke();
  doc.y = y + 8;
}

function h3(text) {
  ensureSpace(22);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND);
  doc.text(text, MARGIN_X, doc.y, { width: CONTENT_W });
  doc.moveDown(0.25);
}

function body(text) {
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  doc.text(text, MARGIN_X, doc.y, { width: CONTENT_W, align: 'justify' });
  doc.moveDown(0.4);
}

function note(text) {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED);
  doc.text(text, MARGIN_X, doc.y, { width: CONTENT_W, align: 'justify' });
  doc.moveDown(0.4);
}

function bullet(text) {
  ensureSpace(16);
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  doc.text('•  ' + text, MARGIN_X + 8, doc.y, { width: CONTENT_W - 8 });
  doc.moveDown(0.15);
}

function bulletRich(label, rest) {
  ensureSpace(18);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
    .text('•  ', MARGIN_X + 8, y, { continued: true, width: CONTENT_W - 8 })
    .text(label, { continued: true });
  doc.font('Helvetica').text(rest);
  doc.moveDown(0.15);
}

function numbered(n, label, rest) {
  ensureSpace(22);
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT)
    .text(n + '. ', MARGIN_X + 8, y, { continued: true, width: CONTENT_W - 8 });
  doc.font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(rest);
  doc.moveDown(0.25);
}

function phasesTable() {
  const cols = [
    { w: 20, align: 'center', label: '#' },
    { w: 96, align: 'left', label: 'Fase / Componente' },
    { w: CONTENT_W - 20 - 96 - 46 - 58 - 82, align: 'left', label: 'Descrição' },
    { w: 46, align: 'right', label: 'Horas' },
    { w: 58, align: 'right', label: 'Taxa' },
    { w: 82, align: 'right', label: 'Subtotal' },
  ];
  const headerH = 20;
  const padX = 4, padY = 4;

  const drawHeader = () => {
    let x = MARGIN_X;
    rect(MARGIN_X, doc.y, CONTENT_W, headerH, ACCENT);
    cols.forEach((c) => {
      textIn(c.label, x + padX, doc.y + 6, c.w - 2 * padX, { size: 8, bold: true, color: '#FFFFFF', align: c.align });
      x += c.w;
    });
    doc.y += headerH;
  };

  ensureSpace(headerH + 30);
  drawHeader();

  phases.forEach((p, i) => {
    const cellsContent = [p[0], p[1], p[2], String(p[3]), fmt(TAXA), fmt(p[3] * TAXA)];
    const heights = cellsContent.map((c, j) => measureH(c, cols[j].w - 2 * padX, { size: 8, bold: j === 1 || j === 5 }));
    const rowH = Math.max(...heights, 12) + 2 * padY;

    if (doc.y + rowH > CONTENT_BOTTOM) {
      doc.addPage();
      drawHeader();
    }

    if (i % 2 === 0) rect(MARGIN_X, doc.y, CONTENT_W, rowH, ROW_ALT);

    let x = MARGIN_X;
    cellsContent.forEach((c, j) => {
      textIn(c, x + padX, doc.y + padY, cols[j].w - 2 * padX, {
        size: 8, align: cols[j].align, bold: j === 1 || j === 5,
      });
      x += cols[j].w;
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN_X, doc.y + rowH).lineTo(MARGIN_X + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });

  ensureSpace(26);
  const totalH = 22;
  rect(MARGIN_X, doc.y, CONTENT_W, totalH, BRAND);
  let x = MARGIN_X;
  const totalCells = ['', '', 'TOTAL', totalHoras + ' h', '', fmt(totalValor)];
  totalCells.forEach((c, j) => {
    if (c) textIn(c, x + padX, doc.y + 6, cols[j].w - 2 * padX, {
      size: 10, bold: true, color: '#FFFFFF', align: j < 2 ? 'left' : 'right',
    });
    x += cols[j].w;
  });
  doc.y += totalH + 10;
}

function summaryTable() {
  const labelW = CONTENT_W - 200;
  const valueW = 200;
  const rows = [
    ['Total de horas investidas', totalHoras + ' horas', null, false],
    ['Valor de referência (esforço × taxa)', fmt(totalValor), BRAND, true],
    ['Status', 'Pronto, testado e operacional', GREEN, false],
    ['Entrega', 'Imediata após assinatura', null, false],
  ];
  rows.forEach((r) => {
    const valueSize = r[3] ? 16 : 11;
    const rowH = Math.max(26, valueSize + 12);
    ensureSpace(rowH);
    textIn(r[0], MARGIN_X + 4, doc.y + 7, labelW - 8, { size: 10, bold: true });
    textIn(r[1], MARGIN_X + labelW + 4, doc.y + (r[3] ? 4 : 7), valueW - 8, {
      size: valueSize, bold: true, color: r[2] || TEXT, align: 'right',
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN_X, doc.y + rowH).lineTo(MARGIN_X + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });
  doc.y += 8;
}

function paymentTable(rows) {
  const cols = [
    { w: 70, align: 'left', label: 'Parcela' },
    { w: 70, align: 'right', label: '%' },
    { w: 120, align: 'right', label: 'Valor' },
    { w: CONTENT_W - 70 - 70 - 120, align: 'left', label: 'Marco' },
  ];
  const headerH = 20;
  const padX = 5, padY = 5;

  ensureSpace(headerH + rows.length * 22 + 6);

  let x = MARGIN_X;
  rect(MARGIN_X, doc.y, CONTENT_W, headerH, ACCENT);
  cols.forEach((c) => {
    textIn(c.label, x + padX, doc.y + 6, c.w - 2 * padX, { size: 8, bold: true, color: '#FFFFFF', align: c.align });
    x += c.w;
  });
  doc.y += headerH;

  rows.forEach((r, i) => {
    const heights = r.slice(0, 4).map((c, j) => measureH(String(c), cols[j].w - 2 * padX, { size: 9, bold: j === 0 || j === 2 }));
    const rowH = Math.max(...heights, 14) + 2 * padY;
    if (i % 2 === 0) rect(MARGIN_X, doc.y, CONTENT_W, rowH, ROW_ALT);
    let xx = MARGIN_X;
    r.slice(0, 4).forEach((c, j) => {
      const color = j === 2 && r[4] ? r[4] : TEXT;
      textIn(String(c), xx + padX, doc.y + padY, cols[j].w - 2 * padX, {
        size: 9, bold: j === 0 || j === 2, color, align: cols[j].align,
      });
      xx += cols[j].w;
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN_X, doc.y + rowH).lineTo(MARGIN_X + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });
  doc.y += 10;
}

function infoCards() {
  const cardW = (CONTENT_W - 12) / 2;
  const cardH = 80;
  ensureSpace(cardH + 10);
  const y = doc.y;
  rect(MARGIN_X, y, cardW, cardH, ROW_ALT, BORDER);
  textIn('Stack Técnica', MARGIN_X + 12, y + 10, cardW - 24, { size: 10, bold: true, color: BRAND });
  textIn('React 18 + Vite\nTailwind CSS + Radix UI\nNode.js + Express\nPostgreSQL', MARGIN_X + 12, y + 26, cardW - 24, { size: 9, color: TEXT });

  rect(MARGIN_X + cardW + 12, y, cardW, cardH, ROW_ALT, BORDER);
  textIn('Módulos Inclusos', MARGIN_X + cardW + 24, y + 10, cardW - 24, { size: 10, bold: true, color: BRAND });
  textIn('Helpdesk · Vendas PF · Vendas PJ · UpCell\nIndicações + Gerador de Leads · Cobrança\nBom Auto · Base · QA · Comissionamento\nAutomações · Disparos WhatsApp', MARGIN_X + cardW + 24, y + 26, cardW - 24, { size: 9, color: TEXT });

  doc.y = y + cardH + 14;
}

function ctaBlock() {
  const h = 64;
  ensureSpace(h + 10);
  const y = doc.y;
  rect(MARGIN_X, y, CONTENT_W, h, BRAND);
  textIn('Próximos passos', MARGIN_X + 22, y + 14, CONTENT_W - 44, { size: 13, bold: true, color: '#FFFFFF' });
  textIn('Aguardamos seu retorno para formalizar a contratação e iniciar a transferência do sistema.',
    MARGIN_X + 22, y + 36, CONTENT_W - 44, { size: 10, color: BRAND_LIGHT });
  doc.y = y + h + 12;
}

hero();
metaBlock();

h2('1. Sobre o Sistema');
body('Plataforma web completa de CRM, já desenvolvida e em pleno funcionamento, com módulos comerciais segregados, integrações com WhatsApp, ERP e assinatura eletrônica, RBAC granular, dashboards operacionais e sistema de comissionamento.');
infoCards();

h2('2. Valoração do Sistema');
body('A tabela abaixo representa o esforço técnico investido no desenvolvimento do sistema, base para a precificação do produto pronto.');
note('Taxa horária de referência: R$ 180,00 — perfil Sênior Full-Stack Brasil. Mediana de mercado 2026 segundo Glassdoor, Catho e Get on Board (faixa R$ 150–250/h para profissionais sênior com domínio em React, Node.js, PostgreSQL e integrações REST complexas).');
phasesTable();

h2('3. Resumo Executivo');
summaryTable();

h2('4. O Que Está Incluso na Entrega');
bulletRich('Código-fonte completo ', '(frontend + backend + scripts de banco)');
bulletRich('Sistema rodando ', 'em ambiente de produção, pronto para uso');
bulletRich('Banco de dados ', 'estruturado com toda a modelagem entregue');
bulletRich('Documentação técnica ', '(arquitetura, API, banco)');
bulletRich('Manual do usuário ', 'para cada módulo');
bulletRich('Treinamento: ', '16h para usuários finais + 8h para equipe técnica');
bulletRich('Migração de dados ', 'inicial (de planilhas ou sistema legado, conforme escopo)');
bulletRich('Garantia de 90 dias ', 'para correção de bugs sem custo adicional');

h2('5. Formas de Pagamento');
body('Como o sistema já está pronto, sugerimos modelos orientados à entrega imediata:');

h3('Opção A — Pagamento à vista (5% de desconto)');
paymentTable([['Único', '100%', fmt(desconto), 'Assinatura do contrato e entrega imediata', BRAND]]);

h3('Opção B — Parcelamento curto (3 parcelas)');
paymentTable([
  ['1ª', '40%', fmt(op2_1), 'Assinatura do contrato e liberação de acesso'],
  ['2ª', '30%', fmt(op2_2), '30 dias após a assinatura'],
  ['3ª', '30%', fmt(op2_2), '60 dias após a assinatura'],
]);

h3('Opção C — Parcelamento estendido (6 parcelas)');
paymentTable([
  ['1ª', '25%', fmt(op3_1), 'Assinatura do contrato e entrega'],
  ['2ª – 6ª', '15% cada', fmt(op3_2) + '/mês', 'Mensais consecutivas'],
]);
note('Forma de pagamento: boleto bancário ou PIX, com vencimento em até 5 dias úteis após a emissão da nota fiscal de serviço.');

h2('6. Observações Importantes');
numbered(1, 'Custos não inclusos: ', 'hospedagem em nuvem, domínios, certificados SSL pagos, licenças de software de terceiros, créditos da API WhatsApp (WHU/Meta), créditos da Autentique, custos de e-mail transacional e quaisquer ferramentas SaaS adicionais.');
numbered(2, 'Customizações futuras: ', 'ajustes de escopo solicitados após a entrega serão tratados como aditivos, com nova estimativa em horas.');
numbered(3, 'Garantia: ', '90 dias após o aceite para correção de bugs sem custo adicional.');
numbered(4, 'Manutenção pós-garantia: ', 'pode ser contratada como mensalidade fixa (sugestão: pacote de 40h/mês a R$ 7.200,00) ou banco de horas pré-pago.');
numbered(5, 'Propriedade intelectual: ', 'o código-fonte completo será entregue ao cliente, sem dependência de licenças proprietárias da contratada.');
numbered(6, 'Confidencialidade: ', 'todas as informações compartilhadas serão tratadas sob NDA mútuo.');
numbered(7, 'Compliance: ', 'o sistema segue boas práticas de LGPD (consentimento, criptografia em trânsito e em repouso, RBAC granular).');

h2('7. Diferenciais');
bullet('Sistema pronto para uso — sem espera por desenvolvimento');
bullet('Arquitetura multi-módulo com isolamento real de dados, equipes e automações');
bullet('RBAC granular com 7 perfis e 4 estruturas de time');
bullet('Sistema de comissões com 6 camadas de validação contra ERP');
bullet('Validação WhatsApp em larga escala (1.200+ números) com fila assíncrona e cache');
bullet('Self-hosted — sem amarras com plataformas de CRM externas');
bullet('Código-fonte 100% entregue ao cliente');

doc.moveDown(0.5);
ctaBlock();

ensureSpace(60);
doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text('[Nome da Empresa Contratada]', MARGIN_X, doc.y, { width: CONTENT_W });
doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('[CNPJ / Razão Social]', MARGIN_X, doc.y, { width: CONTENT_W });
doc.text('[E-mail / Telefone / Site]', MARGIN_X, doc.y, { width: CONTENT_W });

const range = doc.bufferedPageRange();
const totalPages = range.count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(range.start + i);
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  if (i > 0) {
    doc.text('Proposta Comercial — CRM Bom Flow', MARGIN_X, 24, { width: CONTENT_W / 2, align: 'left', lineBreak: false });
    doc.text('24/04/2026', MARGIN_X + CONTENT_W / 2, 24, { width: CONTENT_W / 2, align: 'right', lineBreak: false });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN_X, 40).lineTo(PAGE_W - MARGIN_X, 40).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  }
  doc.text('Confidencial — uso restrito ao destinatário', MARGIN_X, PAGE_H - 28, { width: CONTENT_W / 2, align: 'left', lineBreak: false });
  doc.text('Página ' + (i + 1) + ' de ' + totalPages, MARGIN_X + CONTENT_W / 2, PAGE_H - 28, { width: CONTENT_W / 2, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = origBottom;
}

doc.end();
stream.on('finish', () => console.log('OK ->', outPath));
stream.on('error', (err) => { console.error(err); process.exit(1); });
