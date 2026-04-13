import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils"; // Added useNavigate
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
              Headphones, 
              Upload, 
              Play, 
              FileText, 
              Activity, 
              CheckCircle2, 
              XCircle, 
              AlertTriangle,
              Loader2,
              Search,
              User,
              Trash2,
              MoreVertical,
              CheckSquare,
              Settings
            } from "lucide-react";
      import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
      } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CustomAudioPlayer from "@/components/ui/CustomAudioPlayer";

export default function QualityMonitor() {
  const navigate = useNavigate(); // Added navigate
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedChecklist, setSelectedChecklist] = useState(""); // New state for checklist
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['callAudits'],
    queryFn: () => base44.entities.CallAudit.list('-processed_at'),
    initialData: [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['qualityChecklists'],
    queryFn: () => base44.entities.QualityChecklist.list(),
    initialData: [],
  });

  // Set default checklist on load
  useState(() => {
    if (checklists.length > 0 && !selectedChecklist) {
      const defaultCl = checklists.find(c => c.is_default);
      if (defaultCl) setSelectedChecklist(defaultCl.id);
    }
  }, [checklists]);

  const deleteAuditMutation = useMutation({
    mutationFn: (id) => base44.entities.CallAudit.delete(id),
    onSuccess: () => {
      toast.success("Auditoria excluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['callAudits'] });
      setSelectedAudit(null);
    },
    onError: () => toast.error("Erro ao excluir auditoria.")
  });

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta auditoria?")) {
      deleteAuditMutation.mutate(id);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error("Selecione um arquivo de áudio");
      return;
    }

    // Client-side size validation (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (uploadFile.size > MAX_SIZE) {
      toast.error("Arquivo muito grande! O limite é 10MB para garantir o processamento.");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Upload do arquivo
      toast.info("Fazendo upload do áudio...");
      const uploadRes = await base44.integrations.Core.UploadFile({ file: uploadFile });
      
      // 2. Chamar função de processamento
      toast.info("Processando transcrição e análise (pode demorar até 1 minuto)...");
      
      const response = await base44.functions.invoke('processCallAudit', {
        audio_url: uploadRes.file_url,
        agent_id: selectedAgent,
        checklist_id: selectedChecklist, // Passing the selected checklist ID
        ticket_id: null
      });

      if (response.data && response.data.success) {
        toast.success("Auditoria concluída com sucesso!");
        queryClient.invalidateQueries({ queryKey: ['callAudits'] });
        setIsUploadOpen(false);
        setUploadFile(null);
        setSelectedAgent("");
      } else if (response.data && response.data.error) {
        toast.error("Erro: " + response.data.error);
      } else {
        toast.error("Erro inesperado na resposta do servidor");
      }
    } catch (error) {
      console.error("Erro na auditoria:", error);
      
      if (error.response?.status === 502 || error.response?.status === 504) {
        toast.error("Tempo limite excedido. O áudio pode ser muito longo ou o servidor está ocupado. Tente um arquivo menor.");
      } else {
        const errorMsg = error.response?.data?.error || error.message || "Erro desconhecido";
        toast.error("Falha na auditoria: " + errorMsg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return "text-green-600 bg-green-100 border-green-200";
    if (score >= 70) return "text-blue-600 bg-blue-100 border-blue-200";
    if (score >= 50) return "text-yellow-600 bg-yellow-100 border-yellow-200";
    return "text-red-600 bg-red-100 border-red-200";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Headphones className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              Monitoria de Qualidade
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-14">
              Auditoria automática de chamadas e análise de conformidade com IA
            </p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate(createPageUrl("QualityChecklists"))}
                className="hidden sm:flex"
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                Checklists
              </Button>

              <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all hover:shadow-md">
                    <Upload className="w-4 h-4 mr-2" />
                    Nova Auditoria
                  </Button>
                </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  Nova Auditoria de Ligação
                </DialogTitle>
                <DialogDescription className="text-gray-500">
                  Envie a gravação para análise de sentimento, conformidade e performance via IA.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Custom File Input */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Arquivo de Áudio</Label>
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                    uploadFile 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                    <Input 
                      id="audio-upload"
                      type="file" 
                      accept="audio/*" 
                      onChange={(e) => setUploadFile(e.target.files[0])} 
                      className="hidden"
                    />
                    <label htmlFor="audio-upload" className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-2">
                      {uploadFile ? (
                        <>
                          <FileText className="w-8 h-8 text-blue-600" />
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-300 break-all">
                            {uploadFile.name}
                          </span>
                          <span className="text-xs text-blue-600/70">
                            {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-1">
                            <Upload className="w-5 h-5 text-gray-500" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Clique para selecionar
                          </span>
                          <span className="text-xs text-gray-500">
                            MP3 ou WAV (Máx. 10MB)
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Agente Avaliado (Opcional)</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger className="w-full h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o agente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map(agent => (
                        <SelectItem key={agent.id} value={agent.id} className="cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                              {agent.name.charAt(0)}
                            </div>
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Modelo de Avaliação</Label>
                    <button 
                      onClick={() => { setIsUploadOpen(false); navigate(createPageUrl("QualityChecklists")); }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Gerenciar modelos
                    </button>
                  </div>
                  <Select value={selectedChecklist} onValueChange={setSelectedChecklist}>
                    <SelectTrigger className="w-full h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione um checklist..." />
                    </SelectTrigger>
                    <SelectContent>
                      {checklists.map(cl => (
                        <SelectItem key={cl.id} value={cl.id}>
                          {cl.name} {cl.is_default ? "(Padrão)" : ""}
                        </SelectItem>
                      ))}
                      {checklists.length === 0 && (
                        <SelectItem value="default" disabled>Nenhum modelo criado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleUpload} 
                  disabled={!uploadFile || isProcessing || (!selectedChecklist && checklists.length > 0)}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-900/10 transition-all"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando (isso pode levar 1 min)...
                    </>
                  ) : (
                    <div className="flex items-center">
                      <Activity className="w-5 h-5 mr-2" />
                      Iniciar Auditoria IA
                    </div>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Lista de Auditorias */}
          <Card className="md:col-span-1 h-[calc(100vh-200px)] overflow-hidden flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg">Histórico</CardTitle>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." className="pl-8" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0">
              {audits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                    <Activity className="w-8 h-8 text-gray-400" />
                  </div>
                  <p>Nenhuma auditoria encontrada</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {audits.map((audit) => (
                    <div 
                      key={audit.id}
                      onClick={() => setSelectedAudit(audit)}
                      className={`group relative p-4 cursor-pointer transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 ${
                        selectedAudit?.id === audit.id 
                          ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500' 
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                            {audit.agent_name ? audit.agent_name.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                              {audit.agent_name || 'Agente Desconhecido'}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {format(new Date(audit.processed_at), "dd MMM • HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 relative z-20">
                          <div className={`flex items-center justify-center w-9 h-9 rounded-full border-2 text-xs font-bold ${
                            audit.score >= 90 ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20' :
                            audit.score >= 70 ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20' :
                            audit.score >= 50 ? 'border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' :
                            'border-red-500 text-red-600 bg-red-50 dark:bg-red-900/20'
                          }`}>
                            {audit.score}
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem 
                                className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer py-2.5"
                                onClick={(e) => handleDelete(e, audit.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir Auditoria
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                        <Badge variant="outline" className="text-[10px] font-normal border-gray-200 dark:border-gray-700">
                          {audit.analysis?.sentiment || 'Neutro'}
                        </Badge>
                        {audit.duration && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Play className="w-3 h-3" /> {Math.round(audit.duration)}s
                          </span>
                        )}
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detalhes da Auditoria */}
          <Card className="md:col-span-2 h-[calc(100vh-200px)] overflow-hidden flex flex-col">
            {selectedAudit ? (
              <>
                <CardHeader className="border-b pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <User className="w-5 h-5 text-gray-500" />
                        {selectedAudit.agent_name}
                      </CardTitle>
                      <CardDescription>
                        Processado em {format(new Date(selectedAudit.processed_at), "PPP 'às' p", { locale: ptBR })}
                      </CardDescription>
                    </div>
                    <div className="text-center">
                      <span className="text-sm text-gray-500 uppercase font-bold">Score</span>
                      <div className={`text-3xl font-bold px-4 py-1 rounded-lg border ${getScoreColor(selectedAudit.score)}`}>
                      {selectedAudit.score}
                      </div>
                      </div>
                      {selectedAudit.estimated_cost_usd !== undefined && (
                      <div className="mt-2 text-right">
                      <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-200">
                        Custo Est.: US$ {selectedAudit.estimated_cost_usd.toFixed(4)}
                      </Badge>
                      </div>
                      )}
                      </div>

                      {selectedAudit.audio_url && (
                        <div className="mt-6 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 flex items-center gap-4 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gravação da Chamada</span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">Áudio original da conversa</span>
                              </div>
                            </div>

                            <div className="w-full pt-2">
                              <CustomAudioPlayer 
                                src={selectedAudit.audio_url} 
                                duration={selectedAudit.duration} 
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      </CardHeader>
                
                <CardContent className="flex-1 overflow-hidden p-0">
                  <Tabs defaultValue="analysis" className="h-full flex flex-col">
                    <div className="px-6 pt-4 border-b border-gray-100 dark:border-gray-800">
                      <TabsList className="bg-transparent p-0 w-full justify-start gap-6 h-auto">
                        <TabsTrigger 
                          value="analysis"
                          className="rounded-none border-b-2 border-transparent px-0 py-3 text-gray-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                        >
                          <Activity className="w-4 h-4 mr-2" />
                          Análise da IA
                        </TabsTrigger>
                        <TabsTrigger 
                          value="transcription"
                          className="rounded-none border-b-2 border-transparent px-0 py-3 text-gray-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Transcrição e Diálogo
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="analysis" className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50 dark:bg-gray-900/50">
                      {/* Resumo e Sentimento */}
                      <div className="grid gap-4">
                        <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                          <CardContent className="pt-6">
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                              <Activity className="w-5 h-5 text-blue-600" /> 
                              Resumo Executivo
                            </h3>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              {selectedAudit.analysis?.summary}
                            </p>
                            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800 flex items-center gap-2">
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Sentimento Detectado:</span>
                              <Badge variant="outline" className="bg-white dark:bg-gray-800 border-blue-200 text-blue-700">
                                {selectedAudit.analysis?.sentiment}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Pontos Fortes e Melhoria */}
                      <div className="grid md:grid-cols-2 gap-6">
                        <Card className="border-green-100 dark:border-green-900/50 shadow-sm">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5" /> 
                              Pontos Fortes
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-3">
                              {selectedAudit.analysis?.strengths?.map((point, idx) => (
                                <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-3">
                                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 shadow-sm" />
                                  <span className="leading-snug">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>

                        <Card className="border-orange-100 dark:border-orange-900/50 shadow-sm">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5" /> 
                              Pontos de Atenção
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-3">
                              {selectedAudit.analysis?.improvements?.map((point, idx) => (
                                <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-3">
                                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 shadow-sm" />
                                  <span className="leading-snug">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Checklist Visual */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 pl-1">Checklist de Conformidade</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedAudit.analysis?.compliance_checklist?.map((item, idx) => (
                            <div key={idx} className={`flex items-center justify-between p-4 border rounded-xl transition-all ${
                              item.status 
                                ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
                                : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  item.status ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                }`}>
                                  {item.status ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                </div>
                                <span className={`text-sm font-medium ${item.status ? 'text-gray-700 dark:text-gray-200' : 'text-red-700 dark:text-red-300'}`}>
                                  {item.item}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="transcription" className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-950">
                      {selectedAudit.dialogue && selectedAudit.dialogue.length > 0 ? (
                        <div className="space-y-6 max-w-3xl mx-auto">
                          {selectedAudit.dialogue.map((msg, idx) => {
                            const isAgent = msg.speaker === 'Agente';
                            return (
                              <div 
                                key={idx} 
                                className={`flex gap-4 ${isAgent ? 'flex-row-reverse' : 'flex-row'}`}
                              >
                                {/* Avatar */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                                  isAgent 
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                }`}>
                                  {isAgent ? <Headphones className="w-5 h-5" /> : <User className="w-5 h-5" />}
                                </div>

                                {/* Bubble */}
                                <div className={`flex flex-col max-w-[75%] ${isAgent ? 'items-end' : 'items-start'}`}>
                                  <span className="text-xs text-gray-400 mb-1 px-1">
                                    {isAgent ? selectedAudit.agent_name || 'Agente' : 'Cliente'}
                                  </span>
                                  <div className={`rounded-2xl px-5 py-3 shadow-sm border ${
                                    isAgent 
                                      ? 'bg-blue-50 border-blue-100 text-gray-800 rounded-tr-none dark:bg-blue-900/20 dark:border-blue-900 dark:text-gray-200' 
                                      : 'bg-white border-gray-100 text-gray-800 rounded-tl-none dark:bg-gray-900 dark:border-gray-800 dark:text-gray-300'
                                  }`}>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                      {msg.text}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                          <FileText className="w-12 h-12 opacity-20" />
                          <p>Transcrição em formato de texto simples</p>
                          <div className="w-full max-w-3xl p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300 leading-loose">
                            {selectedAudit.transcription}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 dark:bg-gray-900/50">
                <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm mb-6 border border-gray-100 dark:border-gray-800">
                  <Headphones className="w-10 h-10 text-blue-500/50" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Nenhuma auditoria selecionada
                </h3>
                <p className="text-gray-500 max-w-xs leading-relaxed mb-8">
                  Selecione uma gravação na lista ao lado ou inicie uma nova auditoria.
                </p>
                <Button onClick={() => setIsUploadOpen(true)} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950">
                  <Upload className="w-4 h-4 mr-2" />
                  Nova Auditoria
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}