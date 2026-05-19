import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  MapPin,
  DollarSign,
  Calendar,
  User,
  Filter,
  Search,
  X,
  LayoutGrid,
  List,
  ExternalLink,
  Clock,
  TrendingUp,
  GripVertical,
  Bell,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Users,
  Target,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trophy,
  FileSpreadsheet,
  FileText
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import QuickLeadForm from "../components/sales/QuickLeadForm";
import { createPageUrl } from "@/utils";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import StatsCard from "@/components/dashboard/StatsCard";
import { differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getSortedHistory(lead) {
  const history = [...(lead.stage_history || lead.stageHistory || [])];
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

function getTimeInStage(lead) {
  const history = getSortedHistory(lead);
  let enteredAt = null;

  if (history.length > 0) {
    const lastEntry = history[history.length - 1];
    enteredAt = safeDate(lastEntry.changed_at || lastEntry.changedAt);
  }

  if (!enteredAt) {
    enteredAt = safeDate(lead.createdDate || lead.createdAt || lead.created_at);
  }

  if (!enteredAt) return { label: '-', days: 0, color: 'gray' };

  const now = new Date();
  const totalMinutes = differenceInMinutes(now, enteredAt);
  const totalHours = differenceInHours(now, enteredAt);
  const totalDays = differenceInDays(now, enteredAt);

  let label;
  if (totalMinutes < 60) {
    label = `${totalMinutes}min`;
  } else if (totalHours < 24) {
    label = `${totalHours}h`;
  } else if (totalDays < 30) {
    label = `${totalDays}d`;
  } else {
    const months = Math.floor(totalDays / 30);
    label = `${months}m`;
  }

  let color;
  if (totalDays <= 2) {
    color = 'green';
  } else if (totalDays <= 7) {
    color = 'yellow';
  } else if (totalDays <= 14) {
    color = 'orange';
  } else {
    color = 'red';
  }

  return { label, days: totalDays, hours: totalHours, minutes: totalMinutes, color, enteredAt };
}

function getLeadValue(lead) {
  return parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;
}

function getStageHistoryTimeline(lead, stages) {
  const history = getSortedHistory(lead);
  if (history.length === 0) return [];

  const createdDate = safeDate(lead.createdDate || lead.createdAt || lead.created_at);
  const timeline = [];

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const changedAt = safeDate(entry.changed_at || entry.changedAt);
    if (!changedAt) continue;

    let prevDate;
    if (i === 0) {
      prevDate = createdDate || changedAt;
    } else {
      prevDate = safeDate(history[i - 1].changed_at || history[i - 1].changedAt) || changedAt;
    }

    const durationLabel = formatDuration(prevDate, changedAt);

    const fromId = entry.from || entry.previousStage || entry.from_stage;
    const toId = entry.to || entry.stage || entry.to_stage;
    const fromStage = stages.find(s => s.id === fromId);
    const toStage = stages.find(s => s.id === toId);

    timeline.push({
      from: fromStage?.label || fromId || lead.stage || '-',
      to: toStage?.label || toId || '-',
      duration: durationLabel,
      date: changedAt,
    });
  }

  return timeline;
}

const STAGES = [
  { id: 'novo', label: 'Novo', color: 'from-purple-500 to-purple-600', lightBg: 'bg-purple-50 dark:bg-purple-950/30', gradient: 'from-purple-500 to-purple-600', borderColor: 'border-purple-500', shadowColor: 'shadow-purple-200/50 dark:shadow-purple-900/30', textColor: 'text-purple-500 dark:text-purple-400' },
  { id: 'abordado', label: 'Abordado', color: 'from-blue-500 to-blue-600', lightBg: 'bg-blue-50 dark:bg-blue-950/30', gradient: 'from-blue-500 to-blue-600', borderColor: 'border-blue-500', shadowColor: 'shadow-blue-200/50 dark:shadow-blue-900/30', textColor: 'text-blue-500 dark:text-blue-400' },
  { id: 'qualificado', label: 'Qualificado', color: 'from-indigo-500 to-indigo-600', lightBg: 'bg-indigo-50 dark:bg-indigo-950/30', gradient: 'from-indigo-500 to-indigo-600', borderColor: 'border-indigo-500', shadowColor: 'shadow-indigo-200/50 dark:shadow-indigo-900/30', textColor: 'text-indigo-500 dark:text-indigo-400' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'from-orange-500 to-orange-600', lightBg: 'bg-orange-50 dark:bg-orange-950/30', gradient: 'from-orange-500 to-orange-600', borderColor: 'border-orange-500', shadowColor: 'shadow-orange-200/50 dark:shadow-orange-900/30', textColor: 'text-orange-500 dark:text-orange-400' },
  { id: 'fechado_ganho', label: 'Fechado - Ganho', color: 'from-green-500 to-green-600', lightBg: 'bg-green-50 dark:bg-green-950/30', gradient: 'from-green-500 to-green-600', borderColor: 'border-green-500', shadowColor: 'shadow-green-200/50 dark:shadow-green-900/30', textColor: 'text-green-500 dark:text-green-400' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'from-red-500 to-red-600', lightBg: 'bg-red-50 dark:bg-red-950/30', gradient: 'from-red-500 to-red-600', borderColor: 'border-red-500', shadowColor: 'shadow-red-200/50 dark:shadow-red-900/30', textColor: 'text-red-500 dark:text-red-400' },
];

const LIST_PAGE_SIZE = 20;

function DroppableColumn({ id, stage, children, overId, activeId }) {
  const { setNodeRef } = useDroppable({ id });
  const isOver = overId === id && activeId !== null;
  
  return (
    <div className={`w-64 sm:w-72 flex-shrink-0 transition-all duration-200 snap-start ${
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

function SortableLeadCard({ lead, stage, pendingTasksCount, agentData, navigate, formatCurrency, formatDate, updateLeadMutation, TasksPopover }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : (transition || 'transform 150ms ease'),
    opacity: isDragging ? 0.7 : 1,
    touchAction: 'none',
    willChange: isDragging ? 'transform' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-sortable-id={lead.id}
      className={isDragging ? 'rotate-1 scale-[1.03] z-50' : ''}
    >
      <div 
        onClick={() => navigate(`${createPageUrl("LeadDetail")}?id=${lead.id}`)}
        className={`group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'shadow-2xl scale-[1.02] ring-2 ring-violet-400/50' 
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]'
        }`}
      >
        <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
        
        <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
              {(lead.name || 'S')[0].toUpperCase()}
              <div className="absolute inset-0 rounded-xl ring-2 ring-white/20" />
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px] group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                {lead.name || 'Sem nome'}
              </h4>
              <div className="flex items-center gap-1.5 mt-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                  {lead.phone || 'Sem telefone'}
                </span>
              </div>
              {(() => {
                const d = safeDate(lead.created_at || lead.createdAt);
                return d ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400 dark:text-gray-500 text-[11px]">
                      {d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {pendingTasksCount > 0 && (
              <Popover>
                <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="relative flex-shrink-0 group/btn">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 flex items-center justify-center shadow-sm group-hover/btn:shadow-md transition-shadow">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-lg">
                      {pendingTasksCount}
                    </span>
                  </button>
                </PopoverTrigger>
                <TasksPopover leadId={lead.id} leadName={lead.name} />
              </Popover>
            )}
          </div>

          {getLeadValue(lead) > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(getLeadValue(lead))}
              </span>
            </div>
          )}

          {(lead.source || lead.interest) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {lead.source && (
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-medium">
                  {lead.source}
                </span>
              )}
              {lead.interest && (
                <span className="px-2.5 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-medium">
                  {lead.interest}
                </span>
              )}
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
                    updateLeadMutation.mutate({ id: lead.id, data: { concluded: true } });
                  } else {
                    updateLeadMutation.mutate({ id: lead.id, data: { lost: true } });
                  }
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {stage.id === 'fechado_ganho' ? 'Dar Baixa (Ganho)' : 'Dar Baixa (Perdido)'}
              </Button>
            </div>
          )}

          {(() => {
            const timeInfo = getTimeInStage(lead);
            const timeline = getStageHistoryTimeline(lead, STAGES);
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

export default function LeadsKanban() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('leadsKanbanFilters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return { search: '', agent: 'all', team: 'all', territory: 'all', dateFrom: '', dateTo: '' };
      }
    }
    return { search: '', agent: 'all', team: 'all', territory: 'all', dateFrom: '', dateTo: '' };
  });

  useEffect(() => {
    localStorage.setItem('leadsKanbanFilters', JSON.stringify(filters));
  }, [filters]);

  const clearFilters = () => {
    const defaultFilters = { search: '', agent: 'all', team: 'all', territory: 'all', dateFrom: '', dateTo: '' };
    setFilters(defaultFilters);
    localStorage.removeItem('leadsKanbanFilters');
  };

  const hasActiveFilters = filters.search || filters.agent !== 'all' || filters.team !== 'all' || filters.territory !== 'all' || filters.dateFrom || filters.dateTo;
  const [listPage, setListPage] = useState(1);
  const [listStageFilter, setListStageFilter] = useState('all');
  const [isDraggingCard, setIsDraggingCard] = useState(false);

  // Refs para arrastar o kanban horizontalmente
  const kanbanContainerRef = useRef(null);
  const headersRef = useRef(null);
  const isDraggingCanvasRef = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const savedScrollPosition = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  // Sensores do dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
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


  useEffect(() => {
    setListPage(1);
  }, [filters, viewMode]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 15000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 60000,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;

  const isAdmin = currentAgentType === 'admin' || currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor';
  
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', isAdmin ? 'admin' : currentAgent?.id],
    queryFn: async () => {
      const allLeads = await base44.entities.Lead.list('-createdDate');

      if (isAdmin) {
        return allLeads.filter(l => !l.lost);
      }

      if (!currentAgent) return [];

      const canSeeAll = canViewAll(currentAgent, 'leads');
      if (canSeeAll) {
        return allLeads.filter(l => !l.lost);
      }

      const canSeeTeam = canViewTeam(currentAgent, 'leads');
      if (canSeeTeam) {
        const teamAgents = allAgents.filter(a => a.team_id === currentAgent.team_id);
        const teamAgentIds = teamAgents.map(a => a.id);

        return allLeads.filter(l =>
          !l.lost &&
          (teamAgentIds.includes(l.agentId) || teamAgentIds.includes(l.promoterId))
        );
      }

      return allLeads.filter(l =>
        !l.lost &&
        (l.agentId === currentAgent.id || l.promoterId === currentAgent.id)
      );
    },
    enabled: !!user && (isAdmin || !!currentAgent),
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const salesAgents = allAgents;

  const { data: territories = [], isLoading: isLoadingTerritories } = useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      const result = await base44.entities.Territory.list();
      return result;
    },
    staleTime: 60000,
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => base44.entities.Activity.list(),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const leadsQueryKey = ['leads', isAdmin ? 'admin' : currentAgent?.id];

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Lead.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: leadsQueryKey });
      const previousLeads = queryClient.getQueryData(leadsQueryKey);
      
      queryClient.setQueryData(leadsQueryKey, (old) => {
        if (!old) return old;
        return old.map(lead => 
          String(lead.id) === String(id) ? { ...lead, ...data } : lead
        );
      });
      
      return { previousLeads };
    },
    onError: (err, variables, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey, context.previousLeads);
      }
      toast.error('Erro ao mover lead');
    },
    onSettled: () => {
      const scrollPos = savedScrollPosition.current;
      queryClient.invalidateQueries({ queryKey: leadsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (scrollPos) {
        requestAnimationFrame(() => {
          const container = kanbanContainerRef.current;
          const headers = headersRef.current;
          const pageEl = document.querySelector('[data-kanban-scroll-container]') || container?.closest('.overflow-y-auto, .overflow-auto, main');
          if (container) container.scrollLeft = scrollPos.scrollLeft;
          if (headers) headers.scrollLeft = scrollPos.scrollLeft;
          if (pageEl) pageEl.scrollTop = scrollPos.scrollTop;
          requestAnimationFrame(() => {
            if (container) container.scrollLeft = scrollPos.scrollLeft;
            if (headers) headers.scrollLeft = scrollPos.scrollLeft;
            if (pageEl) pageEl.scrollTop = scrollPos.scrollTop;
            savedScrollPosition.current = null;
          });
        });
      }
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId }) => base44.entities.Activity.update(taskId, {
      completed: true,
      completed_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allActivities'] });
      toast.success('Tarefa concluída!');
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: ({ taskId }) => base44.entities.Activity.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allActivities'] });
      toast.success('Tarefa excluída!');
    },
  });

  const handleStageChange = useCallback(async (leadId, newStage, fromStage = null) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const currentStage = fromStage || lead.stage;
    if (currentStage === newStage) return;

    const stageHistory = [...(lead.stageHistory || lead.stage_history || [])];
    stageHistory.push({
      from: currentStage,
      to: newStage,
      changed_at: new Date().toISOString(),
      changed_by: user?.email,
    });

    await updateLeadMutation.mutateAsync({
      id: leadId,
      data: {
        stage: newStage,
        stage_history: stageHistory,
      }
    });

    toast.success('Lead movido com sucesso!');
  }, [leads, user?.email, updateLeadMutation]);

  const handleDragMove = useCallback(() => {
    if (kanbanContainerRef.current && headersRef.current) {
      headersRef.current.scrollLeft = kanbanContainerRef.current.scrollLeft;
    }
  }, []);

  // Estado para ordem local dos cards
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
    
    // Check if over a column directly or over a card (use card's stage as column)
    if (STAGES.find(s => s.id === over.id)) {
      setOverId(over.id);
    } else {
      // Find the lead and get its stage
      const overLead = leads.find(l => l.id === over.id);
      if (overLead) {
        setOverId(overLead.stage);
      }
    }
  }, [leads]);

  const getLeadsByStage = useCallback((stage) => {
    return leads.filter(l => l.stage === stage);
  }, [leads]);

  const filteredLeads = leads.filter(lead => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (
        !lead.name?.toLowerCase().includes(searchLower) &&
        !lead.phone?.toLowerCase().includes(searchLower) &&
        !lead.email?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    if (filters.team !== 'all') {
      const teamAgentIds = allAgents
        .filter(a => String(a.team_id) === String(filters.team) || String(a.teamId) === String(filters.team))
        .map(a => String(a.id));
      if (!teamAgentIds.includes(String(lead.agentId))) {
        return false;
      }
    }

    if (filters.agent !== 'all' && lead.agentId !== filters.agent) {
      return false;
    }

    if (filters.territory !== 'all' && String(lead.territoryId) !== String(filters.territory)) {
      return false;
    }

    if (filters.dateFrom) {
      const leadDate = new Date(lead.createdDate || lead.createdAt);
      const fromDate = new Date(filters.dateFrom);
      if (leadDate < fromDate) return false;
    }

    if (filters.dateTo) {
      const leadDate = new Date(lead.createdDate || lead.createdAt);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59);
      if (leadDate > toDate) return false;
    }

    return true;
  });

  const listViewLeads = listStageFilter === 'all'
    ? filteredLeads
    : filteredLeads.filter(l => l.stage === listStageFilter);

  const exportToExcel = () => {
    const rows = listViewLeads.map(lead => ({
      'Nome': lead.name || '-',
      'Telefone': lead.phone || '-',
      'E-mail': lead.email || '-',
      'Etapa': STAGES.find(s => s.id === lead.stage)?.label || lead.stage || '-',
      'Valor': getLeadValue(lead),
      'Agente': allAgents.find(a => a.id === lead.agentId)?.name || '-',
      'Criado em': formatDate(lead.createdDate || lead.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads PF');
    XLSX.writeFile(wb, `leads-pf-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Relatório de Leads PF', 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Total: ${listViewLeads.length} leads`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Nome', 'Telefone', 'E-mail', 'Etapa', 'Valor', 'Agente', 'Criado em']],
      body: listViewLeads.map(lead => [
        lead.name || '-',
        lead.phone || '-',
        lead.email || '-',
        STAGES.find(s => s.id === lead.stage)?.label || lead.stage || '-',
        formatCurrency(getLeadValue(lead)),
        allAgents.find(a => a.id === lead.agentId)?.name || '-',
        formatDate(lead.createdDate || lead.createdAt),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });
    doc.save(`leads-pf-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
  };

  const getOrderedLeadsByStage = useCallback((stage) => {
    const stageLeads = filteredLeads.filter(lead => lead.stage === stage);
    if (localOrder[stage]) {
      const orderMap = {};
      localOrder[stage].forEach((id, index) => {
        orderMap[id] = index;
      });
      return [...stageLeads].sort((a, b) => {
        const orderA = orderMap[a.id] ?? 999;
        const orderB = orderMap[b.id] ?? 999;
        return orderA - orderB;
      });
    }
    return stageLeads;
  }, [filteredLeads, localOrder]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setIsDraggingCard(false);
    setOverId(null);

    const container = kanbanContainerRef.current;
    const pageEl = container?.closest('.overflow-y-auto, .overflow-auto, main');
    savedScrollPosition.current = {
      scrollLeft: container?.scrollLeft || 0,
      scrollTop: pageEl?.scrollTop || window.scrollY || 0,
    };

    if (!over) return;

    const activeLeadId = active.id;
    const overId = over.id;

    const activeLead = leads.find(l => l.id === activeLeadId);
    if (!activeLead) return;

    const sourceStage = activeLead.stage;
    let destStage = null;

    if (STAGES.find(s => s.id === overId)) {
      destStage = overId;
    } else {
      const overLead = leads.find(l => l.id === overId);
      if (overLead) {
        destStage = overLead.stage;
      }
    }

    if (!destStage) return;

    if (sourceStage !== destStage) {
      handleStageChange(activeLeadId, destStage, sourceStage);
    } else {
      const stageLeads = getOrderedLeadsByStage(sourceStage);
      const oldIndex = stageLeads.findIndex(l => l.id === activeLeadId);
      const newIndex = stageLeads.findIndex(l => l.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = [...stageLeads];
        const [removed] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, removed);
        
        setLocalOrder(prev => ({
          ...prev,
          [sourceStage]: newOrder.map(l => l.id)
        }));
        
        toast.success('Ordem atualizada');
      }
    }
  }, [leads, handleStageChange, getOrderedLeadsByStage]);

  const actionableTypes = ['task', 'visit', 'call', 'meeting', 'email', 'presentation', 'proposal'];

  const getPendingTasksCount = (leadId) => {
    return allActivities.filter(a =>
      a.lead_id === leadId &&
      actionableTypes.includes(a.type) &&
      !a.completed
    ).length;
  };

  const getPendingTasks = (leadId) => {
    return allActivities.filter(a =>
      a.lead_id === leadId &&
      actionableTypes.includes(a.type) &&
      !a.completed
    );
  };

  // KPIs corrigidos
  const wonLeads = getLeadsByStage('fechado_ganho');
  const lostLeads = getLeadsByStage('fechado_perdido');
  const activeLeads = filteredLeads.filter(l => l.stage !== 'fechado_ganho' && l.stage !== 'fechado_perdido');
  const totalLeadsCount = filteredLeads.length;
  
  // Valor total em pipeline (apenas leads ativos, não ganhos/perdidos)
  const totalValue = activeLeads.reduce((sum, lead) => {
    const val = getLeadValue(lead);
    return sum + val;
  }, 0);
  
  // Valor ganho (leads fechados com sucesso)
  const wonValue = wonLeads.reduce((sum, lead) => {
    const val = getLeadValue(lead);
    return sum + val;
  }, 0);
  
  // Ticket médio baseado em leads ativos
  const avgValue = activeLeads.length > 0 ? totalValue / activeLeads.length : 0;
  
  // Taxa de conversão: leads ganhos / total de leads
  const conversionRate = totalLeadsCount > 0
    ? ((wonLeads.length / totalLeadsCount) * 100).toFixed(1)
    : 0;

  const getAgentData = (agentId) => {
    if (!agentId) return null;
    return salesAgents.find(a => String(a.id) === String(agentId));
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

  const getTaskIcon = (type) => {
    const icons = {
      visit: <MapPin className="w-3.5 h-3.5" />,
      call: <Phone className="w-3.5 h-3.5" />,
      meeting: <Users className="w-3.5 h-3.5" />,
      email: <Mail className="w-3.5 h-3.5" />,
      presentation: <TrendingUp className="w-3.5 h-3.5" />,
      proposal: <DollarSign className="w-3.5 h-3.5" />,
      task: <AlertCircle className="w-3.5 h-3.5" />,
    };
    return icons[type] || <AlertCircle className="w-3.5 h-3.5" />;
  };

  const getTaskTypeLabel = (type) => {
    const labels = {
      visit: 'Visita',
      call: 'Ligação',
      meeting: 'Reunião',
      email: 'E-mail',
      presentation: 'Apresentação',
      proposal: 'Proposta',
      task: 'Tarefa',
    };
    return labels[type] || 'Tarefa';
  };

  const getTaskTypeColor = (type) => {
    const colors = {
      visit: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
      call: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
      meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
      email: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
      presentation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
      proposal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
      task: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    };
    return colors[type] || colors.task;
  };

  const TasksPopover = ({ leadId, leadName }) => {
    const tasks = getPendingTasks(leadId);

    return (
      <PopoverContent className="w-80 p-0 glass-card border-0 shadow-soft-lg" align="start">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 rounded-t-xl">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <Bell className="w-3 h-3" />
            </div>
            Tarefas Pendentes
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{leadName}</p>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Nenhuma tarefa pendente
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {tasks.map((task) => (
                <motion.div 
                  key={task.id} 
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${getTaskTypeColor(task.type)}`}>
                      {getTaskIcon(task.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${getTaskTypeColor(task.type)}`}>
                          {getTaskTypeLabel(task.type)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mt-1">
                        {task.title}
                      </p>
                      {task.scheduled_at && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(task.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:bg-emerald-100 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeTaskMutation.mutate({ taskId: task.id });
                        }}
                        disabled={completeTaskMutation.isPending}
                        title="Marcar como concluída"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Deseja excluir esta tarefa?')) {
                            deleteTaskMutation.mutate({ taskId: task.id });
                          }
                        }}
                        disabled={deleteTaskMutation.isPending}
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
          <Button
            onClick={(e) => { e.stopPropagation(); navigate(`${createPageUrl("LeadDetail")}?id=${leadId}`); }}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ExternalLink className="w-3 h-3 mr-2" />
            Ver Detalhes e Dar Baixa
          </Button>
        </div>
      </PopoverContent>
    );
  };

  return (
    <motion.div 
      className="min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="space-y-4 md:space-y-6">
        <motion.div 
          className="page-header-title-section"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-display bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Pipeline de Vendas PF
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Gerencie seus leads através do funil de vendas</span>
              <span className="sm:hidden">Gerencie seus leads</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="glass"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-none ${hasActiveFilters ? 'ring-2 ring-emerald-500/50' : ''}`}
              size="sm"
            >
              <Filter className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <Badge variant="success" className="ml-2">
                  {[filters.search, filters.agent !== 'all', filters.team !== 'all', filters.territory !== 'all', filters.dateFrom, filters.dateTo].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            <Link to={createPageUrl('NewLead')} className="flex-1 sm:flex-none">
              <Button variant="gradient" size="sm" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Novo Lead
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Buscar
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Nome, telefone, email..."
                          value={filters.search}
                          onChange={(e) => setFilters({...filters, search: e.target.value})}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Time
                      </label>
                      <Select value={filters.team} onValueChange={(val) => setFilters({...filters, team: val, agent: 'all'})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os times" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os times</SelectItem>
                          {teams.map(team => (
                            <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                          {(filters.team !== 'all' ? salesAgents.filter(a => String(a.team_id) === String(filters.team) || String(a.teamId) === String(filters.team)) : salesAgents).map(agent => (
                            <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Território
                      </label>
                      <Select value={filters.territory} onValueChange={(val) => setFilters({...filters, territory: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os territórios" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os territórios</SelectItem>
                          {territories.map(territory => (
                            <SelectItem key={territory.id} value={String(territory.id)}>{territory.name}</SelectItem>
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
          className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatsCard
            title="Leads Ativos"
            value={activeLeads.length}
            subtitle={`${wonLeads.length} ganhos, ${lostLeads.length} perdidos`}
            icon={Users}
            color="blue"
            delay={0}
            helpText="Quantidade de leads em andamento no pipeline (exclui ganhos e perdidos já baixados)"
          />
          <StatsCard
            title="Vendas Fechadas"
            value={formatCurrency(wonValue)}
            subtitle={`${wonLeads.length} vendas ganhas`}
            icon={Trophy}
            color="green"
            delay={0.05}
            helpText="Valor total de todas as vendas já fechadas (leads com status Ganho)"
          />
          <StatsCard
            title="Valor em Pipeline"
            value={formatCurrency(totalValue)}
            icon={DollarSign}
            color="blue"
            delay={0.1}
            helpText="Soma dos valores de todos os leads ativos no pipeline"
          />
          <StatsCard
            title="Ticket Médio"
            value={formatCurrency(avgValue)}
            icon={Target}
            color="purple"
            delay={0.2}
            helpText="Valor médio por lead ativo no pipeline"
          />
          <StatsCard
            title="Taxa de Conversão"
            value={`${conversionRate}%`}
            subtitle={`${wonLeads.length}/${totalLeadsCount} leads`}
            icon={TrendingUp}
            color="orange"
            delay={0.3}
            helpText="Porcentagem de leads ganhos sobre o total de leads (ativos + fechados)"
          />
        </motion.div>

        <div className="flex justify-end">
          <div className="inline-flex rounded-xl glass-card p-1">
            <Button
              variant={viewMode === 'kanban' ? 'gradient' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'gradient' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4 mr-2" />
              Lista
            </Button>
          </div>
        </div>

        {viewMode === 'kanban' && (
          <>
            {/* Sticky Headers */}
            <div 
              ref={headersRef}
              className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-950 pb-2 overflow-x-auto cursor-grab select-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onScroll={(e) => {
                if (kanbanContainerRef.current) {
                  kanbanContainerRef.current.scrollLeft = e.target.scrollLeft;
                }
              }}
            >
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {STAGES.map((stage) => {
                  const stageLeads = getOrderedLeadsByStage(stage.id);
                  const stageValue = stageLeads.reduce((sum, lead) => sum + getLeadValue(lead), 0);
                  const stageTimes = stageLeads.map(l => getTimeInStage(l));
                  const avgDays = stageTimes.length > 0 
                    ? Math.round(stageTimes.reduce((sum, t) => sum + (t.days || 0), 0) / stageTimes.length) 
                    : 0;
                  return (
                    <div key={stage.id} className="w-64 sm:w-72 flex-shrink-0 snap-start">
                      <div className={`bg-gradient-to-r ${stage.color} text-white p-4 rounded-lg shadow-md`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-lg">{stage.label}</h3>
                          <Badge variant="secondary" className="bg-white/20 text-white backdrop-blur-sm">
                            {stageLeads.length}
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
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Tempo médio:
                            </span>
                            <span className="font-semibold">{avgDays === 0 ? (stageTimes.length > 0 ? `${Math.round(stageTimes.reduce((sum, t) => sum + (t.hours || 0), 0) / stageTimes.length)}h` : '<1d') : `${avgDays}d`}</span>
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
              style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
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
              <style>{`.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
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
                    const stageLeads = getOrderedLeadsByStage(stage.id);

                    return (
                      <DroppableColumn key={stage.id} id={stage.id} stage={stage} overId={overId} activeId={activeId}>
                        <SortableContext
                          items={stageLeads.map(l => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stageLeads.map((lead) => {
                            const pendingTasksCount = getPendingTasksCount(lead.id);
                            const agentData = getAgentData(lead.agentId);

                            return (
                              <SortableLeadCard
                                key={lead.id}
                                lead={lead}
                                stage={stage}
                                pendingTasksCount={pendingTasksCount}
                                agentData={agentData}
                                navigate={navigate}
                                formatCurrency={formatCurrency}
                                formatDate={formatDate}
                                updateLeadMutation={updateLeadMutation}
                                TasksPopover={TasksPopover}

                              />
                            );
                          })}
                        </SortableContext>
                        {stageLeads.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <User className="w-8 h-8" />
                            </div>
                            <p>Nenhum lead</p>
                          </div>
                        )}
                        <div style={{ minHeight: '80px' }} />
                      </DroppableColumn>
                    );
                  })}
                </div>
                
                <DragOverlay>
                  {activeId ? (() => {
                    const lead = leads.find(l => l.id === activeId);
                    if (!lead) return null;
                    const stage = STAGES.find(s => s.id === lead.stage) || STAGES[0];
                    return (
                      <div className="w-72 rotate-2 scale-105">
                        <div className="group relative overflow-hidden rounded-2xl shadow-2xl ring-2 ring-violet-400/50">
                          <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
                          <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
                            <div className="flex items-start gap-3">
                              <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
                                {(lead.name || 'S')[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px]">
                                  {lead.name || 'Sem nome'}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Phone className="w-3 h-3 text-gray-400" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                                    {lead.phone || 'Sem telefone'}
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
          const totalPages = Math.ceil(listViewLeads.length / LIST_PAGE_SIZE);
          const startIndex = (listPage - 1) * LIST_PAGE_SIZE;
          const paginatedLeads = listViewLeads.slice(startIndex, startIndex + LIST_PAGE_SIZE);
          
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Barra de filtros e exportação da Lista */}
              <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <Filter className="w-4 h-4 text-gray-400" />
                <Select value={filters.agent} onValueChange={v => setFilters(f => ({ ...f, agent: v }))}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {salesAgents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={listStageFilter} onValueChange={v => { setListStageFilter(v); setListPage(1); }}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as etapas</SelectItem>
                    {STAGES.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="date"
                  className="h-8 text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  value={filters.dateFrom}
                  onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  title="Data de criação — De"
                />
                <input
                  type="date"
                  className="h-8 text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  value={filters.dateTo}
                  onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                  title="Data de criação — Até"
                />
                <div className="flex-1" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{listViewLeads.length} leads</span>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportToExcel}>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportToPDF}>
                  <FileText className="w-3.5 h-3.5 text-red-500" />
                  PDF
                </Button>
              </div>
              <Card className="glass-card border-0 shadow-soft overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Nome</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Telefone</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Etapa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Agente</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Criado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {paginatedLeads.map((lead, index) => {
                          const stage = STAGES.find(s => s.id === lead.stage);
                          const pendingTasksCount = getPendingTasksCount(lead.id);
                          const agentData = getAgentData(lead.agentId);

                          return (
                            <motion.tr
                              key={lead.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                              onClick={() => navigate(`${createPageUrl("LeadDetail")}?id=${lead.id}`)}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.02 }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {lead.name || 'Sem nome'}
                                  </span>
                                  {pendingTasksCount > 0 && (
                                    <Badge variant="warning" className="text-[10px]">
                                      {pendingTasksCount} tarefas
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                  <Phone className="w-3 h-3" />
                                  {lead.phone || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`bg-gradient-to-r ${stage?.gradient} text-white border-0`}>
                                  {stage?.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(getLeadValue(lead))}
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
                                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                                        {agentData.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {agentData.name}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  {formatDate(lead.createdDate || lead.createdAt)}
                                </span>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Mostrando {startIndex + 1} - {Math.min(startIndex + LIST_PAGE_SIZE, listViewLeads.length)} de {listViewLeads.length} leads
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage(p => Math.max(1, p - 1))}
                          disabled={listPage === 1}
                          className="h-8"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Anterior
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (listPage <= 3) {
                              pageNum = i + 1;
                            } else if (listPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = listPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={listPage === pageNum ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setListPage(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                          disabled={listPage === totalPages}
                          className="h-8"
                        >
                          Próximo
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl glass-card border-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                  <Plus className="w-4 h-4" />
                </div>
                Novo Lead PF
              </DialogTitle>
            </DialogHeader>
            <QuickLeadForm
              onSuccess={() => {
                setIsFormOpen(false);
                queryClient.invalidateQueries({ queryKey: ['leads'] });
              }}
              onCancel={() => setIsFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}