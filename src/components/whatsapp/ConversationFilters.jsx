import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Barra de busca moderna + chips de filtro rápido. O filtro opera apenas sobre os dados já
// carregados (client-side) — não altera nenhuma chamada de API nem regra de negócio.
export default function ConversationFilters({ search, onSearch, activeFilter, onFilter, filters, counts }) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar conversa..."
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-gray-100/80 dark:bg-gray-800/60 border border-transparent focus:border-violet-300 dark:focus:border-violet-700 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-violet-200/60 dark:focus:ring-violet-900/40 text-sm outline-none transition-all placeholder:text-gray-400"
        />
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {filters.map((f) => {
          const isActive = activeFilter === f.key;
          const count = counts?.[f.key] || 0;
          return (
            <button
              key={f.key}
              onClick={() => onFilter(f.key)}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium transition-all duration-200 border",
                isActive
                  ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white border-transparent shadow-sm"
                  : "bg-white/70 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border-gray-200/70 dark:border-gray-700/60 hover:border-violet-300 hover:text-violet-600 dark:hover:text-violet-400"
              )}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-[16px] h-4 px-1 rounded-full text-[10px] flex items-center justify-center",
                    isActive ? "bg-white/25 text-white" : "bg-gray-200/80 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
