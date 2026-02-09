import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  User,
  Filter,
  Search,
  X,
  LayoutGrid,
  List,
  Clock,
  TrendingUp,
  Gift,
  Users,
  Target,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Star,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import StatsCard from "@/components/dashboard/StatsCard";
import { format, differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getSortedHistory(item) {
  const history = [...(item.stage_history || item.stageHistory || [])];
  return history
    .filter(e => safeDate(e.changed_at || e.changedAt))
    .sort((a, b) => {
      const da = new Date(a.changed_at || a.changedAt);
      const db = new Date(b.changed_at || b.changedAt);
      return da - db;
    });
}

function formatDuration(fromDate, toDate) {
  const days = differenceInDays(toDate, fromDate);
  const hours = differenceInHours(toDate, fromDate) % 24;
  const mins = differenceInMinutes(toDate, fromDate) % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

function getTimeInStage(item) {
  const history = getSortedHistory(item);
  let enteredAt = null;
  if (history.length > 0) {
    const lastEntry = history[history.length - 1];
    enteredAt = safeDate(lastEntry.changed_at || lastEntry.changedAt);
  }
  if (!enteredAt) {
    enteredAt = safeDate(item.createdDate || item.createdAt || item.created_at);
  }
  if (!enteredAt) return { label: '-', days: 0, color: 'gray' };
  const now = new Date();
  const totalMinutes = differenceInMinutes(now, enteredAt);
  const totalHours = differenceInHours(now, enteredAt);
  const totalDays = differenceInDays(now, enteredAt);
  let label;
  if (totalMinutes < 60) label = `${totalMinutes}min`;
  else if (totalHours < 24) label = `${totalHours}h`;
  else if (totalDays < 30) label = `${totalDays}d`;
  else label = `${Math.floor(totalDays / 30)}m`;
  let color;
  if (totalDays <= 2) color = 'green';
  else if (totalDays <= 7) color = 'yellow';
  else if (totalDays <= 14) color = 'orange';
  else color = 'red';
  return { label, days: totalDays, hours: totalHours, minutes: totalMinutes, color, enteredAt };
}

function getStageHistoryTimeline(item, stages) {
  const history = getSortedHistory(item);
  if (history.length === 0) return [];
  const createdDate = safeDate(item.createdDate || item.createdAt || item.created_at);
  const timeline = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const changedAt = safeDate(entry.changed_at || entry.changedAt);
    if (!changedAt) continue;
    let prevDate;
    if (i === 0) prevDate = createdDate || changedAt;
    else prevDate = safeDate(history[i - 1].changed_at || history[i - 1].changedAt) || changedAt;
    const durationLabel = formatDuration(prevDate, changedAt);
    const fromId = entry.from || entry.previousStage || entry.from_stage;
    const toId = entry.to || entry.stage || entry.to_stage;
    const fromStage = stages.find(s => s.id === fromId);
    const toStage = stages.find(s => s.id === toId);
    timeline.push({
      from: fromStage?.label || fromId || item.stage || '-',
      to: toStage?.label || toId || '-',
      duration: durationLabel,
      date: changedAt,
    });
  }
  return timeline;
}

const STAGES = [
  { id: 'novo', label: 'Novo', color: 'from-purple-500 to-purple-600', lightBg: 'bg-purple-50 dark:bg-purple-950/30', gradient: 'from-purple-500 to-purple-600', borderColor: 'border-purple-500', shadowColor: 'shadow-purple-200/50 dark:shadow-purple-900/30', textColor: 'text-purple-500 dark:text-purple-400' },
  { id: 'validacao', label: 'Validação', color: 'from-blue-500 to-blue-600', lightBg: 'bg-blue-50 dark:bg-blue-950/30', gradient: 'from-blue-500 to-blue-600', borderColor: 'border-blue-500', shadowColor: 'shadow-blue-200/50 dark:shadow-blue-900/30', textColor: 'text-blue-500 dark:text-blue-400' },
  { id: 'contato_iniciado', label: 'Contato Iniciado', color: 'from-cyan-500 to-cyan-600', lightBg: 'bg-cyan-50 dark:bg-cyan-950/30', gradient: 'from-cyan-500 to-cyan-600', borderColor: 'border-cyan-500', shadowColor: 'shadow-cyan-200/50 dark:shadow-cyan-900/30', textColor: 'text-cyan-500 dark:text-cyan-400' },
  { id: 'qualificado', label: 'Qualificado', color: 'from-indigo-500 to-indigo-600', lightBg: 'bg-indigo-50 dark:bg-indigo-950/30', gradient: 'from-indigo-500 to-indigo-600', borderColor: 'border-indigo-500', shadowColor: 'shadow-indigo-200/50 dark:shadow-indigo-900/30', textColor: 'text-indigo-500 dark:text-indigo-400' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'from-orange-500 to-orange-600', lightBg: 'bg-orange-50 dark:bg-orange-950/30', gradient: 'from-orange-500 to-orange-600', borderColor: 'border-orange-500', shadowColor: 'shadow-orange-200/50 dark:shadow-orange-900/30', textColor: 'text-orange-500 dark:text-orange-400' },
  { id: 'fechado_ganho', label: 'Convertido', color: 'from-green-500 to-green-600', lightBg: 'bg-green-50 dark:bg-green-950/30', gradient: 'from-green-500 to-green-600', borderColor: 'border-green-500', shadowColor: 'shadow-green-200/50 dark:shadow-green-900/30', textColor: 'text-green-500 dark:text-green-400' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'from-red-500 to-red-600', lightBg: 'bg-red-50 dark:bg-red-950/30', gradient: 'from-red-500 to-red-600', borderColor: 'border-red-500', shadowColor: 'shadow-red-200/50 dark:shadow-red-900/30', textColor: 'text-red-500 dark:text-red-400' },
];

const LIST_PAGE_SIZE = 20;

function DroppableColumnRef({ id, stage, children, overId, activeId }) {
  const { setNodeRef } = useDroppable({ id });
  const isOver = overId === id && activeId !== null;
  
  return (
    <div className={`w-72 flex-shrink-0 transition-all duration-200 ${
      isOver ? 'scale-[1.02]' : ''
    }`}>
      <Card className={`shadow-sm border-2 flex flex-col rounded-t-none transition-all duration-200 ${
        isOver 
          ? `${stage.borderColor} shadow-xl ${stage.shadowColor}` 
          : 'border-transparent'
      }`}>
        <CardContent className="flex-1 p-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          <div
            ref={setNodeRef}
            className={`p-3 space-y-3 min-h-[200px] transition-all duration-200 ${
              isOver 
                ? `${stage.lightBg} border-2 border-dashed ${stage.borderColor} rounded-lg` 
                : 'bg-gray-50 dark:bg-gray-900'
            }`}
          >
            {children}
            {isOver && (
              <div className={`flex items-center justify-center py-4 ${stage.textColor}`}>
                <div className="flex items-center gap-2 text-sm font-medium animate-pulse">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Soltar aqui
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableReferralCard({ referral, stage, referrerData, agentData, navigate, formatCurrency, formatDate, updateReferralMutation }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: referral.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-sortable-id={referral.id}
      className={`transition-all ${isDragging ? 'rotate-2 scale-105' : ''}`}
    >
      <div 
        onClick={() => navigate(`${createPageUrl("ReferralDetail")}?id=${referral.id}`)}
        className={`group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'shadow-2xl scale-[1.02] ring-2 ring-amber-400/50' 
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]'
        }`}
      >
        <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
        
        <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
              {(referral.referredName || referral.referred_name || 'I')[0].toUpperCase()}
              <div className="absolute inset-0 rounded-xl ring-2 ring-white/20" />
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                {referral.referredName || referral.referred_name || 'Sem nome'}
              </h4>
              <div className="flex items-center gap-1.5 mt-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                  {referral.referredPhone || referral.referred_phone || 'Sem telefone'}
                </span>
              </div>
            </div>
          </div>

          {(referral.value || referral.estimatedValue || referral.estimated_value || referral.monthlyValue || referral.monthly_value) > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(referral.value || referral.estimatedValue || referral.estimated_value || referral.monthlyValue || referral.monthly_value)}
              </span>
            </div>
          )}

          {referrerData && (
            <div className="flex items-center gap-2 mt-3 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              <Gift className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300 truncate">
                Indicado por: {referrerData.name}
              </span>
            </div>
          )}

          {(stage.id === 'fechado_ganho' || stage.id === 'fechado_perdido') && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className={`w-full text-xs font-medium ${
                  stage.id === 'fechado_ganho' 
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (stage.id === 'fechado_ganho') {
                    updateReferralMutation.mutate({ id: referral.id, data: { concluded: true } });
                  } else {
                    updateReferralMutation.mutate({ id: referral.id, data: { lost: true } });
                  }
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {stage.id === 'fechado_ganho' ? 'Dar Baixa (Convertido)' : 'Dar Baixa (Perdido)'}
              </Button>
            </div>
          )}

          {(() => {
            const timeInfo = getTimeInStage(referral);
            const timeline = getStageHistoryTimeline(referral, STAGES);
            const colorClasses = {
              green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
              yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
              orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
              red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
              gray: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
            };
            return (
              <>
                {timeline.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {timeline.slice(-2).map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        <TrendingUp className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{entry.from} → {entry.to}</span>
                        <span className="ml-auto font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{entry.duration}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    {agentData ? (
                      <>
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center overflow-hidden shadow-sm">
                          {agentData.photo_url ? (
                            <img src={agentData.photo_url} alt={agentData.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-[10px] font-semibold">{agentData.name?.charAt(0)}</span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[70px]">{agentData.name?.split(' ')[0]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Não atribuído</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorClasses[timeInfo.color]}`}>
                      <Clock className="w-3 h-3" />
                      {timeInfo.label}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function ReferralPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('referralPipelineFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return { search: '', agent: 'all', dateFrom: '', dateTo: '' };
      }
    }
    return { search: '', agent: 'all', dateFrom: '', dateTo: '' };
  });

  useEffect(() => {
    localStorage.setItem('referralPipelineFilters', JSON.stringify(filters));
  }, [filters]);

  const clearFilters = () => {
    const defaultFilters = { search: '', agent: 'all', dateFrom: '', dateTo: '' };
    setFilters(defaultFilters);
    localStorage.removeItem('referralPipelineFilters');
  };

  const hasActiveFilters = filters.search || filters.agent !== 'all' || filters.dateFrom || filters.dateTo;
  const [listPage, setListPage] = useState(1);
  const [isDraggingCard, setIsDraggingCard] = useState(false);

  // Refs e estado para arrastar o kanban horizontalmente
  const kanbanContainerRef = useRef(null);
  const isDraggingCanvasRef = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const headersRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCanvasMouseDown = useCallback((e) => {
    if (activeId) return;
    if (e.target.closest('[data-sortable-id]')) return;
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (!container && !headers) return;
    isDraggingCanvasRef.current = true;
    const ref = container || headers;
    dragStartX.current = e.pageX - ref.offsetLeft;
    dragScrollLeft.current = container?.scrollLeft || headers?.scrollLeft || 0;
    if (container) container.style.cursor = 'grabbing';
    if (headers) headers.style.cursor = 'grabbing';
  }, [activeId]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isDraggingCanvasRef.current) return;
    if (activeId) return;
    e.preventDefault();
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (!container && !headers) return;
    const ref = container || headers;
    const x = e.pageX - ref.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    const newScrollLeft = dragScrollLeft.current - walk;
    if (container) container.scrollLeft = newScrollLeft;
    if (headers) headers.scrollLeft = newScrollLeft;
  }, [activeId]);

  const handleCanvasMouseUp = useCallback(() => {
    isDraggingCanvasRef.current = false;
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (container) container.style.cursor = 'grab';
    if (headers) headers.style.cursor = 'grab';
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isDraggingCanvasRef.current) {
      isDraggingCanvasRef.current = false;
      const container = kanbanContainerRef.current;
      const headers = headersRef.current;
      if (container) container.style.cursor = 'grab';
      if (headers) headers.style.cursor = 'grab';
    }
  }, []);


  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const currentAgent = user?.agent || agents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = currentAgentType === 'admin' || currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor';
  const currentAgentId = currentAgent?.id;

  const { data: referrals = [], isLoading, refetch } = useQuery({
    queryKey: ['referrals', isAdmin ? 'admin' : currentAgentId],
    queryFn: async () => {
      const allReferrals = await base44.entities.Referral.list('-createdAt');
      
      // Admin/supervisors see all referrals
      if (isAdmin) {
        return allReferrals.filter(r => !r.concluded && !r.lost);
      }

      if (!currentAgent) return [];

      // Check if user can see all referrals
      const canSeeAll = canViewAll(currentAgent, 'referrals');
      if (canSeeAll) {
        return allReferrals.filter(r => !r.concluded && !r.lost);
      }

      // Check if user can see team referrals
      const canSeeTeam = canViewTeam(currentAgent, 'referrals');
      if (canSeeTeam) {
        const teamAgents = agents.filter(a => a.team_id === currentAgent.team_id);
        const teamAgentIds = teamAgents.map(a => a.id);

        return allReferrals.filter(r =>
          (!r.concluded && !r.lost) &&
          (teamAgentIds.includes(r.agentId) || teamAgentIds.includes(r.agent_id))
        );
      }

      // Default: only show referrals assigned to current agent
      return allReferrals.filter(r =>
        (!r.concluded && !r.lost) &&
        (r.agentId === currentAgentId || r.agent_id === currentAgentId)
      );
    },
    staleTime: 0,
    refetchOnMount: true,
    enabled: !!user && (isAdmin || !!currentAgent),
  });

  const referralsQueryKey = ['referrals', isAdmin ? 'admin' : currentAgentId];

  const updateReferralMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const currentReferral = referrals.find(r => String(r.id) === String(id));
      
      if (data.stage && currentReferral && data.stage !== currentReferral.stage) {
        const currentUser = await base44.auth.me();
        const stageHistory = currentReferral.stageHistory || [];
        
        stageHistory.push({
          stage: data.stage,
          previousStage: currentReferral.stage,
          changedAt: new Date().toISOString(),
          changedBy: currentUser.email || 'Sistema',
        });
        
        data.stageHistory = stageHistory;
        
        if (data.stage === 'fechado_ganho') {
          data.convertedAt = new Date().toISOString();
          data.commissionStatus = 'aprovada';
        }
      }
      
      return base44.entities.Referral.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: referralsQueryKey });
      const previousReferrals = queryClient.getQueryData(referralsQueryKey);
      
      queryClient.setQueryData(referralsQueryKey, (old) => {
        if (!old) return old;
        return old.map(ref => 
          String(ref.id) === String(id) ? { ...ref, ...data } : ref
        );
      });
      
      return { previousReferrals };
    },
    onError: (err, variables, context) => {
      if (context?.previousReferrals) {
        queryClient.setQueryData(referralsQueryKey, context.previousReferrals);
      }
      toast.error('Erro ao mover indicação');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: referralsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });

  const handleStageChange = useCallback(async (referralId, newStage, fromStage = null) => {
    const referral = referrals.find(r => String(r.id) === String(referralId));
    if (!referral) return;

    const currentStage = fromStage || referral.stage;
    if (currentStage === newStage) return;

    await updateReferralMutation.mutateAsync({
      id: referralId,
      data: { stage: newStage }
    });

    toast.success('Indicação movida com sucesso!');
  }, [referrals, updateReferralMutation]);
  
  const handleDragMove = useCallback(() => {
    if (kanbanContainerRef.current && headersRef.current) {
      headersRef.current.scrollLeft = kanbanContainerRef.current.scrollLeft;
    }
  }, []);

  // Estado para ordem local dos cards (permite reordenação visual durante a sessão)
  const [localOrder, setLocalOrder] = useState({});

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
    setIsDraggingCard(true);
    setOverId(null);
  }, []);

  const handleDragOver = useCallback((event) => {
    const { over } = event;
    if (!over) {
      setOverId(null);
      return;
    }
    
    if (STAGES.find(s => s.id === over.id)) {
      setOverId(over.id);
    } else {
      const overReferral = referrals.find(r => r.id === over.id);
      if (overReferral) {
        setOverId(overReferral.stage);
      }
    }
  }, [referrals]);

  const filteredReferrals = referrals.filter(referral => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (
        !referral.referredName?.toLowerCase().includes(searchLower) &&
        !referral.referrerName?.toLowerCase().includes(searchLower) &&
        !referral.referredPhone?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    if (filters.agent !== 'all' && referral.agentId !== filters.agent) {
      return false;
    }

    if (filters.dateFrom) {
      const refDate = new Date(referral.createdAt);
      const fromDate = new Date(filters.dateFrom);
      if (refDate < fromDate) return false;
    }

    if (filters.dateTo) {
      const refDate = new Date(referral.createdAt);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59);
      if (refDate > toDate) return false;
    }

    return true;
  });

  const getReferralsByStage = (stage) => {
    return filteredReferrals.filter(ref => ref.stage === stage);
  };

  const getOrderedReferralsByStage = useCallback((stage) => {
    const stageReferrals = filteredReferrals.filter(ref => ref.stage === stage);
    if (localOrder[stage]) {
      const orderMap = {};
      localOrder[stage].forEach((id, index) => {
        orderMap[id] = index;
      });
      return [...stageReferrals].sort((a, b) => {
        const orderA = orderMap[a.id] ?? 999;
        const orderB = orderMap[b.id] ?? 999;
        return orderA - orderB;
      });
    }
    return stageReferrals;
  }, [filteredReferrals, localOrder]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setIsDraggingCard(false);
    setOverId(null);

    if (!over) return;

    const referralId = active.id;
    const overIdValue = over.id;
    const referral = referrals.find(r => r.id === referralId);
    if (!referral) return;

    const currentStage = referral.stage;
    let newStage = overIdValue;

    const overReferral = referrals.find(r => r.id === overIdValue);
    if (overReferral) {
      newStage = overReferral.stage;
    }

    if (!newStage || !STAGES.find(s => s.id === newStage)) return;

    if (currentStage !== newStage) {
      handleStageChange(referralId, newStage, currentStage);
    } else {
      const stageReferrals = getOrderedReferralsByStage(currentStage);
      const oldIndex = stageReferrals.findIndex(r => r.id === referralId);
      const newIndex = stageReferrals.findIndex(r => r.id === overIdValue);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = [...stageReferrals];
        const [removed] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, removed);
        
        setLocalOrder(prev => ({
          ...prev,
          [currentStage]: newOrder.map(r => r.id)
        }));
        
        toast.success('Ordem atualizada');
      }
    }
  }, [referrals, handleStageChange, getOrderedReferralsByStage]);

  // KPIs corrigidos
  const wonReferrals = getReferralsByStage('fechado_ganho');
  const lostReferrals = getReferralsByStage('fechado_perdido');
  const activeReferrals = filteredReferrals.filter(r => r.stage !== 'fechado_ganho' && r.stage !== 'fechado_perdido');
  const totalReferralsCount = filteredReferrals.length;
  
  const getReferralValue = (ref) => {
    return parseFloat(ref.value) || parseFloat(ref.estimatedValue) || parseFloat(ref.estimated_value) || parseFloat(ref.monthlyValue) || parseFloat(ref.monthly_value) || 0;
  };
  
  const getReferralCommission = (ref) => {
    return parseFloat(ref.commissionValue) || parseFloat(ref.commission_value) || 0;
  };
  
  // Valor total em pipeline (apenas indicações ativas)
  const totalValue = activeReferrals.reduce((sum, ref) => sum + getReferralValue(ref), 0);
  
  // Valor ganho (indicações convertidas)
  const wonValue = wonReferrals.reduce((sum, ref) => sum + getReferralValue(ref), 0);
  
  // Total de comissões (todas as indicações com comissão)
  const totalCommissions = filteredReferrals.reduce((sum, ref) => sum + getReferralCommission(ref), 0);
  
  // Taxa de conversão: ganhos / total de indicações
  const conversionRate = totalReferralsCount > 0
    ? ((wonReferrals.length / totalReferralsCount) * 100).toFixed(1)
    : 0;

  // Mapa de agentes para acesso O(1)
  const agentsMap = useMemo(() => {
    const map = {};
    agents.forEach(agent => {
      map[agent.id] = agent;
    });
    return map;
  }, [agents]);

  const getAgentData = (agentId) => {
    if (!agentId) return null;
    return agentsMap[agentId] || null;
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <motion.div 
      className="min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="space-y-6">
        <motion.div 
          className="flex justify-between items-start"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-3xl font-bold font-display bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Pipeline de Indicações
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Gerencie as indicações de clientes
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="glass"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              variant="glass"
              onClick={() => setShowFilters(!showFilters)}
              className={hasActiveFilters ? 'ring-2 ring-purple-500/50' : ''}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="success" className="ml-2">
                  {[filters.search, filters.agent !== 'all', filters.dateFrom, filters.dateTo].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            <Link to={createPageUrl('ReferralCreate')}>
              <Button variant="gradient" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                <Plus className="w-4 h-4 mr-2" />
                Nova Indicação
              </Button>
            </Link>
          </div>
        </motion.div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="glass-card border-0 shadow-soft overflow-hidden">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Buscar
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Nome, telefone..."
                          value={filters.search}
                          onChange={(e) => setFilters({...filters, search: e.target.value})}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Agente
                      </label>
                      <Select value={filters.agent} onValueChange={(val) => setFilters({...filters, agent: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os agentes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os agentes</SelectItem>
                          {agents.map(agent => (
                            <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Data Inicial
                      </label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Data Final
                      </label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                      />
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="mt-4 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="w-4 h-4 mr-2" />
                        Limpar Filtros
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatsCard
            title="Indicações Ativas"
            value={activeReferrals.length}
            subtitle={`${wonReferrals.length} ganhos, ${lostReferrals.length} perdidos`}
            icon={Users}
            color="purple"
            delay={0}
            helpText="Quantidade de indicações em andamento no pipeline (exclui convertidas e perdidas)"
          />
          <StatsCard
            title="Valor em Pipeline"
            value={formatCurrency(totalValue)}
            subtitle={wonValue > 0 ? `${formatCurrency(wonValue)} ganho` : undefined}
            icon={DollarSign}
            color="green"
            delay={0.1}
            helpText="Soma dos valores de todas as indicações ativas. O subtítulo mostra o valor total já convertido."
          />
          <StatsCard
            title="Comissões"
            value={formatCurrency(totalCommissions)}
            icon={Gift}
            color="orange"
            delay={0.2}
            helpText="Total de comissões geradas por todas as indicações (pendentes + pagas)"
          />
          <StatsCard
            title="Taxa de Conversão"
            value={`${conversionRate}%`}
            subtitle={`${wonReferrals.length}/${totalReferralsCount} indicações`}
            icon={TrendingUp}
            color="blue"
            delay={0.3}
            helpText="Porcentagem de indicações convertidas sobre o total (ativas + fechadas)"
          />
        </motion.div>

        <div className="flex justify-end">
          <div className="inline-flex rounded-xl glass-card p-1">
            <Button
              variant={viewMode === 'kanban' ? 'gradient' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className={viewMode === 'kanban' ? 'bg-gradient-to-r from-purple-600 to-pink-600' : ''}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'gradient' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-gradient-to-r from-purple-600 to-pink-600' : ''}
            >
              <List className="w-4 h-4 mr-2" />
              Lista
            </Button>
          </div>
        </div>

        {viewMode === 'kanban' && (
          <>
            <style>{`.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
            
            {/* Sticky Headers */}
            <div 
              ref={headersRef}
              className="overflow-x-hidden pb-0 cursor-grab select-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
            >
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {STAGES.map((stage) => {
                  const stageReferrals = getOrderedReferralsByStage(stage.id);
                  const stageValue = stageReferrals.reduce((sum, ref) => sum + getReferralValue(ref), 0);

                  return (
                    <div key={stage.id} className="w-72 flex-shrink-0">
                      <div className={`bg-gradient-to-r ${stage.color} text-white p-4 rounded-t-lg shadow-md`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-lg">{stage.label}</h3>
                          <Badge variant="secondary" className="bg-white/20 text-white backdrop-blur-sm">
                            {stageReferrals.length}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-white/90">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              Valor:
                            </span>
                            <span className="font-semibold">{formatCurrency(stageValue)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Kanban Columns with dnd-kit */}
            <div 
              ref={kanbanContainerRef}
              className="pb-4 cursor-grab select-none overflow-x-auto"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onScroll={(e) => {
                if (headersRef.current) {
                  headersRef.current.scrollLeft = e.target.scrollLeft;
                }
              }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                autoScroll={{
                  threshold: { x: 0.15, y: 0.15 },
                  acceleration: 5,
                  interval: 10,
                }}
              >
                <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                  {STAGES.map((stage) => {
                    const stageReferrals = getOrderedReferralsByStage(stage.id);

                    return (
                      <DroppableColumnRef key={stage.id} id={stage.id} stage={stage} overId={overId} activeId={activeId}>
                        <SortableContext
                          items={stageReferrals.map(r => r.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stageReferrals.map((referral) => {
                            const agentData = !isLoadingAgents && agents.length > 0 ? getAgentData(referral.agentId) : null;
                            const referrerData = referral.referrerName ? { name: referral.referrerName } : null;

                            return (
                              <SortableReferralCard
                                key={referral.id}
                                referral={referral}
                                stage={stage}
                                referrerData={referrerData}
                                agentData={agentData}
                                navigate={navigate}
                                formatCurrency={formatCurrency}
                                formatDate={formatDate}
                                updateReferralMutation={updateReferralMutation}
                              />
                            );
                          })}
                        </SortableContext>
                        {stageReferrals.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <Gift className="w-8 h-8" />
                            </div>
                            <p>Nenhuma indicação</p>
                          </div>
                        )}
                        <div style={{ minHeight: '80px' }} />
                      </DroppableColumnRef>
                    );
                  })}
                </div>
                
                <DragOverlay>
                  {activeId ? (() => {
                    const referral = referrals.find(r => r.id === activeId);
                    if (!referral) return null;
                    const stage = STAGES.find(s => s.id === referral.stage) || STAGES[0];
                    return (
                      <div className="w-72 rotate-2 scale-105">
                        <div className="group relative overflow-hidden rounded-2xl shadow-2xl ring-2 ring-amber-400/50">
                          <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
                          <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
                            <div className="flex items-start gap-3">
                              <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
                                {(referral.referredName || 'I')[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px]">
                                  {referral.referredName || 'Sem nome'}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Phone className="w-3 h-3 text-gray-400" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                                    {referral.referredPhone || 'Sem telefone'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : null}
                </DragOverlay>
              </DndContext>
            </div>
          </>
        )}

        {viewMode === 'list' && (() => {
          const totalPages = Math.ceil(filteredReferrals.length / LIST_PAGE_SIZE);
          const startIndex = (listPage - 1) * LIST_PAGE_SIZE;
          const paginatedReferrals = filteredReferrals.slice(startIndex, startIndex + LIST_PAGE_SIZE);
          
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card className="glass-card border-0 shadow-soft overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Indicado</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Indicador</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Telefone</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Etapa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Comissão</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Agente</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Criado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {paginatedReferrals.map((referral, index) => {
                          const stage = STAGES.find(s => s.id === referral.stage);
                          const agentData = getAgentData(referral.agentId);

                          return (
                            <motion.tr
                              key={referral.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                              onClick={() => navigate(`${createPageUrl("ReferralDetail")}?id=${referral.id}`)}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.02 }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {referral.referredName || 'Sem nome'}
                                  </span>
                                  {referral.referrerLevel === 2 && (
                                    <Badge variant="warning" className="text-[10px]">
                                      Nível 2
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  {referral.referrerName}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                  <Phone className="w-3 h-3" />
                                  {referral.referredPhone || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`bg-gradient-to-r ${stage?.gradient} text-white border-0`}>
                                  {stage?.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(getReferralValue(referral))}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-sm text-purple-600 dark:text-purple-400">
                                  {formatCurrency(referral.commissionValue)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {agentData ? (
                                  <div className="flex items-center gap-2">
                                    {agentData.photo_url ? (
                                      <img
                                        src={agentData.photo_url}
                                        alt={agentData.name}
                                        className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                                      />
                                    ) : (
                                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                        {agentData.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{agentData.name}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400 italic">Não atribuído</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(referral.createdAt)}
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Mostrando {startIndex + 1} a {Math.min(startIndex + LIST_PAGE_SIZE, filteredReferrals.length)} de {filteredReferrals.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage(p => Math.max(1, p - 1))}
                          disabled={listPage === 1}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Página {listPage} de {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                          disabled={listPage === totalPages}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}
      </div>
    </motion.div>
  );
}
