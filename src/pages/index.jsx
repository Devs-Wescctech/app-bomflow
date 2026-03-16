import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import QueueBoard from "./QueueBoard";

import TicketView from "./TicketView";

import MyTickets from "./MyTickets";

import CreateTicket from "./CreateTicket";

import TicketTypes from "./TicketTypes";

import Agents from "./Agents";

import KnowledgeBase from "./KnowledgeBase";

import KBArticle from "./KBArticle";

import LeadsKanban from "./LeadsKanban";

import LeadDetail from "./LeadDetail";

import LeadsMap from "./LeadsMap";

import SalesTasks from "./SalesTasks";

import SalesDashboard from "./SalesDashboard";

import SalesAgents from "./SalesAgents";

import ProposalTemplates from "./ProposalTemplates";

import PublicSignature from "./PublicSignature";

import CreateSalesTicket from "./CreateSalesTicket";

import SalesTicketView from "./SalesTicketView";

import SalesTickets from "./SalesTickets";

import SalesQueueBoard from "./SalesQueueBoard";

import PortalLogin from "./PortalLogin";

import PortalValidateToken from "./PortalValidateToken";

import PortalHome from "./PortalHome";

import PortalCreateTicket from "./PortalCreateTicket";

import PortalTickets from "./PortalTickets";

import PortalTicketView from "./PortalTicketView";

import PortalContract from "./PortalContract";

import PortalBoletos from "./PortalBoletos";

import CreateCollectionTicket from "./CreateCollectionTicket";

import CollectionTicketView from "./CollectionTicketView";

import CollectionBoard from "./CollectionBoard";

import CollectionDashboard from "./CollectionDashboard";

import CollectionReports from "./CollectionReports";

import CollectionAgenda from "./CollectionAgenda";

import PublicProposal from "./PublicProposal";

import PublicContractSign from "./PublicContractSign";

import Settings from "./Settings";

import AIAgents from "./AIAgents";

import Templates from "./Templates";

import NotificationSettings from "./NotificationSettings";

import SalesRoutes from "./SalesRoutes";

import NewLead from "./NewLead";

import LeadAutomations from "./LeadAutomations";

import AutomationLogs from "./AutomationLogs";

import LeadSearch from "./LeadSearch";

import SalesAgenda from "./SalesAgenda";

import TicketControl from "./TicketControl";

import TicketReports from "./TicketReports";

import WhatsAppQuickAction from "./WhatsAppQuickAction";

import WhatsAppQuickLead from "./WhatsAppQuickLead";

import WhatsAppQuickTicket from "./WhatsAppQuickTicket";

import WhatsAppQuickCollection from "./WhatsAppQuickCollection";

import PortalHomeAlias from "./portal-home";

import SalesReports from "./SalesReports";

import ReferralCreate from "./ReferralCreate";

import LeadGenerator from "./LeadGenerator";

import LeadGeneratorAudit from "./LeadGeneratorAudit";

import ReferralPipeline from "./ReferralPipeline";

import ReferralDetail from "./ReferralDetail";

import ReferralCommissions from "./ReferralCommissions";

import ReferralAutomations from "./ReferralAutomations";

import ReferralAgenda from "./ReferralAgenda";

import ReferralTasks from "./ReferralTasks";

import PortalUpdateData from "./PortalUpdateData";

import PortalOffers from "./PortalOffers";

import PortalReferralCreate from "./PortalReferralCreate";

import PortalReferralList from "./PortalReferralList";

import SalesAgentsDashboard from "./SalesAgentsDashboard";

import DistributionRules from "./DistributionRules";

import QuickServiceRegister from "./QuickServiceRegister";

import QuickServiceList from "./QuickServiceList";

import NPSDashboard from "./NPSDashboard";

import NPSSurvey from "./NPSSurvey";

import NewLeadPJ from "./NewLeadPJ";

import LeadsPJKanban from "./LeadsPJKanban";

import LeadPJSearch from "./LeadPJSearch";

import SalesPJReports from "./SalesPJReports";

import SalesPJDashboard from "./SalesPJDashboard";

import SalesPJAgentsDashboard from "./SalesPJAgentsDashboard";

import ReferralDashboard from "./ReferralDashboard";

