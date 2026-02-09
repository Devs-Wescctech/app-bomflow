import React from "react";
import { 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  MessageSquare, 
  FileText, 
  CheckCircle, 
  TrendingUp,
  User,
  Clock,
  AlertCircle,
  Presentation,
  ArrowRight,
  DollarSign,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatDate = (dateValue) => {
  if (!dateValue) return "";
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (!isValid(date)) return "";
    return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
};

const getActivityConfig = (type) => {
  const configMap = {
    call: {
      icon: Phone,
      label: "Ligacao",
      bg: "bg-blue-100 dark:bg-blue-900/50",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
      gradient: "from-blue-500 to-cyan-500"
    },
    email: {
      icon: Mail,
      label: "E-mail",
      bg: "bg-purple-100 dark:bg-purple-900/50",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800",
      gradient: "from-purple-500 to-violet-500"
    },
    meeting: {
      icon: Calendar,
      label: "Reuniao",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-green-500"
    },
    presentation: {
      icon: Presentation,
      label: "Apresentacao",
      bg: "bg-indigo-100 dark:bg-indigo-900/50",
      text: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800",
      gradient: "from-indigo-500 to-violet-500"
    },
    proposal: {
      icon: DollarSign,
      label: "Proposta",
      bg: "bg-amber-100 dark:bg-amber-900/50",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
      gradient: "from-amber-500 to-yellow-500"
    },
    whatsapp: {
      icon: MessageSquare,
      label: "WhatsApp",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-green-500"
    },
    visit: {
      icon: MapPin,
      label: "Visita",
      bg: "bg-orange-100 dark:bg-orange-900/50",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-800",
      gradient: "from-orange-500 to-amber-500"
    },
    note: {
      icon: FileText,
      label: "Nota",
      bg: "bg-gray-100 dark:bg-gray-800",
      text: "text-gray-600 dark:text-gray-400",
      border: "border-gray-200 dark:border-gray-700",
      gradient: "from-gray-400 to-gray-500"
    },
    stage_change: {
      icon: ArrowRight,
      label: "Mudanca de Etapa",
      bg: "bg-indigo-100 dark:bg-indigo-900/50",
      text: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800",
      gradient: "from-indigo-500 to-blue-500"
    },
    task: {
      icon: CheckCircle,
      label: "Tarefa",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-teal-500"
    },
  };
  return configMap[type] || configMap.note;
};

export default function LeadTimeline({ activities = [], visits = [] }) {
  const getItemDate = (item) => {
    return item.createdAt || item.created_at || item.created_date || item.scheduledAt || item.scheduled_at || '';
  };

  const timelineItems = [
    ...activities.map(a => ({ ...a, itemType: 'activity' })),
    ...visits.map(v => ({ 
      ...v, 
      itemType: 'visit',
      type: 'visit',
      title: 'Check-in realizado',
      description: v.notes,
      created_date: v.visitedAt 
    }))
  ].sort((a, b) => new Date(getItemDate(b)) - new Date(getItemDate(a)));

  if (timelineItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
          <MessageSquare className="w-10 h-10 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhuma atividade registrada</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">As atividades aparecerao aqui</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-gradient-to-b from-blue-200 via-purple-200 to-gray-200 dark:from-blue-800 dark:via-purple-800 dark:to-gray-700" />
      
      <div className="space-y-4">
        {timelineItems.map((item, idx) => {
          const config = getActivityConfig(item.type);
          const Icon = config.icon;
          const isCompleted = item.completed;

          return (
            <div key={item.id || idx} className="relative flex gap-4 group">
              <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              
              <div className={`flex-1 p-4 rounded-xl border ${config.border} bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow duration-200`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${config.bg} ${config.text}`}>
                      {config.label}
                    </span>
                    {isCompleted !== undefined && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        isCompleted 
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' 
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                      }`}>
                        {isCompleted ? (
                          <><CheckCircle className="w-3 h-3" /> Concluida</>
                        ) : (
                          <><Clock className="w-3 h-3" /> Pendente</>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(item.createdAt || item.created_at || item.created_date || item.createdDate)}
                  </span>
                </div>
                
                {item.title && (
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {item.title}
                  </h4>
                )}
                
                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed whitespace-pre-wrap">
                    {item.description}
                  </p>
                )}

                {(item.scheduledAt || item.scheduled_at) && !isCompleted && (
                  <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Agendado para {formatDate(item.scheduledAt || item.scheduled_at)}
                    </span>
                  </div>
                )}

                {item.itemType === 'visit' && item.check_out_at && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Duracao: <strong>{item.duration_minutes} min</strong>
                    </span>
                    {item.outcome && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {item.outcome}
                      </span>
                    )}
                  </div>
                )}

                {(item.assignedTo || item.assigned_to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Responsavel: <span className="font-medium">{item.assignedTo || item.assigned_to}</span>
                    </span>
                  </div>
                )}

                {(item.metadata?.from && item.metadata?.to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {item.metadata.from}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="px-2 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium">
                      {item.metadata.to}
                    </span>
                  </div>
                )}
                {(item.metadata?.stage_from && item.metadata?.stage_to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {item.metadata.stage_from}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="px-2 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium">
                      {item.metadata.stage_to}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
