import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, avatarGradient } from "./chatHelpers";

// Avatar com fallback em gradiente + iniciais e indicador de presença opcional.
export default function ChatAvatar({
  name,
  url,
  size = 44,
  showPresence = false,
  active = false,
  className,
}) {
  const real = url && !url.includes("avatar-default");
  const dot = Math.max(9, Math.round(size * 0.26));
  return (
    <div className={cn("relative flex-shrink-0", className)} style={{ width: size, height: size }}>
      {real ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full rounded-full object-cover ring-2 ring-white dark:ring-gray-900 shadow-sm"
        />
      ) : (
        <div
          className={cn(
            "w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold ring-2 ring-white dark:ring-gray-900 shadow-sm select-none",
            avatarGradient(name)
          )}
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {initials(name) || <User className="w-1/2 h-1/2" />}
        </div>
      )}
      {showPresence && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-gray-900",
            active ? "bg-emerald-400" : "bg-gray-300 dark:bg-gray-600"
          )}
          style={{ width: dot, height: dot }}
        >
          {active && (
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
          )}
        </span>
      )}
    </div>
  );
}
