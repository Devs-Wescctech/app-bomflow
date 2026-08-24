import { useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Sparkles,
  Phone,
  IdCard,
  BadgeCheck,
  Users,
  Wallet,
  MapPin,
  Route,
  Clock,
  ClipboardList,
  UserRound,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ChatAvatar from "./ChatAvatar";
import { convName, convNumber, formatPhoneBR, presenceFromConversation, relativeFromNow } from "./chatHelpers";

// Linha de dado do lead. Mostra o valor real quando existe; caso contrário um placeholder
// discreto — nunca inventamos dado real de cliente numa ferramenta de produção.
function DataRow({ icon: Icon, label, value }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p
          className={cn(
            "text-xs truncate",
            empty ? "text-gray-300 dark:text-gray-600 italic" : "text-gray-700 dark:text-gray-200 font-medium"
          )}
        >
          {empty ? "não informado" : value}
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1.5">
      {children}
    </p>
  );
}

export default function LeadInsightsPanel({ conv, isAdmin, onClose, onUseSuggestion }) {
  const [note, setNote] = useState("");
  const name = convName(conv);
  const presence = presenceFromConversation(conv);
  const phone = formatPhoneBR(convNumber(conv));

  // Sugestão de mensagem (DEMONSTRAÇÃO — sem IA real, conforme solicitado).
  const suggestion = `Olá ${name.split(" ")[0] || ""}! Consegui separar as informações que você pediu. Posso te enviar agora?`;

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full lg:w-80 xl:w-[340px] flex-shrink-0 border-l border-gray-200/70 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70 dark:border-gray-800 flex-shrink-0">
        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Informações do lead</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Cabeçalho do contato */}
        <div className="flex flex-col items-center text-center gap-2 pb-1">
          <ChatAvatar name={name} url={conv.avatar_url} size={68} showPresence active={presence.active} />
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{phone}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
              presence.active
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", presence.active ? "bg-emerald-500" : "bg-gray-400")} />
            {presence.label}
          </span>
        </div>

        {/* Facilito IA — DEMONSTRAÇÃO visual (sem IA real) */}
        <div className="rounded-2xl border border-violet-200/70 dark:border-violet-900/50 bg-gradient-to-br from-violet-50 to-indigo-50/50 dark:from-violet-950/40 dark:to-indigo-950/20 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm font-bold text-violet-700 dark:text-violet-300">
              <Sparkles className="w-4 h-4" />
              Facilito
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-500 dark:bg-violet-900/50 dark:text-violet-300">
              Demonstração
            </span>
          </div>
          <div className="space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200">Resumo da conversa</p>
              <p className="mt-0.5 leading-relaxed">
                Cliente demonstrou interesse e pediu mais informações. Aguardando retorno com os
                detalhes solicitados.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200">Próxima ação sugerida</p>
              <p className="mt-0.5 leading-relaxed">Responder com a proposta e confirmar o interesse.</p>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-gray-900/50 border border-violet-100 dark:border-violet-900/40 p-2.5">
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Mensagem sugerida</p>
              <p className="leading-relaxed text-gray-500 dark:text-gray-400">{suggestion}</p>
              <button
                onClick={() => onUseSuggestion?.(suggestion)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:gap-1.5 transition-all"
              >
                Usar sugestão <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Dados do lead (reais quando disponíveis) */}
        <div>
          <SectionTitle>Dados</SectionTitle>
          <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40 px-3 py-1 divide-y divide-gray-100 dark:divide-gray-800/60">
            <DataRow icon={Phone} label="Telefone" value={phone} />
            <DataRow icon={IdCard} label="CPF" value={null} />
            <DataRow icon={BadgeCheck} label="Status" value={presence.active ? "Em conversa" : "Aguardando"} />
            <DataRow icon={Layers} label="Canal" value={null} />
            <DataRow icon={ClipboardList} label="Plano" value={null} />
            <DataRow icon={Users} label="Dependentes" value={null} />
            <DataRow icon={Wallet} label="Valor" value={null} />
            <DataRow
              icon={UserRound}
              label="Responsável"
              value={conv.vendedor_nome || (isAdmin ? null : "Você")}
            />
            <DataRow
              icon={Clock}
              label="Última atividade"
              value={conv.last_message_at ? relativeFromNow(conv.last_message_at) : null}
            />
            <DataRow icon={Route} label="Origem" value={null} />
            <DataRow icon={MapPin} label="Próxima ação" value={null} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 px-1">
            Campos vazios serão preenchidos quando o lead estiver vinculado.
          </p>
        </div>

        {/* Notas rápidas (local, não persistido) */}
        <div>
          <SectionTitle>Notas rápidas</SectionTitle>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anote algo sobre este contato..."
            rows={3}
            className="w-full rounded-xl bg-gray-100/70 dark:bg-gray-800/60 border border-transparent focus:border-violet-300 dark:focus:border-violet-700 focus:bg-white dark:focus:bg-gray-900 text-xs p-2.5 outline-none resize-none transition-all placeholder:text-gray-400"
          />
        </div>
      </div>
    </motion.aside>
  );
}
