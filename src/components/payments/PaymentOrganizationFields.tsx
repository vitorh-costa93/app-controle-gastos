"use client";

import type { PaymentOrganization } from "@/lib/domain/payments";
import { Input, Select } from "@/components/ui/Field";

const methods: { value: PaymentOrganization["method"]; label: string }[] = [
  { value: "pix", label: "Pix" }, { value: "boleto", label: "Boleto" },
  { value: "transfer", label: "Transferência" }, { value: "cash", label: "Dinheiro" },
  { value: "nubank", label: "Nubank" }, { value: "picpay", label: "PicPay" },
  { value: "other", label: "Outro" },
];

export function PaymentOrganizationFields({ value, onChange, disabled = false }: {
  value: PaymentOrganization;
  onChange: (value: PaymentOrganization) => void;
  disabled?: boolean;
}) {
  const card = value.method === "nubank" || value.method === "picpay";
  function changeMethod(method: PaymentOrganization["method"]) {
    if (method === "nubank" || method === "picpay") {
      onChange({ ...value, method, groupName: method === "nubank" ? "Nubank" : "PicPay", showAtMonthStart: true });
    } else {
      onChange({ ...value, method, groupName: card ? "" : value.groupName });
    }
  }
  return <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
    <label className="block text-xs font-medium">Forma de pagamento
      <Select className="mt-1" value={value.method} onChange={(event) => changeMethod(event.target.value as PaymentOrganization["method"])}>
        {methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
      </Select>
    </label>
    <label className="block text-xs font-medium">Grupo da conta
      <Input className="mt-1" value={value.groupName} disabled={card} maxLength={80} onChange={(event) => onChange({ ...value, groupName: event.target.value })} />
    </label>
    <label className="block text-xs font-medium">Dia de vencimento (opcional)
      <Input className="mt-1" type="number" min={1} max={31} step={1} value={value.dueDay ?? ""} onChange={(event) => onChange({ ...value, dueDay: event.target.value === "" ? null : Number(event.target.value) })} />
    </label>
    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={value.showAtMonthStart} onChange={(event) => onChange({ ...value, showAtMonthStart: event.target.checked })} /> {card ? "Mostrar fatura no início do mês" : "Mostrar no início do mês"}</label>
    {card && <p className="text-xs text-(--color-text-secondary) sm:col-span-2">Compras do mesmo cartão formam uma única fatura. Exibir ou ocultar vale para a fatura inteira no período escolhido.</p>}
  </fieldset>;
}
