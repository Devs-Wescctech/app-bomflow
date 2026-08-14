import {
  ArrowLeft,
  Phone,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
  MoreVertical,
  FolderOpen,
  ExternalLink,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ChatAvatar from "./ChatAvatar";
import { convName, formatPhoneBR, presenceFromConversation, convNumber } from "./chatHelpers";

// Header rico da conversa: identidade + presença + badges + ações rápidas.
export default function ChatConversationHeader({
  conv,
  isAdmin,
  onBack,
  onTogglePanel,
  panelOpen,
  onFacilito,
  onAction,
}) {
  const name = convName(conv);
  const phone = formatPhoneBR(convNumber(conv));
  const presence = presenceFromConversation(conv);
  const telHref = `tel:+${String(convNumber(conv) || "").replace(/\D/g, "")}`;

  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl flex-shrink-0">
      <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0" onClick={onBack}>
        <ArrowLeft className="w-5 h-5" />
      </Button>

      <ChatAvatar name={name} url={conv.avatar_url} size={44} showPresence active={presence.active} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{name}</p>
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              presence.active
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                presence.active ? "bg-emerald-500" : "bg-gray-400"
              )}
            />
            {presence.label}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">{phone}</span>
          {isAdmin && conv.vendedor_nome && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="hidden sm:inline-flex items-center gap-1 truncate">
                <UserRound className="w-3 h-3" />
                {conv.vendedor_nome}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <a href={telHref} title="Ligar">
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            <Phone className="w-[18px] h-[18px]" />
          </Button>
        </a>
        <Button
          onClick={onFacilito}
          size="sm"
          className="hidden sm:inline-flex gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          Facilito IA
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onTogglePanel}
          title={panelOpen ? "Ocultar painel" : "Mostrar painel do lead"}
          className={cn(
            "hidden lg:inline-flex text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30",
            panelOpen && "text-violet-600 bg-violet-50 dark:bg-violet-950/30"
          )}
        >
          {panelOpen ? (
            <PanelRightClose className="w-[18px] h-[18px]" />
          ) : (
            <PanelRightOpen className="w-[18px] h-[18px]" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-gray-500">
              <MoreVertical className="w-[18px] h-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onAction?.("lead")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir Lead
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction?.("files")}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Arquivos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePanel}>
              <PanelRightOpen className="w-4 h-4 mr-2" />
              {panelOpen ? "Ocultar painel" : "Painel do lead"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
