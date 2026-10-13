/** Taxa fixa de saque PIX (centavos). Frontend e backend devem manter o mesmo valor. */
export const WITHDRAWAL_FEE_CENTS = 300;
export const WITHDRAWAL_MIN_CENTS = 1000;

/** MAX sacável = saldo disponível − taxa. */
export function maxWithdrawableCents(availableCents: number): number {
  return Math.max(0, availableCents - WITHDRAWAL_FEE_CENTS);
}

export function canRequestWithdrawal(availableCents: number, amountCents: number): boolean {
  if (amountCents < WITHDRAWAL_MIN_CENTS) return false;
  if (amountCents + WITHDRAWAL_FEE_CENTS > availableCents) return false;
  return true;
}
