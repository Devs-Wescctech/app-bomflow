import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import TicketCard from "./TicketCard";

const colorClasses = {
  blue: {
    bg: "bg-blue-500 dark:bg-blue-600",
    header: "bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700",
  },
  purple: {
    bg: "bg-purple-500 dark:bg-purple-600",
    header: "bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700",
  },
  yellow: {
    bg: "bg-yellow-500 dark:bg-yellow-600",
    header: "bg-gradient-to-r from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700",
  },
  orange: {
    bg: "bg-orange-500 dark:bg-orange-600",
    header: "bg-gradient-to-r from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700",
  },
  green: {
    bg: "bg-green-500 dark:bg-green-600",
    header: "bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700",
  },
};

export default function StatusColumn({ status, tickets, onStatusChange }) {
  const colors = colorClasses[status.color];

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full">
      <Card className="flex flex-col h-full shadow-sm border-gray-200 dark:border-gray-800">
        <CardHeader className={`pb-3 ${colors.header} text-white rounded-t-lg`}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{status.label}</CardTitle>
            <Badge variant="secondary" className="bg-white/20 text-white font-semibold backdrop-blur-sm">
              {status.count || tickets.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 dark:bg-gray-900">
          {tickets.map(ticket => (
            <TicketCard 
              key={ticket.id} 
              ticket={ticket}
              onStatusChange={onStatusChange}
            />
          ))}
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p>Nenhum ticket</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}