import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import L from "leaflet";
import { canViewAll, canViewTeam, getVisibleAgents } from "@/components/utils/permissions.jsx";

// Fix do ícone padrão do Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const stageColors = {
  novo: '#3b82f6',
  abordado: '#a855f7',
  qualificado: '#eab308',
  proposta_enviada: '#f97316',
  fechado_ganho: '#22c55e',
  fechado_perdido: '#ef4444',
  reengajar: '#6366f1',
};

function MapCenterController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 13);
    }
  }, [center, map]);
  return null;
}

export default function LeadsMap() {
  const [userLocation, setUserLocation] = useState(null);
  const [selectedStage, setSelectedStage] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';

  const needsTeamFilter = !isAdmin && currentAgent && !canViewAll(currentAgent, 'leads') && canViewTeam(currentAgent, 'leads');
  const agentsReady = allAgents.length > 0;

  const { data: leads = [] } = useQuery({
    queryKey: ['leads', isAdmin ? 'admin' : currentAgent?.id, needsTeamFilter ? allAgents.length : 0],
    queryFn: async () => {
      const allLeads = await base44.entities.Lead.list();
      
      if (isAdmin) {
        return allLeads;
      }
      
      if (!currentAgent) return [];
      
      if (canViewAll(currentAgent, 'leads')) {
        return allLeads;
      }
      
      if (canViewTeam(currentAgent, 'leads')) {
        const visibleAgs = getVisibleAgents(allAgents, currentAgent);
        const visibleIds = new Set(visibleAgs.map(a => a.id));
        return allLeads.filter(l => 
          visibleIds.has(l.agentId || l.agent_id) || visibleIds.has(l.promoterId || l.promoter_id)
        );
      }
      
      return allLeads.filter(l => 
        (l.agentId || l.agent_id) === currentAgent.id || (l.promoterId || l.promoter_id) === currentAgent.id
      );
    },
    enabled: !!user && (!needsTeamFilter || agentsReady),
  });

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          // Fallback para São Paulo
          setUserLocation([-23.5505, -46.6333]);
        }
      );
    } else {
      // Fallback para São Paulo
      setUserLocation([-23.5505, -46.6333]);
    }
  }, []);

  const leadsWithLocation = leads.filter(l => l.latitude && l.longitude);
  
  const filteredLeads = selectedStage === 'all' 
    ? leadsWithLocation 
    : leadsWithLocation.filter(l => l.stage === selectedStage);

  const defaultCenter = userLocation || [-23.5505, -46.6333];

  const createCustomIcon = (stage) => {
    const color = stageColors[stage] || '#3b82f6';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  const createClusterIcon = (cluster) => {
    const count = cluster.getChildCount();
    let size = 40;
    let bgColor = '#22c55e';
    
    if (count >= 10) {
      size = 50;
      bgColor = '#f97316';
    }
    if (count >= 25) {
      size = 60;
      bgColor = '#ef4444';
    }
    
    return L.divIcon({
      html: `<div style="
        background-color: ${bgColor};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 4px solid white;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size > 40 ? '16px' : '14px'};
      ">${count}</div>`,
      className: 'custom-cluster-icon',
      iconSize: L.point(size, size, true),
    });
  };

  if (!userLocation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] md:h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 map-controls-overlay">
        <div className="max-w-7xl mx-auto">
          <div className="page-header-title-section">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Mapa de Leads</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{filteredLeads.length} leads georreferenciados</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={selectedStage === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStage('all')}
                className="flex-1 sm:flex-none"
              >
                Todos
              </Button>
              <Button
                variant={selectedStage === 'novo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStage('novo')}
                style={{ backgroundColor: selectedStage === 'novo' ? stageColors.novo : undefined }}
                className="flex-1 sm:flex-none"
              >
                Novo
              </Button>
              <Button
                variant={selectedStage === 'qualificado' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStage('qualificado')}
                style={{ backgroundColor: selectedStage === 'qualificado' ? stageColors.qualificado : undefined }}
                className="flex-1 sm:flex-none"
              >
                Qualificado
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1 relative map-container-responsive">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <MapCenterController center={userLocation} />
          
          {/* Marcador da localização do usuário */}
          {userLocation && (
            <Marker position={userLocation} icon={L.icon({
              iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
              shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41]
            })}>
              <Popup>
                <div className="text-center">
                  <Navigation className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                  <p className="font-semibold">Você está aqui</p>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Marcadores dos leads com clustering */}
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterIcon}
            maxClusterRadius={50}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
          >
            {filteredLeads.map(lead => (
              <Marker
                key={lead.id}
                position={[lead.latitude, lead.longitude]}
                icon={createCustomIcon(lead.stage)}
              >
                <Popup>
                  <div className="p-2 min-w-[200px]">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      {lead.name || "Lead sem nome"}
                    </h3>
                    <div className="space-y-1 text-sm mb-3">
                      <p className="flex items-center gap-1 text-gray-600">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </p>
                      {lead.interest && (
                        <Badge variant="outline" className="text-xs">
                          {lead.interest}
                        </Badge>
                      )}
                    </div>
                    <Link to={`${createPageUrl("LeadDetail")}?id=${lead.id}`}>
                      <Button size="sm" className="w-full">
                        Ver Detalhes
                      </Button>
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* Legenda */}
      <div className="absolute bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border z-[1000]">
        <h4 className="font-semibold text-sm mb-2">Legenda</h4>
        <div className="space-y-1 text-xs">
          {Object.entries(stageColors).map(([stage, color]) => (
            <div key={stage} className="flex items-center gap-2">
              <div style={{ backgroundColor: color }} className="w-4 h-4 rounded-full"></div>
              <span className="capitalize">{stage.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}