import ReferralAgentsDashboard from "./ReferralAgentsDashboard";

import ReferralReports from "./ReferralReports";

import LeadPJAutomations from "./LeadPJAutomations";

import LeadPJDetail from "./LeadPJDetail";

import QualityMonitor from "./QualityMonitor";

import AuditDebug from "./AuditDebug";

import QualityChecklists from "./QualityChecklists";

import AgentMyDashboard from "./AgentMyDashboard";

import BomAutoConsulta from "./BomAutoConsulta";

import BomAutoPainel from "./BomAutoPainel";
import BomAutoRelatorio from "./BomAutoRelatorio";

import Login from "./Login";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Login: Login,
    
    Dashboard: Dashboard,
    
    QueueBoard: QueueBoard,
    
    TicketView: TicketView,
    
    MyTickets: MyTickets,
    
    CreateTicket: CreateTicket,
    
    TicketTypes: TicketTypes,
    
    Agents: Agents,
    
    KnowledgeBase: KnowledgeBase,
    
    KBArticle: KBArticle,
    
    LeadsKanban: LeadsKanban,
    
    LeadDetail: LeadDetail,
    
    LeadsMap: LeadsMap,
    
    SalesTasks: SalesTasks,
    
    SalesDashboard: SalesDashboard,
    
    SalesAgents: SalesAgents,
    
    ProposalTemplates: ProposalTemplates,
    
    PublicSignature: PublicSignature,
    
    CreateSalesTicket: CreateSalesTicket,
    
    SalesTicketView: SalesTicketView,
    
    SalesTickets: SalesTickets,
    
    SalesQueueBoard: SalesQueueBoard,
    
    PortalLogin: PortalLogin,
    
    PortalValidateToken: PortalValidateToken,
    
    PortalHome: PortalHome,
    
    PortalCreateTicket: PortalCreateTicket,
    
    PortalTickets: PortalTickets,
    
    PortalTicketView: PortalTicketView,
    
    PortalContract: PortalContract,
    
    PortalBoletos: PortalBoletos,
    
    CreateCollectionTicket: CreateCollectionTicket,
    
    CollectionTicketView: CollectionTicketView,
    
    CollectionBoard: CollectionBoard,
    
    CollectionDashboard: CollectionDashboard,
    
    CollectionReports: CollectionReports,
    
    CollectionAgenda: CollectionAgenda,
    
    PublicProposal: PublicProposal,
    
    PublicContractSign: PublicContractSign,
    
    Settings: Settings,
    
    AIAgents: AIAgents,
    
    Templates: Templates,
    
    NotificationSettings: NotificationSettings,
    
    SalesRoutes: SalesRoutes,
    
    NewLead: NewLead,
    
    LeadAutomations: LeadAutomations,
    
    LeadSearch: LeadSearch,
    
    SalesAgenda: SalesAgenda,
    
    TicketControl: TicketControl,
    
    TicketReports: TicketReports,
    
    WhatsAppQuickAction: WhatsAppQuickAction,
    
    WhatsAppQuickLead: WhatsAppQuickLead,
    
    WhatsAppQuickTicket: WhatsAppQuickTicket,
    
    WhatsAppQuickCollection: WhatsAppQuickCollection,
    
    PortalHomeAlias: PortalHomeAlias,
    
    SalesReports: SalesReports,
    
    ReferralCreate: ReferralCreate,
    
    LeadGenerator: LeadGenerator,
    
    LeadGeneratorAudit: LeadGeneratorAudit,
    
    ReferralPipeline: ReferralPipeline,
    
    ReferralDetail: ReferralDetail,
    
    ReferralCommissions: ReferralCommissions,
    
    ReferralAutomations: ReferralAutomations,
    
    ReferralAgenda: ReferralAgenda,
    
    ReferralTasks: ReferralTasks,
    
    PortalUpdateData: PortalUpdateData,
    
    PortalOffers: PortalOffers,
    
    PortalReferralCreate: PortalReferralCreate,
    
    PortalReferralList: PortalReferralList,
    
    SalesAgentsDashboard: SalesAgentsDashboard,
    
    DistributionRules: DistributionRules,
    
    QuickServiceRegister: QuickServiceRegister,
    
    QuickServiceList: QuickServiceList,
    
    NPSDashboard: NPSDashboard,
    
    NPSSurvey: NPSSurvey,
    
    NewLeadPJ: NewLeadPJ,
    
    LeadsPJKanban: LeadsPJKanban,
    
    LeadPJSearch: LeadPJSearch,
    
    SalesPJReports: SalesPJReports,
    
    SalesPJDashboard: SalesPJDashboard,
    
    SalesPJAgentsDashboard: SalesPJAgentsDashboard,
    
    ReferralDashboard: ReferralDashboard,
    
    ReferralAgentsDashboard: ReferralAgentsDashboard,
    
    ReferralReports: ReferralReports,
    
    LeadPJAutomations: LeadPJAutomations,
    
    LeadPJDetail: LeadPJDetail,
    
    QualityMonitor: QualityMonitor,
    
    AuditDebug: AuditDebug,
    
    QualityChecklists: QualityChecklists,
    
    AgentMyDashboard: AgentMyDashboard,
    
    BomAutoConsulta: BomAutoConsulta,
    
    BomAutoPainel: BomAutoPainel,
    BomAutoRelatorio: BomAutoRelatorio,
    
}

