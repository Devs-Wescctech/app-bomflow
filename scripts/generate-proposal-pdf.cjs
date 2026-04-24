const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

const BRAND = '#7C3AED';
const ACCENT = '#0F172A';
const MUTED = '#64748B';
const ROW_ALT = '#F8FAFC';
const BORDER = '#E2E8F0';

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

const phaseRows = phases.map((p, i) => [
  { text: p[0], style: 'cell', alignment: 'center' },
  { text: p[1], style: 'cellBold' },
  { text: p[2], style: 'cell' },
  { text: p[3].toString(), style: 'cell', alignment: 'right' },
  { text: fmt(TAXA), style: 'cell', alignment: 'right' },
  { text: fmt(p[3] * TAXA), style: 'cellBold', alignment: 'right' },
]);

const totalRow = [
  { text: '', fillColor: BRAND },
  { text: '', fillColor: BRAND },
  { text: 'TOTAL', style: 'totalLabel', alignment: 'right', fillColor: BRAND, color: '#FFFFFF' },
  { text: totalHoras.toString() + ' h', style: 'totalLabel', alignment: 'right', fillColor: BRAND, color: '#FFFFFF' },
  { text: '', fillColor: BRAND },
  { text: fmt(totalValor), style: 'totalLabel', alignment: 'right', fillColor: BRAND, color: '#FFFFFF' },
];

const desconto = totalValor * 0.95;
const op2_1 = totalValor * 0.4;
const op2_2 = totalValor * 0.3;
const op3_1 = totalValor * 0.25;
const op3_2 = totalValor * 0.15;

