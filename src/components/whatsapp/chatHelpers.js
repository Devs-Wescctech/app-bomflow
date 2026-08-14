// Helpers de APRESENTAÇÃO do Chat WhatsApp. Nada aqui altera regra de negócio, API ou
// fluxo — são apenas formatações e derivações visuais a partir dos dados já existentes.

export function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function convName(c) {
  return c?.name || c?.wa_number || "Contato";
}

export function convNumber(c) {
  return c?.wa_number || "";
}

// Iniciais para avatar fallback (máx. 2 letras).
export function initials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Formata número BR para exibição: 5551997720611 -> +55 (51) 99772-0611
export function formatPhoneBR(num) {
  const digits = String(num || "").replace(/\D/g, "");
  if (!digits) return "";
  let d = digits;
  let country = "";
  if (d.startsWith("55") && d.length > 10) {
    country = "+55 ";
    d = d.slice(2);
  }
  if (d.length === 11) return `${country}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${country}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return country ? country + d : d;
}

// Texto relativo simples ("agora", "há 5 min", "há 2 h", "há 3 dias").
export function relativeFromNow(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Presença derivada de dados REAIS (nada é inventado): se a última mensagem foi recebida do
// cliente há pouco, sinaliza atividade recente; caso contrário mostra "visto por último".
export function presenceFromConversation(c) {
  const iso = c?.last_message_at;
  if (!iso) return { label: "sem interações", active: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "", active: false };
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (c?.last_direction === "in" && min <= 15) {
    return { label: "ativo agora", active: true };
  }
  return { label: `visto ${relativeFromNow(iso)}`, active: false };
}

// Cor determinística para o avatar (a partir do nome), dentro da paleta BomFlow.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-indigo-500 to-blue-500",
  "from-blue-500 to-cyan-500",
  "from-cyan-500 to-teal-500",
  "from-fuchsia-500 to-violet-500",
  "from-sky-500 to-indigo-500",
];

export function avatarGradient(seed) {
  const s = String(seed || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
