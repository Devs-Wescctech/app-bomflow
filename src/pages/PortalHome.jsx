
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  FileText,
  Headphones,
  Shield,
  CheckCircle,
  MessageSquare,
  User,
  CreditCard,
  LogOut,
  Ticket,
  Calendar,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PortalHome() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [contactData, setContactData] = useState(null);
  const [contractData, setContractData] = useState(null);

  useEffect(() => {
    // Verificar autenticação
    const authenticated = localStorage.getItem('portal_authenticated') === 'true';
    const contact = localStorage.getItem('portal_contact');
    const contract = localStorage.getItem('portal_contract');

    console.log('🔍 Verificando autenticação do portal:', { authenticated, contact, contract });

    if (authenticated && contact) {
      setIsAuthenticated(true);
      setContactData(JSON.parse(contact));
      if (contract && contract !== 'null') {
        setContractData(JSON.parse(contract));
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('portal_authenticated');
    localStorage.removeItem('portal_contact');
    localStorage.removeItem('portal_contract');
    localStorage.removeItem('portal_contact_id');
    localStorage.removeItem('portal_contact_name');
    localStorage.removeItem('portal_validated_session');
    localStorage.removeItem('portal_session_id');
    localStorage.removeItem('portal_phone');

    setIsAuthenticated(false);
    setContactData(null);
    setContractData(null);

    window.location.reload();
  };

  // 🆕 Valores estáticos para landing page pública
  const companyInfo = {
    name: 'Grupo Bom Pastor',
    logoUrl: 'https://grupobompastor.com.br/site/wp-content/uploads/2024/10/logo-grupo-bom-pastor-maior.png',
    primaryColor: '#0066cc',
    phone: '0800 950 1010',
    email: 'contato@grupobompastor.com.br',
    address: 'Limeira - SP',
    businessHours: 'Seg - Sex: 8h às 18h',
    description: 'Assistência Funeral e Serviços Funerários',
  };

  // SE ESTIVER AUTENTICADO - Mostrar Portal do Cliente
  if (isAuthenticated && contactData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        {/* Header do Portal Logado */}
        <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
          <div className="w-full px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={companyInfo.logoUrl}
                  alt={companyInfo.name}
                  className="h-12 object-contain"
                />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{companyInfo.name}</h1>
                  <p className="text-xs text-gray-500">Portal do Cliente</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-semibold text-gray-900">{contactData.name}</p>
                  <p className="text-xs text-gray-500">{contactData.email || contactData.phone}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="text-red-600 hover:text-red-700"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="w-full px-6 py-8">
          {/* Boas-vindas */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Olá, {contactData.name.split(' ')[0]}!
            </h1>
            <p className="text-gray-600">Bem-vindo ao seu portal de atendimento</p>
          </div>

          {/* 🆕 Banner de Oferta Especial */}
          <Link to={createPageUrl("PortalOffers")}>
            <Card className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 border-none hover:shadow-2xl transition-all cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-yellow-400 text-yellow-900 font-bold">
                        🔥 OFERTA ESPECIAL
                      </Badge>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      Bom Med por apenas R$ 59,90/mês
                    </h2>
                    <p className="text-purple-100 mb-3">
                      Atendimento médico 24h por videochamada • Sem carência • Válido para toda família
                    </p>
                    <Button variant="secondary" className="bg-white text-purple-700 hover:bg-gray-100">
                      Ver Detalhes da Oferta →
                    </Button>
                  </div>
                  <div className="hidden md:block">
                    <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center">
                      <Headphones className="w-16 h-16 text-white" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Cards de Ações Rápidas */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
            <Link to={createPageUrl("PortalContract")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-500 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Meu Contrato</h3>
                  <p className="text-sm text-gray-600">Veja detalhes do seu plano</p>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalUpdateData")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-indigo-500 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Atualizar Dados</h3>
                  <p className="text-sm text-gray-600">Mantenha seu cadastro em dia</p>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalBoletos")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-green-500 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Boletos</h3>
                  <p className="text-sm text-gray-600">2ª via e pagamentos</p>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalCreateTicket")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-purple-500 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                    <Ticket className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Novo Atendimento</h3>
                  <p className="text-sm text-gray-600">Solicite atendimento</p>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalTickets")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-orange-500 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-orange-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Meus Atendimentos</h3>
                  <p className="text-sm text-gray-600">Acompanhe solicitações</p>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalReferralCreate")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg">
                    <span className="text-3xl">🎁</span>
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Indique e Ganhe</h3>
                  <p className="text-sm text-gray-600">Até R$ 150 por indicação</p>
                  <Badge className="mt-2 bg-amber-500 text-white">Programa de Indicação</Badge>
                </CardContent>
              </Card>
            </Link>

            <Link to={createPageUrl("PortalOffers")}>
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-pink-500 bg-gradient-to-br from-pink-50 to-purple-50 h-full">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <span className="text-3xl">💝</span>
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Ofertas Exclusivas</h3>
                  <p className="text-sm text-gray-600">Bom Med e mais</p>
                  <Badge className="mt-2 bg-pink-500 text-white">R$ 59,90/mês</Badge>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Informações do Contrato */}
          {contractData && (
            <div className="grid lg:grid-cols-3 gap-6 mb-8">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Informações do Contrato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Plano Contratado</p>
                      <p className="font-semibold text-gray-900">{contractData.plan}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <Badge className={
                        contractData.status === 'active' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                      }>
                        {contractData.status === 'active' ? 'Ativo' : contractData.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Valor Mensal</p>
                      <p className="font-semibold text-gray-900">
                        R$ {contractData.monthly_value?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status de Pagamento</p>
                      <Badge className={
                        contractData.payment_status === 'up_to_date' ? 'bg-green-100 text-green-700' :
                          'bg-orange-100 text-orange-700'
                      }>
                        {contractData.payment_status === 'up_to_date' ? 'Em dia' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                  {contractData.start_date && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-gray-500">Vigência</p>
                      <p className="text-sm text-gray-900">
                        Desde {format(new Date(contractData.start_date), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <a
                    href={`tel:${companyInfo.phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Telefone</p>
                      <p className="font-semibold text-gray-900 text-sm">{companyInfo.phone}</p>
                    </div>
                  </a>

                  <a
                    href={`mailto:${companyInfo.email}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Mail className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">E-mail</p>
                      <p className="font-semibold text-gray-900 text-sm">{companyInfo.email}</p>
                    </div>
                  </a>

                  <div className="flex items-center gap-3 p-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Horário</p>
                      <p className="font-semibold text-gray-900 text-sm">{companyInfo.businessHours}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Informações Importantes */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">Central de Atendimento 24h</h3>
                  <p className="text-sm text-blue-800 mb-2">
                    Em caso de emergência ou necessidade de acionamento, entre em contato imediatamente:
                  </p>
                  <p className="font-bold text-lg text-blue-900">{companyInfo.phone}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-8 mt-12">
          <div className="w-full px-6 text-center">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} {companyInfo.name}. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // SE NÃO ESTIVER AUTENTICADO - Mostrar Landing Page Pública
  const services = [
    {
      icon: Shield,
      title: 'Planos Funerários',
      description: 'Proteção e tranquilidade para você e sua família',
      color: 'blue'
    },
    {
      icon: Headphones,
      title: 'Atendimento 24h',
      description: 'Estamos sempre prontos para ajudar',
      color: 'green'
    },
    {
      icon: FileText,
      title: 'Documentação',
      description: 'Auxílio completo com toda documentação necessária',
      color: 'purple'
    },
    {
      icon: CheckCircle,
      title: 'Serviços Completos',
      description: 'Tudo que você precisa em um único lugar',
      color: 'orange'
    }
  ];

  const benefits = [
    'Atendimento humanizado e respeitoso',
    'Equipe profissional e experiente',
    'Cobertura em toda região',
    'Planos acessíveis e flexíveis',
    'Suporte administrativo completo',
    'Acompanhamento familiar'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header Público */}
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {companyInfo.logoUrl ? (
                <img src={companyInfo.logoUrl} alt={companyInfo.name} className="h-12 object-contain" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                    <Shield className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{companyInfo.name}</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{companyInfo.description}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <a href={`tel:${companyInfo.phone.replace(/\D/g, '')}`}>
                <Button variant="outline" className="hidden sm:flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {companyInfo.phone}
                </Button>
              </a>
              <Link to={createPageUrl("PortalLogin")}>
                <Button style={{ backgroundColor: companyInfo.primaryColor }} className="text-white hover:opacity-90">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Área do Cliente
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        className="py-20 text-center relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${companyInfo.primaryColor}15 0%, ${companyInfo.primaryColor}05 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          {companyInfo.logoUrl && (
            <img
              src={companyInfo.logoUrl}
              alt={companyInfo.name}
              className="h-24 mx-auto mb-8 object-contain"
            />
          )}
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            {companyInfo.name}
          </h1>
          <p className="text-2xl text-gray-600 dark:text-gray-300 mb-4">
            {companyInfo.description}
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-8">
            Atuando com respeito, dignidade e profissionalismo há anos
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to={createPageUrl("PortalLogin")}>
              <Button size="lg" style={{ backgroundColor: companyInfo.primaryColor }} className="text-white hover:opacity-90">
                <MessageSquare className="w-5 h-5 mr-2" />
                Área do Cliente
              </Button>
            </Link>
            <a href={`tel:${companyInfo.phone.replace(/\D/g, '')}`}>
              <Button size="lg" variant="outline">
                <Phone className="w-5 h-5 mr-2" />
                Falar com Atendente
              </Button>
            </a>
          </div>
        </div>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        </div>
      </section>

      {/* Serviços */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Nossos Serviços
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Tudo que você precisa em momentos difíceis
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service, idx) => (
              <Card key={idx} className="border-2 hover:shadow-lg transition-all duration-300 hover:border-blue-500 dark:hover:border-blue-400">
                <CardContent className="p-6 text-center">
                  <div
                    className={`w-16 h-16 mx-auto mb-4 rounded-full bg-${service.color}-100 dark:bg-${service.color}-950 flex items-center justify-center`}
                  >
                    <service.icon className={`w-8 h-8 text-${service.color}-600 dark:text-${service.color}-400`} />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    {service.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {service.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="py-16 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Por que escolher o {companyInfo.name}?
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                Nossa missão é oferecer dignidade, respeito e tranquilidade para as famílias em momentos delicados.
              </p>
              <div className="space-y-3">
                {benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-1">
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-gray-700 dark:text-gray-300">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
            <Card className="border-2">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Entre em Contato
                </h3>
                <div className="space-y-4">
                  <a
                    href={`tel:${companyInfo.phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-3 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center">
                      <Phone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Telefone</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{companyInfo.phone}</p>
                    </div>
                  </a>

                  <a
                    href={`mailto:${companyInfo.email}`}
                    className="flex items-center gap-3 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center">
                      <Mail className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">E-mail</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{companyInfo.email}</p>
                    </div>
                  </a>

                  <div className="flex items-center gap-3 p-4">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950 rounded-full flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Localização</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{companyInfo.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4">
                    <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center">
                      <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Horário</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{companyInfo.businessHours}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section
        className="py-20 text-center"
        style={{
          background: `linear-gradient(135deg, ${companyInfo.primaryColor} 0%, ${companyInfo.primaryColor}dd 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-white mb-6">
            Já é nosso cliente?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Acesse a área do cliente para consultar seu contrato, boletos e abrir chamados
          </p>
          <Link to={createPageUrl("PortalLogin")}>
            <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100">
              <MessageSquare className="w-5 h-5 mr-2" />
              Acessar Área do Cliente
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-lg mb-4">{companyInfo.name}</h3>
              <p className="text-gray-400 text-sm">
                {companyInfo.description}
              </p>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Contato</h3>
              <div className="space-y-2 text-sm text-gray-400">
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {companyInfo.phone}
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {companyInfo.email}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {companyInfo.address}
                </p>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Links Rápidos</h3>
              <div className="space-y-2 text-sm">
                <Link to={createPageUrl("PortalLogin")} className="block text-gray-400 hover:text-white transition-colors">
                  Área do Cliente
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm text-gray-400">
            <p>© {new Date().getFullYear()} {companyInfo.name}. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
