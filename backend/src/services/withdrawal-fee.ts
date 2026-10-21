/** Taxa fixa de saque PIX (centavos). Frontend e backend devem manter o mesmo valor. */
export const WITHDRAWAL_FEE_CENTS = 300;
export const WITHDRAWAL_MIN_CENTS = 1000;

/**
 * Regra financeira (fee-on-top):
 * - O valor informado pelo usuário é o que ele quer RECEBER (net).
 * - A taxa é cobrada além desse valor.
 * - Máximo sacável = saldo disponível − taxa.
 * - Total debitado da carteira = valor solicitado + taxa.
 */
export function maxWithdrawableCents(availableCents: number): number {
  return Math.max(0, availableCents - WITHDRAWAL_FEE_CENTS);
}

export function canRequestWithdrawal(availableCents: number, amountCents: number): boolean {
  if (amountCents < WITHDRAWAL_MIN_CENTS) return false;
  if (amountCents + WITHDRAWAL_FEE_CENTS > availableCents) return false;
  return true;
}

/** Total a reservar no ledger (centavos) para um pedido de `amountCents` a receber. */
export function totalDebitCents(amountCents: number): number {
  return amountCents + WITHDRAWAL_FEE_CENTS;
}
