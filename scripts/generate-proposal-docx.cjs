const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageOrientation, LevelFormat, convertInchesToTwip,
} = require('docx');
const fs = require('fs');
const path = require('path');

const BRAND = '7C3AED';
const ACCENT = '0F172A';
const MUTED = '64748B';
const ROW_ALT = 'F8FAFC';
const BORDER = 'E2E8F0';
const GREEN = '15803D';

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

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const lightBorder = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
const allLightBorders = { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function txt(text, opts = {}) {
  return new TextRun({ text, font: 'Calibri', size: opts.size || 20, bold: opts.bold, italics: opts.italics, color: opts.color, characterSpacing: opts.characterSpacing });
}
function p(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: opts.alignment, spacing: opts.spacing, heading: opts.heading });
}
function cell(content, opts = {}) {
  return new TableCell({
    children: Array.isArray(content) ? content : [content],
    width: opts.width,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    borders: opts.borders || allLightBorders,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: opts.vAlign,
  });
}

function headerBanner() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        children: [cell([
          p(txt('PROPOSTA COMERCIAL', { size: 18, bold: true, color: 'FFFFFF', characterSpacing: 40 })),
          p(txt('Sistema CRM Bom Flow', { size: 48, bold: true, color: 'FFFFFF' }), { spacing: { before: 120, after: 80 } }),
          p(txt('Plataforma multi-módulo pronta para entrega', { size: 22, color: 'E9D5FF' })),
        ], { fill: BRAND, borders: noBorders }),
        ],
        height: { value: 1500, rule: 'atLeast' },
      }),
    ],
  });
}

function metaBlock() {
  const row = (l1, v1, l2, v2, vColor) => new TableRow({ children: [
    cell(p(txt(l1, { size: 16, bold: true, color: MUTED, characterSpacing: 20 })), { width: { size: 22, type: WidthType.PERCENTAGE } }),
    cell(p(txt(v1, { size: 22, bold: true, color: vColor }))),
    cell(p(txt(l2, { size: 16, bold: true, color: MUTED, characterSpacing: 20 })), { width: { size: 22, type: WidthType.PERCENTAGE } }),
    cell(p(txt(v2, { size: 22, bold: true }))),
  ]});
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      row('Cliente', '[Nome do Cliente]', 'Data', '24/04/2026'),
      row('Projeto', 'CRM Bom Flow — Sistema completo', 'Validade', '30 dias'),
      row('Status', 'Pronto e operacional — entrega imediata', 'Tipo', 'Venda definitiva', GREEN),
    ],
  });
}

function h2(text) { return p(txt(text, { size: 32, bold: true, color: ACCENT }), { spacing: { before: 360, after: 160 } }); }
function h3(text) { return p(txt(text, { size: 24, bold: true, color: BRAND }), { spacing: { before: 200, after: 100 } }); }
function body(text) { return p(txt(text, { size: 22 }), { spacing: { after: 120 } }); }
function note(text) { return p(txt(text, { size: 18, italics: true, color: MUTED }), { spacing: { after: 160 } }); }

