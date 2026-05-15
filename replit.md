# Wescctech CRM

## Overview
Wescctech CRM is a comprehensive, self-hosted Customer Relationship Management system designed to streamline customer service, sales, collections, and knowledge base operations. It aims to assist businesses in migrating from legacy systems and enhancing customer interactions through a full suite of tools. Key capabilities include integrated helpdesk, B2C/B2B sales management, referral tracking, knowledge base, quality assurance, and collections. The project focuses on providing a highly customizable and scalable platform leveraging modern web technologies. It also includes specialized modules like "Bom Auto" for vehicle service consultation and "Upsell" for dedicated sales management.

## User Preferences
- I want iterative development.
- I want to be asked before making major changes.
- I prefer detailed explanations.
- Do not make changes to folder `src/api/base44Client.js`.
- GitHub pushes must always go to the repository **`Devs-Wescctech/app-bomflow`** (branch `main`). Never push to `Wescctech/app-crm-vh` or any other repository.
- Use the DashboardFilters component as the default pattern for all dashboard filter implementations (period presets, agent selector, stage filter).

## System Architecture

### Frontend
- **Framework**: React 18 with Vite
- **State Management**: React Query
- **Routing**: React Router
- **Styling**: Tailwind CSS, Radix UI
- **Charting**: Recharts
- **UI/UX Decisions**: Kanban boards with drag-and-drop, sticky headers, auto-scroll, mobile responsiveness. Consistent design system with sticky navigation, gradient themes, distinct color gradients, temperature badges, and standardized rounded corners/shadows. Redesigned timeline components.

### Backend
- **Framework**: Node.js with Express
- **Database**: PostgreSQL
- **Authentication**: JWT
- **File Uploads**: Multer
- **API Design**: RESTful API with standardized CRUD operations.

### Core Features & Technical Implementations
- **Monorepo Structure**: Frontend and Backend coexist in a single repository.
- **Authentication & Authorization**: JWT-based authentication with Role-Based Access Control (RBAC) supporting 7 agent types and 4 team structures.
- **Helpdesk**: Ticket management with SLA, Kanban, and configurable tools. Dynamic ticket distribution using Round Robin and Least Active agent assignment.
- **Sales (B2C & B2B)**: Lead pipeline, geolocation, activity scheduling, proposals, e-signatures, and target management. Automated lead triggers and actions based on stage and inactivity.
- **Referrals**: Referral management, commission tracking, conversion pipeline, and a Lead Generator with WhatsApp bulk messaging, audit logging, async queue processing, rate limiting, and RBAC. Includes features like PIX key integration, sequential contact triggers, and hard delete with RBAC.
- **Knowledge Base**: Categorized articles with versioning.
- **Quality Assurance**: Monitoring, evaluation checklists, and call auditing.
- **Collections**: Collection tickets, delinquency dashboard, and contact scheduling.
- **Bom Auto**: Vehicle service consultation module with ERP integration.
- **APPs Hub**: Central launcher for internal mini-apps. First app shipped: **API Reference** — modern, Stripe-style documentation page (`/ApiDocumentation`) with sticky sidebar nav, search/scroll-spy, per-endpoint cards (method badge, path/query/body tables) and live cURL/JavaScript code samples. Endpoint spec lives in `src/data/apiDocsSpec.js`.
- **Upsell**: Independent sales module mirroring B2C content but with B2B-style separation and dedicated data structures. Includes dedicated Tarefas (`SalesUpsellTasks`) and Agenda (`SalesUpsellAgenda`) pages backed by `activities_upsell`/`leads_upsell`. Welcome and stage_change automations are wired through `automationService` (`executeLeadCreatedAutomation`/`executeStageChangeAutomation` with `leadType='lead_upsell'`) and the cron picks up `lead_upsell_automations` via `checkAndExecuteLeadUpsellAutomations`. Admin/supervisor permissions resolved through helpers `isAdminUser` (global), `isUpsellAdmin`/`isUpsellPrivileged`. Kanban filters out concluded leads (`!l.concluded`). Search page includes "Retornar ao Pipeline" button for concluded/lost leads. SalesUpsellTasks uses permission-based filtering (supervisor/admin see all, agents see own). LeadUpsellDetail accepts `location.state.tab` for tab switching from external navigation. **Channel Automations**: fully independent `LeadUpsellAutomations` page (modeled after `ReferralChannelAutomations`) with own token config (`upsell_channel_config`), template search by token (`getTemplatesByToken`/`WhatsAppTemplateSelectorByToken`), and dedicated automation rules (`upsell_channel_automations`). Backend engine: `checkAndExecuteUpsellChannelAutomations` (cron), `executeUpsellChannelLeadCreatedAutomation` and `executeUpsellChannelStageChangeAutomation` (real-time dispatch in POST/PUT `/leads-upsell`). Color scheme: violet.
- **WhatsApp Automation**: Integration with WHU API for automated messaging, template support, and intelligent fallback mechanisms. Includes a professional dispatch platform with async queue processing, rate limiting, and an operational dashboard.
- **Digital Contract Signing**: Public-facing module with token-based access.
- **Optimistic UI**: Implemented for Kanban interactions.
- **Dashboard Filters**: Reusable `DashboardFilters` component for consistent data display.
- **ERP Integration**: `erp_agent_id` for integration with external ERP systems for data lookup, commission validation, and deduplication.
- **Commission Management**: Tiered commission system, weekly snapshots, reconciliation, and payment control with email reports.
- **Token Management**: Global fetch interceptor for transparently refreshing expired access tokens.
- **API List Limits**: Default API list limits increased to 10000 for various endpoints.
- **WhatsApp Pre-Validation**: Asynchronous job for validating WhatsApp numbers with caching and cancelation functionality.

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
- **WHU API**: External API for WhatsApp messaging and number validation.