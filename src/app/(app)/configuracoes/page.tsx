export const dynamic = "force-dynamic";

import {
  listPeople,
  listCategories,
  listTransactionTypes,
  createPerson,
  createCategory,
  createTransactionType,
} from "@/lib/data/reference";
import { listActiveRecurrenceRules } from "@/lib/data/recurrence";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ReferenceListEditor } from "@/components/configuracoes/ReferenceListEditor";
import { RecurrenceRulesEditor } from "@/components/configuracoes/RecurrenceRulesEditor";

export default async function ConfiguracoesPage() {
  const [people, categories, types, recurrenceRules] = await Promise.all([
    listPeople(),
    listCategories(),
    listTransactionTypes(),
    listActiveRecurrenceRules(),
  ]);

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie pessoas, categorias, tipos e recorrências do casal."
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ReferenceListEditor title="Pessoas" table="people" items={people} onCreate={createPerson} />
          <ReferenceListEditor title="Categorias" table="categories" items={categories} onCreate={createCategory} />
          <ReferenceListEditor title="Tipos" table="transaction_types" items={types} onCreate={createTransactionType} />
        </div>

        <RecurrenceRulesEditor rules={recurrenceRules} people={people} categories={categories} types={types} />

        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Preferências</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-(--color-text-secondary)">Moeda</span>
            <span className="font-medium">BRL — R$ (formato R$ 1.234,56)</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