function phasesTable() {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell(p(txt('#', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.CENTER }), { fill: ACCENT }),
      cell(p(txt('Fase / Componente', { size: 18, bold: true, color: 'FFFFFF' })), { fill: ACCENT }),
      cell(p(txt('Descrição', { size: 18, bold: true, color: 'FFFFFF' })), { fill: ACCENT }),
      cell(p(txt('Horas', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: ACCENT }),
      cell(p(txt('Taxa', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: ACCENT }),
      cell(p(txt('Subtotal', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: ACCENT }),
    ],
  });

  const rows = phases.map((ph, i) => {
    const fill = i % 2 === 0 ? ROW_ALT : null;
    return new TableRow({ children: [
      cell(p(txt(ph[0], { size: 18 }), { alignment: AlignmentType.CENTER }), { fill }),
      cell(p(txt(ph[1], { size: 18, bold: true })), { fill }),
      cell(p(txt(ph[2], { size: 18 })), { fill }),
      cell(p(txt(String(ph[3]), { size: 18 }), { alignment: AlignmentType.RIGHT }), { fill }),
      cell(p(txt(fmt(TAXA), { size: 18 }), { alignment: AlignmentType.RIGHT }), { fill }),
      cell(p(txt(fmt(ph[3] * TAXA), { size: 18, bold: true }), { alignment: AlignmentType.RIGHT }), { fill }),
    ]});
  });

  const total = new TableRow({ children: [
    cell(p(txt('', {})), { fill: BRAND }),
    cell(p(txt('', {})), { fill: BRAND }),
    cell(p(txt('TOTAL', { size: 20, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: BRAND }),
    cell(p(txt(totalHoras + ' h', { size: 20, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: BRAND }),
    cell(p(txt('', {})), { fill: BRAND }),
    cell(p(txt(fmt(totalValor), { size: 20, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: BRAND }),
  ]});

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [400, 1900, 4400, 800, 1200, 1500],
    rows: [header, ...rows, total],
  });
}

function summaryTable() {
  const r = (lbl, val, color, big) => new TableRow({ children: [
    cell(p(txt(lbl, { size: 22, bold: true }))),
    cell(p(txt(val, { size: big ? 32 : 22, bold: true, color }), { alignment: AlignmentType.RIGHT })),
  ]});
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [6500, 3500],
    rows: [
      r('Total de horas investidas', totalHoras + ' horas'),
      r('Valor de referência (esforço × taxa)', fmt(totalValor), BRAND, true),
      r('Status', 'Pronto, testado e operacional', GREEN),
      r('Entrega', 'Imediata após assinatura'),
    ],
  });
}

function paymentTable(rows) {
  const header = new TableRow({ tableHeader: true, children: [
    cell(p(txt('Parcela', { size: 18, bold: true, color: 'FFFFFF' })), { fill: ACCENT }),
    cell(p(txt('%', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: ACCENT }),
    cell(p(txt('Valor', { size: 18, bold: true, color: 'FFFFFF' }), { alignment: AlignmentType.RIGHT }), { fill: ACCENT }),
    cell(p(txt('Marco', { size: 18, bold: true, color: 'FFFFFF' })), { fill: ACCENT }),
  ]});
  const dataRows = rows.map((r, i) => {
    const fill = i % 2 === 0 ? ROW_ALT : null;
    return new TableRow({ children: [
      cell(p(txt(r[0], { size: 18, bold: true })), { fill }),
      cell(p(txt(r[1], { size: 18 }), { alignment: AlignmentType.RIGHT }), { fill }),
      cell(p(txt(r[2], { size: 18, bold: true, color: r[4] || undefined }), { alignment: AlignmentType.RIGHT }), { fill }),
      cell(p(txt(r[3], { size: 18 })), { fill }),
    ]});
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1400, 1000, 2200, 5400],
    rows: [header, ...dataRows],
  });
}

function bullet(text) { return new Paragraph({ children: [txt(text, { size: 22 })], bullet: { level: 0 }, spacing: { after: 60 } }); }
function bulletRich(label, rest) { return new Paragraph({ children: [txt(label, { size: 22, bold: true }), txt(rest, { size: 22 })], bullet: { level: 0 }, spacing: { after: 60 } }); }
function numbered(label, rest, ref) { return new Paragraph({ children: [txt(label, { size: 22, bold: true }), txt(rest, { size: 22 })], numbering: { reference: ref, level: 0 }, spacing: { after: 80 } }); }

function ctaBlock() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [cell([
        p(txt('Próximos passos', { size: 28, bold: true, color: 'FFFFFF' })),
        p(txt('Aguardamos seu retorno para formalizar a contratação e iniciar a transferência do sistema.', { size: 22, color: 'E9D5FF' }), { spacing: { before: 120 } }),
      ], { fill: BRAND, borders: noBorders })],
      height: { value: 1100, rule: 'atLeast' },
    })],
  });
}

const desconto = totalValor * 0.95;
const op2_1 = totalValor * 0.4;
const op2_2 = totalValor * 0.3;
const op3_1 = totalValor * 0.25;
const op3_2 = totalValor * 0.15;

