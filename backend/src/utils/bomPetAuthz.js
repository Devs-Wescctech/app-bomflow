// Regras puras de autorização do módulo Bom Pet (testáveis sem banco/HTTP).
// Atendentes só acessam atendimentos próprios; supervisores/admins acessam todos.

export function canAccessAtendimento({ isSupervisor, usuario }, atendimento) {
  if (isSupervisor) return true;
  if (!usuario || !atendimento) return false;
  return String(atendimento.usuario || '').toLowerCase() === String(usuario).toLowerCase();
}
