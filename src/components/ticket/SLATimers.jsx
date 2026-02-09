import { Card, CardContent } from "@/components/ui/card";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SLATimers({ ticket }) {
  const calculateTimeLeft = (deadline) => {
    if (!deadline) return null;
    const now = new Date();
    const end = new Date(deadline);
    const diff = end - now;
    
    if (diff < 0) return { expired: true, text: 'Vencido' };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { 
      expired: false, 
      text: `${hours}h ${minutes}m`,
      isAtRisk: hours < 4
    };
  };

  const firstResponse = calculateTimeLeft(ticket.sla_first_response_deadline);
  const nextResponse = calculateTimeLeft(ticket.sla_next_response_deadline);
  const resolution = calculateTimeLeft(ticket.sla_resolution_deadline);

  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Ticket Resolvido</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid md:grid-cols-3 gap-4">
          {ticket.first_response_at ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Primeira Resposta</p>
                <p className="font-semibold text-green-600">Concluído</p>
              </div>
            </div>
          ) : firstResponse && (
            <div className="flex items-center gap-3">
              {firstResponse.expired ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <Clock className={`w-5 h-5 ${firstResponse.isAtRisk ? 'text-orange-600' : 'text-blue-600'}`} />
              )}
              <div>
                <p className="text-xs text-gray-500">Primeira Resposta</p>
                <p className={`font-semibold ${
                  firstResponse.expired ? 'text-red-600' : 
                  firstResponse.isAtRisk ? 'text-orange-600' : 'text-blue-600'
                }`}>
                  {firstResponse.text}
                </p>
              </div>
            </div>
          )}

          {nextResponse && (
            <div className="flex items-center gap-3">
              {nextResponse.expired ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <Clock className={`w-5 h-5 ${nextResponse.isAtRisk ? 'text-orange-600' : 'text-blue-600'}`} />
              )}
              <div>
                <p className="text-xs text-gray-500">Próxima Resposta</p>
                <p className={`font-semibold ${
                  nextResponse.expired ? 'text-red-600' : 
                  nextResponse.isAtRisk ? 'text-orange-600' : 'text-blue-600'
                }`}>
                  {nextResponse.text}
                </p>
              </div>
            </div>
          )}

          {resolution && (
            <div className="flex items-center gap-3">
              {resolution.expired ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <Clock className={`w-5 h-5 ${resolution.isAtRisk ? 'text-orange-600' : 'text-blue-600'}`} />
              )}
              <div>
                <p className="text-xs text-gray-500">Resolução</p>
                <p className={`font-semibold ${
                  resolution.expired ? 'text-red-600' : 
                  resolution.isAtRisk ? 'text-orange-600' : 'text-blue-600'
                }`}>
                  {resolution.text}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}