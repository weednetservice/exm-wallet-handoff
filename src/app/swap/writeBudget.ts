export function assertMainnetWriteBudget({ reviewedGas, estimatedGas, feeCap, value, balance }: { reviewedGas: bigint; estimatedGas: bigint; feeCap: bigint; value: bigint; balance: bigint }) {
  if (reviewedGas <= 0n || estimatedGas <= 0n || feeCap <= 0n || value < 0n || balance < 0n) throw new Error("Не удалось проверить лимит газа и баланс. Обновите расчёт.")
  if (estimatedGas > reviewedGas) throw new Error("Расход газа вырос после проверки. Обновите расчёт перед подписью.")
  if (balance < value + reviewedGas * feeCap) throw new Error("Не хватает ETH на сумму и подтверждённый максимум комиссии.")
}