const doc = new Document({
  creator: 'Bom Flow',
  title: 'Proposta Comercial — CRM Bom Flow',
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  numbering: {
    config: [
      { reference: 'obs-list', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    children: [
      headerBanner(),
      p(txt('', {}), { spacing: { after: 200 } }),
      metaBlock(),

      h2('1. Sobre o Sistema'),
      body('Plataforma web completa de CRM, já desenvolvida e em pleno funcionamento, com módulos comerciais segregados, integrações com WhatsApp, ERP e assinatura eletrônica, RBAC granular, dashboards operacionais e sistema de comissionamento.'),
      h3('Stack Técnica'),
      body('React 18 + Vite, Tailwind CSS + Radix UI, Node.js + Express, PostgreSQL.'),
      h3('Módulos Inclusos'),
      body('Helpdesk, Vendas PF, Vendas PJ, UpCell, Indicações + Gerador de Leads, Cobrança, Bom Auto, Base de Conhecimento, Quality Assurance, Comissionamento, Automações, Disparos WhatsApp.'),

      h2('2. Valoração do Sistema'),
      body('A tabela abaixo representa o esforço técnico investido no desenvolvimento do sistema, base para a precificação do produto pronto.'),
      note('Taxa horária de referência: R$ 180,00 — perfil Sênior Full-Stack Brasil. Mediana de mercado 2026 segundo Glassdoor, Catho e Get on Board (faixa R$ 150–250/h para profissionais sênior com domínio em React, Node.js, PostgreSQL e integrações REST complexas).'),
      phasesTable(),

      h2('3. Resumo Executivo'),
      summaryTable(),

      h2('4. O Que Está Incluso na Entrega'),
      bulletRich('Código-fonte completo ', '(frontend + backend + scripts de banco)'),
      bulletRich('Sistema rodando ', 'em ambiente de produção, pronto para uso'),
      bulletRich('Banco de dados ', 'estruturado com toda a modelagem entregue'),
      bulletRich('Documentação técnica ', '(arquitetura, API, banco)'),
      bulletRich('Manual do usuário ', 'para cada módulo'),
      bulletRich('Treinamento: ', '16h para usuários finais + 8h para equipe técnica'),
      bulletRich('Migração de dados ', 'inicial (de planilhas ou sistema legado, conforme escopo)'),
      bulletRich('Garantia de 90 dias ', 'para correção de bugs sem custo adicional'),

      h2('5. Formas de Pagamento'),
      body('Como o sistema já está pronto, sugerimos modelos orientados à entrega imediata:'),

      h3('Opção A — Pagamento à vista (5% de desconto)'),
      paymentTable([['Único', '100%', fmt(desconto), 'Assinatura do contrato e entrega imediata', BRAND]]),

      h3('Opção B — Parcelamento curto (3 parcelas)'),
      paymentTable([
        ['1ª', '40%', fmt(op2_1), 'Assinatura do contrato e liberação de acesso'],
        ['2ª', '30%', fmt(op2_2), '30 dias após a assinatura'],
        ['3ª', '30%', fmt(op2_2), '60 dias após a assinatura'],
      ]),

      h3('Opção C — Parcelamento estendido (6 parcelas)'),
      paymentTable([
        ['1ª', '25%', fmt(op3_1), 'Assinatura do contrato e entrega'],
        ['2ª – 6ª', '15% cada', fmt(op3_2) + '/mês', 'Mensais consecutivas'],
      ]),
      note('Forma de pagamento: boleto bancário ou PIX, com vencimento em até 5 dias úteis após a emissão da nota fiscal de serviço.'),

      h2('6. Observações Importantes'),
      numbered('Custos não inclusos: ', 'hospedagem em nuvem, domínios, certificados SSL pagos, licenças de software de terceiros, créditos da API WhatsApp (WHU/Meta), créditos da Autentique, custos de e-mail transacional e quaisquer ferramentas SaaS adicionais.', 'obs-list'),
      numbered('Customizações futuras: ', 'ajustes de escopo solicitados após a entrega serão tratados como aditivos, com nova estimativa em horas.', 'obs-list'),
      numbered('Garantia: ', '90 dias após o aceite para correção de bugs sem custo adicional.', 'obs-list'),
      numbered('Manutenção pós-garantia: ', 'pode ser contratada como mensalidade fixa (sugestão: pacote de 40h/mês a R$ 7.200,00) ou banco de horas pré-pago.', 'obs-list'),
      numbered('Propriedade intelectual: ', 'o código-fonte completo será entregue ao cliente, sem dependência de licenças proprietárias da contratada.', 'obs-list'),
      numbered('Confidencialidade: ', 'todas as informações compartilhadas serão tratadas sob NDA mútuo.', 'obs-list'),
      numbered('Compliance: ', 'o sistema segue boas práticas de LGPD (consentimento, criptografia em trânsito e em repouso, RBAC granular).', 'obs-list'),

      h2('7. Diferenciais'),
      bullet('Sistema pronto para uso — sem espera por desenvolvimento'),
      bullet('Arquitetura multi-módulo com isolamento real de dados, equipes e automações'),
      bullet('RBAC granular com 7 perfis e 4 estruturas de time'),
      bullet('Sistema de comissões com 6 camadas de validação contra ERP'),
      bullet('Validação WhatsApp em larga escala (1.200+ números) com fila assíncrona e cache'),
      bullet('Self-hosted — sem amarras com plataformas de CRM externas'),
      bullet('Código-fonte 100% entregue ao cliente'),

      p(txt('', {}), { spacing: { after: 200 } }),
      ctaBlock(),
      p(txt('', {}), { spacing: { after: 200 } }),

      p(txt('[Nome da Empresa Contratada]', { size: 22, bold: true })),
      p(txt('[CNPJ / Razão Social]', { size: 18, color: MUTED })),
      p(txt('[E-mail / Telefone / Site]', { size: 18, color: MUTED })),
    ],
  }],
});

const outPath = path.resolve(__dirname, '..', 'exports', 'proposta-comercial-crm-bom-flow.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('OK ->', outPath);
}).catch((err) => { console.error(err); process.exit(1); });
