export const dynamic = "force-dynamic";
// Envio de várias fotos processa cada lote em paralelo na IA, mas ainda pode passar
// do timeout padrão da função serverless com muitas imagens de uma vez.
export const maxDuration = 60;

import { listTransactions } from "@/lib/data/transactions";
import { listPeople, listCategories, listTransactionTypes } from "@/lib/data/reference";
import { listActiveRecurrenceRules } from "@/lib/data/recurrence";
import { listInstallmentGroups } from "@/lib/data/installments";
import { getEstimateAverages, getEstimatedExpenses } from "@/lib/data/estimates";
import { syncSalaryIncomeTransactions } from "@/lib/data/salary";
import { CadastroPageClient } from "@/components/cadastro/CadastroPageClient";
import { RecorrenciasView } from "@/components/recorrencias/RecorrenciasView";
import { AtencaoView } from "@/components/atencao/AtencaoView";
import { listDuplicatePairs } from "@/lib/data/duplicates";
import { buildMonthRows } from "@/lib/domain/month-rows";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  // Antes de listar: reflete no lançamento real de Salário qualquer atualização do
  // dashboard-psi (mesmo em mês já fechado) — sem isso, a lista aqui ficava presa no
  // valor de quando o lançamento foi criado.
  await syncSalaryIncomeTransactions();

  const [people, categories, types, recurrenceRules] = await Promise.all([
    listPeople(),
    listCategories(),
    listTransactionTypes(),
    listActiveRecurrenceRules(),
  ]);

  if (sp.tab === "recorrencias") {
    const [installmentGroups, estimatedExpenses] = await Promise.all([
      listInstallmentGroups(),
      getEstimatedExpenses(),
    ]);
    const estimateAverages = await getEstimateAverages(estimatedExpenses);
    return (
      <RecorrenciasView
        recurrenceRules={recurrenceRules}
        installmentGroups={installmentGroups}
        estimatedExpenses={estimatedExpenses}
        estimateAverages={estimateAverages}
        people={people}
        categories={categories}
        types={types}
      />
    );
  }

  if (sp.tab === "atencao") {
    const pairs = await listDuplicatePairs();
    return <AtencaoView pairs={pairs} people={people} categories={categories} />;
  }

  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  const filters = {
    personId: typeof sp.personId === "string" && sp.personId ? sp.personId : undefined,
    direction: sp.direction === "income" || sp.direction === "expense" ? sp.direction : undefined,
    typeId: typeof sp.typeId === "string" && sp.typeId ? sp.typeId : undefined,
    fixedVariable:
      sp.fixedVariable === "fixed" || sp.fixedVariable === "variable" ? sp.fixedVariable : undefined,
  } as const;

  // Com um mês escolhido, a lista mostra tudo o que cai nele (inclusive recorrentes e parcelas
  // cadastradas em outros meses); sem mês, continua a lista cronológica de lançamentos.
  if (month) {
    const { data: monthTransactions } = await listTransactions({ ...filters, referenceMonth: month, pageSize: 500 });
    const allRows = buildMonthRows(month, monthTransactions, recurrenceRules, filters);
    const pageSize = 20;
    return (
      <CadastroPageClient
        transactions={[]}
        monthRows={allRows.slice((page - 1) * pageSize, page * pageSize)}
        total={allRows.length}
        page={page}
        pageSize={pageSize}
        people={people}
        categories={categories}
        types={types}
        recurrenceRules={recurrenceRules}
      />
    );
  }

  const { data: transactions, total } = await listTransactions({ ...filters, page, pageSize: 12 });

  return (
    <CadastroPageClient
      transactions={transactions}
      total={total}
      page={page}
      pageSize={12}
      people={people}
      categories={categories}
      types={types}
      recurrenceRules={recurrenceRules}
    />
  );
}
