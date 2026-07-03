import { motion } from "framer-motion";
import { Check, CheckCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "./chatHelpers";

// Estados que representam falha de entrega reportada pelo WhatsApp (statusMessage <= 0).
const FAILED_STATUSES = new Set(["failed", "-1", "0"]);

function isFailedStatus(status) {
  return FAILED_STATUSES.has(String(status || "").toLowerCase());
}

// Status de entrega para mensagens enviadas por nós.
function DeliveryStatus({ status }) {
  const s = String(status || "").toLowerCase();
  if (isFailedStatus(s)) return <AlertTriangle className="w-3.5 h-3.5 text-red-200" />;
  if (s === "read" || s === "3") return <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />;
  if (s === "delivered" || s === "2") return <CheckCheck className="w-3.5 h-3.5 text-white/70" />;
  return <Check className="w-3.5 h-3.5 text-white/70" />;
}

// Balão de mensagem premium com agrupamento por autor (cantos adaptativos).
export default function MessageBubble({ msg, iso, isFirstInGroup, isLastInGroup }) {
  const out = msg.direction === "out";
  const failed = out && isFailedStatus(msg.status);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex", out ? "justify-end" : "justify-start", isFirstInGroup ? "mt-3" : "mt-0.5")}
    >
      <div className={cn("flex flex-col max-w-[80%] sm:max-w-[68%]", out ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-3.5 py-2.5 text-sm leading-relaxed rounded-[20px]",
            out
              ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_4px_14px_-4px_rgba(99,102,241,0.5)]"
              : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700/60 shadow-soft",
            // Falha de entrega: contorno vermelho para chamar a atenção do vendedor.
            failed && "ring-1 ring-red-400/70",
            // Cantos adaptativos por grupo: "rabinho" só no último balão da sequência.
            out
              ? cn(!isFirstInGroup && "rounded-tr-md", isLastInGroup && "rounded-br-md")
              : cn(!isFirstInGroup && "rounded-tl-md", isLastInGroup && "rounded-bl-md")
          )}
        >
          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          <div
            className={cn(
              "flex items-center gap-1 justify-end mt-1 -mb-0.5",
              out ? "text-white/70" : "text-gray-400"
            )}
          >
            <span className="text-[10px]">{formatTime(iso)}</span>
            {out && <DeliveryStatus status={msg.status} />}
          </div>
        </div>
        {failed && (
          <span className="mt-1 mr-1 flex items-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400">
            <AlertTriangle className="w-3 h-3" />
            Não entregue
          </span>
        )}
      </div>
    </motion.div>
  );
}
