
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Download, CreditCard, AlertCircle, CheckCircle, Clock, Copy } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function PortalBoletos() {
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [contract, setContract] = useState(null);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    const contractData = localStorage.getItem('portal_contract');

    if (contactData) setContact(JSON.parse(contactData));
    if (contractData) setContract(JSON.parse(contractData));
  }, [navigate]);

  if (!contact || !contract) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Mock de boletos (em produção, isso viria do backend)
  const boletos = [
    {
      id: '1',
      mes: 'Dezembro/2025',
      vencimento: '2025-12-10',
      valor: contract.monthly_value,
      status: 'pendente',
      linhaDigitavel: '23790.00029 00000.000000 00000.000000 0 00000000000000',
      codigoBarras: '23790000900000000000000000000000000000000000',
    },
    {
      id: '2',
      mes: 'Janeiro/2026',
      vencimento: '2026-01-10',
      valor: contract.monthly_value,
      status: 'aberto',
      linhaDigitavel: '23790.00029 00000.000001 00000.000000 0 00000000000000',
      codigoBarras: '23790000900000000000000000000000000000000001',
    },
    {
      id: '3',
      mes: 'Novembro/2025',
      vencimento: '2025-11-10',
      valor: contract.monthly_value,
      status: 'pago',
      dataPagamento: '2025-11-08',
    },
    {
      id: '4',
      mes: 'Outubro/2025',
      vencimento: '2025-10-10',
      valor: contract.monthly_value,
      status: 'pago',
      dataPagamento: '2025-10-09',
    },
  ];

  const handleCopyLine = (linha) => {
    navigator.clipboard.writeText(linha);
    toast.success('Linha digitável copiada!');
  };

  const handleDownloadPDF = (boleto) => {
    toast.info('Gerando PDF do boleto...');
    // Aqui você implementaria a geração/download do PDF
  };

  const boletosVencidos = boletos.filter(b => 
    b.status === 'pendente' && new Date(b.vencimento) < new Date()
  );

  const boletosAbertos = boletos.filter(b => 
    b.status === 'aberto' || (b.status === 'pendente' && new Date(b.vencimento) >= new Date())
  );

  const boletosPagos = boletos.filter(b => b.status === 'pago');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="w-full px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("PortalHome"))}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">2ª Via de Boletos</h1>
              <p className="text-sm text-gray-600">Acesse e baixe seus boletos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full p-6 space-y-6">
        {/* Alertas */}
        {boletosVencidos.length > 0 && (
          <Alert className="bg-red-50 border-red-300">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Atenção!</strong> Você possui {boletosVencidos.length} boleto(s) vencido(s). 
              Regularize sua situação para manter seu plano ativo.
            </AlertDescription>
          </Alert>
        )}

        {contract.payment_status === 'up_to_date' && boletosVencidos.length === 0 && (
          <Alert className="bg-green-50 border-green-300">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <AlertDescription className="text-green-800">
              Parabéns! Seus pagamentos estão em dia. Continue mantendo seu plano regularizado.
            </AlertDescription>
          </Alert>
        )}

        {/* Boletos Vencidos */}
        {boletosVencidos.length > 0 && (
          <Card className="shadow-lg border-red-300 bg-red-50">
            <CardHeader className="bg-gradient-to-r from-red-100 to-red-50 border-b border-red-200">
              <CardTitle className="flex items-center gap-2 text-red-900">
                <AlertCircle className="w-5 h-5" />
                Boletos Vencidos ({boletosVencidos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {boletosVencidos.map(boleto => (
                  <Card key={boleto.id} className="border-red-200 bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1">{boleto.mes}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4" />
                            Vencido em {format(new Date(boleto.vencimento), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-red-600">
                            R$ {boleto.valor?.toFixed(2).replace('.', ',')}
                          </p>
                          <Badge className="bg-red-100 text-red-700 mt-1">VENCIDO</Badge>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg mb-3">
                        <p className="text-xs text-gray-600 mb-1">Linha Digitável</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono flex-1 break-all">{boleto.linhaDigitavel}</code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyLine(boleto.linhaDigitavel)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleDownloadPDF(boleto)}
                        className="w-full bg-red-600 hover:bg-red-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Boleto Atualizado
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Boletos em Aberto */}
        {boletosAbertos.length > 0 && (
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Boletos em Aberto ({boletosAbertos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {boletosAbertos.map(boleto => (
                  <Card key={boleto.id} className="border-blue-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1">{boleto.mes}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4" />
                            Vence em {format(new Date(boleto.vencimento), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            R$ {boleto.valor?.toFixed(2).replace('.', ',')}
                          </p>
                          <Badge className="bg-blue-100 text-blue-700 mt-1">EM ABERTO</Badge>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg mb-3">
                        <p className="text-xs text-gray-600 mb-1">Linha Digitável</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono flex-1 break-all">{boleto.linhaDigitavel}</code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyLine(boleto.linhaDigitavel)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleDownloadPDF(boleto)}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Boleto PDF
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Boletos Pagos */}
        {boletosPagos.length > 0 && (
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Boletos Pagos ({boletosPagos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {boletosPagos.map(boleto => (
                  <div key={boleto.id} className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{boleto.mes}</h4>
                      <p className="text-sm text-gray-600">
                        Pago em {format(new Date(boleto.dataPagamento), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-700">
                        R$ {boleto.valor?.toFixed(2).replace('.', ',')}
                      </p>
                      <Badge className="bg-green-100 text-green-700 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        PAGO
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Informações */}
        <Card className="shadow-lg bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-3">💡 Informações Importantes</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• Os boletos vencem todo dia {contract.payment_due_day || 10} de cada mês</li>
              <li>• Após o vencimento, acesse a 2ª via atualizada com juros e multa</li>
              <li>• O pagamento pode levar até 3 dias úteis para ser confirmado</li>
              <li>• Guarde o comprovante de pagamento por até 6 meses</li>
              <li>• Em caso de dúvidas, entre em contato: 0800 777 1234</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
