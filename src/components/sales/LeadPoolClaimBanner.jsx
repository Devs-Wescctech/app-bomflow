import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, Clock, Loader2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { extractApiError } from "@/utils/apiError";

const MODULE_ROUTES = {
  leads: 'LeadDetail',
  leads_pj: 'LeadPJDetail',
  leads_upsell: 'LeadUpsellDetail',
  referrals: 'ReferralDetail',
};

const MODULE_LABELS = {
  leads: 'Vendas PF',
  leads_pj: 'Vendas PJ',
  leads_upsell: 'Upsell',
  referrals: 'Indicações',
};

export default function LeadPoolClaimBanner({ phone, currentModule }) {
  const navigate = useNavigate();
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setCheckResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`/api/lead-pool/check?phone=${encodeURIComponent(digits)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.found && data.module !== currentModule) {
          setCheckResult(data);
        } else {
          setCheckResult(null);
        }
      } catch {
        setCheckResult(null);
      } finally {
        setChecking(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [phone, currentModule]);

  const handleClaim = async () => {
    if (!checkResult) return;
    setClaiming(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/lead-pool/claim', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromModule: checkResult.module,
          fromLeadId: checkResult.leadId,
          toModule: currentModule,
          notes: `Puxado de ${MODULE_LABELS[checkResult.module]} após ${checkResult.daysInactive} dias de inatividade`,
        }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao puxar lead'));
      const data = await res.json();
      toast.success('Lead puxado com sucesso! Redirecionando...');
      const routeName = MODULE_ROUTES[currentModule];
      setTimeout(() => navigate(`${createPageUrl(routeName)}?id=${data.newLeadId}`), 1200);
    } catch (e) {
      toast.error(e.message || 'Erro ao puxar lead');
      setClaiming(false);
    }
  };

  if (checking) {
    return (
      <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Verificando em outros módulos...
      </p>
    );
  }

  if (!checkResult) return null;

  if (!checkResult.claimable) {
    return (
      <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-lg">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-orange-700">Lead em atendimento ativo</p>
        </div>
        <p className="text-xs text-orange-600 mt-1">
          Telefone já cadastrado no módulo <strong>{checkResult.moduleLabel}</strong>
          {checkResult.agentName ? ` — vendedor: ${checkResult.agentName}` : ''}.{' '}
          Ativo há <strong>{checkResult.daysInactive} dias</strong> (necessário{' '}
          {checkResult.inactivityDays} dias de inatividade para liberar).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-400 rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Lead disponível para puxar</p>
          </div>
          <p className="text-xs text-amber-700 mt-1">
            <strong>{checkResult.leadName}</strong> está no módulo{' '}
            <strong>{checkResult.moduleLabel}</strong>
            {checkResult.agentName ? ` (${checkResult.agentName})` : ''}, inativo há{' '}
            <strong>{checkResult.daysInactive} dias</strong>. Você pode transferi-lo para seu módulo.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleClaim}
          disabled={claiming}
          className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
        >
          {claiming ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Puxando...
            </>
          ) : (
            <>
              <ArrowRightLeft className="w-3 h-3 mr-1" />
              Puxar Lead
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
