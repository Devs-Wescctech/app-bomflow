import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User, MapPin, Package, CreditCard, Users, ClipboardCheck,
  Loader2, ArrowLeft, ArrowRight, Send, CheckCircle2, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Plus, Trash2, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Formata um número como celular brasileiro: (XX) 9XXXX-XXXX
const formatMobilePhone = (v) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Valida celular brasileiro: DDD (2 dígitos) + 9 dígitos começando com 9.
const isMobilePhone = (v) => {
  const d = (v || "").replace(/\D/g, "");
  return d.length === 11 && d[2] === "9";
};

const DIA_VENCIMENTO_OPTIONS = ["01", "05", "10", "15", "20", "25"];
const QUANTIDADE_PARCELAS_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const TITULO_CONTRATO_OPTIONS = [
  "BOM CORP", "BOM PASTOR", "BOM PASTOR - BOM AUTO",
  "BOM PASTOR - BOM DESCANSO FAMILIA", "BOM PASTOR - BOM MED",
  "BOM PASTOR - BOM PET", "BOM PASTOR - COB",
  "BOM PASTOR - COMBO MULTI ESPECIAL", "BOM PASTOR - COMBO MULTI SELEÇÃO",
  "BOM PASTOR - DIGITAL", "BOM PASTOR - ESSENCIAL", "BOM PASTOR - IDEAL",
  "BOM PASTOR - PEROLA", "BOM PASTOR - RUBI", "BOM PASTOR - SAFIRA",
  "BOM PASTOR - TOPAZIO", "BOM PASTOR - TOTAL +", "BOM SAMBA",
  "EXPLORER CALLCENTER",
];

const PARENTESCO_OPTIONS = [
  { value: "P", label: "Pai" },
  { value: "M", label: "Mãe" },
  { value: "F", label: "Filho/Filha" },
  { value: "S", label: "Sogro/Sogra" },
  { value: "C", label: "Cônjuge" },
  { value: "D", label: "Dependente" },
];

const SEXO_OPTIONS = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
];

const ESTADO_CIVIL_OPTIONS = [
  "SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "SEPARADO", "UNIAO ESTAVEL",
];

const PROFISSAO_OPTIONS = [
  "MEDICO", "ENFERMEIRO", "PROFESSOR", "ADVOGADO", "ENGENHEIRO",
  "COMERCIANTE", "AUTONOMO", "APOSENTADO", "DO LAR", "OUTRO",
];

// BOM AUTO — modelos de carro mais comuns no Brasil + "OUTRO" (digita livre).
const VEICULO_MODELO_OPTIONS = [
  "ONIX", "HB20", "POLO", "GOL", "ARGO", "MOBI", "KWID", "UNO", "CORSA", "PALIO",
  "STRADA", "SAVEIRO", "TORO", "S10", "HILUX", "RANGER", "FRONTIER",
  "COROLLA", "CIVIC", "CITY", "VERSA", "SENTRA", "CRUZE", "VIRTUS", "PRISMA",
  "COMPASS", "RENEGADE", "CRETA", "KICKS", "TRACKER", "T-CROSS", "NIVUS", "DUSTER",
  "PULSE", "FASTBACK", "FOX", "VOYAGE", "KA", "FIESTA", "ECOSPORT",
  "SANDERO", "LOGAN", "C3", "C4 CACTUS", "208", "2008", "YARIS", "MERIVA",
  "OUTRO",
];

// BOM AUTO — cores mais comuns + "OUTRO".
const VEICULO_COR_OPTIONS = [
  "PRETO", "BRANCO", "PRATA", "CINZA", "VERMELHO", "AZUL", "VERDE",
  "AMARELO", "MARROM", "BEGE", "DOURADO", "LARANJA", "VINHO", "ROXO",
  "OUTRO",
];

// BOM PET — tipos de pet mais comuns + "OUTRO" (descreve livre).
const PET_TIPO_OPTIONS = [
  "CACHORRO", "GATO", "PÁSSARO", "PEIXE", "HAMSTER", "COELHO",
  "TARTARUGA", "RÉPTIL", "OUTRO",
];

// BOM PET — raças de cachorro mais comuns no Brasil + "SRD" e "OUTROS".
const PET_RACA_CACHORRO_OPTIONS = [
  "SRD", "LABRADOR", "GOLDEN RETRIEVER", "POODLE", "SHIH TZU", "LULU DA POMERANIA",
  "YORKSHIRE", "PINSCHER", "ROTTWEILER", "PASTOR ALEMÃO", "PUG", "BEAGLE",
  "DACHSHUND", "MALTÊS", "CHIHUAHUA", "BORDER COLLIE", "PIT BULL", "BOXER",
  "BULLDOG FRANCÊS", "BULLDOG INGLÊS", "COCKER SPANIEL", "DÁLMATA", "SCHNAUZER",
  "AKITA", "HUSKY SIBERIANO", "OUTROS",
];

// BOM PET — raças de gato mais comuns no Brasil + "SRD" e "OUTROS".
const PET_RACA_GATO_OPTIONS = [
  "SRD", "PERSA", "SIAMÊS", "MAINE COON", "ANGORÁ", "RAGDOLL", "BENGAL",
  "SPHYNX", "BRITISH SHORTHAIR", "EXÓTICO", "AZUL RUSSO", "OUTROS",
];

// BOM PET — opção de raça para tipos sem lista específica (pássaro, peixe etc.).
const PET_RACA_GENERICA_OPTIONS = ["SRD", "OUTROS"];

// BOM PET — cores de pet mais comuns + "OUTRO".
const PET_COR_OPTIONS = [
  "PRETO", "BRANCO", "MARROM", "CARAMELO", "CINZA", "DOURADO", "BEGE",
  "TIGRADO", "MALHADO", "BRANCO E PRETO", "BRANCO E DOURADO", "OUTRO",
];

// BOM PET — portes de pet.
const PET_PORTE_OPTIONS = ["MICRO", "PEQUENO", "MÉDIO", "GRANDE", "GIGANTE"];

// BOM PET: lista de opções de raça conforme o tipo de pet selecionado.
function racasPorTipo(tipo) {
  if (tipo === "CACHORRO") return PET_RACA_CACHORRO_OPTIONS;
  if (tipo === "GATO") return PET_RACA_GATO_OPTIONS;
  return PET_RACA_GENERICA_OPTIONS;
}

const STEPS = [
  { id: 1, label: "Contratante", icon: User },
  { id: 2, label: "Endereço", icon: MapPin },
  { id: 3, label: "Plano", icon: Package },
  { id: 4, label: "Beneficiários", icon: Users },
  { id: 5, label: "Pagamento", icon: CreditCard },
  { id: 6, label: "Revisão", icon: ClipboardCheck },
];

const NOME_ESTABELECIMENTO_FIXO = "LIMEIRA - CNPA";

// Produtos cujo nome contém "NOME DO PET" são planos de pet, atrelados aos beneficiários (não ao titular).
function isPetProduto(prod) {
  return /NOME DO PET/i.test(prod?.descricao || prod?.titulo_contrato || "");
}

// BOM AUTO: produtos de "DADOS DO CONDUTOR" e "DADOS DO VEÍCULO" também são produtos de beneficiário
// (não do titular). Cada um vira um card fixo de beneficiário no Step 5.
function isCondutorProduto(prod) {
  return /DADOS DO CONDUTOR/i.test(prod?.descricao || prod?.titulo_contrato || "");
}
function isVeiculoProduto(prod) {
  return /DADOS DO VE[IÍ]CULO/i.test(prod?.descricao || prod?.titulo_contrato || "");
}

// Produtos com "DEPENDENTE" no nome E valor 0,01 são "vagas" de dependente (sem custo): não devem
// aparecer na lista do titular (Step 3) e sim apenas como produto de beneficiário (Step 5). Os
// produtos DEPENDENTE com preço real (faixas etárias etc.) continuam sendo do titular, como hoje.
function isDependenteProduto(prod) {
  const desc = prod?.descricao || prod?.titulo_contrato || "";
  const preco = Number(prod?.preco_informado);
  return /DEPENDENTE/i.test(desc) && Math.abs(preco - 0.01) < 0.005;
}

// Produtos "DEPENDENTE" com preço real (> 0,01) são serviços de valor agregado: continuam sendo itens
// do TITULAR (aparecem e são cobrados no passo Plano), mas exigem o cadastro do dependente como
// beneficiário vinculado ao próprio item — o titular NÃO entra na quantidade desse item. Modelo
// confirmado no pedido ERP 68923 (item "ESSENCIAL DEPENDENTES - 0 A 50 ANOS" vinculado só ao dependente).
function isDependentePagoProduto(prod) {
  const desc = prod?.descricao || prod?.titulo_contrato || "";
  const preco = Number(prod?.preco_informado);
  return /DEPENDENTE/i.test(desc) && Number.isFinite(preco) && preco > 0.015;
}

// Um produto é "de beneficiário" (não do titular) se for pet, condutor, veículo ou vaga de dependente.
function isProdutoBeneficiario(prod) {
  return isPetProduto(prod) || isCondutorProduto(prod) || isVeiculoProduto(prod) || isDependenteProduto(prod);
}

