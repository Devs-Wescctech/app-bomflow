
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Zap, Calendar, User, FileText, Filter, Plus, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function QuickServiceList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['quickServices'],
    queryFn: () => base44.entities.QuickService.list('-createdDate', 500),
    initialData: [],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list(),
    initialData: [],
  });

  const filteredServices = services.filter(service => {
    // Filtro de categoria
    if (categoryFilter !== "all" && service.category !== categoryFilter) return false;
    
    // Filtro de canal
    if (channelFilter !== "all" && service.channel !== channelFilter) return false;
    
    // Filtro de data
    if (startDate && new Date(service.created_date) < new Date(startDate)) return false;
    if (endDate && new Date(service.created_date) > new Date(endDate)) return false;
    
    // Filtro de busca
    if (searchQuery) {
      // Find contact for filtering purposes, as service might not always contain contact_name/cpf directly.
      const contact = contacts.find(c => c.id === service.contact_id); 
      const searchLower = searchQuery.toLowerCase();
      
      if (
        !service.description?.toLowerCase().includes(searchLower) &&
        !service.service_type?.toLowerCase().includes(searchLower) &&
        !service.protocol_number?.toLowerCase().includes(searchLower) &&
        !contact?.name?.toLowerCase().includes(searchLower) && // Uses contact.name for search
        !service.handled_by_name?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    
    return true;
  });

  const categoryColors = {
    "Médico": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    "Financeiro": "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    "Cadastro": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    "Comercial": "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    "Administrativo": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    "Sinistro": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  };

  const channelIcons = {
    "Presencial": "🏢",
    "Telefone": "📞",
    "WhatsApp": "💬",
    "Email": "📧",
    "Chat Online": "💻",
  };

  const totalServices = services.length;
  const todayServices = services.filter(s => {
    const today = new Date();
    const serviceDate = new Date(s.created_date);
    return serviceDate.toDateString() === today.toDateString();
  }).length;

  const categoriesCount = services.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Zap className="w-8 h-8 text-yellow-500" />
              Atendimentos Rápidos
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Histórico de atendimentos registrados
            </p>
          </div>
          <Link to={createPageUrl("QuickServiceRegister")}>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Atendimento
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total</p>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{totalServices}</p>
                </div>
                <FileText className="w-10 h-10 text-blue-500 dark:text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">Hoje</p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-300">{todayServices}</p>
                </div>
                <Calendar className="w-10 h-10 text-green-500 dark:text-green-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Categoria Mais Usada</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                    {Object.keys(categoriesCount).length > 0 
                      ? Object.keys(categoriesCount).reduce((a, b) => categoriesCount[a] > categoriesCount[b] ? a : b)
                      : 'N/A'
                    }
                  </p>
                </div>
                <Zap className="w-10 h-10 text-purple-500 dark:text-purple-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Filtrados</p>
                  <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{filteredServices.length}</p>
                </div>
                <Filter className="w-10 h-10 text-orange-500 dark:text-orange-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid md:grid-cols-5 gap-4">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Buscar</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Protocolo, nome, descrição..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Categoria</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="Médico">Médico</SelectItem>
                    <SelectItem value="Financeiro">Financeiro</SelectItem>
                    <SelectItem value="Cadastro">Cadastro</SelectItem>
                    <SelectItem value="Comercial">Comercial</SelectItem>
                    <SelectItem value="Administrativo">Administrativo</SelectItem>
                    <SelectItem value="Sinistro">Sinistro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Canal</label>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Presencial">Presencial</SelectItem>
                    <SelectItem value="Telefone">Telefone</SelectItem>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Chat Online">Chat Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Data Início</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 bg-white dark:bg-gray-800"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Data Fim</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 bg-white dark:bg-gray-800"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Atendimentos */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900 dark:text-gray-100">
                Atendimentos ({filteredServices.length})
              </CardTitle>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="p-12 text-center">
                <Zap className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Nenhum atendimento encontrado
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Ajuste os filtros ou registre um novo atendimento
                </p>
                <Link to={createPageUrl("QuickServiceRegister")}>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Atendimento
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredServices.map(service => {
                  // Keep contact variable for potential uses like search or if service properties are missing
                  const contact = contacts.find(c => c.id === service.contact_id); 
                  const protocol = `QS-${service.id.slice(0, 8).toUpperCase()}`;
                  
                  return (
                    <div key={service.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">{channelIcons[service.channel]}</span>
                            <div>
                              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                                {service.service_type}
                              </h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Protocolo: <span className="font-mono font-semibold">{protocol}</span>
                              </p>
                            </div>
                          </div>

                          <p className="text-gray-700 dark:text-gray-300 mb-3">
                            {service.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <Badge className={categoryColors[service.category]}>
                              {service.category}
                            </Badge>
                            <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800">
                              {service.channel}
                            </Badge>
                            {service.contact_name && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {service.contact_name}
                              </Badge>
                            )}
                            {service.contact_cpf && (
                              <Badge variant="outline" className="font-mono text-xs">
                                CPF: {service.contact_cpf}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {format(new Date(service.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {service.handled_by_name || service.handled_by}
                            </span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                            <Zap className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      </div>

                      {service.notes && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Obs:</strong> {service.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
