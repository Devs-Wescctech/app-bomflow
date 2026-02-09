import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Loader2, ArrowLeft, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function PortalValidateToken() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [phone, setPhone] = useState("");
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutos em segundos

  useEffect(() => {
    // Recuperar sessionId do localStorage
    const storedSessionId = localStorage.getItem('portal_session_id');
    const storedPhone = localStorage.getItem('portal_phone');

    if (!storedSessionId) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    setSessionId(storedSessionId);
    setPhone(storedPhone || '');

    // Contador regressivo
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token || token.length !== 6) {
      setError("Digite o código de 6 dígitos");
      return;
    }

    setIsLoading(true);

    try {
      const response = await base44.functions.invoke('validateToken', {
        sessionId: sessionId,
        token: token,
      });

      if (response.data.success) {
        console.log('✅ Token validado com sucesso:', response.data);
        
        // Salvar TODOS os dados no localStorage
        localStorage.setItem('portal_contact', JSON.stringify(response.data.contact));
        localStorage.setItem('portal_contract', JSON.stringify(response.data.contract));
        localStorage.setItem('portal_authenticated', 'true');
        localStorage.setItem('portal_contact_id', response.data.contact.id);
        localStorage.setItem('portal_contact_name', response.data.contact.name);
        
        // Manter o sessionId para validação
        // Já está salvo, mas vamos garantir
        localStorage.setItem('portal_validated_session', sessionId);

        toast.success('Acesso autorizado! Redirecionando...');
        
        // Pequeno delay para o toast aparecer
        setTimeout(() => {
          // Usar window.location para forçar reload completo
          window.location.href = createPageUrl("PortalHome");
        }, 500);
      } else {
        setError(response.data.error || 'Código inválido');
      }
    } catch (err) {
      console.error('❌ Erro na validação:', err);
      setError(err.response?.data?.error || 'Código inválido ou expirado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = () => {
    // Limpar storage e voltar para login
    localStorage.removeItem('portal_session_id');
    localStorage.removeItem('portal_phone');
    navigate(createPageUrl("PortalLogin"));
    toast.info('Solicite um novo código');
  };

  const maskPhone = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.substring(0,2)}) ${cleaned.substring(2,7)}-****`;
    }
    return phone;
  };

  if (timeLeft === 0) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center overflow-auto">
        <Card className="w-full max-w-md mx-6 shadow-xl">
          <CardContent className="pt-6 text-center">
            <Clock className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Código Expirado</h2>
            <p className="text-gray-600 mb-6">
              O código de acesso expirou. Solicite um novo código para continuar.
            </p>
            <Button
              onClick={handleResendCode}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Solicitar Novo Código
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center overflow-auto">
      <div className="w-full max-w-md mx-auto px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("PortalLogin"))}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <div className="text-center mb-8">
          <img 
            src="https://grupobompastor.com.br/site/wp-content/uploads/2024/10/logo-grupo-bom-pastor-maior.png" 
            alt="Grupo Bom Pastor" 
            className="h-20 mx-auto mb-6 object-contain"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Validar Código</h1>
          <p className="text-gray-600">Digite o código enviado para seu WhatsApp</p>
        </div>

        <Card className="shadow-xl border-gray-200">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-purple-50">
            <CardTitle className="text-center text-gray-900">
              Código de Acesso
            </CardTitle>
            {phone && (
              <p className="text-sm text-gray-600 text-center mt-2">
                Enviado para {maskPhone(phone)}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="000000"
                  value={token}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setToken(value);
                      setError("");
                    }
                  }}
                  maxLength={6}
                  disabled={isLoading}
                  className="text-center text-2xl font-bold tracking-widest"
                  autoFocus
                />
                <p className="text-xs text-gray-500 text-center mt-2">
                  Digite o código de 6 dígitos
                </p>
              </div>

              {/* Contador */}
              <div className="flex items-center justify-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className={timeLeft < 300 ? "text-red-600 font-medium" : "text-gray-600"}>
                  Expira em {formatTime(timeLeft)}
                </span>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isLoading || token.length !== 6}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  'Validar e Acessar'
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleResendCode}
                disabled={isLoading}
                className="w-full"
              >
                Não recebeu? Solicitar novo código
              </Button>
            </form>
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