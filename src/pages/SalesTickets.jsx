import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, Clock, CheckCircle2, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

const priorityColors = {
  P1: "bg-red-100 text-red-700 border-red-300",
  P2: "bg-orange-100 text-orange-700 border-orange-300",
  P3: "bg-blue-100 text-blue-700 border-blue-300",
  P4: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function SalesTickets() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQueue, setSelectedQueue] = useState("all");

  const { data: tickets = [] } = useQuery({
    queryKey: ['salesTickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate');
      return allTickets.filter(t => t.ticket_type === 'sales');
    },
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = !searchQuery || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesQueue = selectedQueue === "all" || ticket.queue_id === selectedQueue;
    return matchesSearch && matchesQueue;
  });

  const preSalesTickets = filteredTickets.filter(t => t.category === 'pre_sales' && !['resolved', 'closed'].includes(t.status));
  const postSalesTickets = filteredTickets.filter(t => t.category === 'post_sales' && !['resolved', 'closed'].includes(t.status));
  const confirmedTickets = filteredTickets.filter(t => t.status === 'resolved' || t.status === 'closed');

  const renderTicketList = (ticketList, emptyMessage) => (
    <div className="space-y-3">
      {ticketList.map(ticket => (
        <Link 
          key={ticket.id}
          to={`${createPageUrl("SalesTicketView")}?id=${ticket.id}`}
        >
          <div className="p-4 border border-gray-200 rounded-lg hover:shadow-lg hover:border-blue-500 transition-all bg-white cursor-pointer">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
                    {ticket.priority}
                  </Badge>
                  <Badge className={
                    ticket.category === 'pre_sales' ? 'bg-blue-100 text-blue-700' :
                    ticket.category === 'post_sales' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                  }>
                    {ticket.category === 'pre_sales' ? 'Pré-Venda' : 
                     ticket.category === 'post_sales' ? 'Pós-Venda' : 
                     'Confirmado'}
                  </Badge>
                </div>
                <h4 className="font-semibold text-gray-900 truncate mb-1">
                  {ticket.subject}
                </h4>
                <p className="text-sm text-gray-500">
                  {ticket.channel}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
      {ticketList.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tickets de Vendas</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Pré-Venda e Pós-Venda
          </p>
        </div>
        <Link to={createPageUrl("CreateSalesTicket")}>
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Package className="w-4 h-4 mr-2" />
            Novo Ticket de Venda
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <Card className="border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white"
              />
            </div>
            <Select value={selectedQueue} onValueChange={setSelectedQueue}>
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="Todas as filas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                {queues.map(queue => (
                  <SelectItem key={queue.id} value={queue.id}>{queue.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gray-200 bg-white hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pré-Venda</p>
                <p className="text-3xl font-bold text-blue-600">{preSalesTickets.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Package className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pós-Venda</p>
                <p className="text-3xl font-bold text-purple-600">{postSalesTickets.length}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl">
                <Clock className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Confirmados</p>
                <p className="text-3xl font-bold text-green-600">{confirmedTickets.length}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="border-gray-200 bg-white shadow-sm">
        <CardHeader className="border-b border-gray-200">
          <CardTitle className="text-gray-900">Tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="pre_sales">
            <TabsList className="mb-4 bg-gray-100">
              <TabsTrigger value="pre_sales" className="data-[state=active]:bg-white">
                Pré-Venda ({preSalesTickets.length})
              </TabsTrigger>
              <TabsTrigger value="post_sales" className="data-[state=active]:bg-white">
                Pós-Venda ({postSalesTickets.length})
              </TabsTrigger>
              <TabsTrigger value="confirmed" className="data-[state=active]:bg-white">
                Confirmados ({confirmedTickets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pre_sales">
              {renderTicketList(preSalesTickets, "Nenhum ticket em Pré-Venda")}
            </TabsContent>

            <TabsContent value="post_sales">
              {renderTicketList(postSalesTickets, "Nenhum ticket em Pós-Venda")}
            </TabsContent>

            <TabsContent value="confirmed">
              {renderTicketList(confirmedTickets, "Nenhuma venda confirmada")}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}