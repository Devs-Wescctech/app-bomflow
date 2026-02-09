
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Mail, MapPin, Calendar, FileText, Users, Clock, DollarSign, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CustomerTimeline from "./CustomerTimeline";

export default function CustomerInfo({ contact, contract, erpData }) {
  if (!contact) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-gray-500 dark:text-gray-400">
          Nenhum contato vinculado
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-gray-200 dark:border-gray-800">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <Users className="w-5 h-5" />
          Informações do Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800">
            <TabsTrigger value="info">Dados</TabsTrigger>
            {erpData && erpData.contracts && erpData.contracts.length > 0 && (
              <TabsTrigger value="contracts">Contratos</TabsTrigger>
            )}
            <TabsTrigger value="timeline">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-6 mt-6">
            {/* Informações do Contato */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Contato
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nome</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.name}</p>
                </div>

                {contact.document && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">CPF</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{contact.document}</p>
                  </div>
                )}

                {contact.birth_date && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Data de Nascimento
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {format(new Date(contact.birth_date), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}

                {contact.phones && contact.phones.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      Telefones
                    </p>
                    <div className="space-y-1">
                      {contact.phones.map((phone, idx) => (
                        <a
                          key={idx}
                          href={`tel:${phone}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline block"
                        >
                          {phone}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {contact.emails && contact.emails.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      E-mails
                    </p>
                    <div className="space-y-1">
                      {contact.emails.map((email, idx) => (
                        <a
                          key={idx}
                          href={`mailto:${email}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline block"
                        >
                          {email}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Endereço do ERP */}
                {erpData && erpData.contact && erpData.contact.address && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Endereço
                    </p>
                    <div className="text-sm text-gray-900 dark:text-gray-100 space-y-1">
                      <p>{erpData.contact.address.logradouro}, {erpData.contact.address.numero}</p>
                      {erpData.contact.address.complemento && (
                        <p>{erpData.contact.address.complemento}</p>
                      )}
                      <p>{erpData.contact.address.bairro}</p>
                      <p>{erpData.contact.address.cidade} - {erpData.contact.address.uf}</p>
                      <p>CEP: {erpData.contact.address.cep}</p>
                    </div>
                  </div>
                )}

                {contact.vip && (
                  <div>
                    <Badge className="bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300">
                      ⭐ Cliente VIP
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Situação Financeira do ERP */}
            {erpData && erpData.financial && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Situação Financeira
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Contratos</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {erpData.financial.total_contratos}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Valor Mensal Total</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      R$ {erpData.financial.valor_total_mensal?.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Contratos Ativos</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {erpData.financial.contratos_ativos}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                    <Badge className={
                      erpData.financial.status_geral === 'EM DIA' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' 
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    }>
                      {erpData.financial.status_geral}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Aba de Contratos do ERP */}
          {erpData && erpData.contracts && erpData.contracts.length > 0 && (
            <TabsContent value="contracts" className="space-y-3 mt-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Contratos ({erpData.contracts.length})
              </h3>
              <div className="space-y-3">
                {erpData.contracts.map((contrato, idx) => (
                  <div 
                    key={idx}
                    className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {contrato.plano}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Contrato #{contrato.numero_contrato}
                        </p>
                      </div>
                      <Badge className={
                        contrato.situacao === 'Ativo' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                      }>
                        {contrato.situacao}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Valor Mensal</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          R$ {contrato.valor_mensal?.toFixed(2).replace('.', ',') || '0,00'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Início Vigência</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {contrato.inicio_vigencia ? format(new Date(contrato.inicio_vigencia), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-500 dark:text-gray-400">Status Pagamento</p>
                        <Badge variant="outline" className={
                          contrato.status_pagamento === 'EM DIA'
                            ? 'text-green-700 border-green-300 dark:text-green-300 dark:border-green-700'
                            : 'text-orange-700 border-orange-300 dark:text-orange-300 dark:border-orange-700'
                        }>
                          {contrato.status_pagamento}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          <TabsContent value="timeline" className="mt-6">
            <CustomerTimeline 
              contactId={contact.id} 
              accountId={contact.account_id}
              contactDocument={contact.document}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
