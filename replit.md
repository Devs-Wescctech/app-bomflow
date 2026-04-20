# Wescctech CRM

## Overview
Wescctech CRM is a comprehensive, self-hosted Customer Relationship Management system designed to streamline customer service, sales, collections, and knowledge base operations. It aims to assist businesses in migrating from legacy systems and enhancing customer interactions through a full suite of tools. Key capabilities include integrated helpdesk, B2C/B2B sales management, referral tracking, knowledge base, quality assurance, and collections. The project focuses on providing a highly customizable and scalable platform leveraging modern web technologies.

## User Preferences
- I want iterative development.
- I want to be asked before making major changes.
- I prefer detailed explanations.
- Do not make changes to folder `src/api/base44Client.js`.
- Use the DashboardFilters component as the default pattern for all dashboard filter implementations (period presets, agent selector, stage filter).

## System Architecture

### Frontend
- **Framework**: React 18 with Vite
- **State Management**: React Query
- **Routing**: React Router
- **Styling**: Tailwind CSS, Radix UI
- **Charting**: Recharts

### Backend
- **Framework**: Node.js with Express
- **Database**: PostgreSQL
- **Authentication**: JWT
- **File Uploads**: Multer

### Core Features
- **Helpdesk**: Ticket management with SLA, Kanban, and configurable tools.
- **Sales (B2C & B2B)**: Lead pipeline, geolocation, activity scheduling, proposals, e-signatures, and target management.
- **Referrals**: Referral management, commission tracking, conversion pipeline, and a Lead Generator with WhatsApp bulk messaging, audit logging, async queue processing, rate limiting, and RBAC.
- **Knowledge Base**: Categorized articles with versioning.
- **Quality Assurance**: Monitoring, evaluation checklists, and call auditing.
- **Collections**: Collection tickets, delinquency dashboard, and contact scheduling.
- **Bom Auto**: Vehicle service consultation module with ERP integration, client eligibility, service registration, and operational dashboards.

### UI/UX Design
- **Kanban Boards**: Advanced drag-and-drop implementation with sticky headers, auto-scroll, and mobile responsiveness.
- **Component Library**: Radix UI for accessibility, styled with Tailwind CSS.
- **Data Visualization**: Recharts for dynamic dashboards.
- **Visual Design System**: Features sticky navigation, gradient-themed profile cards, distinct color gradients for different business types, temperature badges, and standardized rounded corners/shadows.
- **Detail Pages**: Consistent layout for lead/referral details including header, pending tasks, pipeline history, and a two-column grid for tabs and sidebar.
- **Timeline Components**: Redesigned with gradient connecting lines and themed activity cards.
- **Mobile Responsiveness**: Full support with hamburger menu, collapsible sidebar, touch-friendly Kanban, and responsive grids.

