import { RecurrenceRule } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { InstallmentGroup } from "@/lib/data/installments";
import { EstimateAverage, EstimatedExpense } from "@/lib/data/estimates";
import { PageHeader } from "@/components/layout/PageHeader";
import { CadastroTabs } from "@/components/cadastro/CadastroTabs";
import { RecurrenceRulesEditor } from "./RecurrenceRulesEditor";
import { InstallmentGroupsEditor } from "./InstallmentGroupsEditor";
import { EstimatedExpensesEditor } from "./EstimatedExpensesEditor";
import { PersonScopeFilter } from "@/components/layout/PersonScopeFilter";

export function RecorrenciasView({
  recurrenceRules,
  installmentGroups,
  estimatedExpenses,
  estimateAverages,
  people,
  categories,
  types,
  scopePersonId,
}: {
  recurrenceRules: RecurrenceRule[];
  installmentGroups: InstallmentGroup[];
  estimatedExpenses: EstimatedExpense[];
  estimateAverages: EstimateAverage[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  scopePersonId?: string | null;
}) {
  return (
    <div>
      <PageHeader
        title="Lançamentos"
        subtitle="Custos fixos, compras parceladas e gastos estimados que se repetem nos próximos meses."
      />
      <CadastroTabs active="recorrencias" />
      <PersonScopeFilter people={people} />

      <div className="flex flex-col gap-6">
        <RecurrenceRulesEditor rules={recurrenceRules} people={people} categories={categories} types={types} />
        <InstallmentGroupsEditor groups={installmentGroups} people={people} categories={categories} types={types} />
        <EstimatedExpensesEditor
          items={estimatedExpenses}
          averages={estimateAverages}
          people={people}
          categories={categories}
          types={types}
          scopePersonId={scopePersonId}
        />
      </div>
    </div>
  );
}
