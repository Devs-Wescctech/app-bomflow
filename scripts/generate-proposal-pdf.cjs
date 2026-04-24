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

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_W = PAGE.width - 2 * MARGIN;
const FOOTER_Y = PAGE.height - 30;
const CONTENT_BOTTOM = PAGE.height - 50;

const outPath = path.resolve(__dirname, '..', 'exports', 'proposta-comercial-crm-bom-flow.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Proposta Comercial — CRM Bom Flow', Author: 'Bom Flow' }, autoFirstPage: false });
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

let pageNum = 0;
const totalPagesPlaceholder = '__TOTAL__';

function newPage() {
  doc.addPage();
  pageNum++;
  drawFooter();
  if (pageNum > 1) drawHeader();
}

function drawHeader() {
  doc.save();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('Proposta Comercial — CRM Bom Flow', MARGIN, 20, { width: CONTENT_W / 2, align: 'left' });
  doc.text('24/04/2026', MARGIN + CONTENT_W / 2, 20, { width: CONTENT_W / 2, align: 'right' });
  doc.restore();
}

function drawFooter() {
  doc.save();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('Confidencial — uso restrito ao destinatário', MARGIN, FOOTER_Y, { width: CONTENT_W / 2, align: 'left', lineBreak: false });
  doc.text('Página ' + pageNum, MARGIN + CONTENT_W / 2, FOOTER_Y, { width: CONTENT_W / 2, align: 'right', lineBreak: false });
  doc.restore();
}

function ensureSpace(needed) {
  if (doc.y + needed > CONTENT_BOTTOM) newPage();
}

function rect(x, y, w, h, fill, stroke) {
  doc.save();
  if (fill) doc.fillColor(fill).rect(x, y, w, h).fill();
  if (stroke) doc.strokeColor(stroke).lineWidth(0.5).rect(x, y, w, h).stroke();
  doc.restore();
}

function textInRect(text, x, y, w, h, opts = {}) {
  doc.save();
  doc.font(opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica');
  doc.fontSize(opts.size || 10).fillColor(opts.color || TEXT);
  if (opts.charSpace) doc.text(text, x + (opts.padX || 6), y + (opts.padY || 4), { width: w - 2 * (opts.padX || 6), align: opts.align || 'left', characterSpacing: opts.charSpace, lineBreak: opts.lineBreak !== false });
  else doc.text(text, x + (opts.padX || 6), y + (opts.padY || 4), { width: w - 2 * (opts.padX || 6), align: opts.align || 'left', lineBreak: opts.lineBreak !== false });
  doc.restore();
}

function measureText(text, w, opts = {}) {
  doc.save();
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10);
  const h = doc.heightOfString(text, { width: w - 2 * (opts.padX || 6) });
  doc.restore();
  return h + 2 * (opts.padY || 4);
}

function drawHero() {
  const y = MARGIN;
  const h = 100;
  rect(MARGIN, y, CONTENT_W, h, BRAND);
  textInRect('PROPOSTA COMERCIAL', MARGIN, y + 16, CONTENT_W, 14, { size: 9, bold: true, color: '#FFFFFF', padX: 20, padY: 0, charSpace: 2 });
  textInRect('Sistema CRM Bom Flow', MARGIN, y + 34, CONTENT_W, 30, { size: 24, bold: true, color: '#FFFFFF', padX: 20, padY: 0 });
  textInRect('Plataforma multi-módulo pronta para entrega', MARGIN, y + 70, CONTENT_W, 14, { size: 11, color: BRAND_LIGHT, padX: 20, padY: 0 });
  doc.y = y + h + 16;
}

