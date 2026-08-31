export function filterPreSalesQueue(items, {
  search = '',
  tab = 'todas',
  isMine = () => false,
  sortItems = (list) => list,
} = {}) {
  const term = String(search).trim().toLowerCase();
  let list = items;

  if (term) {
    const termDigits = term.replace(/\D/g, '');
    list = list.filter((item) => {
      const cpf = String(item.cpf_titular || '').replace(/\D/g, '');
      return (
        String(item.numero_orcamento || '').toLowerCase().includes(term)
        || String(item.nome_titular || '').toLowerCase().includes(term)
        || String(item.nome_vendedor || '').toLowerCase().includes(term)
        || (termDigits && cpf.includes(termDigits))
      );
    });
  }

  if (tab === 'meus') {
    list = list.filter(isMine);
  } else if (tab !== 'todas') {
    list = list.filter((item) => item._priority === tab);
  }

  return sortItems([...list]);
}

export function findTopPending(items, {
  isPending,
  sortItems = (list) => list,
} = {}) {
  const pending = items.filter(isPending);
  return pending.length > 0 ? sortItems([...pending])[0] : null;
}