import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Upload, Image as ImageIcon, Save, Loader2, Building2, Palette, Bell } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function Settings() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0066cc");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    initialData: [],
    onSuccess: (data) => {
      const logoSetting = data.find(s => s.setting_key === 'company_logo');
      const nameSetting = data.find(s => s.setting_key === 'company_name');
      const colorSetting = data.find(s => s.setting_key === 'primary_color');
      
      if (nameSetting) setCompanyName(nameSetting.setting_value);
      if (colorSetting) setPrimaryColor(colorSetting.setting_value);
    }
  });

  const createOrUpdateSettingMutation = useMutation({
    mutationFn: async ({ key, value, type, category }) => {
      const existingSetting = settings.find(s => s.setting_key === key);
      
      const data = {
        setting_key: key,
        setting_value: value,
        setting_type: type || 'text',
        category: category || 'general',
      };

      if (existingSetting) {
        return base44.entities.SystemSettings.update(existingSetting.id, data);
      } else {
        return base44.entities.SystemSettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      toast.success('Configuração salva com sucesso!');
    },
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    setUploading(true);
    try {
      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      
      await createOrUpdateSettingMutation.mutateAsync({
        key: 'company_logo',
        value: uploadResult.file_url,
        type: 'image',
        category: 'branding'
      });
      
      toast.success('Logo atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao fazer upload do logo');
    }
    setUploading(false);
  };

  const handleSaveCompanyName = async () => {
    if (!companyName.trim()) {
      toast.error('Digite o nome da empresa');
      return;
    }

    await createOrUpdateSettingMutation.mutateAsync({
      key: 'company_name',
      value: companyName,
      type: 'text',
      category: 'branding'
    });
  };

  const handleSavePrimaryColor = async () => {
    await createOrUpdateSettingMutation.mutateAsync({
      key: 'primary_color',
      value: primaryColor,
      type: 'color',
      category: 'branding'
    });
  };

  const logoUrl = settings.find(s => s.setting_key === 'company_logo')?.setting_value;

  // Verificar se é admin
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6 text-center">
            <SettingsIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Acesso Restrito
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Apenas administradores podem acessar as configurações do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Configurações do Sistema</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Personalize o CRM da sua empresa
        </p>
      </div>

      <Tabs defaultValue="branding" className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <TabsTrigger value="branding" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Palette className="w-4 h-4 mr-2" />
            Marca e Visual
          </TabsTrigger>
          <TabsTrigger value="general" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Building2 className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Bell className="w-4 h-4 mr-2" />
            Notificações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-6">
          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardHeader className="border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <ImageIcon className="w-5 h-5" />
                Logo da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {logoUrl && (
                  <div className="flex justify-center">
                    <img 
                      src={logoUrl} 
                      alt="Logo da Empresa" 
                      className="max-w-xs max-h-32 object-contain bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
                
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Upload de Logo</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Formatos aceitos: PNG, JPG, SVG • Recomendado: 300x100px
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Fazendo upload...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Fazer Upload do Logo
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardHeader className="border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Nome da Empresa</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Nome</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Wescctech CRM"
                    className="mt-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <Button
                  onClick={handleSaveCompanyName}
                  disabled={createOrUpdateSettingMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                >
                  {createOrUpdateSettingMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Nome
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardHeader className="border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Cor Primária</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Cor Principal do Sistema</Label>
                  <div className="flex gap-3 mt-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-20 cursor-pointer rounded border border-gray-200 dark:border-gray-700"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#0066cc"
                      className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Esta cor será usada em botões e destaques do sistema
                  </p>
                </div>
                <Button
                  onClick={handleSavePrimaryColor}
                  disabled={createOrUpdateSettingMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                >
                  {createOrUpdateSettingMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Cor
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardContent className="pt-6">
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                Configurações gerais em breve...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardContent className="pt-6">
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                Configurações de notificações em breve...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}