function drawMetaTable() {
  const cols = [{ w: CONTENT_W * 0.18 }, { w: CONTENT_W * 0.32 }, { w: CONTENT_W * 0.18 }, { w: CONTENT_W * 0.32 }];
  const rowH = 26;
  const rows = [
    ['Cliente', '[Nome do Cliente]', 'Data', '24/04/2026'],
    ['Projeto', 'CRM Bom Flow — Sistema completo', 'Validade', '30 dias'],
    ['Status', 'Pronto e operacional — entrega imediata', 'Tipo', 'Venda definitiva'],
  ];
  const greenRow = 2;
  let y = doc.y;
  rows.forEach((r, i) => {
    let x = MARGIN;
    r.forEach((cellText, j) => {
      const isLabel = j % 2 === 0;
      const w = cols[j].w;
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(x, y + rowH).lineTo(x + w, y + rowH).stroke();
      const isGreenStatus = i === greenRow && j === 1;
      textInRect(cellText, x, y, w, rowH, {
        size: isLabel ? 8 : 10,
        bold: true,
        color: isLabel ? MUTED : (isGreenStatus ? GREEN : TEXT),
        charSpace: isLabel ? 1 : 0,
        padY: 8,
      });
      x += w;
    });
    y += rowH;
  });
  doc.y = y + 8;
}

function h2(text) {
  ensureSpace(40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(ACCENT).text(text, MARGIN, doc.y);
  doc.moveDown(0.4);
}

function h3(text) {
  ensureSpace(30);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND).text(text, MARGIN, doc.y);
  doc.moveDown(0.3);
}

function body(text) {
  doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(text, MARGIN, doc.y, { width: CONTENT_W, align: 'justify' });
  doc.moveDown(0.4);
}

function note(text) {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(text, MARGIN, doc.y, { width: CONTENT_W, align: 'justify' });
  doc.moveDown(0.4);
}

function bullet(text) {
  ensureSpace(20);
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  doc.text('•  ' + text, MARGIN + 10, doc.y, { width: CONTENT_W - 10 });
  doc.moveDown(0.2);
}

function bulletRich(label, rest) {
  ensureSpace(20);
  const startY = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT).text('•  ', MARGIN + 10, startY, { continued: true, width: CONTENT_W - 10 });
  doc.font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(rest);
  doc.moveDown(0.2);
}

function numbered(n, label, rest) {
  ensureSpace(24);
  const startY = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(n + '. ', MARGIN + 10, startY, { continued: true, width: CONTENT_W - 10 });
  doc.font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(rest);
  doc.moveDown(0.3);
}