function _getCurrentPage(url) {
    if (url === '/' || url === '') {
        return 'Dashboard';
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || 'Dashboard';
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                <Route path="/login" element={<Login />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/QueueBoard" element={<QueueBoard />} />
                
                <Route path="/TicketView" element={<TicketView />} />
                
                <Route path="/MyTickets" element={<MyTickets />} />
                
                <Route path="/CreateTicket" element={<CreateTicket />} />
                
                <Route path="/TicketTypes" element={<TicketTypes />} />
                
                <Route path="/Agents" element={<Agents />} />
                
                <Route path="/KnowledgeBase" element={<KnowledgeBase />} />
                
                <Route path="/KBArticle" element={<KBArticle />} />
                
                <Route path="/LeadsKanban" element={<LeadsKanban />} />
                
                <Route path="/LeadDetail" element={<LeadDetail />} />
                
                <Route path="/LeadsMap" element={<LeadsMap />} />
                
                <Route path="/SalesTasks" element={<SalesTasks />} />
                
                <Route path="/SalesDashboard" element={<SalesDashboard />} />
                
                <Route path="/SalesAgents" element={<SalesAgents />} />
                
                <Route path="/ProposalTemplates" element={<ProposalTemplates />} />
                
                <Route path="/PublicSignature" element={<PublicSignature />} />
                
                <Route path="/CreateSalesTicket" element={<CreateSalesTicket />} />
                
                <Route path="/SalesTicketView" element={<SalesTicketView />} />
                
                <Route path="/SalesTickets" element={<SalesTickets />} />
                
                <Route path="/SalesQueueBoard" element={<SalesQueueBoard />} />
                
                <Route path="/PortalLogin" element={<PortalLogin />} />
                
                <Route path="/PortalValidateToken" element={<PortalValidateToken />} />
                
                <Route path="/PortalHome" element={<PortalHome />} />
                
                <Route path="/PortalCreateTicket" element={<PortalCreateTicket />} />
                
                <Route path="/PortalTickets" element={<PortalTickets />} />
                
                <Route path="/PortalTicketView" element={<PortalTicketView />} />
                
                <Route path="/PortalContract" element={<PortalContract />} />
                
                <Route path="/PortalBoletos" element={<PortalBoletos />} />
                
                <Route path="/CreateCollectionTicket" element={<CreateCollectionTicket />} />
                
                <Route path="/CollectionTicketView" element={<CollectionTicketView />} />
                
                <Route path="/CollectionBoard" element={<CollectionBoard />} />
                
                <Route path="/CollectionDashboard" element={<CollectionDashboard />} />
                
                <Route path="/CollectionReports" element={<CollectionReports />} />
                
                <Route path="/CollectionAgenda" element={<CollectionAgenda />} />
                
                <Route path="/PublicProposal" element={<PublicProposal />} />
                
                <Route path="/PublicContractSign" element={<PublicContractSign />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/AIAgents" element={<AIAgents />} />
                
                <Route path="/Templates" element={<Templates />} />
                
                <Route path="/NotificationSettings" element={<NotificationSettings />} />
                
                <Route path="/SalesRoutes" element={<SalesRoutes />} />
                
                <Route path="/NewLead" element={<NewLead />} />
                
                <Route path="/LeadAutomations" element={<LeadAutomations />} />
                
                <Route path="/AutomationLogs" element={<AutomationLogs />} />
                
                <Route path="/LeadSearch" element={<LeadSearch />} />
                
                <Route path="/SalesAgenda" element={<SalesAgenda />} />
                
                <Route path="/TicketControl" element={<TicketControl />} />
                
                <Route path="/TicketReports" element={<TicketReports />} />
                
                <Route path="/WhatsAppQuickAction" element={<WhatsAppQuickAction />} />
                
                <Route path="/WhatsAppQuickLead" element={<WhatsAppQuickLead />} />
                
                <Route path="/WhatsAppQuickTicket" element={<WhatsAppQuickTicket />} />
                
                <Route path="/WhatsAppQuickCollection" element={<WhatsAppQuickCollection />} />
                
                <Route path="/portal-home" element={<PortalHomeAlias />} />
                
                <Route path="/SalesReports" element={<SalesReports />} />
                
                <Route path="/ReferralCreate" element={<ReferralCreate />} />
                
                <Route path="/LeadGenerator" element={<LeadGenerator />} />
                
                <Route path="/LeadGeneratorAudit" element={<LeadGeneratorAudit />} />
                
                <Route path="/ReferralPipeline" element={<ReferralPipeline />} />
                
                <Route path="/ReferralDetail" element={<ReferralDetail />} />
                
                <Route path="/ReferralCommissions" element={<ReferralCommissions />} />
                
                <Route path="/ReferralAutomations" element={<ReferralAutomations />} />
                
                <Route path="/ReferralAgenda" element={<ReferralAgenda />} />
                
                <Route path="/ReferralTasks" element={<ReferralTasks />} />
                
                <Route path="/PortalUpdateData" element={<PortalUpdateData />} />
                
                <Route path="/PortalOffers" element={<PortalOffers />} />
                
                <Route path="/PortalReferralCreate" element={<PortalReferralCreate />} />
                
                <Route path="/PortalReferralList" element={<PortalReferralList />} />
                
                <Route path="/SalesAgentsDashboard" element={<SalesAgentsDashboard />} />
                
                <Route path="/DistributionRules" element={<DistributionRules />} />
                
                <Route path="/QuickServiceRegister" element={<QuickServiceRegister />} />
                
                <Route path="/QuickServiceList" element={<QuickServiceList />} />
                
                <Route path="/NPSDashboard" element={<NPSDashboard />} />
                
                <Route path="/NPSSurvey" element={<NPSSurvey />} />
                
                <Route path="/NewLeadPJ" element={<NewLeadPJ />} />
                
                <Route path="/LeadsPJKanban" element={<LeadsPJKanban />} />
                
                <Route path="/LeadPJSearch" element={<LeadPJSearch />} />
                
                <Route path="/SalesPJReports" element={<SalesPJReports />} />
                
                <Route path="/SalesPJDashboard" element={<SalesPJDashboard />} />
                
                <Route path="/SalesPJAgentsDashboard" element={<SalesPJAgentsDashboard />} />
                
                <Route path="/ReferralDashboard" element={<ReferralDashboard />} />
                
                <Route path="/ReferralAgentsDashboard" element={<ReferralAgentsDashboard />} />
                
                <Route path="/ReferralReports" element={<ReferralReports />} />
                
                <Route path="/LeadPJAutomations" element={<LeadPJAutomations />} />
                
                <Route path="/LeadPJDetail" element={<LeadPJDetail />} />
                
                <Route path="/QualityMonitor" element={<QualityMonitor />} />
                
                <Route path="/AuditDebug" element={<AuditDebug />} />
                
                <Route path="/QualityChecklists" element={<QualityChecklists />} />
                
                <Route path="/AgentMyDashboard" element={<AgentMyDashboard />} />
                
                <Route path="/BomAutoConsulta" element={<BomAutoConsulta />} />
                
                <Route path="/BomAutoPainel" element={<BomAutoPainel />} />
                <Route path="/BomAutoRelatorio" element={<BomAutoRelatorio />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}