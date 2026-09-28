export const dynamic = "force-dynamic";

import {
  listPeople,
  listCategories,
  listTransactionTypes,
  createPerson,
  createCategory,
  createTransactionType,
} from "@/lib/data/reference";
import { listEffectiveSalaryEntries } from "@/lib/data/salary";
import { getPsiMonthlyRevenueBreakdown } from "@/lib/data/psi-revenue";
import { getStartingBalance, getFixedSalaryTaxAmountCents } from "@/lib/data/settings";
import { findVariableSalaryPerson, findFixedSalaryPerson } from "@/lib/domain/salary";
import { addMonths } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ReferenceListEditor } from "@/components/configuracoes/ReferenceListEditor";
import { SalaryProjectionEditor } from "@/components/configuracoes/SalaryProjectionEditor";
import { StartingBalanceEditor } from "@/components/configuracoes/StartingBalanceEditor";
import { TaxSettingsEditor } from "@/components/configuracoes/TaxSettingsEditor";

export default async function ConfiguracoesPage() {
  const [people, categories, types, startingBalance, fixedSalaryTaxAmountCents] = await Promise.all([
    listPeople(),
    listCategories(),
    listTransactionTypes(),
    getStartingBalance(),
    getFixedSalaryTaxAmountCents(),
  ]);

  const variableSalaryPerson = findVariableSalaryPerson(people);
  const fixedSalaryPerson = findFixedSalaryPerson(people);
  const salaryEntries = variableSalaryPerson ? await listEffectiveSalaryEntries(variableSalaryPerson.id) : [];
  const psiBreakdownByPsiMonth = variableSalaryPerson ? await getPsiMonthlyRevenueBreakdown() : {};
  // Mesmo deslocamento de 1 mês do salário: o detalhamento do mês X no psi acompanha o
  // lançamento que aparece aqui como X+1.
  const psiBreakdownByReferenceMonth = Object.fromEntries(
    Object.entries(psiBreakdownByPsiMonth).map(([psiMonth, breakdown]) => [addMonths(psiMonth, 1), breakdown])
  );

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie pessoas, categorias, tipos, salário e impostos do casal. Recorrências ficam em Cadastro → Recorrências."
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ReferenceListEditor title="Pessoas" table="people" items={people} onCreate={createPerson} />
          <ReferenceListEditor title="Categorias" table="categories" items={categories} onCreate={createCategory} />
          <ReferenceListEditor title="Tipos" table="transaction_types" items={types} onCreate={createTransactionType} />
        </div>

        {variableSalaryPerson && (
          <SalaryProjectionEditor
            entries={salaryEntries}
            person={variableSalaryPerson}
            psiBreakdownByMonth={psiBreakdownByReferenceMonth}
          />
        )}

        <StartingBalanceEditor startingBalance={startingBalance} />

        <TaxSettingsEditor
          fixedSalaryPerson={fixedSalaryPerson}
          fixedSalaryTaxAmountCents={fixedSalaryTaxAmountCents}
          hasVariableSalaryPerson={Boolean(variableSalaryPerson)}
        />

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
