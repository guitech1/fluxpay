/** Validação local de CPF (dígitos verificadores). Não consulta API externa. */

export function onlyDigits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

export function isValidCpf(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  if (rev !== parseInt(d[9]!, 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  if (rev !== parseInt(d[10]!, 10)) return false;

  return true;
}

export function formatCpf(cpf: string): string {
  const d = onlyDigits(cpf).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
