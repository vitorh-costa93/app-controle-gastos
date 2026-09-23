import { RecurrenceRule } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { InstallmentGroup } from "@/lib/data/installments";
import { EstimatedExpense } from "@/lib/data/estimates";
import { PageHeader } from "@/components/layout/PageHeader";
import { CadastroTabs } from "@/components/cadastro/CadastroTabs";
import { RecurrenceRulesEditor } from "./RecurrenceRulesEditor";
import { InstallmentGroupsEditor } from "./InstallmentGroupsEditor";
import { EstimatedExpensesEditor } from "./EstimatedExpensesEditor";

export function RecorrenciasView({
  recurrenceRules,
  installmentGroups,
  estimatedExpenses,
  people,
  categories,
  types,
}: {
  recurrenceRules: RecurrenceRule[];
  installmentGroups: InstallmentGroup[];
  estimatedExpenses: EstimatedExpense[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  return (
    <div>
      <PageHeader
        title="Cadastro"
        subtitle="Custos fixos, compras parceladas e gastos estimados que se repetem nos próximos meses."
      />
      <CadastroTabs active="recorrencias" />

      <div className="flex flex-col gap-6">
        <RecurrenceRulesEditor rules={recurrenceRules} people={people} categories={categories} types={types} />
        <InstallmentGroupsEditor groups={installmentGroups} people={people} categories={categories} types={types} />
        <EstimatedExpensesEditor
          items={estimatedExpenses}
          people={people}
          categories={categories}
          types={types}
        />
      </div>
    </div>
  );
}
