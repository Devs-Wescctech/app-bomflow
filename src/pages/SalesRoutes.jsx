import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Navigation, 
  Clock, 
  TrendingDown, 
  Route,
  Phone,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Play,
  Filter,
  Calendar,
  User,
  ChevronRight,
  Zap,
  Target,
  Car
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, isValid, parseISO, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function optimizeRoute(leads, startLat, startLon) {
  if (leads.length === 0) return { optimizedLeads: [], totalDistance: 0, totalTime: 0 };
  
  const unvisited = [...leads];
  const route = [];
  let currentLat = startLat;
  let currentLon = startLon;
  let totalDistance = 0;
  
  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;
    
    unvisited.forEach((lead, index) => {
      const distance = calculateDistance(currentLat, currentLon, lead.latitude, lead.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });
    
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push({
      ...nearest,
      distanceFromPrevious: minDistance,
      timeFromPrevious: Math.round((minDistance / 40) * 60),
    });
    
    totalDistance += minDistance;
    currentLat = nearest.latitude;
    currentLon = nearest.longitude;
  }
  
  const totalTime = Math.round((totalDistance / 40) * 60);
  
  return { optimizedLeads: route, totalDistance, totalTime };
}

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

const stageColors = {
  novo: '#3b82f6',
  abordado: '#a855f7',
  qualificado: '#eab308',
  proposta_enviada: '#f97316',
  fechado_ganho: '#22c55e',
  fechado_perdido: '#ef4444',
  reengajar: '#6366f1',
};

const stageLabels = {
  novo: 'Novo',
  abordado: 'Abordado',
  qualificado: 'Qualificado',
  proposta_enviada: 'Proposta',
  fechado_ganho: 'Ganho',
  fechado_perdido: 'Perdido',
  reengajar: 'Reengajar',
};

