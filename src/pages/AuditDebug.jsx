import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Play, FileAudio, FileText, BrainCircuit, Bug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AuditDebug() {
  const [audioUrl, setAudioUrl] = useState("");
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState("");

  const addLog = (type, message, data = null) => {
    setLogs(prev => [...prev, { 
      timestamp: new Date().toLocaleTimeString(), 
      type, 
      message, 
      data 
    }]);
  };

  const clearLogs = () => setLogs([]);

  const runTest = async (step) => {
    if (!audioUrl) {
      addLog('error', 'Por favor, insira uma URL de áudio válida.');
      return;
    }

    setIsLoading(true);
    setCurrentStep(step);
    addLog('info', `Iniciando teste: ${step.toUpperCase()}...`);

    try {
      const response = await base44.functions.invoke('processCallAudit', {
        audio_url: audioUrl,
        debug_step: step, // Parâmetro especial para controlar o fluxo
        agent_id: 'debug_test',
        ticket_id: 'debug_test'
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      addLog('success', `Sucesso na etapa: ${step}`, response.data);
      
    } catch (error) {
      console.error("Erro no teste:", error);
      const errorMessage = error.response?.data?.error || error.message || "Erro desconhecido";
      addLog('error', `Falha na etapa ${step}: ${errorMessage}`, error.response?.data);
    } finally {
      setIsLoading(false);
      setCurrentStep("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <Bug className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Debug de Auditoria</h1>
            <p className="text-gray-500 dark:text-gray-400">Teste cada etapa do processo de IA isoladamente</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuração do Teste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">URL do Áudio (MP3/WAV)</label>
              <div className="flex gap-2">
                <Input 
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://exemplo.com/gravacao.mp3"
                  className="font-mono text-sm"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Dica: Use uma URL pública e direta para o arquivo de áudio.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => runTest('download')}
                disabled={isLoading}
                className="border-blue-200 hover:bg-blue-50 text-blue-700"
              >
                <FileAudio className="w-4 h-4 mr-2" />
                1. Testar Download
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => runTest('transcribe')}
                disabled={isLoading}
                className="border-purple-200 hover:bg-purple-50 text-purple-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                2. Testar Transcrição
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => runTest('full')}
                disabled={isLoading}
                className="border-green-200 hover:bg-green-50 text-green-700"
              >
                <BrainCircuit className="w-4 h-4 mr-2" />
                3. Teste Completo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-gray-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-mono">Console de Logs</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearLogs} className="text-xs h-8">
              Limpar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs h-[400px] overflow-y-auto space-y-3">
              {logs.length === 0 && (
                <div className="text-gray-500 text-center mt-10">
                  Aguardando execução de testes...
                </div>
              )}
              {logs.map((log, idx) => (
                <div key={idx} className="border-b border-gray-800 pb-2 last:border-0">
                  <div className="flex gap-2 mb-1">
                    <span className="text-gray-500">[{log.timestamp}]</span>
                    {log.type === 'info' && <span className="text-blue-400">INFO:</span>}
                    {log.type === 'success' && <span className="text-green-400">SUCCESS:</span>}
                    {log.type === 'error' && <span className="text-red-400">ERROR:</span>}
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                  {log.data && (
                    <pre className="text-gray-500 ml-[70px] overflow-x-auto custom-scrollbar">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}