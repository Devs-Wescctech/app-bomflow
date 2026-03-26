import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Upload, Image as ImageIcon, Save, Loader2, Building2, Palette, Bell, ListChecks, Plus, X, GripVertical, Calendar, Link2, Unlink, ExternalLink } from "lucide-react";
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
    mutationFn: async ({ key, value, type }) => {
      const existingSetting = settings.find(s => (s.setting_key || s.settingKey) === key);
      
      const data = {
        setting_key: key,
        setting_value: value,
        setting_type: type || 'text',
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
    });
  };

  const handleSavePrimaryColor = async () => {
    await createOrUpdateSettingMutation.mutateAsync({
      key: 'primary_color',
      value: primaryColor,
      type: 'color',
    });
  };

  const logoUrl = settings.find(s => (s.setting_key || s.settingKey) === 'company_logo')?.setting_value || settings.find(s => (s.setting_key || s.settingKey) === 'company_logo')?.settingValue;

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
          <TabsTrigger value="sales-fields" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <ListChecks className="w-4 h-4 mr-2" />
            Campos de Vendas
          </TabsTrigger>
          <TabsTrigger value="general" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Building2 className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Bell className="w-4 h-4 mr-2" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="google-calendar" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Calendar className="w-4 h-4 mr-2" />
            Google Agenda
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

        <TabsContent value="sales-fields" className="space-y-6">
          <SalesFieldsManager settings={settings} onSave={createOrUpdateSettingMutation} />
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

        <TabsContent value="google-calendar" className="space-y-6">
          <GoogleCalendarSettings settings={settings} onSave={createOrUpdateSettingMutation} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OptionListEditor({ title, description, settingKey, settings, onSave }) {
  const getOptions = () => {
    const setting = settings.find(s => s.setting_key === settingKey || s.settingKey === settingKey);
    if (setting) {
      try { return JSON.parse(setting.setting_value || setting.settingValue); } catch {}
    }
    return [];
  };

  const [options, setOptions] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialized && settings.length > 0) {
      const loaded = getOptions();
      if (loaded.length > 0) {
        setOptions(loaded);
        setInitialized(true);
      }
    }
  }, [settings, initialized]);

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toast.error('Esta opção já existe');
      return;
    }
    setOptions([...options, trimmed]);
    setNewOption("");
  };

  const handleRemove = (index) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (options.length === 0) {
      toast.error('Adicione pelo menos uma opção antes de salvar');
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({
        key: settingKey,
        value: JSON.stringify(options),
        type: 'json',
      });
    } catch (error) {
      toast.error('Erro ao salvar opções');
    }
    setSaving(false);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <CardTitle className="text-gray-900 dark:text-gray-100 text-base">{title}</CardTitle>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2 group">
              <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                {option}
              </div>
              <button
                onClick={() => handleRemove(index)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            placeholder="Nova opção..."
            className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button
            onClick={handleAdd}
            variant="outline"
            size="icon"
            disabled={!newOption.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#5A2A3C' }}
            className="text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Opções
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesFieldsManager({ settings, onSave }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OptionListEditor
          title="Interesses - Vendas PJ"
          description="Opções de interesse para leads de pessoa jurídica"
          settingKey="interest_options_pj"
          settings={settings}
          onSave={onSave}
        />
        <OptionListEditor
          title="Origens - Vendas PJ"
          description="Fontes de origem para leads de pessoa jurídica"
          settingKey="source_options_pj"
          settings={settings}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

function GoogleCalendarSettings({ settings, onSave }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const queryClient = useQueryClient();

  const { data: gcalStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["gcalStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { configured: false, connected: false };
      return res.json();
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      toast.success("Google Calendar conectado com sucesso!");
      refetchStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (settings.length > 0) {
      const idSetting = settings.find(s => (s.setting_key || s.settingKey) === "google_calendar_client_id");
      const secretSetting = settings.find(s => (s.setting_key || s.settingKey) === "google_calendar_client_secret");
      if (idSetting) setClientId((idSetting.setting_value || idSetting.settingValue) || "");
      if (secretSetting) setClientSecret((secretSetting.setting_value || secretSetting.settingValue) || "");
    }
  }, [settings]);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha Client ID e Client Secret");
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({ key: "google_calendar_client_id", value: clientId.trim(), type: "text" });
      await onSave.mutateAsync({ key: "google_calendar_client_secret", value: clientSecret.trim(), type: "text" });
      toast.success("Credenciais salvas!");
      refetchStatus();
    } catch {
      toast.error("Erro ao salvar credenciais");
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Erro ao obter URL de autorização");
      }
    } catch {
      toast.error("Erro ao conectar");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/functions/google-calendar/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Google Calendar desconectado");
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
    } catch {
      toast.error("Erro ao desconectar");
    }
    setDisconnecting(false);
  };

  return (
    <div className="space-y-6">
      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Calendar className="w-5 h-5" />
            Integração Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="p-4 rounded-lg" style={{ backgroundColor: gcalStatus?.connected ? "#f0fdf4" : "#fef3c7" }}>
            <div className="flex items-center gap-2">
              {gcalStatus?.connected ? (
                <>
                  <Link2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Google Calendar conectado</span>
                </>
              ) : (
                <>
                  <Unlink className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">
                    {gcalStatus?.configured ? "Configurado, mas não conectado" : "Não configurado"}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Google Client ID</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Seu Client ID do Google Cloud Console"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Google Client Secret</Label>
              <Input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                type="password"
                placeholder="Seu Client Secret do Google Cloud Console"
                className="mt-1"
              />
            </div>
            <Button onClick={handleSaveCredentials} disabled={saving} className="w-full" variant="outline">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Credenciais
            </Button>
          </div>

          <div className="border-t pt-4 space-y-3">
            {gcalStatus?.connected ? (
              <Button onClick={handleDisconnect} disabled={disconnecting} variant="destructive" className="w-full">
                {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
                Desconectar Google Calendar
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={connecting || !gcalStatus?.configured}
                className="w-full text-white"
                style={{ background: "linear-gradient(135deg, #5A2A3C, #F98F6F)" }}
              >
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Conectar com Google Calendar
              </Button>
            )}
          </div>

          <div className="text-xs text-gray-500 space-y-1 border-t pt-4">
            <p className="font-medium">Como configurar:</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Acesse o Google Cloud Console</li>
              <li>Crie um projeto ou selecione um existente</li>
              <li>Ative a API Google Calendar</li>
              <li>Crie credenciais OAuth 2.0 (tipo "Aplicativo Web")</li>
              <li>Adicione a URL de redirecionamento autorizada</li>
              <li>Copie o Client ID e Client Secret acima</li>
              <li>Salve e clique em "Conectar"</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}