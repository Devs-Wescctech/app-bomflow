# Wescctech CRM

## Overview
Wescctech CRM is a comprehensive, self-hosted Customer Relationship Management system designed to streamline customer service, sales, collections, and knowledge base operations. It provides a highly customizable and scalable platform leveraging modern web technologies, aiming to assist businesses in migrating from legacy systems and enhancing customer interactions through a full suite of tools. Key capabilities include integrated helpdesk, B2C/B2B sales management, referral tracking, knowledge base, quality assurance, and collections.

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
- **Helpdesk**: Ticket management with SLA, Kanban, configurable types, templates, macros, and CSAT.
- **Sales (B2C & B2B)**: Lead pipeline (Kanban), geolocation, activity scheduling, proposals, e-signatures, and target management.
- **Referrals**: Referral management, commission tracking, conversion pipeline, and a Lead Generator with WhatsApp bulk messaging, audit logging, async queue processing, rate limiting, and RBAC. Includes an agent-specific dashboard for referral sales (`IndicacoesMeuPainel.jsx`).
- **Knowledge Base**: Categorized articles with versioning.
- **Quality Assurance**: Monitoring, evaluation checklists, and call auditing.
- **Collections**: Collection tickets, delinquency dashboard, and contact scheduling.
- **Bom Auto**: Vehicle service consultation module with ERP integration, client eligibility, service registration, a comprehensive Operational Dashboard, and Utilization Report.

### UI/UX Design
- **Kanban Boards**: Advanced drag-and-drop implementation using `@dnd-kit` with sticky headers, auto-scroll, and mobile responsiveness.
- **Component Library**: Radix UI for accessibility, styled with Tailwind CSS.
- **Data Visualization**: Recharts for dynamic dashboards.
- **Visual Design System**: Features sticky navigation, gradient-themed profile cards with glassmorphism, distinct color gradients for different business types (PF=blue, PJ=indigo, Indicações=amber), temperature badges, and standardized rounded corners/shadows.
- **Detail Pages**: Consistent layout for lead/referral details including header, pending tasks, pipeline history, and a two-column grid for tabs and sidebar.
- **Timeline Components**: Redesigned with gradient connecting lines and themed activity cards.
- **Mobile Responsiveness**: Full support with hamburger menu, collapsible sidebar, touch-friendly Kanban, and responsive grids.

