import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Loader2, MessageSquare, Calendar, CreditCard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!cpf || cpf.length < 14) {
      setError("Digite um CPF válido");
      return;
    }

    if (!birthDate) {
      setError("Digite sua data de nascimento");
      return;
    }

    setIsLoading(true);

    try {
      const response = await base44.functions.invoke('portalAuth', {
        cpf: cpf,
        birthDate: birthDate,
      });

      if (response.data.success) {
        console.log('✅ Código enviado com sucesso');
        
        // Salvar sessionId no localStorage
        localStorage.setItem('portal_session_id', response.data.sessionId);
        localStorage.setItem('portal_phone', response.data.phone);

        toast.success('Código enviado para seu WhatsApp!');
        
        // Navegar para validação do token
        navigate(createPageUrl("PortalValidateToken"));
      } else {
        setError(response.data.error || 'Erro ao enviar código');
      }
    } catch (err) {
      console.error('❌ Erro no login:', err);
      setError(err.response?.data?.error || 'CPF ou data de nascimento incorretos');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center overflow-auto">
      <div className="w-full max-w-md mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <img 
            src="https://grupobompastor.com.br/site/wp-content/uploads/2024/10/logo-grupo-bom-pastor-maior.png" 
            alt="Grupo Bom Pastor" 
            className="h-20 mx-auto mb-6 object-contain"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Portal do Cliente</h1>
          <p className="text-gray-600">Grupo Bom Pastor</p>
        </div>

        <Card className="shadow-xl border-gray-200">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-purple-50">
            <CardTitle className="text-center text-gray-900">
              Acesso Seguro
            </CardTitle>
            <p className="text-sm text-gray-600 text-center mt-2">
              Informe seus dados para receber o código de acesso
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="cpf" className="flex items-center gap-2 text-gray-900">
                  <CreditCard className="w-4 h-4" />
                  CPF do Titular
                </Label>
                <Input
                  id="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={handleCpfChange}
                  maxLength={14}
                  disabled={isLoading}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="birthDate" className="flex items-center gap-2 text-gray-900">
                  <Calendar className="w-4 h-4" />
                  Data de Nascimento
                </Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="mt-1"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isLoading || !cpf || !birthDate}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando código...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-5 h-5 mr-2" />
                    Enviar Código via WhatsApp
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-start gap-3 text-sm text-gray-600">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 mb-1">Segurança e Privacidade</p>
                  <p className="text-xs">
                    Seus dados são protegidos e o código de acesso é válido por apenas 15 minutos.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Problemas para acessar?{" "}
            <a href="tel:08009501010" className="text-blue-600 hover:text-blue-700 font-medium">
              Ligue 0800 950 1010
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}