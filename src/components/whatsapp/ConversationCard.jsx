import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import ChatAvatar from "./ChatAvatar";
import { convName, convNumber, formatListTime, presenceFromConversation } from "./chatHelpers";

// Card de conversa (não parece linha de tabela): avatar, nome, prévia, hora, não-lidas.
export default function ConversationCard({ conv, active, isAdmin, onSelect, index = 0 }) {
  const name = convName(conv);
  const preview = conv.last_message_text || convNumber(conv);
  const unread = conv.unread_count || 0;
  const isOutLast = conv.last_direction === "out";
  const presence = presenceFromConversation(conv);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.02, 0.18) }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(conv)}
      className={cn(
        "group relative w-full text-left rounded-2xl px-3 py-2.5 flex items-center gap-3 border transition-all duration-200",
        active
          ? "bg-gradient-to-r from-violet-50 to-indigo-50/50 dark:from-violet-950/40 dark:to-indigo-950/20 border-violet-200/70 dark:border-violet-800/50 shadow-soft"
          : "bg-transparent border-transparent hover:bg-white hover:border-gray-200/70 dark:hover:bg-gray-800/50 dark:hover:border-gray-700/50 hover:shadow-soft"
      )}
    >
      {active && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500" />
      )}
      <ChatAvatar name={name} url={conv.avatar_url} size={46} showPresence active={presence.active} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "text-sm truncate",
              unread > 0
                ? "font-bold text-gray-900 dark:text-white"
                : "font-semibold text-gray-800 dark:text-gray-100"
            )}
          >
            {name}
          </p>
          <span
            className={cn(
              "text-[11px] flex-shrink-0",
              unread > 0 ? "text-violet-600 dark:text-violet-400 font-semibold" : "text-gray-400"
            )}
          >
            {formatListTime(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={cn(
              "text-xs truncate",
              unread > 0
                ? "text-gray-700 dark:text-gray-200 font-medium"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            {isOutLast && <span className="text-gray-400">Você: </span>}
            {preview}
          </p>
          {unread > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        {isAdmin && conv.vendedor_nome && (
          <p className="text-[10px] text-gray-400 truncate mt-1 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br from-violet-400 to-indigo-400" />
            {conv.vendedor_nome}
          </p>
        )}
      </div>
    </motion.button>
  );
}
