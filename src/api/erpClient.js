// ============================================================
// ERP Client — Bom Pastor
// Funções de integração com o ERP.
// TODO: preencher ERP_BASE_URL e ERP_TOKEN antes de ativar em produção.
// ============================================================

const ERP_BASE_URL = ""; // TODO: URL base do ERP (ex: https://api.bompastor.com.br)
const ERP_TOKEN   = ""; // TODO: Bearer token do ERP

export const ESTABELECIMENTO_PADRAO = 104;   // LIMEIRA - CNPA
export const SENHA_PADRAO           = "bp@2026";
export const COPIAR_DIREITOS_DE     = "base.upsell";

// ------------------------------------------------------------
// getPessoaByErp(cpf)
// Busca uma Pessoa no ERP pelo CPF.
// Retorna o objeto da pessoa encontrada ou null se não existir.
// ------------------------------------------------------------
export async function getPessoaByErp(cpf) {
  // TODO: substituir stub pela chamada real:
  //   const res = await fetch(`${ERP_BASE_URL}/Pessoas?cpf=${cpf}`, {
  //     headers: { Authorization: `Bearer ${ERP_TOKEN}` }
  //   });
  //   if (!res.ok) return null;
  //   const data = await res.json();
  //   return data?.results?.[0] ?? null;

  return null; // stub — pessoa não encontrada
}

// ------------------------------------------------------------
// createPessoaErp(payload)
// Cria uma Pessoa Física no ERP.
// payload: { tipo_pessoa, nome_completo, cpf, situacao }
// ------------------------------------------------------------
export async function createPessoaErp(payload) {
  // TODO: substituir stub pela chamada real:
  //   const res = await fetch(`${ERP_BASE_URL}/Pessoas`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${ERP_TOKEN}`
  //     },
  //     body: JSON.stringify(payload)
  //   });
  //   const data = await res.json();
  //   if (data?.error) throw new Error(data.error);
  //   return data; // { pessoa: "CODIGO", nome_completo: "..." }

  return {
    pessoa: "PESSOA123",         // stub — código fictício
    nome_completo: payload.nome_completo,
  };
}

// ------------------------------------------------------------
// createUsuarioErp(payload)
// Cria um Usuário no ERP vinculado a uma Pessoa.
// payload: { login, pessoa, estabelecimento_padrao, senha_prot,
//            copiar_direitos_de, ativo, super_usuario, observacoes }
// Lança Error se o ERP retornar { error: "mensagem" }.
// ------------------------------------------------------------
export async function createUsuarioErp(payload) {
  // TODO: substituir stub pela chamada real:
  //   const res = await fetch(`${ERP_BASE_URL}/Usuarios`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${ERP_TOKEN}`
  //     },
  //     body: JSON.stringify(payload)
  //   });
  //   const data = await res.json();
  //   if (data?.error) throw new Error(data.error);
  //   return data; // { id: number, login: string }

  return {
    id: 99999,           // stub — ID fictício
    login: payload.login,
  };
}
