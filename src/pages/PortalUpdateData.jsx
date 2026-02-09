import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Phone, Mail, MapPin, ArrowLeft, Save, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function PortalUpdateData() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [contact, setContact] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    phone2: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: '',
  });

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    if (contactData) {
      const parsedContact = JSON.parse(contactData);
      setContact(parsedContact);
      
      // Preencher formulário com dados existentes
      setFormData({
        email: parsedContact.email || '',
        phone: parsedContact.phone || '',
        phone2: parsedContact.phones?.[1] || '',
        address: parsedContact.metadata?.endereco_completo || '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        cep: '',
      });
    }
    setIsLoading(false);
  }, [navigate]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCEP = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 8) {
      return numbers.replace(/(\d{5})(\d{3})/, '$1-$2');
    }
    return value;
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccess(false);

    try {
      const phones = [formData.phone];
      if (formData.phone2) phones.push(formData.phone2);

      const emails = [];
      if (formData.email) emails.push(formData.email);

      const updateData = {
        phones,
        emails,
        metadata: {
          ...contact.metadata,
          endereco_completo: `${formData.address}, ${formData.number}${formData.complement ? ' - ' + formData.complement : ''} - ${formData.neighborhood}, ${formData.city}/${formData.state} - CEP: ${formData.cep}`,
          last_update: new Date().toISOString(),
        }
      };

      await base44.entities.Contact.update(contact.id, updateData);

      // Atualizar localStorage
      const updatedContact = { ...contact, ...updateData };
      localStorage.setItem('portal_contact', JSON.stringify(updatedContact));
      setContact(updatedContact);

      setSuccess(true);
      toast.success('Dados atualizados com sucesso!');
      
      setTimeout(() => {
        navigate(createPageUrl("PortalHome"));
      }, 2000);

    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar dados. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!contact) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("PortalHome"))}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Atualização Cadastral</h1>
          <p className="text-gray-600">Mantenha seus dados sempre atualizados</p>
        </div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Dados atualizados com sucesso! Redirecionando...
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Pessoais */}
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Dados Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Nome Completo</Label>
                  <Input
                    value={contact.name}
                    disabled
                    className="mt-1 bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Para alterar o nome, entre em contato conosco
                  </p>
                </div>
                <div>
                  <Label className="text-gray-900">CPF</Label>
                  <Input
                    value={contact.document}
                    disabled
                    className="mt-1 bg-gray-100"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Informações de Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">E-mail</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="seu@email.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Telefone Principal *</Label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Telefone Secundário</Label>
                  <Input
                    type="tel"
                    value={formData.phone2}
                    onChange={(e) => handleChange('phone2', formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <Label className="text-gray-900">CEP</Label>
                  <Input
                    value={formData.cep}
                    onChange={(e) => handleChange('cep', formatCEP(e.target.value))}
                    placeholder="00000-000"
                    className="mt-1"
                    maxLength={9}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div className="md:col-span-3">
                  <Label className="text-gray-900">Endereço</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Rua, Avenida..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Número</Label>
                  <Input
                    value={formData.number}
                    onChange={(e) => handleChange('number', e.target.value)}
                    placeholder="123"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-900">Complemento</Label>
                  <Input
                    value={formData.complement}
                    onChange={(e) => handleChange('complement', e.target.value)}
                    placeholder="Apto, Bloco..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Bairro</Label>
                  <Input
                    value={formData.neighborhood}
                    onChange={(e) => handleChange('neighborhood', e.target.value)}
                    placeholder="Centro"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label className="text-gray-900">Cidade</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="São Paulo"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Estado</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
                    placeholder="SP"
                    className="mt-1"
                    maxLength={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerta Importante */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Importante:</strong> Após a atualização, seus dados serão verificados por nossa equipe. 
              Caso haja inconsistências, entraremos em contato.
            </AlertDescription>
          </Alert>

          {/* Botões */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl("PortalHome"))}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !formData.phone}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}