### Technical Implementations
- **Monorepo Structure**: Frontend and Backend coexist within a single repository.
- **API Design**: RESTful API with standardized CRUD operations.
- **Authentication & Authorization**: JWT-based authentication with a comprehensive Role-Based Access Control (RBAC) system supporting 7 agent types and 4 team structures.
- **Dynamic Ticket Distribution**: Algorithms for Round Robin and Least Active agent assignment.
- **SLA Management**: Configurable Service Level Agreements with priority-based deadlines.
- **Lead Automation**: Automated triggers and actions based on lead stage and inactivity, supporting multi-team assignment and both B2C (PF) and B2B (PJ) leads.
- **WhatsApp Automation**: Integration with WHU API for automated messaging and template support, including intelligent fallback mechanisms for dispatch.
- **Digital Contract Signing**: Public-facing module for digital contract signatures with token-based access.
- **Optimistic UI**: Implemented for Kanban drag-and-drop interactions.
- **Dashboard Filters**: Reusable `DashboardFilters` component for consistent data display across dashboards.
- **ERP Agent ID Mapping**: `erp_agent_id` for integration with external ERP systems.
- **Token Auto-Refresh**: Global fetch interceptor for transparently refreshing expired access tokens.
- **API List Limits**: Default API list limits increased to 10000 for various endpoints.
- **WhatsApp Dispatch Platform**: Professional system with async queue processing, rate limiting, recurrence blocking, daily duplicate prevention, intelligent retry logic, real-time polling, and an operational dashboard with RBAC.
- **Lead Generator Metrics Audit**: Automated daily audit system for Lead Generator metrics, including ROI recalculation.
- **Commission ERP Validation & Deduplication**: Commission eligibility validated against ERP data with a 6-layer protection system.
- **Commission Tier System**: Commission calculated based on a unit value multiplied by conversions across different tiers.
- **Commission Weekly Snapshot**: Frozen weekly commission data stored for reports and payment control.
- **Commission Reconciliation**: Automated daily audit comparing ERP paid sales with system commissions.
- **Commission Payment Control**: Financial control module for commission payments with weekly cycles, automated batch generation, and manual confirmations.
- **Commission Email Reports**: Weekly automated email reports with commission summaries and audit tables, configurable via admin panel.
- **Phone Normalization**: Utility function `normalizePhone()` for consistent phone number formats.
- **Structured Dispatch Logging**: Detailed logging of every WhatsApp dispatch with lead metadata, agent info, status, and conversion tracking.
- **Channel Automations**: Separate automation system within Indicações module allowing per-channel WhatsApp token configuration for inactivity and stage duration triggers. Menu item "Automações" was removed from the Indicações sidebar (page/route still exists and is accessible via direct URL); "Automações por Canal" remains visible in the sidebar. Automatic template variable detection (`{{1}}`, `{{2}}`) determines whether to send BODY parameters or empty components to the WHU API, stored as `template_has_variables` in `action_config`.
- **WHU Template Parameter Resolution**: Three-layer detection applied consistently across scheduler, test-send, and all automation flows: (1) Explicit `action_config.template_has_variables` flag set by frontend on template selection; (2) Fallback regex scan of `action_config.templateMessage` for `{{N}}` patterns (supports legacy automations created before the flag); (3) `sendWhatsAppMessageWithToken` uses `Array.isArray(templateComponents)` to distinguish `[]` (no params) from `undefined` (default 1 BODY param with lead name). The same 3-layer logic is used in: `checkContatoSequencialTrigger()`, `executeChannelAutomationAction()`, `handleTestSend()` (frontend), and `/api/whatsapp/test-send` (backend). WHU API `create-new` requires `quickAnswerComponents: []` for no-variable templates.
- **Indicador PIX Key**: PIX payment keys stored per-CPF, integrated into referral creation, commission reports, and payment control.
- **Agent WhatsApp Channel Token**: Individual `whatsapp_channel_token` for agents for WHU/Rudo integration.
- **Sequential Contact Triggers (2°/3°/4° Contato)**: Three new trigger types (`segundo_contato`, `terceiro_contato`, `quarto_contato`) in "Automações por Canal" module. Based on `gerador_leads_whatsapp_logs` table: if `retorno_whu != true` after 7 days of the previous contact, sends configured WhatsApp template. Columns: `data_segundo_contato`, `data_terceiro_contato`, `data_quarto_contato` (TIMESTAMP). Chain: 1° disparo original → 7d → 2° contato → 7d → 3° contato → 7d → 4° contato. If `retorno_whu = true` at any point, subsequent contacts are cancelled. Backend handler: `checkContatoSequencialTrigger()` in `automationService.js`. Runs via same `setInterval` scheduler (every 60 min).
- **WHU ChatId Verification API**: Public endpoint for WHU webhook callbacks to update dispatch logs.
- **Lead WhatsApp Contact Log**: Logs agent-initiated WhatsApp contacts with leads.
- **Lead Generator WhatsApp Pre-Validation**: Ao clicar em "Buscar Leads", o frontend percorre a base do ERP em lotes de 30 chamando `POST /api/functions/validate-whatsapp-numbers`, que consulta WHU `/wa-number-check/{phone}` (12 chamadas paralelas, timeout 8s) e só devolve números com `status = VALID_WA_NUMBER`. Resultados ficam em cache na tabela `whatsapp_number_validations` (PK `phone`): `VALID_WA_NUMBER` por 30 dias, `INVALID_WA_NUMBER` por 90 dias. Loop encerra ao alcançar `MAX_LEADS=1200` válidos ou esgotar a base. Endpoint protegido pelo mesmo `DISPATCH_FORBIDDEN_TYPES` do gerador (vendas/sales/bom_auto_atendente/support/collection/pre_sales/post_sales bloqueados); tentativas negadas são auditadas em `gerador_leads_audit_log`. UI exibe barra de progresso (verificados/total + válidos/alvo) durante a validação. Service: `whatsappValidationService.js`. Token reutilizado: `RUDO_WHATSAPP_TOKEN`.

## External Dependencies

- **PostgreSQL**: Primary database.
- **React 18**: Frontend library.
- **Vite**: Frontend build tool.
- **React Query**: Server state management.
- **React Router**: Client-side routing.
- **Tailwind CSS**: Styling framework.
- **Radix UI**: Headless component library.
- **Recharts**: Charting library.
- **Node.js**: Backend runtime.
- **Express**: Backend framework.
- **`pg`**: PostgreSQL client.
- **`jsonwebtoken`**: JWT authentication.
- **`multer`**: File uploads.
- **`@dnd-kit`**: Drag-and-drop functionality.
- **ERP Bom Pastor API**: External API for CPF and associated data lookup.
- **ERP Bom Auto API**: External API for vehicle and client consultation.
- **ERP API_DADOS_VENDAS_INDICACOES**: External API for sales data and commission validation.