// Placa: aceita modelo antigo (AAA9999) e Mercosul (AAA9A99). Normaliza para alfanumérico maiúsculo.
function normalizaPlaca(v) {
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
function placaValida(v) {
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(normalizaPlaca(v));
}

// BOM AUTO: monta o valor enviado ao ERP a partir dos campos do veículo no formato MODELO/COR/PLACA/ANO.
// Retorna "" se algum campo estiver vazio (mantém a validação de "nome obrigatório" coerente).
function montarNomeVeiculo(b) {
  const modelo = (b.veic_modelo === "OUTRO" ? b.veic_modelo_outro : b.veic_modelo) || "";
  const cor = (b.veic_cor === "OUTRO" ? b.veic_cor_outro : b.veic_cor) || "";
  const placa = normalizaPlaca(b.veic_placa);
  const ano = (b.veic_ano || "").toString().trim();
  const partes = [modelo.trim().toUpperCase(), cor.trim().toUpperCase(), placa, ano];
  if (partes.some((p) => !p)) return "";
  return partes.join("/");
}

// BOM PET: monta o valor enviado ao ERP a partir dos campos do pet no formato
// NOME/TIPO/RAÇA/COR/PORTE (ex.: ZARA/CACHORRO/LULU DA POMERANIA/BRANCO E DOURADO/PEQUENO).
// Retorna "" se algum campo estiver vazio (mantém a validação de "nome obrigatório" coerente).
function montarNomePet(b) {
  const nome = (b.pet_nome || "").trim();
  const tipo = (b.pet_tipo === "OUTRO" ? b.pet_tipo_outro : b.pet_tipo) || "";
  const raca = (b.pet_raca === "OUTROS" ? b.pet_raca_outro : b.pet_raca) || "";
  const cor = (b.pet_cor === "OUTRO" ? b.pet_cor_outro : b.pet_cor) || "";
  const porte = (b.pet_porte || "").trim();
  const partes = [
    nome.toUpperCase(), tipo.trim().toUpperCase(), raca.trim().toUpperCase(),
    cor.trim().toUpperCase(), porte.toUpperCase(),
  ];
  if (partes.some((p) => !p)) return "";
  return partes.join("/");
}

function erpLoginFromEmail(email) {
  if (!email) return undefined;
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return undefined;
  const local = email.slice(0, atIdx).toLowerCase().trim();
  const domain = email.slice(atIdx + 1).replace(/\.[^.]+$/, "").toLowerCase().trim();
  if (!local || !domain) return undefined;
  return `user.${local}.${domain}`;
}

function formatCpf(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(v) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function isValidCpf(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

const EMPTY_BENEFICIARIO = {
  usua_cpf: "",
  usua_nome_completo: "",
  usua_data_nascimento: "",
  usua_sexo: "",
  usua_parentesco: "",
  usua_telefone: "",
  usua_produtos: "",
  // BOM PET (somente frontend; combinados em usua_nome_completo no formato NOME/TIPO/RAÇA/COR/PORTE)
  pet_nome: "",
  pet_tipo: "",
  pet_tipo_outro: "",
  pet_raca: "",
  pet_raca_outro: "",
  pet_cor: "",
  pet_cor_outro: "",
  pet_porte: "",
};

function useCanAccessOrcamento(user) {
  if (!user) return null;
  return user.role === "admin" || user.email === "teste3@bomflow.com";
}

export default function UpsellNovoOrcamento() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [cpfLookup, setCpfLookup] = useState(null);
  const [cepLookup, setCepLookup] = useState(null);
  const [beneficiarios, setBeneficiarios] = useState([{ ...EMPTY_BENEFICIARIO }]);
  const [openBenef, setOpenBenef] = useState([true]);
  const [submitResult, setSubmitResult] = useState(null);
  // Múltiplos produtos por orçamento (modelo fiel ao ERP): cada produto vira um item/cartão.
  // produto_id guarda o `id` do produto da lista do ERP; preco editável; incluir_titular vincula o titular ao item.
  const [produtosSel, setProdutosSel] = useState([]);

  const [form, setForm] = useState({
    contratante_pessoa: "",
    cpf: "",
    pessoa_contato: "",
    un_rg: "",
    telefone: "",
    celular: "",
    email_contato: "",
    whatsapp_do_cliente: "",
    sexo: "",
    estado_civil: "",
    profissao: "",
    un_codigo_postal: "",
    un_lougradouro: "",
    un_numero_lougradouro: "",
    un_complemento_lougradouro: "",
    un_bairro: "",
    un_cidade: "",
    titulo_contrato: "",
    plano_pagamento_id: "",
    plano_pagamento: "",
    quantidade_parcelas: "",
    dia_vencimento: "10",
    observacoes: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Ao trocar o título do contrato, os produtos disponíveis mudam — limpa seleção do titular e
  // as atribuições de produto dos beneficiários para não vazar itens de um título anterior.
  const setTituloContrato = (v) => {
    set("titulo_contrato", v);
    setProdutosSel([]);
    // Troca de título reinicia os beneficiários (os produtos disponíveis mudam).
    // Para BOM AUTO os dois cards fixos (condutor/veículo) são montados pelo efeito abaixo.
    setBeneficiarios([{ ...EMPTY_BENEFICIARIO }]);
    setOpenBenef([true]);
  };

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const canAccess = useCanAccessOrcamento(user);

  const currentAgent = user?.agent;
  const erpAgenteVendaId = currentAgent?.erp_agente_venda_id ?? currentAgent?.erpAgenteVendaId ?? null;

  const { data: erpProdutos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ["erpProdutos"],
    queryFn: async () => {
      const res = await fetch("/api/erp/produtos", {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar produtos do ERP");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!canAccess,
  });

  const { data: planosPagamento = [], isLoading: loadingPlanos } = useQuery({
    queryKey: ["erpPlanosPagamento"],
    queryFn: async () => {
      const res = await fetch("/api/erp/planos-pagamento", {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar planos de pagamento do ERP");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!canAccess,
  });

  const planoSelecionado = useMemo(
    () => planosPagamento.find((p) => String(p.id) === String(form.plano_pagamento_id)) || null,
    [planosPagamento, form.plano_pagamento_id]
  );

  const produtosFiltrados = useMemo(() => {
    if (!form.titulo_contrato) return [];
    return erpProdutos.filter((p) => {
      const titulo = (p.titulo_contrato || p.descricao || "").toLowerCase();
      return titulo.includes(form.titulo_contrato.toLowerCase());
    });
  }, [erpProdutos, form.titulo_contrato]);

  // BOM AUTO: produto de veículo presente no título selecionado.
  const produtoVeiculo = useMemo(
    () => produtosFiltrados.find((p) => isVeiculoProduto(p)) || null,
    [produtosFiltrados]
  );
  // Condutor presente diretamente no título (BOM AUTO puro, ex.: "BOM PASTOR - BOM AUTO").
  const produtoCondutorDireto = useMemo(
    () => produtosFiltrados.find((p) => isCondutorProduto(p)) || null,
    [produtosFiltrados]
  );
  // BOM AUTO puro: o título traz condutor E veículo — gera exatamente dois cards fixos (efeito abaixo).
  const isBomAuto = !!(produtoCondutorDireto && produtoVeiculo);
  // Condutor EFETIVO: nos contratos COMBO o título traz só "DADOS DO VEÍCULO" (sem o condutor). Pareia o
  // produto de condutor a partir do veículo (mesma variante CLIENTES / NÃO CLIENTES) buscando na lista
  // completa do ERP, para que todo veículo tenha um condutor — assim o fechamento do BOM AUTO no combo
  // não sai em branco (o item do condutor reaproveita a pessoa real do titular via dedup por CPF).
  const produtoCondutor = useMemo(() => {
    if (produtoCondutorDireto) return produtoCondutorDireto;
    if (!produtoVeiculo) return null;
    const descVeic = (produtoVeiculo.descricao || "").trim().toUpperCase();
    const alvo = descVeic.replace(/DADOS DO VE[IÍ]CULO/i, "DADOS DO CONDUTOR");
    if (!alvo || alvo === descVeic) return null; // descrição do veículo não bate o padrão esperado
    return (
      erpProdutos.find(
        (p) => isCondutorProduto(p) && (p.descricao || "").trim().toUpperCase() === alvo
      ) || null
    );
  }, [produtoCondutorDireto, produtoVeiculo, erpProdutos]);

  // Produtos de BENEFICIÁRIO (pet, condutor ou veículo): não aparecem na seleção do titular (Step 3)
  // e sim como produto fixo de cada beneficiário (Step 5).
  const produtosTitular = useMemo(
    () => produtosFiltrados.filter((p) => !isProdutoBeneficiario(p)),
    [produtosFiltrados]
  );
  const produtosBeneficiario = useMemo(() => {
    const base = produtosFiltrados.filter((p) => isProdutoBeneficiario(p));
    // COMBO: injeta o condutor pareado (ausente no título do combo) para que o card de condutor tenha
    // um produto válido e gere o item correspondente no ERP. No BOM AUTO puro o condutor já está em base.
    if (produtoCondutor && !base.some((p) => String(p.id) === String(produtoCondutor.id))) {
      return [...base, produtoCondutor];
    }
    return base;
  }, [produtosFiltrados, produtoCondutor]);
  // Produtos "DEPENDENTE" pagos (> 0,01) que o titular selecionou no Plano. Continuam sendo itens do
  // titular (cobrados no Plano), mas precisam aparecer como opção no card de beneficiário para cadastrar
  // o dependente vinculado ao item. Só os selecionados entram (linkar dependente só faz sentido no pedido).
  const produtosDependentePago = useMemo(
    () => produtosFiltrados.filter((p) => isDependentePagoProduto(p)),
    [produtosFiltrados]
  );
  const dependentePagoSelecionados = useMemo(
    () =>
      produtosDependentePago.filter((p) =>
        produtosSel.some((ps) => String(ps.produto_id) === String(p.id))
      ),
    [produtosDependentePago, produtosSel]
  );
  const dependentePagoIds = useMemo(
    () => dependentePagoSelecionados.map((p) => String(p.id)),
    [dependentePagoSelecionados]
  );

  // Quantidade de pessoas vinculadas a um produto = (titular incluído ? 1 : 0) + beneficiários atribuídos a ele.
  const qtyForProduto = (produtoId, incluirTitular) =>
    (incluirTitular ? 1 : 0) +
    beneficiarios.filter((b) => b.usua_nome_completo?.trim() && String(b.usua_produtos) === String(produtoId)).length;

  // Itens de beneficiário: produtos pet/condutor/veículo referenciados por algum beneficiário nomeado.
  // Não são escolhidos no Step 3 (titular); entram como item próprio, com preço padrão do ERP e sem titular.
  const benefItens = useMemo(() => {
    const refs = new Set(
      beneficiarios
        .filter((b) => b.usua_nome_completo?.trim() && b.usua_produtos)
        .map((b) => String(b.usua_produtos))
    );
    return produtosBeneficiario
      .filter((p) => refs.has(String(p.id)))
      .map((p) => ({
        produto_id: String(p.id),
        preco: p.preco_informado !== undefined ? String(p.preco_informado) : "0",
        incluir_titular: false,
        is_beneficiario: true,
      }));
  }, [beneficiarios, produtosBeneficiario]);

  // Lista completa de itens do orçamento = produtos do titular (Step 3) + itens de beneficiário (Step 5).
  const itensSel = useMemo(() => [...produtosSel, ...benefItens], [produtosSel, benefItens]);

  const produtosResumo = useMemo(
    () =>
      itensSel.map((ps) => {
        const prod = produtosFiltrados.find((p) => String(p.id) === String(ps.produto_id)) ||
          erpProdutos.find((p) => String(p.id) === String(ps.produto_id));
        const quantidade = qtyForProduto(ps.produto_id, ps.incluir_titular);
        const preco = Number(ps.preco) || 0;
        return {
          ...ps,
          descricao: prod?.descricao || prod?.titulo_contrato || `Produto ${ps.produto_id}`,
          quantidade,
          total: preco * quantidade,
        };
      }),
    [itensSel, produtosFiltrados, erpProdutos, beneficiarios]
  );

  const grandTotal = useMemo(
    () => produtosResumo.reduce((acc, p) => acc + p.total, 0),
    [produtosResumo]
  );

  // Opções de produto para cada beneficiário (Step 5): apenas produtos de beneficiário
  // (pet/condutor/veículo/vaga 0,01). Produtos de dependente pago (> 0,01) NÃO entram aqui —
  // eles ganham cards automáticos com produto pré-definido e bloqueado (ver useEffect abaixo).
  const opcoesBenefProduto = useMemo(
    () =>
      produtosBeneficiario.map((p) => ({
        produto_id: String(p.id),
        descricao: p.descricao || p.titulo_contrato || `Produto ${p.id}`,
      })),
    [produtosBeneficiario]
  );

  // BOM PET: ids dos produtos de pet — quando um beneficiário aponta para um deles,
  // o card mostra os campos estruturados do pet (nome/tipo/raça/cor/porte).
  const petProdutoIds = useMemo(
    () => produtosBeneficiario.filter((p) => isPetProduto(p)).map((p) => String(p.id)),
    [produtosBeneficiario]
  );

  // BOM PET: o orçamento é "modo pet" quando o titular escolheu um plano BOM PET no passo "Plano"
  // (ex.: "BOM PET (1 PET)", "BOM PET SAÚDE") e o contrato possui o produto de pet do beneficiário.
  // Nesse modo, todo card de beneficiário já mostra os campos do pet e o produto de pet é atribuído
  // automaticamente (o vendedor não precisa escolher o produto "NOME DO PET" manualmente).
  const isBomPet = useMemo(() => {
    if (isBomAuto) return false;
    if (petProdutoIds.length === 0) return false;
    return produtosSel.some((ps) => {
      const prod =
        produtosFiltrados.find((p) => String(p.id) === String(ps.produto_id)) ||
        erpProdutos.find((p) => String(p.id) === String(ps.produto_id));
      return prod && /BOM\s*PET/i.test(prod.descricao || prod.titulo_contrato || "");
    });
  }, [isBomAuto, petProdutoIds, produtosSel, produtosFiltrados, erpProdutos]);

  // BOM PET: produto de pet (beneficiário) usado para vincular os pets, casando com o plano do titular
  // — se o titular escolheu um plano "SAÚDE", usa o produto de pet "SAÚDE"; senão, o produto de pet padrão.
  const petBenefProdutoId = useMemo(() => {
    const petProds = produtosBeneficiario.filter((p) => isPetProduto(p));
    if (petProds.length === 0) return "";
    const titularSaude = produtosSel.some((ps) => {
      const prod =
        produtosFiltrados.find((p) => String(p.id) === String(ps.produto_id)) ||
        erpProdutos.find((p) => String(p.id) === String(ps.produto_id));
      const desc = prod ? `${prod.descricao || ""} ${prod.titulo_contrato || ""}` : "";
      return /BOM\s*PET/i.test(desc) && /SA[UÚ]DE/i.test(desc);
    });
    const match = petProds.find((p) => /SA[UÚ]DE/i.test(p.descricao || "") === titularSaude);
    return String((match || petProds[0]).id);
  }, [produtosBeneficiario, produtosSel, produtosFiltrados, erpProdutos]);

  // BOM AUTO: monta exatamente dois cards fixos de beneficiário (um para o produto "DADOS DO CONDUTOR"
  // e outro para "DADOS DO VEÍCULO"), com o produto pré-preenchido e bloqueado. Roda uma única vez por
  // título/produtos (o ref evita sobrescrever os dados que o vendedor já digitou).
  const bomAutoSetupRef = useRef("");
  useEffect(() => {
    if (!isBomAuto) {
      bomAutoSetupRef.current = "";
      return;
    }
    const condId = produtoCondutor ? String(produtoCondutor.id) : "";
    const veicId = produtoVeiculo ? String(produtoVeiculo.id) : "";
    if (!condId && !veicId) return; // produtos ainda não carregaram
    const key = `${form.titulo_contrato}|${condId}|${veicId}`;
    if (bomAutoSetupRef.current === key) return;
    const cards = [];
    if (produtoCondutor) cards.push({ ...EMPTY_BENEFICIARIO, usua_produtos: condId });
    if (produtoVeiculo) cards.push({ ...EMPTY_BENEFICIARIO, usua_produtos: veicId });
    setBeneficiarios(cards);
    setOpenBenef(cards.map(() => true));
    bomAutoSetupRef.current = key;
  }, [isBomAuto, produtoCondutor, produtoVeiculo, form.titulo_contrato]);

  // COMBO (não BOM AUTO puro): garante um card "DADOS DO CONDUTOR" pareado sempre que houver um card de
  // veículo. O condutor nasce com os dados do TITULAR — no fechamento/adesão do ERP o endereço e contato
  // são sempre do titular, e isso faz o item do condutor reaproveitar a pessoa real do contratante (dedup
  // por CPF no backend), evitando que o contrato BOM AUTO do combo saia em branco. Sincroniza o par:
  // adiciona o condutor quando surge um veículo e o remove quando o veículo é retirado.
  useEffect(() => {
    if (isBomAuto) return; // BOM AUTO puro já monta condutor + veículo no efeito acima
    if (!produtoVeiculo || !produtoCondutor) return;
    const veicId = String(produtoVeiculo.id);
    const condId = String(produtoCondutor.id);
    const temVeiculo = beneficiarios.some((b) => String(b.usua_produtos) === veicId);
    const temCondutor = beneficiarios.some((b) => String(b.usua_produtos) === condId);
    if (temVeiculo && !temCondutor) {
      setBeneficiarios((bs) => [
        ...bs,
        {
          ...EMPTY_BENEFICIARIO,
          usua_produtos: condId,
          usua_nome_completo: form.pessoa_contato || "",
          usua_cpf: form.cpf || "",
          usua_sexo: form.sexo || "",
          usua_telefone: form.celular || form.telefone || "",
        },
      ]);
      setOpenBenef((o) => [...o, true]);
    } else if (!temVeiculo && temCondutor) {
      const idxCond = beneficiarios.findIndex((b) => String(b.usua_produtos) === condId);
      setBeneficiarios((bs) => bs.filter((_, idx) => idx !== idxCond));
      setOpenBenef((o) => o.filter((_, idx) => idx !== idxCond));
    }
  }, [
    isBomAuto, produtoVeiculo, produtoCondutor, beneficiarios,
    form.pessoa_contato, form.cpf, form.sexo, form.celular, form.telefone,
  ]);

  // DEPENDENTE PAGO: cria/remove automaticamente 1 card de beneficiário por produto
  // "DEPENDENTE" com preço real (> 0,01) selecionado no Plano. O card nasce com o produto
  // pré-definido e bloqueado (limitado a 1 beneficiário); CPF, nome e data de nascimento
  // são obrigatórios. Quando o produto é desmarcado no Plano, o card correspondente é removido.
  useEffect(() => {
    const depPagoAllIds = new Set(produtosDependentePago.map((p) => String(p.id)));
    const depPagoSelIds = new Set(dependentePagoSelecionados.map((p) => String(p.id)));
    const cardsDepPagoIds = new Set(
      beneficiarios.filter((b) => depPagoAllIds.has(String(b.usua_produtos))).map((b) => String(b.usua_produtos))
    );
    const toAdd = [...depPagoSelIds].filter((id) => !cardsDepPagoIds.has(id));
    const toRemove = new Set([...cardsDepPagoIds].filter((id) => !depPagoSelIds.has(id)));
    if (toAdd.length === 0 && toRemove.size === 0) return;
    // índices que permanecem (mantém beneficiarios e openBenef alinhados por índice)
    const keepIdx = [];
    beneficiarios.forEach((b, idx) => {
      if (!toRemove.has(String(b.usua_produtos))) keepIdx.push(idx);
    });
    setBeneficiarios((prev) => {
      const kept = keepIdx.filter((idx) => idx < prev.length).map((idx) => prev[idx]);
      const novos = toAdd.map((id) => ({ ...EMPTY_BENEFICIARIO, usua_produtos: id }));
      return [...kept, ...novos];
    });
    // novos cards de dependente pago nascem abertos para o vendedor preencher
    setOpenBenef((o) => {
      const kept = keepIdx.map((idx) => (o[idx] !== undefined ? o[idx] : true));
      return [...kept, ...toAdd.map(() => true)];
    });
  }, [dependentePagoSelecionados, produtosDependentePago, beneficiarios]);

  // BOM PET: ao entrar no modo pet (ou trocar o produto de pet do contrato/plano), atribui o produto
  // de pet aos cards de beneficiário que ainda não apontam para um produto de pet. Assim os campos do
  // pet aparecem assim que o beneficiário é adicionado, sem o vendedor escolher o produto manualmente.
  useEffect(() => {
    if (!isBomPet || !petBenefProdutoId) return;
    setBeneficiarios((bs) => {
      let changed = false;
      const next = bs.map((b) => {
        const cur = String(b.usua_produtos || "");
        // já aponta para o produto de pet correto: não mexe
        if (cur === String(petBenefProdutoId)) return b;
        // card sem produto OU já é card de pet (variante antiga): atribui/migra o produto de pet
        // correto preservando os dados já preenchidos do pet (só troca usua_produtos)
        if (!cur || petProdutoIds.includes(cur)) {
          changed = true;
          return { ...b, usua_produtos: petBenefProdutoId };
        }
        return b;
      });
      return changed ? next : bs;
    });
  }, [isBomPet, petBenefProdutoId, petProdutoIds]);

  const toggleProduto = (prod) => {
    setProdutosSel((list) => {
      const exists = list.some((p) => String(p.produto_id) === String(prod.id));
      if (exists) {
        // ao remover o produto, limpa a atribuição dos beneficiários que apontavam para ele
        setBeneficiarios((bs) =>
          bs.map((b) => (String(b.usua_produtos) === String(prod.id) ? { ...b, usua_produtos: "" } : b))
        );
        return list.filter((p) => String(p.produto_id) !== String(prod.id));
      }
      return [
        ...list,
        {
          produto_id: String(prod.id),
          preco: prod.preco_informado !== undefined ? String(prod.preco_informado) : "",
          // Dependente pago (> 0,01): no ERP o item é vinculado só ao dependente, não ao titular —
          // por isso "incluir titular" nasce desligado (a quantidade vira o nº de dependentes).
          incluir_titular: !isDependentePagoProduto(prod),
        },
      ];
    });
  };

  const setProdutoField = (produtoId, field, value) => {
    setProdutosSel((list) =>
      list.map((p) => (String(p.produto_id) === String(produtoId) ? { ...p, [field]: value } : p))
    );
  };

  const lookupCpfMutation = useMutation({
    mutationFn: async (cpf) => {
      const r = await fetch(`/api/erp/lookup-cpf?cpf=${encodeURIComponent(cpf)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro ao buscar CPF");
      return data;
    },
    onSuccess: (data) => {
      setCpfLookup({ status: "found", ...data });
      set("contratante_pessoa", data.pessoa || "");
      if (data.nome) set("pessoa_contato", data.nome);
      if (data.cpf) set("cpf", formatCpf(data.cpf));
    },
    onError: (err) => {
      setCpfLookup({ status: "notfound", error: err.message });
    },
  });

  const lookupCepMutation = useMutation({
    mutationFn: async (cep) => {
      const raw = cep.replace(/\D/g, "");
      const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await r.json();
      if (data.erro) throw new Error("CEP não encontrado");
      return data;
    },
    onSuccess: (data) => {
      setCepLookup({ status: "found" });
      setForm((f) => ({
        ...f,
        un_lougradouro: (data.logradouro || "").toUpperCase(),
        un_bairro: (data.bairro || "").toUpperCase(),
        un_cidade: data.localidade ? `${data.localidade.toUpperCase()} - ${data.uf.toUpperCase()}` : f.un_cidade,
      }));
    },
    onError: (err) => setCepLookup({ status: "notfound", error: err.message }),
  });

  const payload = useMemo(() => {
    // Cada produto (titular + pet) vira um item; quantidade = nº de pessoas vinculadas (titular + beneficiários atribuídos).
    const itens = itensSel.map((ps) => {
      const prod = produtosFiltrados.find((p) => String(p.id) === String(ps.produto_id)) ||
        erpProdutos.find((p) => String(p.id) === String(ps.produto_id));
      const produtoIdNum = prod ? Number(prod.produto_id || prod.id) : Number(ps.produto_id);
      const beneficiariosDoItem = beneficiarios
        .filter((b) => b.usua_nome_completo?.trim() && String(b.usua_produtos) === String(ps.produto_id))
        .map((b) => ({
          nome: b.usua_nome_completo.trim(),
          cpf: b.usua_cpf || null,
          dataNascimento: b.usua_data_nascimento || null,
          sexo: b.usua_sexo || null,
          parentesco: b.usua_parentesco || null,
          telefone: b.usua_telefone || null,
        }));
      return {
        produtoId: produtoIdNum,
        preco: Number(ps.preco) || 0,
        incluirTitular: !!ps.incluir_titular,
        beneficiarios: beneficiariosDoItem,
      };
    });

    const p = {
      tipo_pedido: "ORÇAMENTO",
      nome_estabelecimento: NOME_ESTABELECIMENTO_FIXO,
      agente_venda_id: erpAgenteVendaId ? Number(erpAgenteVendaId) : undefined,
      usuario_inclusao: user?.email ? erpLoginFromEmail(user.email) : undefined,
      contratante_pessoa: form.contratante_pessoa || undefined,
      cpf: form.cpf || undefined,
      pessoa_contato: form.pessoa_contato || undefined,
      un_rg: form.un_rg || undefined,
      telefone: form.telefone || undefined,
      celular: form.celular || undefined,
      email_contato: form.email_contato || undefined,
      whatsapp_do_cliente: form.whatsapp_do_cliente || undefined,
      sexo: form.sexo || undefined,
      estado_civil: form.estado_civil || undefined,
      profissao: form.profissao || undefined,
      un_codigo_postal: form.un_codigo_postal ? form.un_codigo_postal.replace(/\D/g, "") : undefined,
      un_lougradouro: form.un_lougradouro || undefined,
      un_numero_lougradouro: form.un_numero_lougradouro || undefined,
      un_complemento_lougradouro: form.un_complemento_lougradouro || undefined,
      un_bairro: form.un_bairro || undefined,
      un_cidade: form.un_cidade || undefined,
      titulo_contrato: form.titulo_contrato || undefined,
      itens: itens.length ? itens : undefined,
      plano_pagamento: planoSelecionado?.plano_pagamento || form.plano_pagamento || undefined,
      numero_parcelas: planoSelecionado?.numero_parcelas != null ? Number(planoSelecionado.numero_parcelas) : undefined,
      quantidade_parcelas: form.quantidade_parcelas ? Number(form.quantidade_parcelas) : undefined,
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : undefined,
      prazo_pagamento_id: form.plano_pagamento_id ? Number(form.plano_pagamento_id) : undefined,
      observacoes: form.observacoes || undefined,
    };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  }, [form, itensSel, produtosFiltrados, erpProdutos, planoSelecionado, beneficiarios, erpAgenteVendaId, user]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/erp/orcamento", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      return { ok: r.ok, status: r.status, data };
    },
    onSuccess: ({ ok, data }) => {
      if (!ok) {
        setSubmitResult({ type: "error", message: data?.error || "Erro desconhecido", data });
        toast.error(data?.error || "Erro ao enviar orçamento");
        return;
      }
      if (data?.block) {
        setSubmitResult({ type: "error", message: data.error || `Bloco: ${data.block}`, data });
        toast.error(data.error || `Bloco: ${data.block}`);
        return;
      }
      if (data?.error) {
        setSubmitResult({ type: "error", message: data.error, data });
        toast.error(data.error);
        return;
      }
      // Defesa contra falha parcial silenciosa: o cabeçalho pode ter sido criado no ERP
      // sem que produto/beneficiários fossem gravados. Nunca tratar como sucesso.
      if (data?.dbWarning || data?.incomplete) {
        const msg = data.dbWarning || "Orçamento criado no ERP, mas o produto/beneficiários NÃO foram vinculados. O orçamento está incompleto e precisa ser corrigido.";
        setSubmitResult({ type: "error", message: msg, data });
        toast.error(msg);
        return;
      }
      if (!data?.dbInserted) {
        const msg = "Orçamento criado, mas não foi possível confirmar a gravação do produto. Verifique no ERP antes de prosseguir.";
        setSubmitResult({ type: "error", message: msg, data });
        toast.error(msg);
        return;
      }
      setSubmitResult({ type: "success", data });
      toast.success("Orçamento enviado com sucesso!");
    },
    onError: (err) => {
      setSubmitResult({ type: "error", message: err.message });
    },
  });

  const validateStep = () => {
    if (step === 1) {
      const cpfRaw = form.cpf.replace(/\D/g, "");
      if (!cpfRaw || !isValidCpf(form.cpf)) { toast.error("CPF inválido"); return false; }
      if (!form.pessoa_contato.trim()) { toast.error("Nome completo obrigatório"); return false; }
      if (!form.telefone.trim()) { toast.error("Telefone obrigatório"); return false; }
      if (form.celular.trim() && !isMobilePhone(form.celular)) {
        toast.error("Celular deve ser um número de celular válido (DDD + 9 dígitos)"); return false;
      }
    }
    if (step === 2) {
      if (form.un_codigo_postal.replace(/\D/g, "").length !== 8) { toast.error("CEP inválido (8 dígitos)"); return false; }
      if (!form.un_lougradouro.trim()) { toast.error("Logradouro obrigatório"); return false; }
      if (!form.un_numero_lougradouro.trim()) { toast.error("Número obrigatório"); return false; }
      if (!form.un_bairro.trim()) { toast.error("Bairro obrigatório"); return false; }
      if (!form.un_cidade.trim()) { toast.error("Cidade obrigatória"); return false; }
    }
    if (step === 3) {
      if (!form.titulo_contrato) { toast.error("Selecione o título do contrato"); return false; }
      if (produtosSel.length === 0) { toast.error("Selecione ao menos um produto"); return false; }
      // Produtos de pet têm preço padrão do ERP; a validação de preço vale só para os produtos do titular.
      const semPreco = produtosResumo.find((p) => !p.is_beneficiario && !(Number(p.preco) > 0));
      if (semPreco) { toast.error(`Informe um preço válido para "${semPreco.descricao}"`); return false; }
    }
    if (step === 5) {
      if (!form.plano_pagamento_id) { toast.error("Selecione o plano de pagamento"); return false; }
      const qtd = Number(form.quantidade_parcelas);
      if (!form.quantidade_parcelas || Number.isNaN(qtd) || qtd < 1) {
        toast.error("Informe uma quantidade de parcelas válida"); return false;
      }
    }
    if (step === 4) {
      // Condutor (só BOM AUTO) exige nome.
      const veicId = produtoVeiculo ? String(produtoVeiculo.id) : "";
      if (isBomAuto) {
        const condId = produtoCondutor ? String(produtoCondutor.id) : "";
        const cardCond = beneficiarios.find((b) => String(b.usua_produtos) === condId);
        if (cardCond && !cardCond.usua_nome_completo?.trim()) {
          toast.error("Preencha o nome do condutor"); return false;
        }
      }
      // Card de veículo (BOM AUTO ou produto de veículo escolhido em contrato COMBO): exige modelo, cor,
      // placa válida e ano (4 dígitos). Vale sempre que houver um card apontando para o produto de veículo.
      if (veicId) {
        const cardVeic = beneficiarios.find((b) => String(b.usua_produtos) === veicId);
        if (cardVeic) {
          const modelo = cardVeic.veic_modelo === "OUTRO" ? cardVeic.veic_modelo_outro : cardVeic.veic_modelo;
          const cor = cardVeic.veic_cor === "OUTRO" ? cardVeic.veic_cor_outro : cardVeic.veic_cor;
          if (!modelo?.trim()) { toast.error("Selecione ou informe o modelo do veículo"); return false; }
          if (!cor?.trim()) { toast.error("Selecione ou informe a cor do veículo"); return false; }
          if (!placaValida(cardVeic.veic_placa)) {
            toast.error("Informe uma placa válida (ex.: ABC1D23 ou ABC1234)"); return false;
          }
          if (!/^\d{4}$/.test((cardVeic.veic_ano || "").toString().trim())) {
            toast.error("Informe o ano do veículo com 4 dígitos"); return false;
          }
        }
      }
      // BOM PET: cards atribuídos a um produto de pet exigem todos os campos (nome, tipo, raça, cor e porte).
      const petIncompleto = beneficiarios.find(
        (b) => petProdutoIds.includes(String(b.usua_produtos)) && !montarNomePet(b)
      );
      if (petIncompleto) {
        toast.error("Preencha todos os dados do pet (nome, tipo, raça, cor e porte)"); return false;
      }
      // Beneficiários de dependente pago (produto DEPENDENTE > 0,01): CPF, nome completo e
      // data de nascimento são obrigatórios, pois o card é criado automaticamente para o item.
      for (const b of beneficiarios) {
        if (!dependentePagoIds.includes(String(b.usua_produtos))) continue;
        const prod = erpProdutos.find((p) => String(p.id) === String(b.usua_produtos));
        const desc = prod?.descricao || "Dependente";
        if (!b.usua_nome_completo?.trim()) {
          toast.error(`Informe o nome completo do beneficiário para "${desc}"`); return false;
        }
        if (!isValidCpf(b.usua_cpf || "")) {
          toast.error(`Informe um CPF válido para o beneficiário de "${desc}"`); return false;
        }
        if (!b.usua_data_nascimento) {
          toast.error(`Informe a data de nascimento do beneficiário de "${desc}"`); return false;
        }
      }
      // Beneficiário com nome precisa estar atribuído a um produto válido (titular ou pet).
      // Exclui cards de dependente pago — produto já pré-definido, não está em opcoesBenefProduto.
      const semProduto = beneficiarios.find(
        (b) =>
          b.usua_nome_completo?.trim() &&
          !dependentePagoIds.includes(String(b.usua_produtos)) &&
          !opcoesBenefProduto.some((p) => String(p.produto_id) === String(b.usua_produtos))
      );
      if (semProduto) {
        toast.error(`Selecione o produto/plano de "${semProduto.usua_nome_completo.trim()}"`); return false;
      }
      // Beneficiário comum (não condutor/veículo e não pet) com nome preenchido precisa de CPF válido.
      if (!isBomAuto) {
        const benefSemCpf = beneficiarios.find(
          (b) =>
            b.usua_nome_completo?.trim() &&
            // Card é de pet (isento de CPF) só se for realmente pet — dependente pago (> 0,01) tem
            // produto próprio e exige CPF mesmo quando o orçamento está em modo BOM PET.
            !(
              !dependentePagoIds.includes(String(b.usua_produtos)) &&
              (isBomPet || petProdutoIds.includes(String(b.usua_produtos)))
            ) &&
            // Card de veículo não tem CPF (nome é montado dos campos do veículo).
            String(b.usua_produtos) !== veicId &&
            !isValidCpf(b.usua_cpf || "")
        );
        if (benefSemCpf) {
          toast.error(`Informe um CPF válido para "${benefSemCpf.usua_nome_completo.trim()}"`); return false;
        }
      }
      // Todo produto precisa de ao menos uma pessoa (titular ou beneficiário), senão o fechamento falha no ERP.
      const vazio = produtosResumo.find((p) => p.quantidade < 1);
      if (vazio) {
        toast.error(`O produto "${vazio.descricao}" precisa de ao menos uma pessoa (titular ou beneficiário)`); return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const addBeneficiario = () => {
    if (beneficiarios.length >= 15) {
      toast.error("Limite de 15 beneficiários atingido");
      return;
    }
    const newIndex = beneficiarios.length;
    // BOM PET: novo card já nasce vinculado ao produto de pet (campos do pet aparecem de imediato).
    const novoBenef = isBomPet && petBenefProdutoId
      ? { ...EMPTY_BENEFICIARIO, usua_produtos: petBenefProdutoId }
      : { ...EMPTY_BENEFICIARIO };
    setBeneficiarios((b) => [...b, novoBenef]);
    setOpenBenef((o) => [...o, true]);
    // Direciona a tela para o novo card recém-adicionado, sem o usuário rolar manualmente.
    setTimeout(() => {
      document.getElementById(`benef-card-${newIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const removeBeneficiario = (i) => {
    setBeneficiarios((b) => b.filter((_, idx) => idx !== i));
    setOpenBenef((o) => o.filter((_, idx) => idx !== i));
  };

  const setBenef = (i, k, v) => {
    setBeneficiarios((b) => b.map((benef, idx) => {
      if (idx !== i) return benef;
      // Ao trocar de um produto de pet para um não-pet, limpa os campos e o nome combinado do pet
      // (evita que o formato NOME/TIPO/RAÇA/COR/PORTE vaze para um beneficiário comum).
      if (k === "usua_produtos") {
        const wasPet = petProdutoIds.includes(String(benef.usua_produtos));
        const nowPet = petProdutoIds.includes(String(v));
        if (wasPet && !nowPet) {
          return {
            ...benef,
            usua_produtos: v,
            usua_nome_completo: "",
            pet_nome: "", pet_tipo: "", pet_tipo_outro: "",
            pet_raca: "", pet_raca_outro: "", pet_cor: "", pet_cor_outro: "", pet_porte: "",
          };
        }
      }
      return { ...benef, [k]: v };
    }));
  };

  // BOM AUTO (card do veículo): atualiza um campo do veículo e recalcula usua_nome_completo
  // (valor combinado MODELO/COR/PLACA/ANO enviado ao ERP).
  const setVeiculoField = (i, k, v) => {
    setBeneficiarios((b) =>
      b.map((benef, idx) => {
        if (idx !== i) return benef;
        const merged = { ...benef, [k]: v };
        merged.usua_nome_completo = montarNomeVeiculo(merged);
        return merged;
      })
    );
  };

  // BOM PET (card do pet): atualiza um campo do pet e recalcula usua_nome_completo
  // (valor combinado NOME/TIPO/RAÇA/COR/PORTE enviado ao ERP). Trocar o tipo limpa a raça.
  const setPetField = (i, k, v) => {
    setBeneficiarios((b) =>
      b.map((benef, idx) => {
        if (idx !== i) return benef;
        const merged = { ...benef, [k]: v };
        if (k === "pet_tipo") { merged.pet_raca = ""; merged.pet_raca_outro = ""; }
        merged.usua_nome_completo = montarNomePet(merged);
        return merged;
      })
    );
  };

  const toggleBenef = (i) => setOpenBenef((o) => {
    const next = [...o];
    while (next.length <= i) next.push(true);
    next[i] = !next[i];
    return next;
  });

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (canAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-lg font-semibold text-slate-700">Acesso não permitido</p>
        <Button variant="outline" onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}>
          Voltar ao Upsell
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Novo Orçamento ERP</h1>
          <p className="text-sm text-slate-500">Criação de orçamento via PrePropostaUsuarioSgprc</p>
        </div>
      </div>

      <ProgressBar step={step} />

      {submitResult ? (
        <SubmitResult result={submitResult} onReset={() => { setSubmitResult(null); setStep(1); }} />
      ) : (
        <>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-700">
                {(() => { const S = STEPS[step - 1]; return <S.icon className="w-5 h-5 text-violet-500" />; })()}
                {STEPS[step - 1].label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 && (
                <Step1
                  form={form}
                  set={set}
                  cpfLookup={cpfLookup}
                  setCpfLookup={setCpfLookup}
                  lookupCpfMutation={lookupCpfMutation}
                />
              )}
              {step === 2 && (
                <Step2
                  form={form}
                  set={set}
                  cepLookup={cepLookup}
                  setCepLookup={setCepLookup}
                  lookupCepMutation={lookupCepMutation}
                />
              )}
              {step === 3 && (
                <Step3
                  form={form}
                  set={set}
                  setTituloContrato={setTituloContrato}
                  produtosFiltrados={produtosTitular}
                  produtosSel={produtosSel}
                  produtosResumo={produtosResumo}
                  grandTotal={grandTotal}
                  toggleProduto={toggleProduto}
                  setProdutoField={setProdutoField}
                  loadingProdutos={loadingProdutos}
                />
              )}
              {step === 4 && (
                <Step5
                  beneficiarios={beneficiarios}
                  openBenef={openBenef}
                  produtosResumo={produtosResumo}
                  opcoesBenefProduto={opcoesBenefProduto}
                  allProdutos={erpProdutos}
                  setBenef={setBenef}
                  setVeiculoField={setVeiculoField}
                  setPetField={setPetField}
                  toggleBenef={toggleBenef}
                  addBeneficiario={addBeneficiario}
                  removeBeneficiario={removeBeneficiario}
                  isBomAuto={isBomAuto}
                  isBomPet={isBomPet}
                  produtoVeiculoId={produtoVeiculo ? String(produtoVeiculo.id) : ""}
                  produtoCondutorId={produtoCondutor ? String(produtoCondutor.id) : ""}
                  petProdutoIds={petProdutoIds}
                  dependentePagoIds={dependentePagoIds}
                />
              )}
              {step === 5 && <Step4 form={form} set={set} planosPagamento={planosPagamento} loadingPlanos={loadingPlanos} planoSelecionado={planoSelecionado} />}
              {step === 6 && (
                <Step6
                  form={form}
                  beneficiarios={beneficiarios}
                  produtosResumo={produtosResumo}
                  grandTotal={grandTotal}
                  payload={payload}
                  currentAgent={currentAgent}
                  user={user}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            {step < 6 ? (
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleNext}
              >
                Próximo <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando ao ERP...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Confirmar e Enviar ao ERP</>
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-full transition-all",
                done && "bg-violet-100 text-violet-700",
                active && "bg-violet-600 text-white shadow",
                !done && !active && "text-slate-400"
              )}
            >
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <span className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[10px] flex-shrink-0",
                  active ? "border-white bg-white/20 text-white" : "border-slate-300"
                )}>{s.id}</span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px flex-1 mx-1", done ? "bg-violet-300" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ form, set, cpfLookup, setCpfLookup, lookupCpfMutation }) {
  const handleCpfChange = (v) => {
    const masked = formatCpf(v);
    set("cpf", masked);
    setCpfLookup(null);
    const raw = masked.replace(/\D/g, "");
    if (raw.length === 11 && isValidCpf(masked)) {
      lookupCpfMutation.mutate(masked);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>CPF <span className="text-red-500">*</span></Label>
        <div className="relative">
          <Input
            value={form.cpf}
            onChange={(e) => handleCpfChange(e.target.value)}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {lookupCpfMutation.isPending && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-violet-500" />
          )}
          {cpfLookup?.status === "found" && (
            <CheckCircle2 className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
          )}
        </div>
        {cpfLookup?.status === "found" && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Encontrado no ERP: {cpfLookup.nome}
          </p>
        )}
        {cpfLookup?.status === "notfound" && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Não encontrado no ERP — preencha manualmente
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Nome completo <span className="text-red-500">*</span></Label>
        <Input
          value={form.pessoa_contato}
          onChange={(e) => set("pessoa_contato", e.target.value.toUpperCase())}
          placeholder="NOME COMPLETO"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Telefone <span className="text-red-500">*</span></Label>
          <Input
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(51) 99999-9999"
          />
        </div>
        <div className="space-y-1">
          <Label>RG</Label>
          <Input
            value={form.un_rg}
            onChange={(e) => set("un_rg", e.target.value)}
            placeholder="Documento RG"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Celular</Label>
          <Input
            value={form.celular}
            onChange={(e) => set("celular", formatMobilePhone(e.target.value))}
            placeholder="(51) 99999-9999"
            maxLength={15}
          />
          <p className="text-xs text-slate-400">Opcional — somente celular (DDD + 9 dígitos)</p>
        </div>
        <div className="space-y-1">
          <Label>Telefone</Label>
          <Input
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(51) 3333-3333"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Sexo <span className="text-red-500">*</span></Label>
          <Select value={form.sexo} onValueChange={(v) => set("sexo", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {SEXO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Estado civil <span className="text-red-500">*</span></Label>
          <Select value={form.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_CIVIL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Profissão <span className="text-red-500">*</span></Label>
          <Select value={form.profissao} onValueChange={(v) => set("profissao", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {PROFISSAO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input
            type="email"
            value={form.email_contato}
            onChange={(e) => set("email_contato", e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
        <div className="space-y-1">
          <Label>WhatsApp</Label>
          <Input
            value={form.whatsapp_do_cliente}
            onChange={(e) => set("whatsapp_do_cliente", e.target.value)}
            placeholder="(51) 99999-9999"
          />
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>Celular, Sexo, Estado civil e Profissão são campos obrigatórios no fechamento do ERP. Preencha-os para evitar erro de validação.</span>
      </div>
    </div>
  );
}

function Step2({ form, set, cepLookup, setCepLookup, lookupCepMutation }) {
  const handleCepChange = (v) => {
    const masked = formatCep(v);
    set("un_codigo_postal", masked);
    setCepLookup(null);
    const raw = masked.replace(/\D/g, "");
    if (raw.length === 8) lookupCepMutation.mutate(masked);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>CEP <span className="text-red-500">*</span></Label>
        <div className="relative">
          <Input
            value={form.un_codigo_postal}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
          />
          {lookupCepMutation.isPending && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-violet-500" />
          )}
          {cepLookup?.status === "found" && (
            <CheckCircle2 className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
          )}
        </div>
        {cepLookup?.status === "notfound" && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> CEP não encontrado
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Logradouro <span className="text-red-500">*</span></Label>
        <Input
          value={form.un_lougradouro}
          onChange={(e) => set("un_lougradouro", e.target.value.toUpperCase())}
          placeholder="RUA EXEMPLO"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Número <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_numero_lougradouro}
            onChange={(e) => set("un_numero_lougradouro", e.target.value)}
            placeholder="123"
          />
        </div>
        <div className="space-y-1">
          <Label>Complemento</Label>
          <Input
            value={form.un_complemento_lougradouro}
            onChange={(e) => set("un_complemento_lougradouro", e.target.value.toUpperCase())}
            placeholder="APTO 101"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Bairro <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_bairro}
            onChange={(e) => set("un_bairro", e.target.value.toUpperCase())}
            placeholder="CENTRO"
          />
        </div>
        <div className="space-y-1">
          <Label>Cidade <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_cidade}
            onChange={(e) => set("un_cidade", e.target.value.toUpperCase())}
            placeholder="CANOAS - RS"
          />
        </div>
      </div>
    </div>
  );
}

function Step3({ form, set, setTituloContrato, produtosFiltrados, produtosSel, produtosResumo, grandTotal, toggleProduto, setProdutoField, loadingProdutos }) {
  const isSelected = (id) => produtosSel.some((p) => String(p.produto_id) === String(id));
  const resumoById = (id) => produtosResumo.find((p) => String(p.produto_id) === String(id));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Título do contrato <span className="text-red-500">*</span></Label>
        <Select
          value={form.titulo_contrato}
          onValueChange={(v) => setTituloContrato(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o título..." />
          </SelectTrigger>
          <SelectContent>
            {TITULO_CONTRATO_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Produtos / planos <span className="text-red-500">*</span></Label>
        <p className="text-xs text-slate-400">
          Marque um ou mais produtos. Cada produto vira um item do orçamento. A quantidade de cada item é
          o número de pessoas vinculadas (titular + beneficiários).
        </p>
        {loadingProdutos ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 p-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando produtos do ERP...
          </div>
        ) : !form.titulo_contrato ? (
          <p className="text-xs text-slate-400 p-2">Selecione o título do contrato primeiro</p>
        ) : produtosFiltrados.length === 0 ? (
          <p className="text-xs text-amber-600 p-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Nenhum produto encontrado para este título
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {produtosFiltrados.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-50 transition-colors",
                  isSelected(p.id) && "bg-violet-50"
                )}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-violet-600 flex-shrink-0"
                  checked={isSelected(p.id)}
                  onChange={() => toggleProduto(p)}
                />
                <span className="text-sm text-slate-700 flex-1">
                  {p.descricao || p.titulo_contrato || `Produto ${p.id}`}
                </span>
                {p.preco_informado !== undefined && (
                  <span className="text-xs text-slate-400">R$ {Number(p.preco_informado).toFixed(2)}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {produtosSel.length > 0 && (
        <div className="space-y-2">
          <Label>Itens selecionados</Label>
          {produtosSel.map((ps) => {
            const r = resumoById(ps.produto_id) || { descricao: ps.produto_id, quantidade: 0, total: 0 };
            const prodOriginal = produtosFiltrados.find((p) => String(p.id) === String(ps.produto_id));
            const isDepPago = prodOriginal ? isDependentePagoProduto(prodOriginal) : false;
            return (
              <Card key={ps.produto_id} className="border-violet-200">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">{r.descricao}</span>
                    <button
                      type="button"
                      onClick={() => toggleProduto({ id: ps.produto_id })}
                      className="text-red-400 hover:text-red-600 p-1 rounded flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Preço unitário <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ps.preco}
                        onChange={(e) => setProdutoField(ps.produto_id, "preco", e.target.value)}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                    {isDepPago ? (
                      <div className="flex items-center pb-2">
                        <span className="text-xs text-slate-500">
                          Item vinculado ao(s) dependente(s) — cadastre-os na etapa de Beneficiários.
                        </span>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 pb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-violet-600"
                          checked={!!ps.incluir_titular}
                          onChange={(e) => setProdutoField(ps.produto_id, "incluir_titular", e.target.checked)}
                        />
                        <span className="text-xs text-slate-600">Incluir titular neste item</span>
                      </label>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <span>Qtd. (pessoas): <strong className="text-slate-700">{r.quantidade}</strong></span>
                    <span>Total do item: <strong className="text-slate-700">R$ {r.total.toFixed(2)}</strong></span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <div className="flex items-center justify-between p-3 bg-violet-50 border border-violet-200 rounded-lg">
            <span className="text-sm font-medium text-violet-700">Total do orçamento</span>
            <span className="text-base font-bold text-violet-700">R$ {grandTotal.toFixed(2)}</span>
          </div>
          <p className="text-xs text-slate-400">
            A quantidade é atualizada conforme você atribui beneficiários a cada produto no passo "Beneficiários".
          </p>
        </div>
      )}
    </div>
  );
}

function Step4({ form, set, planosPagamento, loadingPlanos, planoSelecionado }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Plano de pagamento <span className="text-red-500">*</span></Label>
        <Select
          value={form.plano_pagamento_id}
          onValueChange={(v) => {
            set("plano_pagamento_id", v);
            const p = planosPagamento.find((pl) => String(pl.id) === String(v));
            set("plano_pagamento", p?.plano_pagamento || "");
          }}
          disabled={loadingPlanos}
        >
          <SelectTrigger>
            <SelectValue placeholder={loadingPlanos ? "Carregando planos..." : "Selecione..."} />
          </SelectTrigger>
          <SelectContent>
            {planosPagamento.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.plano_pagamento}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {planoSelecionado?.numero_parcelas != null && (
          <p className="text-xs text-slate-500">Número de parcelas do plano: <strong>{planoSelecionado.numero_parcelas}</strong></p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Quantidade de parcelas <span className="text-red-500">*</span></Label>
          <Select value={form.quantidade_parcelas} onValueChange={(v) => set("quantidade_parcelas", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {QUANTIDADE_PARCELAS_OPTIONS.map((q) => (
                <SelectItem key={q} value={q}>{q}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Dia de vencimento</Label>
          <Select value={form.dia_vencimento} onValueChange={(v) => set("dia_vencimento", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {DIA_VENCIMENTO_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(Number(d))}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Observações</Label>
        <Textarea
          value={form.observacoes}
          onChange={(e) => set("observacoes", e.target.value)}
          placeholder="Observações adicionais..."
          rows={3}
        />
      </div>

      <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700 space-y-1">
        <p className="font-medium">Após o envio, o orçamento será fechado automaticamente (situação "I") e o pagamento registrado no ERP. A aprovação (situação "A") continua manual.</p>
      </div>
    </div>
  );
}

function Step5({ beneficiarios, openBenef, produtosResumo, opcoesBenefProduto, allProdutos = [], setBenef, setVeiculoField, setPetField, toggleBenef, addBeneficiario, removeBeneficiario, isBomAuto, isBomPet = false, produtoVeiculoId, produtoCondutorId = "", petProdutoIds = [], dependentePagoIds = [] }) {
  const descProduto = (produtoId) => {
    const fromOpcoes = opcoesBenefProduto.find((p) => String(p.produto_id) === String(produtoId))?.descricao;
    if (fromOpcoes) return fromOpcoes;
    // dep pago não está em opcoesBenefProduto — busca na lista completa
    return allProdutos.find((p) => String(p.id) === String(produtoId))?.descricao || "";
  };
  // Card de dependente pago: produto DEPENDENTE com preço > 0,01 (card criado automaticamente).
  const isDepPagoCard = (b) => dependentePagoIds.includes(String(b.usua_produtos));
  // Em modo BOM PET todo card é de pet; fora dele, só os cards atribuídos a um produto de pet.
  // EXCEÇÃO: cards de dependente pago (produto DEPENDENTE > 0,01) nunca são de pet, mesmo em modo
  // BOM PET — eles têm produto próprio e usam os campos comuns de beneficiário (CPF, nome, parentesco).
  const isPetCard = (b) =>
    !dependentePagoIds.includes(String(b.usua_produtos)) &&
    (isBomPet || petProdutoIds.includes(String(b.usua_produtos)));
  // Card de veículo: mostra os campos do veículo (modelo/cor/placa/ano) sempre que o card aponta para o
  // produto "DADOS DO VEÍCULO" — não só em modo BOM AUTO. Em contratos COMBO (ex.: "COMBO MULTI ESPECIAL")
  // o produto de veículo é escolhido como beneficiário comum, então o card precisa trocar para esses campos.
  const isVeiculoCard = (b) =>
    !!produtoVeiculoId && String(b.usua_produtos) === String(produtoVeiculoId);
  // Card de condutor pareado (contratos COMBO): produto fixo (read-only), pré-preenchido com o titular.
  const isCondutorCard = (b) =>
    !!produtoCondutorId && String(b.usua_produtos) === String(produtoCondutorId);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {isBomAuto
            ? "BOM AUTO — preencha os dados do condutor e do veículo (produtos definidos automaticamente)"
            : isBomPet
            ? `BOM PET — preencha os dados de cada pet (plano definido no passo "Plano")`
            : `${beneficiarios.length} beneficiário(s) — cada um deve ser atribuído a um produto/plano`}
        </p>
        {!isBomAuto && (
          <Button type="button" variant="outline" size="sm" onClick={addBeneficiario} className="text-violet-600 border-violet-200 hover:bg-violet-50">
            <Plus className="w-4 h-4 mr-1" /> Adicionar beneficiário
          </Button>
        )}
      </div>

      {beneficiarios.map((b, i) => (
        <Card key={i} id={`benef-card-${i}`} className="border-slate-200">
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 rounded-t-lg"
            onClick={() => toggleBenef(i)}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-violet-500" />
              <span className="font-medium text-sm text-slate-700">
                {b.usua_nome_completo || ((isBomAuto || isVeiculoCard(b) || isCondutorCard(b)) ? descProduto(b.usua_produtos) || `Beneficiário ${i + 1}` : isPetCard(b) ? `Pet ${i + 1}` : `Beneficiário ${i + 1}`)}
                {b.usua_parentesco && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {PARENTESCO_OPTIONS.find((p) => p.value === b.usua_parentesco)?.label || b.usua_parentesco}
                  </Badge>
                )}
              </span>
              {!isBomAuto && !isBomPet && i === 0 && !isDepPagoCard(b) && <Badge className="bg-violet-100 text-violet-700 text-xs">Principal</Badge>}
              {isCondutorCard(b) && <Badge className="bg-violet-100 text-violet-700 text-xs">Condutor</Badge>}
              {isDepPagoCard(b) && <Badge className="bg-amber-100 text-amber-700 text-xs">Dependente</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {!isBomAuto && i > 0 && !isCondutorCard(b) && !isDepPagoCard(b) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeBeneficiario(i); }}
                  className="text-red-400 hover:text-red-600 p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {openBenef[i] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>

          {openBenef[i] && (
            <CardContent className="pt-0 pb-4 space-y-3">
              {isVeiculoCard(b) ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Modelo do veículo <span className="text-red-500">*</span></Label>
                      <Select
                        value={b.veic_modelo || ""}
                        onValueChange={(v) => setVeiculoField(i, "veic_modelo", v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione o modelo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {VEICULO_MODELO_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>{o === "OUTRO" ? "Outro" : o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {b.veic_modelo === "OUTRO" && (
                        <Input
                          className="mt-1"
                          value={b.veic_modelo_outro || ""}
                          onChange={(e) => setVeiculoField(i, "veic_modelo_outro", e.target.value.toUpperCase())}
                          placeholder="INFORME O MODELO"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cor <span className="text-red-500">*</span></Label>
                      <Select
                        value={b.veic_cor || ""}
                        onValueChange={(v) => setVeiculoField(i, "veic_cor", v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione a cor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {VEICULO_COR_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>{o === "OUTRO" ? "Outro" : o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {b.veic_cor === "OUTRO" && (
                        <Input
                          className="mt-1"
                          value={b.veic_cor_outro || ""}
                          onChange={(e) => setVeiculoField(i, "veic_cor_outro", e.target.value.toUpperCase())}
                          placeholder="INFORME A COR"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Placa <span className="text-red-500">*</span></Label>
                      <Input
                        value={b.veic_placa || ""}
                        onChange={(e) => setVeiculoField(i, "veic_placa", normalizaPlaca(e.target.value))}
                        placeholder="ABC1D23"
                        maxLength={7}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ano <span className="text-red-500">*</span></Label>
                      <Input
                        value={b.veic_ano || ""}
                        onChange={(e) => setVeiculoField(i, "veic_ano", e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="2021"
                        inputMode="numeric"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  {b.usua_nome_completo && (
                    <p className="text-xs text-slate-500">
                      Será enviado ao ERP como: <span className="font-medium text-slate-700">{b.usua_nome_completo}</span>
                    </p>
                  )}
                </>
              ) : isPetCard(b) ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do pet <span className="text-red-500">*</span></Label>
                      <Input
                        value={b.pet_nome || ""}
                        onChange={(e) => setPetField(i, "pet_nome", e.target.value.toUpperCase())}
                        placeholder="EX.: ZARA"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de pet <span className="text-red-500">*</span></Label>
                      <Select value={b.pet_tipo || ""} onValueChange={(v) => setPetField(i, "pet_tipo", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione o tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PET_TIPO_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>{o === "OUTRO" ? "Outro" : o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {b.pet_tipo === "OUTRO" && (
                        <Input
                          className="mt-1"
                          value={b.pet_tipo_outro || ""}
                          onChange={(e) => setPetField(i, "pet_tipo_outro", e.target.value.toUpperCase())}
                          placeholder="INFORME O TIPO"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Raça <span className="text-red-500">*</span></Label>
                      <Select value={b.pet_raca || ""} onValueChange={(v) => setPetField(i, "pet_raca", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione a raça..." />
                        </SelectTrigger>
                        <SelectContent>
                          {racasPorTipo(b.pet_tipo).map((o) => (
                            <SelectItem key={o} value={o}>{o === "OUTROS" ? "Outros" : o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {b.pet_raca === "OUTROS" && (
                        <Input
                          className="mt-1"
                          value={b.pet_raca_outro || ""}
                          onChange={(e) => setPetField(i, "pet_raca_outro", e.target.value.toUpperCase())}
                          placeholder="INFORME A RAÇA"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cor <span className="text-red-500">*</span></Label>
                      <Select value={b.pet_cor || ""} onValueChange={(v) => setPetField(i, "pet_cor", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione a cor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PET_COR_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>{o === "OUTRO" ? "Outro" : o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {b.pet_cor === "OUTRO" && (
                        <Input
                          className="mt-1"
                          value={b.pet_cor_outro || ""}
                          onChange={(e) => setPetField(i, "pet_cor_outro", e.target.value.toUpperCase())}
                          placeholder="INFORME A COR"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Porte <span className="text-red-500">*</span></Label>
                      <Select value={b.pet_porte || ""} onValueChange={(v) => setPetField(i, "pet_porte", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione o porte..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PET_PORTE_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {b.usua_nome_completo && (
                    <p className="text-xs text-slate-500">
                      Será enviado ao ERP como: <span className="font-medium text-slate-700">{b.usua_nome_completo}</span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">CPF{!isBomAuto && <span className="text-red-500"> *</span>}</Label>
                      <Input
                        value={b.usua_cpf}
                        onChange={(e) => setBenef(i, "usua_cpf", formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome completo <span className="text-red-500">*</span></Label>
                      <Input
                        value={b.usua_nome_completo}
                        onChange={(e) => setBenef(i, "usua_nome_completo", e.target.value.toUpperCase())}
                        placeholder="NOME COMPLETO"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Data nascimento{isDepPagoCard(b) && <span className="text-red-500"> *</span>}</Label>
                      <Input
                        type="date"
                        value={b.usua_data_nascimento}
                        onChange={(e) => setBenef(i, "usua_data_nascimento", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sexo</Label>
                      <Select value={b.usua_sexo} onValueChange={(v) => setBenef(i, "usua_sexo", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sexo" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEXO_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Parentesco</Label>
                      <Select value={b.usua_parentesco} onValueChange={(v) => setBenef(i, "usua_parentesco", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Parentesco" />
                        </SelectTrigger>
                        <SelectContent>
                          {PARENTESCO_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      value={b.usua_telefone}
                      onChange={(e) => setBenef(i, "usua_telefone", e.target.value)}
                      placeholder="(51) 99999-9999"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Produto / plano <span className="text-red-500">*</span></Label>
                {isBomAuto || (isBomPet && isPetCard(b)) || isCondutorCard(b) || isDepPagoCard(b) ? (
                  <div className="h-9 flex items-center px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    {descProduto(b.usua_produtos) || "—"}
                  </div>
                ) : opcoesBenefProduto.length === 0 ? (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Selecione ao menos um produto no passo "Plano"
                  </p>
                ) : (
                  <Select
                    value={b.usua_produtos ? String(b.usua_produtos) : ""}
                    onValueChange={(v) => setBenef(i, "usua_produtos", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o produto deste beneficiário..." />
                    </SelectTrigger>
                    <SelectContent>
                      {opcoesBenefProduto
                        .filter((p) => !produtoCondutorId || String(p.produto_id) !== String(produtoCondutorId))
                        .map((p) => (
                          <SelectItem key={p.produto_id} value={String(p.produto_id)}>
                            {p.descricao}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {!isBomAuto && beneficiarios.length < 15 && (
        <button
          type="button"
          onClick={addBeneficiario}
          className="w-full flex items-center justify-center gap-1 py-3 rounded-lg border-2 border-dashed border-violet-200 text-violet-600 text-sm font-medium hover:bg-violet-50 hover:border-violet-300 transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar beneficiário
        </button>
      )}
    </div>
  );
}

function Step6({ form, beneficiarios, produtosResumo, grandTotal, payload, currentAgent, user }) {
  const beneficiariosValidos = beneficiarios.filter((b) => b.usua_nome_completo?.trim());
  const descricaoProduto = (id) =>
    produtosResumo.find((p) => String(p.produto_id) === String(id))?.descricao || "—";

  return (
    <div className="space-y-5">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Revise os dados antes de enviar</p>
          <p className="text-xs mt-1">Após o envio, o orçamento será criado no ERP. Esta ação não pode ser desfeita por aqui.</p>
        </div>
      </div>

      <ReviewSection title="Contratante" icon={User}>
        <ReviewRow label="CPF" value={form.cpf} />
        <ReviewRow label="Nome" value={form.pessoa_contato} />
        <ReviewRow label="Telefone" value={form.telefone} />
        {form.email_contato && <ReviewRow label="E-mail" value={form.email_contato} />}
        {form.whatsapp_do_cliente && <ReviewRow label="WhatsApp" value={form.whatsapp_do_cliente} />}
      </ReviewSection>

      <ReviewSection title="Endereço" icon={MapPin}>
        <ReviewRow label="CEP" value={form.un_codigo_postal} />
        <ReviewRow label="Endereço" value={`${form.un_lougradouro}, ${form.un_numero_lougradouro}${form.un_complemento_lougradouro ? ` - ${form.un_complemento_lougradouro}` : ""}`} />
        <ReviewRow label="Bairro" value={form.un_bairro} />
        <ReviewRow label="Cidade" value={form.un_cidade} />
      </ReviewSection>

      <ReviewSection title="Plano e Produtos" icon={Package}>
        <ReviewRow label="Título" value={form.titulo_contrato} />
      </ReviewSection>
      <div className="space-y-1 -mt-2">
        {produtosResumo.map((p) => (
          <div key={p.produto_id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
            <span className="text-slate-700 truncate mr-2">
              {p.descricao}
              {p.incluir_titular && <span className="text-violet-500"> · titular</span>}
            </span>
            <span className="text-slate-500 whitespace-nowrap">
              R$ {(Number(p.preco) || 0).toFixed(2)} × {p.quantidade} = <strong className="text-slate-700">R$ {p.total.toFixed(2)}</strong>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between text-xs font-semibold text-violet-700 px-2 py-1.5">
          <span>Total</span>
          <span>R$ {grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <ReviewSection title="Pagamento" icon={CreditCard}>
        <ReviewRow label="Plano" value={form.plano_pagamento} />
        <ReviewRow label="Qtd. parcelas" value={form.quantidade_parcelas ? `${form.quantidade_parcelas}x` : "-"} />
        <ReviewRow label="Vencimento" value={`Dia ${form.dia_vencimento}`} />
      </ReviewSection>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 border-b pb-1">
          <Users className="w-4 h-4 text-violet-500" />
          {`Beneficiários (${beneficiariosValidos.length})`}
        </div>
        {beneficiariosValidos.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum beneficiário informado (orçamento somente do titular).</p>
        ) : (
          <div className="space-y-1">
            {beneficiariosValidos.map((b, i) => {
              const parentesco = PARENTESCO_OPTIONS.find((p) => p.value === b.usua_parentesco)?.label || b.usua_parentesco;
              return (
                <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                  <span className="text-slate-700 truncate mr-2">
                    {b.usua_nome_completo}
                    {parentesco && <span className="text-slate-400"> · {parentesco}</span>}
                  </span>
                  <span className="text-slate-500 whitespace-nowrap truncate max-w-[50%]">{descricaoProduto(b.usua_produtos)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-500">
        <p className="font-medium text-slate-600">Campos automáticos no payload:</p>
        <p>tipo_pedido: ORÇAMENTO | nome_estabelecimento: LIMEIRA - CNPA</p>
        <p>agente_venda_id: {currentAgent?.erp_agente_venda_id || "—"} | usuario_inclusao: {user?.email ? `user.${user.email.split("@")[0]}.${user.email.split("@")[1]?.replace(/\.[^.]+$/, "")}` : "—"}</p>
        <p>prazo_pagamento_id: {form.plano_pagamento_id || "—"} | usua_papeis: B</p>
        <p className="text-violet-600">Fechamento automático: situação "M" → "I" + registro de pagamento</p>
      </div>
    </div>
  );
}

function ReviewSection({ title, icon: Icon, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 border-b pb-1">
        <Icon className="w-4 h-4 text-violet-500" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700 font-medium truncate">{value || "—"}</span>
    </>
  );
}

function SubmitResult({ result, onReset }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
        {result.type === "success" && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Orçamento enviado com sucesso!</p>
              {result.data?.id && (
                <p className="text-sm text-slate-500 mt-1">ID do pedido: <strong>{result.data.id}</strong></p>
              )}
              {result.data?.numero_pedido && (
                <p className="text-sm text-slate-500">Número: <strong>{result.data.numero_pedido}</strong></p>
              )}
              {result.data?.fechamento?.situacao && (
                <p className="text-sm text-violet-600 mt-1">
                  Fechado na situação <strong>"{result.data.fechamento.situacao}"</strong> com pagamento registrado.
                </p>
              )}
            </div>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white mt-2"
              onClick={onReset}
            >
              Criar novo orçamento
            </Button>
          </>
        )}

        {result.type === "partial" && (
          <>
            <AlertCircle className="w-14 h-14 text-amber-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Orçamento criado com restrição</p>
              <p className="text-sm text-slate-600 mt-2 max-w-md">
                Orçamento criado, mas o fechamento está bloqueado. Contate o administrador do ERP para liberar o bloco de fechamento.
              </p>
              <p className="text-xs text-slate-400 mt-2 font-mono bg-slate-50 p-2 rounded">
                {result.data?.block}
              </p>
            </div>
            <Button variant="outline" onClick={onReset} className="mt-2">
              Tentar novamente
            </Button>
          </>
        )}

        {result.type === "error" && (
          <>
            <XCircle className="w-14 h-14 text-red-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Erro ao enviar</p>
              <p className="text-sm text-red-600 mt-2">{result.message}</p>
            </div>
            <Button variant="outline" onClick={onReset} className="mt-2">
              Voltar e corrigir
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
