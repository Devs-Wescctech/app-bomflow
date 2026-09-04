export function evaluateBomPetDeathEligibility({
  statusAtendimento,
  hasRemovalImage,
}) {
  if (statusAtendimento !== 'Solucionado') {
    return {
      ok: false,
      statusCode: 400,
      code: 'attendance_not_solved',
      message: 'O pet só pode ser marcado como Falecido após solucionar o atendimento.',
    };
  }
  if (hasRemovalImage !== true) {
    return {
      ok: false,
      statusCode: 400,
      code: 'removal_proof_required',
      message: 'É obrigatório anexar o comprovante de remoção antes de registrar o falecimento.',
    };
  }
  return { ok: true, statusCode: 200, code: null, message: null };
}

export function assertBomPetGuardedUpdateApplied({ rowCount, guarded }) {
  if (!guarded || rowCount === 1) return;
  const error = new Error(
    'O atendimento mudou, perdeu o comprovante ou possui uma marcação de falecimento incompatível. Recarregue os dados antes de tentar novamente.'
  );
  error.statusCode = 409;
  throw error;
}