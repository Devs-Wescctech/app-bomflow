import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp } from "lucide-react";

export default function TeamPerformance({ agents, tickets }) {
  const agentStats = agents.map(agent => {
    const agentTickets = tickets.filter(t => t.agent_id === agent.id);
    const resolved = agentTickets.filter(t => t.status === 'resolvido' || t.status === 'fechado').length;
    const total = agentTickets.length;
    const percentage = total > 0 ? (resolved / total) * 100 : 0;

    return {
      ...agent,
      total,
      resolved,
      percentage: Math.round(percentage),
    };
  }).sort((a, b) => b.resolved - a.resolved).slice(0, 5);

  return (
    <Card className="shadow-sm border-gray-200 dark:border-gray-800 h-full">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <div className="flex-1">
            <CardTitle className="text-gray-900 dark:text-gray-100">Performance dos Agentes</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Top 5 por tickets resolvidos</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {agentStats.map((agent, index) => (
            <div key={agent.id} className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {index === 0 && (
                    <div className="absolute -left-2 top-0">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    </div>
                  )}
                  <div className="relative">
                    {agent.photo_url ? (
                      <img 
                        src={agent.photo_url} 
                        alt={agent.name}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-100 dark:ring-blue-900"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-100 dark:ring-blue-900">
                        <span className="text-white text-sm font-semibold">
                          {agent.name?.[0]?.toUpperCase() || 'A'}
                        </span>
                      </div>
                    )}
                    {agent.online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white dark:ring-gray-900"></div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {agent.name || 'Agente'}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{agent.level || 'pleno'}</p>
                      {agent.work_unit && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{agent.work_unit}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {agent.resolved}/{agent.total}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <TrendingUp className="w-3 h-3" />
                    {agent.percentage}%
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Progress value={agent.percentage} className="h-2" />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Taxa de resolução</span>
                  {agent.online ? (
                    <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 text-xs h-5">
                      Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs h-5">Offline</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
          {agentStats.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="font-medium">Nenhum ticket resolvido ainda</p>
              <p className="text-xs mt-1">Os agentes aparecerão aqui conforme resolverem tickets</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}