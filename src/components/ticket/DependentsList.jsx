import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, Heart, HeartCrack } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DependentsList({ dependents = [], onSelectDependent, selectedDependentId, isFromERP = false }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDependents = dependents.filter(dep => {
    const name = isFromERP ? dep.nome : dep.full_name;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" />
          Dependentes ({dependents.length})
          {isFromERP && (
            <Badge className="bg-blue-100 text-blue-700 text-xs ml-auto">
              ERP
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dependents.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar dependente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredDependents.map((dependent, idx) => {
            const depId = isFromERP ? dependent.id_dependente_erp : dependent.id;
            const depName = isFromERP ? dependent.nome : dependent.full_name;
            const depBirthDate = isFromERP ? dependent.data_nascimento : dependent.birth_date;
            const depRelationship = isFromERP ? 'Dependente' : dependent.relationship;
            const depLifeStatus = isFromERP ? (dependent.status_vida || 'VIVO') : dependent.life_status;

            return (
              <div
                key={depId || idx}
                onClick={() => onSelectDependent?.(dependent)}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                  selectedDependentId === depId
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                      {depName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {depRelationship}
                    </p>
                    {depBirthDate && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Nascimento: {format(new Date(depBirthDate), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {depLifeStatus === 'VIVO' ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs">
                        <Heart className="w-3 h-3 mr-1" />
                        VIVO
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">
                        <HeartCrack className="w-3 h-3 mr-1" />
                        FALECIDO
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredDependents.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              {searchQuery ? 'Nenhum dependente encontrado' : 'Nenhum dependente cadastrado'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}