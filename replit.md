# Wescctech CRM

## Overview
Wescctech CRM is a comprehensive Customer Relationship Management system designed to manage customer service, sales, collections, and knowledge base operations. It aims to provide a robust, self-hosted CRM solution leveraging modern web technologies to deliver a highly customizable and scalable platform for businesses, especially those migrating from legacy systems. Its core purpose is to streamline customer interactions and internal processes through a full suite of tools.

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
- **Database**: PostgreSQL (native `pg` library)
- **Authentication**: JWT
- **File Uploads**: Multer

### Core Features
- **Helpdesk**: Ticket management (SLA, Kanban, configurable types, templates, macros, CSAT).
- **Sales (B2C & B2B)**: Lead pipeline (Kanban), geolocation map, activity scheduling, proposals, e-signatures, targets.
- **Referrals**: Management, commission tracking, conversion pipeline.
- **Knowledge Base**: Categorized articles, versioning.
- **Quality Assurance**: Monitoring, evaluation checklists, call auditing.
- **Collections**: Collection tickets, delinquency dashboard, contact scheduling.
- **Bom Auto**: Vehicle service consultation module with ERP integration, client eligibility check, service attendance registration, full Operational Dashboard (command center) with real-time counters, operational alerts, universal search, advanced collapsible filters, status-based visual differentiation, auto-refresh, and Utilization Report (BomAutoRelatorio) with advanced filters, Excel/PDF export, and access restricted to Admin and Sales Supervisor agent types.

### UI/UX Design
- **Kanban Boards**: Implemented using `@dnd-kit` for simultaneous vertical and horizontal scrolling. Features include sticky headers, canvas drag blocking, auto-scroll, and specific sensor configurations.
- **Component Library**: Radix UI for accessible components, styled with Tailwind CSS.
- **Reporting**: Recharts for data visualization on dashboards.
- **Visual Design System**: Features sticky top navigation, hero profile cards with gradient backgrounds and glassmorphism, themed color gradients (PF=blue, PJ=indigo, Indicações=amber), temperature badges, and standardized rounded corners and shadows (rounded-2xl, shadow-2xl).
- **Detail Pages**: Standardized layout across lead and referral detail pages with Header, Pending Tasks Alert, Pipeline History Card, and a two-column grid for tabs (Activities, Tasks, Proposal/Contract) and a sidebar. Temperature badges indicate lead contact recency.
- **Timeline Components**: Redesigned with gradient vertical connecting lines, themed icon containers, and card-based activity items.
- **Mobile Responsiveness**: Full mobile/tablet support with hamburger menu, collapsible sidebar overlay, touch-friendly snap scrolling on Kanban boards, responsive grids, and mobile-first CSS utility classes (responsive-grid-*, card-responsive, touch-target, kanban-scroll).

### Technical Implementations
- **Monorepo Structure**: Frontend (`src/`) and Backend (`backend/`) in a single repository.
- **API Design**: RESTful API with standardized CRUD endpoints.
- **Authentication & Authorization**: JWT-based authentication with a comprehensive Role-Based Access Control (RBAC) system. RBAC supports 7 agent types and 4 team structures, with permissions dynamically managed from the database with fallbacks to hardcoded flags.
- **Dynamic Ticket Distribution**: Algorithms for Round Robin and Least Active agent assignment.
- **SLA Management**: Configurable Service Level Agreements with priority-based deadlines.
- **Lead Automation**: Automated triggers and actions based on lead stage and inactivity.
- **WhatsApp Automation (WHU API)**: Integrated for automated messaging, supporting various trigger types and template components.
- **Digital Contract Signing**: Public page for clients to sign contracts digitally (PublicContractSign.jsx), with signature stored as image and token-based access. Routes: getPublicContract, signContract, send-contract-whatsapp.
- **Task Completion from Lead Detail**: Tasks can be marked as completed directly from lead detail pages (PF, PJ, Referrals) with checkbox and "Concluir" button, synced with main agenda/tasks module.
- **Optimistic UI**: Implemented for Kanban drag-and-drop.
- **Dashboard Filters**: Reusable `DashboardFilters` component (`src/components/dashboard/DashboardFilters.jsx`) with period presets, team/equipe selector, agent selector, and stage filter. Team filter is available system-wide across all dashboards, kanbans, pipelines, and reports. Team filter resets agent selection on change. All ID comparisons use `String()` casting for robustness.
- **Team Filter Data Model**: Team filtering works indirectly — leads/tickets don't have a `team_id` field. Instead, agents have `team_id`, and the filter finds agents in the team, then filters records by those agent IDs. The `bom_auto_atendimentos.usuario` field stores agent emails (not names), so BomAutoRelatorio matches by `a.email` or `a.name`.
- **Metrics Documentation**: `MetricsHelpDialog` component (`src/components/dashboard/MetricsHelpDialog.jsx`) explains metric calculations with role-based visibility.
- **Centralized Constants**: Stage definitions for different lead types are centralized in `src/constants/stages.js`.
- **Token Auto-Refresh**: Global fetch interceptor (`src/api/tokenInterceptor.js`) transparently refreshes expired accessTokens using the refreshToken (7-day validity). Only retries safe (GET/HEAD/OPTIONS) requests automatically; non-idempotent requests return 401 for app-level handling. On refresh failure, clears tokens and redirects to login. Installed in `src/main.jsx` before app render.

## External Dependencies

- **PostgreSQL**: Primary database.
- **React 18**: Frontend library.
- **Vite**: Frontend build tool.
- **React Query**: Data fetching and state management.
- **React Router**: Client-side routing.
- **Tailwind CSS**: Utility-first CSS framework.
- **Radix UI**: Headless UI component library.
- **Recharts**: Charting library.
- **Node.js**: Backend runtime.
- **Express**: Node.js web framework.
- **`pg`**: Native PostgreSQL client for Node.js.
- **`jsonwebtoken`**: For JWT authentication.
- **`multer`**: For file uploads.
- **`@dnd-kit/core` and `@dnd-kit/sortable`**: Drag-and-drop library.
- **ERP Bom Pastor**: Integrated for CPF lookup in the Referral system.
- **ERP Bom Auto API**: Integrated for vehicle/client consultation in the Bom Auto module (API_TESTE_BOM_AUTO endpoint).