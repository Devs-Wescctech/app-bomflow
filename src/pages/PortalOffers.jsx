import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  CheckCircle, 
  Phone, 
  Video, 
  Clock, 
  Users, 
  Shield,
  Heart,
  Headphones,
  MessageSquare,
  Star,
  Gift,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import { createPageUrl } from "@/utils";

export default function PortalOffers() {
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    if (contactData) {
      setContact(JSON.parse(contactData));
    }
  }, [navigate]);

  const handleContactWhatsApp = () => {
    const phone = "5519934046200";
    const message = encodeURIComponent(`Olá! Tenho interesse no Bom Med por R$ 59,90. Meu nome é ${contact?.name || ''}.`);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const telemedicineFeatures = [
    {
      icon: Video,
      title: "Consultas por Videochamada",
      description: "Atendimento médico por videochamada 24h"
    },
    {
      icon: Phone,
      title: "Atendimento Telefônico",
      description: "Fale com médicos 24h por dia"
    },
    {
      icon: Clock,
      title: "Disponível 24/7",
      description: "Atendimento a qualquer hora do dia ou noite"
    },
    {
      icon: Users,
      title: "Toda a Família",
      description: "Válido para titular e dependentes"
    },
    {
      icon: Shield,
      title: "Sem Carência",
      description: "Use imediatamente após a contratação"
    },
    {
      icon: Heart,
      title: "Diversas Especialidades",
      description: "Clínico geral, pediatria e muito mais"
    }
  ];

  const benefits = [
    "✓ Atendimento médico 24 horas por dia, 7 dias por semana",
    "✓ Consultas por videochamada ou telefone",
    "✓ Sem limite de consultas mensais",
    "✓ Válido para todo o Brasil",
    "✓ Receitas e atestados digitais",
    "✓ Orientação médica especializada",
    "✓ Suporte em casos de emergência",
    "✓ Histórico de consultas disponível"
  ];

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-pink-50 to-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("PortalHome"))}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <div className="mb-8 text-center">
          <Badge className="mb-4 bg-yellow-400 text-yellow-900 font-bold text-sm px-4 py-2">
            <Gift className="w-4 h-4 mr-2" />
            OFERTA EXCLUSIVA PARA VOCÊ
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
            Bom Med
          </h1>
          <p className="text-xl text-gray-600">
            Atendimento médico 24h por videochamada
          </p>
          <a 
            href="https://grupobompastor.com.br/bommed/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 text-purple-600 hover:text-purple-700 font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Saiba mais sobre o Bom Med
          </a>
        </div>

        {/* Card Principal da Oferta */}
        <Card className="shadow-2xl border-4 border-purple-200 mb-8 bg-gradient-to-br from-white to-purple-50">
          <CardContent className="p-8">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-48 h-48 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex flex-col items-center justify-center shadow-2xl">
                  <Video className="w-24 h-24 text-white mb-2" />
                  <p className="text-white font-bold text-lg">24/7</p>
                </div>
              </div>

              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Bom Med - Telemedicina Completa
                </h2>
                <p className="text-lg text-gray-700 mb-6">
                  Tenha acesso a médicos qualificados 24 horas por dia através de <strong>videochamada</strong>. 
                  Perfeito para consultas rápidas, orientações médicas e emergências.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-500 line-through">De R$ 89,90</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold text-purple-600">R$ 59</span>
                      <span className="text-2xl text-purple-600">,90</span>
                      <span className="text-gray-600">/mês</span>
                    </div>
                    <Badge className="mt-2 bg-green-500 text-white">
                      Economia de R$ 30,00
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <Button
                    onClick={handleContactWhatsApp}
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg text-lg px-8 py-6"
                  >
                    <MessageSquare className="w-5 h-5 mr-2" />
                    Contratar pelo WhatsApp
                  </Button>
                  <Button
                    onClick={() => window.open('https://grupobompastor.com.br/bommed/', '_blank')}
                    size="lg"
                    variant="outline"
                    className="border-purple-600 text-purple-600 hover:bg-purple-50"
                  >
                    <ExternalLink className="w-5 h-5 mr-2" />
                    Ver Site Oficial
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recursos */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            O que está incluído
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {telemedicineFeatures.map((feature, idx) => (
              <Card key={idx} className="hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <feature.icon className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Benefícios */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-purple-600" />
                Todos os Benefícios
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-gray-700">{benefit}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Para Quem é Indicado
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Famílias</h4>
                    <p className="text-sm text-gray-600">
                      Perfeito para quem tem crianças e precisa de orientação médica rápida
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Pessoas Ocupadas</h4>
                    <p className="text-sm text-gray-600">
                      Ideal para quem tem pouco tempo para ir ao médico presencialmente
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Segurança</h4>
                    <p className="text-sm text-gray-600">
                      Tenha a tranquilidade de contar com médicos 24h por videochamada
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Perguntas Frequentes */}
        <Card className="shadow-lg mb-8">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 border-b">
            <CardTitle>Perguntas Frequentes</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Como funciona a consulta?</h4>
              <p className="text-sm text-gray-600">
                Você pode fazer uma <strong>videochamada</strong> com o médico a qualquer hora do dia ou da noite, 
                ou ligar por telefone. Um médico irá atendê-lo em poucos minutos.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Posso usar para minha família?</h4>
              <p className="text-sm text-gray-600">
                Sim! O serviço vale para titular e todos os dependentes cadastrados no seu plano.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Tem limite de consultas?</h4>
              <p className="text-sm text-gray-600">
                Não! Você pode usar quantas vezes precisar durante o mês, 24 horas por dia.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Como é cobrado?</h4>
              <p className="text-sm text-gray-600">
                O valor de R$ 59,90 será adicionado à sua mensalidade atual.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">O que é o Bom Med?</h4>
              <p className="text-sm text-gray-600">
                Bom Med é o serviço de telemedicina do Grupo Bom Pastor, oferecendo atendimento médico 
                por videochamada 24 horas por dia, 7 dias por semana.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CTA Final */}
        <Card className="shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white border-none">
          <CardContent className="p-8 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Pronto para ter médicos disponíveis 24h por videochamada?
            </h2>
            <p className="text-xl text-purple-100 mb-6">
              Contrate o <strong>Bom Med</strong> agora e tenha acesso imediato ao serviço
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={handleContactWhatsApp}
                size="lg"
                className="bg-white text-purple-700 hover:bg-gray-100 text-lg px-8 py-6 shadow-xl"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                Contratar pelo WhatsApp
              </Button>
              <Button
                onClick={() => window.open('https://grupobompastor.com.br/bommed/', '_blank')}
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-purple-700 text-lg px-8 py-6"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Saiba Mais
              </Button>
            </div>
            <p className="text-sm text-purple-200 mt-4">
              📞 Ou ligue: 0800 950 1010
            </p>
          </CardContent>
        </Card>

        {/* Aviso Legal */}
        <Alert className="mt-8 bg-gray-50 border-gray-200">
          <AlertCircle className="w-4 h-4 text-gray-600" />
          <AlertDescription className="text-gray-700 text-sm">
            <strong>Importante:</strong> O Bom Med é um serviço adicional ao seu plano funeral. 
            Não substitui atendimentos presenciais de emergência. Para emergências, procure imediatamente 
            o serviço de saúde mais próximo ou ligue 192 (SAMU).
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}