function drawPhasesTable() {
  const cols = [
    { w: 24, align: 'center', label: '#' },
    { w: 110, align: 'left', label: 'Fase / Componente' },
    { w: CONTENT_W - 24 - 110 - 38 - 52 - 62, align: 'left', label: 'Descrição' },
    { w: 38, align: 'right', label: 'Horas' },
    { w: 52, align: 'right', label: 'Taxa' },
    { w: 62, align: 'right', label: 'Subtotal' },
  ];
  const headerH = 22;

  const drawHeader = () => {
    let x = MARGIN;
    rect(MARGIN, doc.y, CONTENT_W, headerH, ACCENT);
    cols.forEach((c) => {
      textInRect(c.label, x, doc.y, c.w, headerH, { size: 9, bold: true, color: '#FFFFFF', align: c.align, padY: 7 });
      x += c.w;
    });
    doc.y += headerH;
  };

  ensureSpace(headerH + 30);
  drawHeader();

  phases.forEach((p, i) => {
    const cellsContent = [p[0], p[1], p[2], String(p[3]), fmt(TAXA), fmt(p[3] * TAXA)];
    const heights = cellsContent.map((c, j) => measureText(c, cols[j].w, { size: 9, bold: j === 1 || j === 5 }));
    const rowH = Math.max(...heights, 22);

    if (doc.y + rowH > CONTENT_BOTTOM) {
      newPage();
      drawHeader();
    }

    if (i % 2 === 0) rect(MARGIN, doc.y, CONTENT_W, rowH, ROW_ALT);

    let x = MARGIN;
    cellsContent.forEach((c, j) => {
      const opts = { size: 9, align: cols[j].align, padY: 6, bold: j === 1 || j === 5 };
      textInRect(c, x, doc.y, cols[j].w, rowH, opts);
      x += cols[j].w;
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, doc.y + rowH).lineTo(MARGIN + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });

  ensureSpace(28);
  const totalH = 26;
  rect(MARGIN, doc.y, CONTENT_W, totalH, BRAND);
  let x = MARGIN;
  const totalCells = ['', '', 'TOTAL', totalHoras + ' h', '', fmt(totalValor)];
  totalCells.forEach((c, j) => {
    if (c) textInRect(c, x, doc.y, cols[j].w, totalH, { size: 11, bold: true, color: '#FFFFFF', align: j < 2 ? 'left' : 'right', padY: 8 });
    x += cols[j].w;
  });
  doc.y += totalH + 6;
}

function drawSummaryTable() {
  const labelW = CONTENT_W - 180;
  const valueW = 180;
  const rows = [
    ['Total de horas investidas', totalHoras + ' horas', null, false],
    ['Valor de referência (esforço × taxa)', fmt(totalValor), BRAND, true],
    ['Status', 'Pronto, testado e operacional', GREEN, false],
    ['Entrega', 'Imediata após assinatura', null, false],
  ];
  rows.forEach((r) => {
    const valueSize = r[3] ? 16 : 11;
    const rowH = Math.max(28, valueSize + 16);
    ensureSpace(rowH);
    textInRect(r[0], MARGIN, doc.y, labelW, rowH, { size: 11, bold: true, padY: 8 });
    textInRect(r[1], MARGIN + labelW, doc.y, valueW, rowH, { size: valueSize, bold: true, color: r[2] || TEXT, align: 'right', padY: r[3] ? 5 : 8 });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, doc.y + rowH).lineTo(MARGIN + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });
  doc.moveDown(0.6);
}

function drawPaymentTable(rows) {
  const cols = [
    { w: 70, align: 'left', label: 'Parcela' },
    { w: 60, align: 'right', label: '%' },
    { w: 110, align: 'right', label: 'Valor' },
    { w: CONTENT_W - 70 - 60 - 110, align: 'left', label: 'Marco' },
  ];
  const headerH = 22;
  ensureSpace(headerH + rows.length * 24 + 4);

  let x = MARGIN;
  rect(MARGIN, doc.y, CONTENT_W, headerH, ACCENT);
  cols.forEach((c) => {
    textInRect(c.label, x, doc.y, c.w, headerH, { size: 9, bold: true, color: '#FFFFFF', align: c.align, padY: 7 });
    x += c.w;
  });
  doc.y += headerH;

  rows.forEach((r, i) => {
    const heights = r.slice(0, 4).map((c, j) => measureText(String(c), cols[j].w, { size: 9, bold: j === 0 || j === 2 }));
    const rowH = Math.max(...heights, 22);
    if (i % 2 === 0) rect(MARGIN, doc.y, CONTENT_W, rowH, ROW_ALT);
    let xx = MARGIN;
    r.slice(0, 4).forEach((c, j) => {
      const color = j === 2 && r[4] ? r[4] : TEXT;
      textInRect(String(c), xx, doc.y, cols[j].w, rowH, { size: 9, bold: j === 0 || j === 2, color, align: cols[j].align, padY: 6 });
      xx += cols[j].w;
    });
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, doc.y + rowH).lineTo(MARGIN + CONTENT_W, doc.y + rowH).stroke();
    doc.y += rowH;
  });
  doc.moveDown(0.5);
}

function drawCTA() {
  const h = 70;
  ensureSpace(h + 10);
  const y = doc.y;
  rect(MARGIN, y, CONTENT_W, h, BRAND);
  textInRect('Próximos passos', MARGIN, y + 14, CONTENT_W, 20, { size: 14, bold: true, color: '#FFFFFF', padX: 20, padY: 0 });
  textInRect('Aguardamos seu retorno para formalizar a contratação e iniciar a transferência do sistema.', MARGIN, y + 38, CONTENT_W, 20, { size: 10, color: BRAND_LIGHT, padX: 20, padY: 0 });
  doc.y = y + h + 12;
}

newPage();
drawHero();
drawMetaTable();

h2('1. Sobre o Sistema');
body('Plataforma web completa de CRM, já desenvolvida e em pleno funcionamento, com módulos comerciais segregados, integrações com WhatsApp, ERP e assinatura eletrônica, RBAC granular, dashboards operacionais e sistema de comissionamento.');

const cardW = (CONTENT_W - 12) / 2;
const cardY = doc.y;
const cardH = 70;
ensureSpace(cardH + 8);
rect(MARGIN, cardY, cardW, cardH, ROW_ALT, BORDER);
textInRect('Stack Técnica', MARGIN, cardY + 8, cardW, 14, { size: 10, bold: true, color: BRAND, padX: 12, padY: 0 });
textInRect('React 18 + Vite\nTailwind CSS + Radix UI\nNode.js + Express\nPostgreSQL', MARGIN, cardY + 22, cardW, cardH - 22, { size: 9, color: TEXT, padX: 12, padY: 0 });
rect(MARGIN + cardW + 12, cardY, cardW, cardH, ROW_ALT, BORDER);
textInRect('Módulos Inclusos', MARGIN + cardW + 12, cardY + 8, cardW, 14, { size: 10, bold: true, color: BRAND, padX: 12, padY: 0 });
textInRect('Helpdesk · Vendas PF · Vendas PJ · UpCell\nIndicações + Gerador de Leads · Cobrança\nBom Auto · Base de Conhecimento · QA\nComissionamento · Automações · WhatsApp', MARGIN + cardW + 12, cardY + 22, cardW, cardH - 22, { size: 9, color: TEXT, padX: 12, padY: 0 });
doc.y = cardY + cardH + 12;

newPage();
h2('2. Valoração do Sistema');
body('A tabela abaixo representa o esforço técnico investido no desenvolvimento do sistema, base para a precificação do produto pronto.');
note('Taxa horária de referência: R$ 180,00 — perfil Sênior Full-Stack Brasil. Mediana de mercado 2026 segundo Glassdoor, Catho e Get on Board (faixa R$ 150–250/h para profissionais sênior com domínio em React, Node.js, PostgreSQL e integrações REST complexas).');
drawPhasesTable();

newPage();
h2('3. Resumo Executivo');
drawSummaryTable();

h2('4. O Que Está Incluso na Entrega');
bulletRich('Código-fonte completo ', '(frontend + backend + scripts de banco)');
bulletRich('Sistema rodando ', 'em ambiente de produção, pronto para uso');
bulletRich('Banco de dados ', 'estruturado com toda a modelagem entregue');
bulletRich('Documentação técnica ', '(arquitetura, API, banco)');
bulletRich('Manual do usuário ', 'para cada módulo');
bulletRich('Treinamento: ', '16h para usuários finais + 8h para equipe técnica');
bulletRich('Migração de dados ', 'inicial (de planilhas ou sistema legado, conforme escopo)');
bulletRich('Garantia de 90 dias ', 'para correção de bugs sem custo adicional');

newPage();
h2('5. Formas de Pagamento');
body('Como o sistema já está pronto, sugerimos modelos orientados à entrega imediata:');

h3('Opção A — Pagamento à vista (5% de desconto)');
drawPaymentTable([['Único', '100%', fmt(desconto), 'Assinatura do contrato e entrega imediata', BRAND]]);

h3('Opção B — Parcelamento curto (3 parcelas)');
drawPaymentTable([
  ['1ª', '40%', fmt(op2_1), 'Assinatura do contrato e liberação de acesso'],
  ['2ª', '30%', fmt(op2_2), '30 dias após a assinatura'],
  ['3ª', '30%', fmt(op2_2), '60 dias após a assinatura'],
]);

h3('Opção C — Parcelamento estendido (6 parcelas)');
drawPaymentTable([
  ['1ª', '25%', fmt(op3_1), 'Assinatura do contrato e entrega'],
  ['2ª – 6ª', '15% cada', fmt(op3_2) + '/mês', 'Mensais consecutivas'],
]);
note('Forma de pagamento: boleto bancário ou PIX, com vencimento em até 5 dias úteis após a emissão da nota fiscal de serviço.');

newPage();
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
drawCTA();

doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text('[Nome da Empresa Contratada]', MARGIN, doc.y);
doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('[CNPJ / Razão Social]', MARGIN, doc.y);
doc.text('[E-mail / Telefone / Site]', MARGIN, doc.y);

doc.end();
stream.on('finish', () => console.log('OK ->', outPath));
stream.on('error', (err) => { console.error(err); process.exit(1); });
