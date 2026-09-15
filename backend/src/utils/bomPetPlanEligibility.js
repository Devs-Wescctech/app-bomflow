export function getBomPetPlanIdentityBlock(identityStatus) {
  if (identityStatus === 'resolved') return null;
  if (identityStatus === 'retryable_error') {
    return {
      statusCode: 502,
      message: 'Não foi possível validar o vínculo ativo do pet no ERP. Tente novamente.',
    };
  }
  return {
    statusCode: 409,
    message: 'Atendimento bloqueado: o pet não possui um vínculo ativo e único com uma Pessoa no ERP. Solicite revisão cadastral.',
  };
}

export function shouldExposeBomPetPlanPet(identityStatus) {
  return identityStatus === 'resolved';
}

export function getBomPetPlanAvailability({ falecido, identityStatus }) {
  if (falecido) {
    return {
      atendimentoElegivel: false,
      motivoBloqueio: 'Este pet já está marcado como Falecido.',
      status: 'Falecido',
    };
  }
  const identityBlock = getBomPetPlanIdentityBlock(identityStatus);
  if (identityBlock) {
    return {
      atendimentoElegivel: false,
      motivoBloqueio: 'O pet não possui um vínculo ativo e único com uma Pessoa no ERP. Solicite revisão cadastral.',
      status: 'Revisão cadastral',
    };
  }
  return {
    atendimentoElegivel: true,
    motivoBloqueio: null,
    status: 'Ativo',
  };
}