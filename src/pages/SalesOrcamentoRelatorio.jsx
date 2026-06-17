import ErpOrcamentoRelatorioBase from "@/components/erp/ErpOrcamentoRelatorioBase";

export default function SalesOrcamentoRelatorio() {
  return (
    <ErpOrcamentoRelatorioBase
      moduloNome="Vendas PF"
      modulo="sales"
      gradient="from-blue-700 via-blue-600 to-indigo-600"
      accentColor="blue"
    />
  );
}