### Technical Implementations
- **Monorepo Structure**: Frontend and Backend coexist within a single repository.
- **API Design**: RESTful API with standardized CRUD operations.
- **Authentication & Authorization**: JWT-based authentication with a comprehensive Role-Based Access Control (RBAC) system supporting 7 agent types and 4 team structures, with dynamic database management and hardcoded fallbacks.
- **Dynamic Ticket Distribution**: Algorithms for Round Robin and Least Active agent assignment.
- **SLA Management**: Configurable Service Level Agreements with priority-based deadlines.
- **Lead Automation**: Automated triggers and actions based on lead stage and inactivity.
- **WhatsApp Automation**: Integration with WHU API for automated messaging and template support.
- **Digital Contract Signing**: Public-facing module for digital contract signatures with token-based access.
- **Optimistic UI**: Implemented for Kanban drag-and-drop interactions.
- **Dashboard Filters**: Reusable `DashboardFilters` component (`src/components/dashboard/DashboardFilters.jsx`) with period presets, team, agent, and stage filters, ensuring consistent data display across dashboards.
- **ERP Agent ID Mapping**: Agents table includes `erp_agent_id` for integration with external ERP systems, facilitating agent resolution and mapping.
- **Token Auto-Refresh**: Global fetch interceptor for transparently refreshing expired access tokens using refresh tokens, with fallback to login on failure.
- **API List Limits**: Default API list limits increased to 10000 for leads, referrals, and generic CRUD endpoints to ensure consistent data visibility in dashboards and reports.
- **WhatsApp Dispatch Platform**: Professional system with async queue processing, rate limiting, recurrence blocking, daily duplicate prevention, intelligent retry logic, real-time polling, and an operational dashboard for metrics and analytics, including RBAC for dispatch permissions.
- **Lead Generator Metrics Audit**: Automated daily audit system for Lead Generator metrics, checking for sales without dispatches, dispatches without sales, potential duplicates, and recalculating ROI. Results are persisted and accessible on-demand.
- **Commission ERP Validation & Deduplication**: Commission eligibility validated against ERP data (`API_DADOS_VENDAS_INDICACOES`) with 6-layer protection: (1) sale must exist in ERP, (2) sale must be paid (`valores_pagos=SIM`), (3) sale must match the referred client's CPF (`cpf_indicado` ↔ `referred_cpf`), (4) only the first/oldest referral for a given `referred_cpf` is eligible (`created_at ASC`), (5) each `contrato_servicos` can only generate one commission (tracked in `processed_referral_contracts` table), (6) referral must have been created before the sale date (`created_at < data_contrato`), preventing retroactive referrals. Sales deduplication uses `contrato_servicos` and fallback composite keys via `processed_referral_sales`.
- **Commission Tier System**: Commission is a single value per indicator (not multiplied by conversions). Tiers: 1-3 paid conversions = R$100, 4-12 = R$150, 13+ = R$200. Applied via `getCommissionByTier()` in both `runWeeklyCommissionBatch` and `getCommissionReportData`. Frontend rules in `src/utils/commissionRules.js`.
- **Commission Reconciliation**: Automated daily audit (04:00) comparing ERP paid sales with system commissions. Detects: sales without commissions, commissions without sales, cancelled payments, and duplicate contracts. Results stored in `commission_reconciliation_logs` with admin panel at `/CommissionReconciliation`. Manual trigger available.
- **Commission Payment Control**: Financial control module for commission payments with weekly cycles (Thursday 00:00 → Tuesday 23:59). Automated batch generation on Wednesdays (cron 05:00) fetches ERP paid sales, registers eligible commissions in `commission_payment_control`, and creates payment batches in `commission_payment_batches`. Features: manual batch trigger, individual/batch payment confirmation, deduplication by `contrato_servicos`, grouped indicator view. Admin panel at `/CommissionPaymentControl` (supervisor-only). RBAC enforced on all endpoints.
- **Commission Email Reports**: Weekly automated email report sent Wednesdays at 08:00 with commission summary and audit tables. SMTP configuration stored in `email_commission_settings` table, administrable via Indicações → Automações. Features: configurable SMTP, test email, manual send, duplicate prevention for automatic sends, email tracking on batches (`email_enviado`, `data_envio_email`, `usuario_envio`, `tipo_envio`). Uses `nodemailer` with SSL.
- **Phone Normalization**: Utility function `normalizePhone()` ensures consistent phone number formats for conversion tracking and comparison across various data sources.

## External Dependencies

- **PostgreSQL**: Primary database for the system.
- **React 18**: Frontend library for building user interfaces.
- **Vite**: Fast development build tool for the frontend.
- **React Query**: For server state management and data fetching.
- **React Router**: For client-side routing in the single-page application.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Radix UI**: Headless component library for accessible UI primitives.
- **Recharts**: JavaScript charting library for data visualization.
- **Node.js**: JavaScript runtime for the backend server.
- **Express**: Web framework for Node.js backend.
- **`pg`**: Node.js native PostgreSQL client.
- **`jsonwebtoken`**: For implementing JWT-based authentication.
- **`multer`**: Middleware for handling `multipart/form-data`, used for file uploads.
- **`@dnd-kit/core` and `@dnd-kit/sortable`**: Libraries for drag-and-drop functionality, particularly for Kanban boards.
- **ERP Bom Pastor API**: External API (`API_CPF_INDICADOR`) used for CPF lookup and associated data in the Referral system.
- **ERP Bom Auto API**: External API (`API_TESTE_BOM_AUTO`) integrated for vehicle and client consultation within the Bom Auto module.
- **ERP API_DADOS_VENDAS_INDICACOES**: External API providing sales data for Lead Generator ROI metrics and Commission Management validation.