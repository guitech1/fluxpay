/**
 * Parser mínimo de BR Code / PIX EMV (copia e cola).
 * Extrai valor (quando presente) e valida estrutura básica.
 * Não inventa dados de beneficiário — apenas o que está no payload EMV.
 */

export type ParsedPixEmv = {
  raw: string;
  isValid: boolean;
  amountCents: number | null;
  merchantName: string | null;
  merchantCity: string | null;
  txid: string | null;
  description: string | null;
  errors: string[];
};

function readTlv(payload: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0 || i + 4 + len > payload.length) break;
    const value = payload.slice(i + 4, i + 4 + len);
    map.set(id, value);
    i += 4 + len;
  }
  return map;
}

/**
 * Parseia um código PIX copia-e-cola (EMV).
 * Retorna amountCents quando o campo 54 estiver presente.
 */
export function parsePixEmv(input: string): ParsedPixEmv {
  const raw = (input || "").trim().replace(/\s+/g, "");
  const errors: string[] = [];

  if (!raw || raw.length < 20) {
    return {
      raw,
      isValid: false,
      amountCents: null,
      merchantName: null,
      merchantCity: null,
      txid: null,
      description: null,
      errors: ["Código PIX inválido ou muito curto."],
    };
  }

  // Deve começar com payload format indicator 00
  if (!raw.startsWith("000201")) {
    errors.push("Formato EMV não reconhecido (esperado início 000201).");
  }

  const root = readTlv(raw);

  // Valor (tag 54) — opcional em QR estático sem valor
  let amountCents: number | null = null;
  const amountStr = root.get("54");
  if (amountStr) {
    const parsed = Number(amountStr.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      amountCents = Math.round(parsed * 100);
    } else {
      errors.push("Campo de valor (54) inválido.");
    }
  }

  // Merchant Account Information (26) — contém GUI e chave
  const mai = root.get("26");
  let merchantName: string | null = null;
  let description: string | null = null;
  if (mai) {
    const sub = readTlv(mai);
    // 00 = GUI, 01 = chave ou reference
    const gui = sub.get("00") || "";
    if (!gui.toLowerCase().includes("br.gov.bcb.pix")) {
      errors.push("GUI PIX ausente ou inválida.");
    }
  }

  // Nome do recebedor (59) e cidade (60) — dados do QR, não são DICT confirmado
  merchantName = root.get("59")?.trim() || null;
  const merchantCity = root.get("60")?.trim() || null;

  // Additional Data Field Template (62) — txid / descrição
  let txid: string | null = null;
  const add = root.get("62");
  if (add) {
    const sub = readTlv(add);
    txid = sub.get("05")?.trim() || null; // reference label / txid
    description = sub.get("08")?.trim() || null;
  }

  // CRC16 (tag 63) deve existir
  if (!root.has("63")) {
    errors.push("CRC (tag 63) ausente.");
  }

  const isValid = errors.length === 0 || (raw.startsWith("000201") && raw.length >= 50);

  return {
    raw,
    isValid,
    amountCents,
    merchantName,
    merchantCity,
    txid,
    description,
    errors,
  };
}

/** Mascara código copia-e-cola para exibição. */
export function maskEmv(code: string): string {
  const t = (code || "").trim();
  if (t.length <= 24) return "***";
  return `${t.slice(0, 12)}…${t.slice(-8)}`;
}
