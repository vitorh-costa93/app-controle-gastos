import { Person, Category } from "@/types/db";
import { DuplicatePair } from "@/lib/domain/duplicates";
import { PageHeader } from "@/components/layout/PageHeader";
import { CadastroTabs } from "@/components/cadastro/CadastroTabs";
import { DuplicateReviewList } from "./DuplicateReviewList";
import { PersonScopeFilter } from "@/components/layout/PersonScopeFilter";

export function AtencaoView({
  pairs,
  people,
  categories,
}: {
  pairs: DuplicatePair[];
  people: Person[];
  categories: Category[];
}) {
  return (
    <div>
      <PageHeader
        title="Cadastro"
        subtitle="Lançamentos que parecem duplicados. Confira e decida: aprovar mantém os dois, recusar exclui o repetido."
      />
      <CadastroTabs active="atencao" attentionCount={pairs.length} />
      <PersonScopeFilter people={people} />
      <DuplicateReviewList pairs={pairs} people={people} categories={categories} />
    </div>
  );
}
