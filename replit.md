# SalesTwo - Vendas B2B

## Overview
SalesTwo is a focused B2B sales management platform built on a streamlined version of the original Wescctech CRM. The system is designed exclusively for managing B2B (Pessoa Jurídica) sales operations, including lead management, pipeline tracking, proposals, and agent/access management.

## Brand Identity
- **Primary Colors**: Burgundy (#5A2A3C) + Coral (#F98F6F)
- **Logo**: `/public/logo-saleswo.png` (full), `/public/logo-saleswo-icon-nobg.png` (icon, transparent)
- **Favicon**: `/public/logo-saleswo-icon-nobg.png`
- **Page Title**: "SalesTwo - Vendas B2B"

## Active Modules
1. **Vendas PJ** — Main module: B2B lead pipeline, dashboards, proposals, automations, reports
2. **Agentes** — User/agent management with permissions and access control
3. **Configurações** — System settings (branding, permissions)

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

### Active Pages
- **Vendas PJ**: SalesPJDashboard, SalesPJAgentsDashboard, NewLeadPJ, LeadsPJKanban, LeadPJSearch, SalesPJReports, SalesPJWonReport, LeadPJAutomations, LeadPJDetail
- **Shared**: SalesAgenda, SalesTasks, ProposalTemplates, AutomationLogs
- **Admin**: Agents, Settings
- **Public**: PublicSignature, PublicProposal, PublicContractSign
- **Auth**: Login

### WhatsApp Automation Token
- Token is stored in `system_settings` table as `automation_token`
- Backend `whatsappService.js` uses `getConfiguredToken()` which reads from DB first, falls back to `RUDO_WHATSAPP_TOKEN` env var
- Frontend configuration UI available in LeadPJAutomations page
- Token is masked in UI for security (shows first 6 + last 4 chars)
- Saving a new token auto-refreshes WhatsApp templates
- Template parameter count is dynamically detected from template definition (no hardcoded IDs)

### Activities/Agenda
- `SalesAgenda` combines activities from both `activities` (PF) and `activities_pj` (PJ) tables
- PJ activities link to `LeadPJDetail`, PF activities link to `LeadDetail`
- Activity types include: visit, call, whatsapp, email, task, meeting

### UI/UX Design
- **Kanban Boards**: Advanced drag-and-drop implementation using `@dnd-kit` with sticky headers, auto-scroll, and mobile responsiveness.
- **Component Library**: Radix UI for accessibility, styled with Tailwind CSS.
- **Data Visualization**: Recharts for dynamic dashboards.
- **Visual Design System**: Indigo/violet gradient theme for B2B sales, glassmorphism sidebar, temperature badges.
- **Mobile Responsiveness**: Full support with hamburger menu, collapsible sidebar, touch-friendly Kanban, and responsive grids.

### Technical Implementations
- **Monorepo Structure**: Frontend and Backend coexist within a single repository.
- **API Design**: RESTful API with standardized CRUD operations.
- **Authentication & Authorization**: JWT-based authentication with RBAC system.
- **Lead Automation**: Automated triggers and actions based on lead stage and inactivity for PJ leads.
- **Digital Contract Signing**: Public-facing module for digital contract signatures with token-based access.
- **Optimistic UI**: Implemented for Kanban drag-and-drop interactions.
- **Dashboard Filters**: Reusable `DashboardFilters` component with period presets, team, agent, and stage filters.
- **Token Auto-Refresh**: Global fetch interceptor for transparently refreshing expired access tokens.
- **Configurable Automation Token**: WhatsApp automation token configurable via UI, stored in system_settings DB table.

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
- **`@dnd-kit/core` and `@dnd-kit/sortable`**: Libraries for drag-and-drop functionality.