const docDefinition = {
  pageSize: 'A4',
  pageMargins: [40, 70, 40, 60],

  header: (currentPage) => {
    if (currentPage === 1) return null;
    return {
      margin: [40, 25, 40, 0],
      columns: [
        { text: 'Proposta Comercial — CRM Bom Flow', style: 'headerSmall', color: MUTED },
        { text: '24/04/2026', style: 'headerSmall', alignment: 'right', color: MUTED },
      ],
    };
  },

  footer: (currentPage, pageCount) => ({
    margin: [40, 20, 40, 0],
    columns: [
      { text: 'Confidencial — uso restrito ao destinatário', style: 'footerText', color: MUTED },
      { text: 'Página ' + currentPage + ' de ' + pageCount, style: 'footerText', alignment: 'right', color: MUTED },
    ],
  }),

  content: [
    {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: [
              { text: 'PROPOSTA COMERCIAL', style: 'kicker', color: '#FFFFFF' },
              { text: 'Sistema CRM Bom Flow', style: 'h1', color: '#FFFFFF', margin: [0, 6, 0, 4] },
              { text: 'Plataforma multi-módulo pronta para entrega', style: 'subtitle', color: '#E9D5FF' },
            ],
            fillColor: BRAND,
            border: [false, false, false, false],
            margin: [20, 22, 20, 22],
          },
        ]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 20],
    },

    {
      table: {
        widths: ['25%', '*', '25%', '*'],
        body: [
          [
            { text: 'Cliente', style: 'metaLabel', color: MUTED },
            { text: '[Nome do Cliente]', style: 'metaValue' },
            { text: 'Data', style: 'metaLabel', color: MUTED },
            { text: '24/04/2026', style: 'metaValue' },
          ],
          [
            { text: 'Projeto', style: 'metaLabel', color: MUTED },
            { text: 'CRM Bom Flow — Sistema completo', style: 'metaValue' },
            { text: 'Validade', style: 'metaLabel', color: MUTED },
            { text: '30 dias', style: 'metaValue' },
          ],
          [
            { text: 'Status', style: 'metaLabel', color: MUTED },
            { text: 'Pronto e operacional — entrega imediata', style: 'metaValue', color: '#15803D' },
            { text: 'Tipo', style: 'metaLabel', color: MUTED },
            { text: 'Venda definitiva', style: 'metaValue' },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 8,
        paddingBottom: () => 8,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
      margin: [0, 0, 0, 20],
    },

    { text: '1. Sobre o Sistema', style: 'h2', color: ACCENT, margin: [0, 8, 0, 8] },
    {
      text: 'Plataforma web completa de CRM, já desenvolvida e em pleno funcionamento, com módulos comerciais segregados, integrações com WhatsApp, ERP e assinatura eletrônica, RBAC granular, dashboards operacionais e sistema de comissionamento.',
      style: 'body',
      margin: [0, 0, 0, 8],
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Stack Técnica', style: 'cardTitle', color: BRAND },
            { text: 'React 18 + Vite\nTailwind CSS + Radix UI\nNode.js + Express\nPostgreSQL', style: 'cardBody' },
          ],
        },
        {
          width: '*',
          stack: [
            { text: 'Módulos Inclusos', style: 'cardTitle', color: BRAND },
            { text: 'Helpdesk · Vendas PF · Vendas PJ · UpCell\nIndicações + Gerador de Leads · Cobrança\nBom Auto · Base de Conhecimento · QA\nComissionamento · Automações · Disparos WhatsApp', style: 'cardBody' },
          ],
        },
      ],
      columnGap: 16,
      margin: [0, 4, 0, 16],
    },

    { text: '2. Valoração do Sistema', style: 'h2', color: ACCENT, pageBreak: 'before', margin: [0, 0, 0, 6] },
    {
      text: 'A tabela abaixo representa o esforço técnico investido no desenvolvimento do sistema, base para a precificação do produto pronto.',
      style: 'body',
      margin: [0, 0, 0, 6],
    },
    {
      text: 'Taxa horária de referência: R$ 180,00 — perfil Sênior Full-Stack Brasil. Mediana de mercado 2026 segundo Glassdoor, Catho e Get on Board (faixa R$ 150–250/h para profissionais sênior com domínio comprovado em React, Node.js, PostgreSQL e integrações REST complexas).',
      style: 'note',
      color: MUTED,
      margin: [0, 0, 0, 12],
    },

    {
      table: {
        headerRows: 1,
        widths: [22, 110, '*', 36, 50, 60],
        body: [
          [
            { text: '#', style: 'thead', alignment: 'center' },
            { text: 'Fase / Componente', style: 'thead' },
            { text: 'Descrição', style: 'thead' },
            { text: 'Horas', style: 'thead', alignment: 'right' },
            { text: 'Taxa', style: 'thead', alignment: 'right' },
            { text: 'Subtotal', style: 'thead', alignment: 'right' },
          ],
          ...phaseRows,
          totalRow,
        ],
      },
      layout: {
        fillColor: (rowIndex) => {
          if (rowIndex === 0) return ACCENT;
          if (rowIndex === phaseRows.length + 1) return BRAND;
          return rowIndex % 2 === 0 ? ROW_ALT : null;
        },
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
    },

    { text: '3. Resumo Executivo', style: 'h2', color: ACCENT, pageBreak: 'before', margin: [0, 0, 0, 12] },
    {
      table: {
        widths: ['*', 160],
        body: [
          [
            { text: 'Total de horas investidas', style: 'summaryLabel' },
            { text: totalHoras + ' horas', style: 'summaryValue', alignment: 'right' },
          ],
          [
            { text: 'Valor de referência (esforço × taxa)', style: 'summaryLabel' },
            { text: fmt(totalValor), style: 'summaryValueBig', alignment: 'right', color: BRAND },
          ],
          [
            { text: 'Status', style: 'summaryLabel' },
            { text: 'Pronto, testado e operacional', style: 'summaryValue', alignment: 'right', color: '#15803D' },
          ],
          [
            { text: 'Entrega', style: 'summaryLabel' },
            { text: 'Imediata após assinatura', style: 'summaryValue', alignment: 'right' },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 12,
        paddingBottom: () => 12,
        paddingLeft: () => 10,
        paddingRight: () => 10,
      },
      margin: [0, 0, 0, 24],
    },

    { text: '4. O Que Está Incluso na Entrega', style: 'h2', color: ACCENT, margin: [0, 0, 0, 10] },
    {
      ul: [
        { text: [{ text: 'Código-fonte completo ', bold: true }, '(frontend + backend + scripts de banco)'] },
        { text: [{ text: 'Sistema rodando ', bold: true }, 'em ambiente de produção, pronto para uso'] },
        { text: [{ text: 'Banco de dados ', bold: true }, 'estruturado com toda a modelagem entregue'] },
        { text: [{ text: 'Documentação técnica ', bold: true }, '(arquitetura, API, banco)'] },
        { text: [{ text: 'Manual do usuário ', bold: true }, 'para cada módulo'] },
        { text: [{ text: 'Treinamento: ', bold: true }, '16h para usuários finais + 8h para equipe técnica'] },
        { text: [{ text: 'Migração de dados ', bold: true }, 'inicial (de planilhas ou sistema legado, conforme escopo)'] },
        { text: [{ text: 'Garantia de 90 dias ', bold: true }, 'para correção de bugs sem custo adicional'] },
      ],
      style: 'body',
      margin: [10, 0, 0, 20],
    },

    { text: '5. Formas de Pagamento', style: 'h2', color: ACCENT, pageBreak: 'before', margin: [0, 0, 0, 6] },
    {
      text: 'Como o sistema já está pronto, sugerimos modelos orientados à entrega imediata:',
      style: 'body',
      margin: [0, 0, 0, 14],
    },

    { text: 'Opção A — Pagamento à vista (5% de desconto)', style: 'h3', color: BRAND, margin: [0, 0, 0, 6] },
    {
      table: {
        widths: ['auto', 60, 90, '*'],
        body: [
          [
            { text: 'Parcela', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
            { text: '%', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Valor', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Marco', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
          ],
          [
            { text: 'Único', style: 'cellBold' },
            { text: '100%', style: 'cell', alignment: 'right' },
            { text: fmt(desconto), style: 'cellBold', alignment: 'right', color: BRAND },
            { text: 'Assinatura do contrato e entrega imediata', style: 'cell' },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 7,
        paddingBottom: () => 7,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 16],
    },

    { text: 'Opção B — Parcelamento curto (3 parcelas)', style: 'h3', color: BRAND, margin: [0, 0, 0, 6] },
    {
      table: {
        widths: ['auto', 60, 90, '*'],
        body: [
          [
            { text: 'Parcela', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
            { text: '%', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Valor', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Marco', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
          ],
          [
            { text: '1ª', style: 'cellBold' },
            { text: '40%', style: 'cell', alignment: 'right' },
            { text: fmt(op2_1), style: 'cellBold', alignment: 'right' },
            { text: 'Assinatura do contrato e liberação de acesso', style: 'cell' },
          ],
          [
            { text: '2ª', style: 'cellBold' },
            { text: '30%', style: 'cell', alignment: 'right' },
            { text: fmt(op2_2), style: 'cellBold', alignment: 'right' },
            { text: '30 dias após a assinatura', style: 'cell' },
          ],
          [
            { text: '3ª', style: 'cellBold' },
            { text: '30%', style: 'cell', alignment: 'right' },
            { text: fmt(op2_2), style: 'cellBold', alignment: 'right' },
            { text: '60 dias após a assinatura', style: 'cell' },
          ],
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex > 0 && rowIndex % 2 === 0 ? ROW_ALT : null),
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 7,
        paddingBottom: () => 7,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 16],
    },

    { text: 'Opção C — Parcelamento estendido (6 parcelas)', style: 'h3', color: BRAND, margin: [0, 0, 0, 6] },
    {
      table: {
        widths: ['auto', 60, 90, '*'],
        body: [
          [
            { text: 'Parcela', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
            { text: '%', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Valor', style: 'thead', alignment: 'right', fillColor: ACCENT, color: '#FFFFFF' },
            { text: 'Marco', style: 'thead', fillColor: ACCENT, color: '#FFFFFF' },
          ],
          [
            { text: '1ª', style: 'cellBold' },
            { text: '25%', style: 'cell', alignment: 'right' },
            { text: fmt(op3_1), style: 'cellBold', alignment: 'right' },
            { text: 'Assinatura do contrato e entrega', style: 'cell' },
          ],
          [
            { text: '2ª – 6ª', style: 'cellBold' },
            { text: '15% cada', style: 'cell', alignment: 'right' },
            { text: fmt(op3_2) + '/mês', style: 'cellBold', alignment: 'right' },
            { text: 'Mensais consecutivas', style: 'cell' },
          ],
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex > 0 && rowIndex % 2 === 0 ? ROW_ALT : null),
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 7,
        paddingBottom: () => 7,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 12],
    },
    {
      text: 'Forma de pagamento: boleto bancário ou PIX, com vencimento em até 5 dias úteis após a emissão da nota fiscal de serviço.',
      style: 'note',
      color: MUTED,
    },

    { text: '6. Observações Importantes', style: 'h2', color: ACCENT, pageBreak: 'before', margin: [0, 0, 0, 10] },
    {
      ol: [
        { text: [{ text: 'Custos não inclusos: ', bold: true }, 'hospedagem em nuvem (AWS / Replit / DigitalOcean), domínios, certificados SSL pagos, licenças de software de terceiros, créditos da API WhatsApp (WHU/Meta), créditos da Autentique, custos de e-mail transacional e quaisquer ferramentas SaaS adicionais que o cliente venha a contratar.'] },
        { text: [{ text: 'Customizações futuras: ', bold: true }, 'ajustes de escopo solicitados após a entrega serão tratados como aditivos, com nova estimativa em horas.'] },
        { text: [{ text: 'Garantia: ', bold: true }, '90 dias após o aceite para correção de bugs sem custo adicional.'] },
        { text: [{ text: 'Manutenção pós-garantia: ', bold: true }, 'pode ser contratada como mensalidade fixa (sugestão: pacote de 40h/mês a R$ 7.200,00) ou banco de horas pré-pago.'] },
        { text: [{ text: 'Propriedade intelectual: ', bold: true }, 'o código-fonte completo será entregue ao cliente, sem dependência de licenças proprietárias da contratada.'] },
        { text: [{ text: 'Confidencialidade: ', bold: true }, 'todas as informações compartilhadas serão tratadas sob NDA mútuo.'] },
        { text: [{ text: 'Compliance: ', bold: true }, 'o sistema segue boas práticas de LGPD (consentimento registrado, criptografia em trânsito e em repouso, RBAC granular).'] },
      ],
      style: 'body',
      margin: [10, 0, 0, 20],
    },

    { text: '7. Diferenciais', style: 'h2', color: ACCENT, margin: [0, 0, 0, 10] },
    {
      ul: [
        'Sistema pronto para uso — sem espera por desenvolvimento',
        'Arquitetura multi-módulo com isolamento real de dados, equipes e automações',
        'RBAC granular com 7 perfis e 4 estruturas de time',
        'Sistema de comissões com 6 camadas de validação contra ERP',
        'Validação WhatsApp em larga escala (1.200+ números) com fila assíncrona e cache',
        'Self-hosted — sem amarras com plataformas de CRM externas',
        'Código-fonte 100% entregue ao cliente',
      ],
      style: 'body',
      margin: [10, 0, 0, 24],
    },

    {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: [
              { text: 'Próximos passos', style: 'ctaTitle', color: '#FFFFFF' },
              { text: 'Aguardamos seu retorno para formalizar a contratação e iniciar a transferência do sistema.', style: 'ctaBody', color: '#E9D5FF', margin: [0, 6, 0, 0] },
            ],
            fillColor: BRAND,
            border: [false, false, false, false],
            margin: [20, 18, 20, 18],
          },
        ]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 16],
    },

    {
      columns: [
        {
          width: '*',
          stack: [
            { text: '[Nome da Empresa Contratada]', style: 'sigName' },
            { text: '[CNPJ / Razão Social]', style: 'sigInfo', color: MUTED },
            { text: '[E-mail / Telefone / Site]', style: 'sigInfo', color: MUTED },
          ],
        },
      ],
    },
  ],

  styles: {
    kicker: { fontSize: 10, bold: true, characterSpacing: 2 },
    h1: { fontSize: 26, bold: true },
    h2: { fontSize: 16, bold: true },
    h3: { fontSize: 12, bold: true },
    subtitle: { fontSize: 11 },
    body: { fontSize: 10, lineHeight: 1.4 },
    note: { fontSize: 9, italics: true, lineHeight: 1.4 },
    metaLabel: { fontSize: 8, bold: true, characterSpacing: 1 },
    metaValue: { fontSize: 10, bold: true },
    cardTitle: { fontSize: 10, bold: true, margin: [0, 0, 0, 4] },
    cardBody: { fontSize: 9, lineHeight: 1.5 },
    thead: { fontSize: 9, bold: true, color: '#FFFFFF' },
    cell: { fontSize: 9 },
    cellBold: { fontSize: 9, bold: true },
    totalLabel: { fontSize: 10, bold: true },
    summaryLabel: { fontSize: 11, bold: true },
    summaryValue: { fontSize: 11, bold: true },
    summaryValueBig: { fontSize: 16, bold: true },
    ctaTitle: { fontSize: 14, bold: true },
    ctaBody: { fontSize: 10 },
    sigName: { fontSize: 11, bold: true, margin: [0, 0, 0, 2] },
    sigInfo: { fontSize: 9, margin: [0, 1, 0, 0] },
    headerSmall: { fontSize: 8 },
    footerText: { fontSize: 8 },
  },

  defaultStyle: { font: 'Roboto' },
};

const outPath = path.resolve(__dirname, '..', 'exports', 'proposta-comercial-crm-bom-flow.pdf');
const pdfDoc = printer.createPdfKitDocument(docDefinition);
const stream = fs.createWriteStream(outPath);
pdfDoc.pipe(stream);
pdfDoc.end();
stream.on('finish', () => {
  console.log('OK ->', outPath);
});
