export const dynamic = "force-dynamic";
// Envio de várias fotos processa cada lote em paralelo na IA, mas ainda pode passar
// do timeout padrão da função serverless com muitas imagens de uma vez.
export const maxDuration = 60;

import { listTransactions } from "@/lib/data/transactions";
import { listPeople, listCategories, listTransactionTypes } from "@/lib/data/reference";
import { CadastroPageClient } from "@/components/cadastro/CadastroPageClient";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const [people, categories, types] = await Promise.all([
    listPeople(),
    listCategories(),
    listTransactionTypes(),
  ]);

  const { data: transactions, total } = await listTransactions({
    referenceMonth: typeof sp.month === "string" ? sp.month : undefined,
    personId: typeof sp.personId === "string" ? sp.personId : undefined,
    direction:
      sp.direction === "income" || sp.direction === "expense" ? sp.direction : undefined,
    typeId: typeof sp.typeId === "string" ? sp.typeId : undefined,
    page,
    pageSize: 12,
  });

  return (
    <CadastroPageClient
      transactions={transactions}
      total={total}
      page={page}
      pageSize={12}
      people={people}
      categories={categories}
      types={types}
    />
  );
}
