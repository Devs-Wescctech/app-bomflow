export function buildBomPetSelectionValue(pet) {
  return JSON.stringify([
    String(pet?.contrato_id ?? ''),
    String(pet?.descricao ?? '').trim(),
    String(pet?.erp_pessoa_id ?? ''),
  ]);
}

export function findBomPetBySelection(pets, selectionValue) {
  return (Array.isArray(pets) ? pets : [])
    .find((pet) => buildBomPetSelectionValue(pet) === selectionValue) || null;
}