export default function SalesRoutes() {
  const [userLocation, setUserLocation] = useState(null);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showOnlyScheduled, setShowOnlyScheduled] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 2,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = currentAgentType === 'admin';
  const isSupervisor = currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor';
  const isSalesAgent = currentAgentType === 'sales' || currentAgentType === 'sales_supervisor';
  const canViewAllLeads = isAdmin;
  const canViewTeamLeads = isSupervisor;

  const { data: leads = [] } = useQuery({
    queryKey: ['leads', canViewAllLeads ? 'all' : canViewTeamLeads ? 'team' : currentAgent?.id],
    queryFn: async () => {
      const allLeads = await base44.entities.Lead.list();
      
      if (canViewAllLeads) {
        return allLeads;
      }
      
      if (canViewTeamLeads) {
        const currentTeam = currentAgent?.team;
        if (currentTeam) {
          return allLeads.filter(l => {
            const leadAgentId = l.agentId || l.agent_id;
            const leadAgent = allAgents.find(a => a.id === leadAgentId);
            return leadAgent?.team === currentTeam;
          });
        }
        return allLeads;
      }
      
      if (!currentAgent) return [];
      
      return allLeads.filter(l => {
        const leadAgentId = l.agentId || l.agent_id;
        const leadPromoterId = l.promoterId || l.promoter_id;
        return leadAgentId === currentAgent.id || leadPromoterId === currentAgent.id;
      });
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!user && (canViewAllLeads || canViewTeamLeads || !!currentAgent),
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['activities', 'all'],
    queryFn: () => base44.entities.Activity.list('-scheduledAt', 1000),
    staleTime: 1000 * 60 * 2,
  });

  const { data: allVisits = [] } = useQuery({
    queryKey: ['visits', 'all'],
    queryFn: () => base44.entities.Visit.list('-visitedAt', 1000),
    staleTime: 1000 * 60 * 2,
  });

  const toLocalDateString = (dateValue) => {
    if (!dateValue) return '';
    try {
      let date;
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue instanceof Date) {
        date = dateValue;
      } else {
        return '';
      }
      if (!isValid(date)) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  const isSameDateAsSelected = (dateValue) => {
    const dateStr = toLocalDateString(dateValue);
    return dateStr === selectedDate;
  };

  const activities = allActivities.filter(a => {
    const actType = a.type || a.activity_type;
    if (actType !== 'visit') return false;
    const scheduledAt = a.scheduledAt || a.scheduled_at;
    return isSameDateAsSelected(scheduledAt);
  });
  
  const visits = allVisits.filter(v => {
    const visitedAt = v.visitedAt || v.visited_at;
    return isSameDateAsSelected(visitedAt);
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!userLocation) {
        setUserLocation([-23.5505, -46.6333]);
      }
    }, 3000);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeout);
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          clearTimeout(timeout);
          console.error("Erro ao obter localização:", error);
          setUserLocation([-23.5505, -46.6333]);
        },
        { timeout: 3000, enableHighAccuracy: false }
      );
    } else {
      clearTimeout(timeout);
      setUserLocation([-23.5505, -46.6333]);
    }

    return () => clearTimeout(timeout);
  }, []);

  const leadsWithGeo = leads.filter(l => l.latitude && l.longitude);
  
  // Helper to check boolean values (handles true, 't', 'true', 1, etc.)
  const isTruthy = (val) => val === true || val === 't' || val === 'true' || val === 1 || val === '1';
  
  // All open leads with geolocation (not filtered by scheduled)
  const closedStages = ['fechado_ganho', 'fechado_perdido'];
  const allOpenLeadsWithGeo = leadsWithGeo.filter(lead => {
    // Check closed stages
    if (closedStages.includes(lead.stage)) return false;
    // Check concluded/lost flags with fallbacks for camelCase/snake_case
    const isConcluded = isTruthy(lead.concluded) || isTruthy(lead.is_concluded);
    const isLost = isTruthy(lead.lost) || isTruthy(lead.is_lost);
    if (isConcluded || isLost) return false;
    return true;
  });
  
  // Leads with scheduled visits for selected date (check ALL leads with geo, not just open ones)
  const leadsWithScheduledVisit = leadsWithGeo.filter(lead => {
    return activities.some(act => {
      const actLeadId = act.leadId || act.lead_id;
      const actType = act.type || act.activity_type;
      // Double-check activity type is 'visit' (activities array is already filtered, but this is explicit)
      if (actType !== 'visit') return false;
      return actLeadId === lead.id;
    });
  });
  
  // Final list based on filter
  const leadsForRoute = showOnlyScheduled ? leadsWithScheduledVisit : allOpenLeadsWithGeo;

  // Leads with scheduled visits that DON'T have geolocation (to show warning) - checks ALL leads regardless of stage/status
  const scheduledLeadsWithoutGeo = leads.filter(lead => {
    // Check if lead has a scheduled visit for selected date
    const hasScheduledVisit = allActivities.some(act => {
      const actLeadId = act.leadId || act.lead_id;
      const actType = act.type || act.activity_type;
      if (actType !== 'visit') return false;
      const scheduledAt = act.scheduledAt || act.scheduled_at;
      return actLeadId === lead.id && toLocalDateString(scheduledAt) === selectedDate;
    });
    if (!hasScheduledVisit) return false;
    // Check if lead is missing geo
    return !lead.latitude || !lead.longitude;
  });

  console.log('[SalesRoutes] Debug:', {
    totalLeads: leads.length,
    leadsWithGeo: leadsWithGeo.length,
    allOpenLeadsWithGeo: allOpenLeadsWithGeo.length,
    leadsWithScheduledVisit: leadsWithScheduledVisit.length,
    scheduledLeadsWithoutGeo: scheduledLeadsWithoutGeo.length,
    leadsForRoute: leadsForRoute.length,
    showOnlyScheduled,
    selectedDate,
    activities: activities.length,
    allActivitiesForDate: allActivities.filter(a => {
      const scheduledAt = a.scheduledAt || a.scheduled_at;
      return toLocalDateString(scheduledAt) === selectedDate;
    }).length,
    currentAgent: currentAgent?.name,
    isAdmin,
    isSupervisor,
    isSalesAgent,
    canViewAllLeads,
    canViewTeamLeads,
    currentAgentType
  });

  const leadsForRouteIds = leadsForRoute.map(l => l.id).join(',');
  
  useEffect(() => {
    if (userLocation && leadsForRoute.length > 0) {
      const result = optimizeRoute(leadsForRoute, userLocation[0], userLocation[1]);
      setOptimizedRoute(result);
    } else {
      setOptimizedRoute({ optimizedLeads: [], totalDistance: 0, totalTime: 0 });
    }
  }, [leadsForRouteIds, userLocation]);

  const handleStartNavigation = () => {
    if (!optimizedRoute || optimizedRoute.optimizedLeads.length === 0) {
      toast.error('Nenhuma rota para iniciar');
      return;
    }

    const waypoints = optimizedRoute.optimizedLeads
      .slice(0, -1)
      .map(lead => `${lead.latitude},${lead.longitude}`)
      .join('|');
    
    const lastLead = optimizedRoute.optimizedLeads[optimizedRoute.optimizedLeads.length - 1];
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${lastLead.latitude},${lastLead.longitude}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
    
    window.open(mapsUrl, '_blank');
    toast.success('Rota aberta no Google Maps!');
  };

  const getLeadIcon = (index, stage) => {
    const color = stageColors[stage] || '#3b82f6';
    
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background: linear-gradient(135deg, ${color}, ${color}dd); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px;">${index + 1}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  const routeCoordinates = optimizedRoute 
    ? [userLocation, ...optimizedRoute.optimizedLeads.map(l => [l.latitude, l.longitude])]
    : [];

  const nearbyUnvisitedLeads = userLocation ? leads.filter(lead => {
    if (!lead.latitude || !lead.longitude) return false;
    if (leadsForRoute.some(l => l.id === lead.id)) return false;
    
    const distance = calculateDistance(userLocation[0], userLocation[1], lead.latitude, lead.longitude);
    return distance <= 2;
  }).slice(0, 5) : [];

  if (!userLocation) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse mx-auto mb-6 flex items-center justify-center">
              <Navigation className="w-10 h-10 text-white animate-bounce" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg font-medium">Obtendo sua localização...</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Preparando a rota inteligente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] md:h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 py-4 flex-shrink-0 map-controls-overlay">
        <div className="max-w-7xl mx-auto">
          <div className="page-header-title-section mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
                <Route className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white">Rota Inteligente</h1>
                <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm">
                  {optimizedRoute?.optimizedLeads?.length || 0} lead{(optimizedRoute?.optimizedLeads?.length || 0) !== 1 ? 's' : ''} no mapa para {format(parseISO(selectedDate), "dd/MM", { locale: ptBR })}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-3 md:mt-0">
              <div className="relative flex-1 sm:flex-none">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-auto pl-10 pr-4 py-2 md:py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOnlyScheduled(false)}
                  className={`rounded-none border-0 text-xs md:text-sm ${!showOnlyScheduled ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <span className="hidden sm:inline">Todos </span>({allOpenLeadsWithGeo.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOnlyScheduled(true)}
                  className={`rounded-none border-0 text-xs md:text-sm ${showOnlyScheduled ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <Calendar className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Agendadas </span>({leadsWithScheduledVisit.length})
                </Button>
              </div>
              
              <Button
                onClick={handleStartNavigation}
                disabled={!optimizedRoute || optimizedRoute.optimizedLeads.length === 0}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 border-0 rounded-xl shadow-lg shadow-green-500/25 transition-all duration-300 flex-1 sm:flex-none"
              >
                <Play className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Iniciar </span>Navegar
              </Button>
            </div>
          </div>

          {scheduledLeadsWithoutGeo.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {scheduledLeadsWithoutGeo.length} visita{scheduledLeadsWithoutGeo.length > 1 ? 's' : ''} agendada{scheduledLeadsWithoutGeo.length > 1 ? 's' : ''} sem localização
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                  {scheduledLeadsWithoutGeo.map(l => l.name).join(', ')} - cadastre a localização para aparecer no mapa
                </p>
              </div>
            </div>
          )}

          {optimizedRoute && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              <Card className="border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-100">Visitas no Mapa</p>
                      <p className="text-2xl font-bold">{optimizedRoute.optimizedLeads.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-green-500/20 overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <Car className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-green-100">Distância Total</p>
                      <p className="text-2xl font-bold">{optimizedRoute.totalDistance.toFixed(1)} km</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-amber-100">Tempo Estimado</p>
                      <p className="text-2xl font-bold">{optimizedRoute.totalTime} min</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/20 overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-purple-100">Agendadas</p>
                      <p className="text-2xl font-bold">{leadsWithScheduledVisit.length + scheduledLeadsWithoutGeo.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        <div className="w-full md:w-[360px] lg:w-[420px] bg-white dark:bg-gray-900 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[40vh] md:max-h-none order-2 md:order-1">
          <div className="p-3 md:p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-sm md:text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Route className="w-4 h-4 text-blue-500" />
              Sequência Otimizada
            </h3>
            {nearbyUnvisitedLeads.length > 0 && (
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-xs">
                +{nearbyUnvisitedLeads.length} próximos
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {optimizedRoute?.optimizedLeads.map((lead, index) => {
              const hasVisited = visits.some(v => (v.leadId || v.lead_id) === lead.id);
              const isSelected = selectedLead?.id === lead.id;
              
              return (
                <Card 
                  key={lead.id} 
                  className={`
                    border transition-all duration-300 cursor-pointer group
                    ${hasVisited ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-800 hover:shadow-lg hover:shadow-blue-500/10'}
                    ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200 dark:border-gray-700'}
                  `}
                  onClick={() => setSelectedLead(lead)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-lg transition-transform group-hover:scale-110"
                        style={{ background: `linear-gradient(135deg, ${stageColors[lead.stage] || '#3b82f6'}, ${stageColors[lead.stage] || '#3b82f6'}cc)` }}
                      >
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                            {lead.name || "Lead sem nome"}
                          </h4>
                          {hasVisited && (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className="text-xs"
                            style={{ 
                              backgroundColor: `${stageColors[lead.stage]}15`,
                              borderColor: stageColors[lead.stage],
                              color: stageColors[lead.stage]
                            }}
                          >
                            {stageLabels[lead.stage] || lead.stage}
                          </Badge>
                          {lead.interest && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {lead.interest}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {lead.address || lead.neighborhood || `${lead.city || ''}, ${lead.state || ''}`}
                        </p>
                        
                        {index > 0 && (
                          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 mb-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                            <span className="flex items-center gap-1">
                              <Route className="w-3 h-3" />
                              {lead.distanceFromPrevious?.toFixed(1)} km do anterior
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              ~{lead.timeFromPrevious} min
                            </span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${lead.latitude},${lead.longitude}`, '_blank');
                            }}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-0 text-xs rounded-lg"
                          >
                            <Navigation className="w-3 h-3 mr-1" />
                            Navegar
                          </Button>
                          
                          {lead.phone && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}`, '_blank');
                              }}
                              className="text-xs rounded-lg border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
                            >
                              <MessageSquare className="w-3 h-3 mr-1" />
                              WhatsApp
                            </Button>
                          )}
                          
                          <Link 
                            to={`${createPageUrl("LeadDetail")}?id=${lead.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button size="sm" variant="ghost" className="text-xs rounded-lg">
                              Ver
                              <ChevronRight className="w-3 h-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {optimizedRoute?.optimizedLeads.length === 0 && (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  {showOnlyScheduled ? 'Nenhuma visita agendada' : 'Nenhum lead disponível'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                  {showOnlyScheduled 
                    ? `Não há visitas agendadas para ${selectedDate}.` 
                    : leads.length === 0 
                      ? 'Você não tem leads atribuídos. Contate o supervisor.'
                      : leadsWithGeo.length === 0
                        ? 'Seus leads não têm coordenadas de localização cadastradas.'
                        : allOpenLeadsWithGeo.length === 0
                          ? 'Todos os leads com localização estão fechados (ganhos ou perdidos).'
                          : 'Carregando leads...'}
                </p>
                <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 space-y-1">
                  <p>Total de leads: {leads.length}</p>
                  <p>Com geolocalização: {leadsWithGeo.length}</p>
                  <p>Abertos: {allOpenLeadsWithGeo.length}</p>
                  <p>Agendados para {selectedDate}: {leadsWithScheduledVisit.length}</p>
                </div>
                {showOnlyScheduled && allOpenLeadsWithGeo.length > 0 && (
                  <Button
                    variant="outline"
                    className="mt-4 rounded-xl"
                    onClick={() => setShowOnlyScheduled(false)}
                  >
                    Ver Todos os Leads ({allOpenLeadsWithGeo.length})
                  </Button>
                )}
              </div>
            )}

            {nearbyUnvisitedLeads.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Leads Próximos (até 2km)
                </h3>
                
                <div className="space-y-2">
                  {nearbyUnvisitedLeads.map(lead => {
                    const distance = calculateDistance(userLocation[0], userLocation[1], lead.latitude, lead.longitude);
                    
                    return (
                      <Card 
                        key={lead.id} 
                        className="border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ background: `linear-gradient(135deg, ${stageColors[lead.stage] || '#f97316'}, ${stageColors[lead.stage] || '#f97316'}cc)` }}
                              >
                                <User className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-gray-900 dark:text-white">{lead.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{distance.toFixed(1)} km de você</p>
                              </div>
                            </div>
                            <Link to={`${createPageUrl("LeadDetail")}?id=${lead.id}`}>
                              <Button size="sm" variant="outline" className="text-xs rounded-lg">
                                Ver
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative map-container-responsive order-1 md:order-2 min-h-[250px] md:min-h-0">
          <MapContainer
            center={userLocation}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            <MapController center={userLocation} zoom={13} />
            
            <Marker position={userLocation} icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); width: 20px; height: 20px; border-radius: 50%; border: 4px solid white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5); animation: pulse 2s infinite;"></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })}>
              <Popup>
                <div className="text-center p-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-2">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-semibold text-gray-900">Você está aqui</p>
                </div>
              </Popup>
            </Marker>
            
            {optimizedRoute?.optimizedLeads.map((lead, index) => (
              <Marker
                key={lead.id}
                position={[lead.latitude, lead.longitude]}
                icon={getLeadIcon(index, lead.stage)}
              >
                <Popup>
                  <div className="p-3 min-w-[240px]">
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${stageColors[lead.stage] || '#3b82f6'}, ${stageColors[lead.stage] || '#3b82f6'}cc)` }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                        <Badge 
                          variant="outline" 
                          className="text-xs mt-1"
                          style={{ 
                            backgroundColor: `${stageColors[lead.stage]}15`,
                            borderColor: stageColors[lead.stage],
                            color: stageColors[lead.stage]
                          }}
                        >
                          {stageLabels[lead.stage] || lead.stage}
                        </Badge>
                      </div>
                    </div>
                    
                    {lead.phone && (
                      <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {lead.phone}
                      </p>
                    )}
                    
                    {lead.address && (
                      <p className="text-xs text-gray-500 mb-3 flex items-start gap-2">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        {lead.address}
                      </p>
                    )}
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lead.latitude},${lead.longitude}`, '_blank')}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-0"
                      >
                        <Navigation className="w-3 h-3 mr-1" />
                        Navegar
                      </Button>
                      <Link to={`${createPageUrl("LeadDetail")}?id=${lead.id}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">
                          Detalhes
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {routeCoordinates.length > 1 && (
              <>
                <Polyline
                  positions={routeCoordinates}
                  pathOptions={{
                    color: '#1e40af',
                    weight: 8,
                    opacity: 0.3,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                <Polyline
                  positions={routeCoordinates}
                  pathOptions={{
                    color: '#3b82f6',
                    weight: 4,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </>
            )}
          </MapContainer>

          <div className="absolute bottom-6 left-6 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 z-[1000] max-w-[200px]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <MapPin className="w-3 h-3 text-white" />
              </div>
              <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Etapas</h4>
            </div>
            <div className="space-y-1.5">
              {Object.entries(stageColors).filter(([stage]) => !['fechado_ganho', 'fechado_perdido'].includes(stage)).map(([stage, color]) => (
                <div key={stage} className="flex items-center gap-2">
                  <div 
                    style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }} 
                    className="w-3 h-3 rounded-full shadow-sm"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {stageLabels[stage] || stage.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-8 h-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" />
                <span>Sequência otimizada</span>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                Clique em "Iniciar Navegação" para abrir a rota real no Google Maps
              </p>
            </div>
          </div>
          
          <div className="absolute top-4 right-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 z-[1000]">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{format(parseISO(selectedDate), "dd 'de' MMMM", { locale: ptBR })}</span>
            </p>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); }
        }
      `}} />
    </div>
  );
}
