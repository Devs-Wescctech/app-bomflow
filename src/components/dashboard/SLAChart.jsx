import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function SLAChart({ tickets }) {
  const slaData = [
    {
      name: "P1",
      atendidos: tickets.filter(t => t.priority === "P1" && t.sla_first_response_met).length,
      violados: tickets.filter(t => t.priority === "P1" && t.sla_breached).length,
    },
    {
      name: "P2",
      atendidos: tickets.filter(t => t.priority === "P2" && t.sla_first_response_met).length,
      violados: tickets.filter(t => t.priority === "P2" && t.sla_breached).length,
    },
    {
      name: "P3",
      atendidos: tickets.filter(t => t.priority === "P3" && t.sla_first_response_met).length,
      violados: tickets.filter(t => t.priority === "P3" && t.sla_breached).length,
    },
    {
      name: "P4",
      atendidos: tickets.filter(t => t.priority === "P4" && t.sla_first_response_met).length,
      violados: tickets.filter(t => t.priority === "P4" && t.sla_breached).length,
    },
  ];

  const totalMet = slaData.reduce((sum, d) => sum + d.atendidos, 0);
  const totalBreached = slaData.reduce((sum, d) => sum + d.violados, 0);
  const slaHitRate = totalMet + totalBreached > 0 
    ? ((totalMet / (totalMet + totalBreached)) * 100).toFixed(1)
    : 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Performance de SLA</CardTitle>
          <p className="text-sm text-gray-500 mt-1">Taxa de cumprimento por prioridade</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-green-600">{slaHitRate}%</div>
          <div className="text-xs text-gray-500">SLA Hit Rate</div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={slaData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="atendidos" fill="#00c853" name="Dentro do SLA" />
            <Bar dataKey="violados" fill="#f44336" name="Violados" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}