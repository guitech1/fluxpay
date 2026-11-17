"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPaste, KeyRound, Lock, ShieldCheck, X } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency } from "@/lib/utils";
import { maskEmv, parsePixEmv } from "@/lib/pix-emv";

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
type TransferMode = "key" | "qr" | "copiacola";

const KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
];

const MIN_CENTS = 1000;
const FEE_CENTS = 300;

function parseAmountToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

interface Props {
  availableCents: number;
  currency: string;
  canTransfer: boolean;
  environment: string;
}

export function PixTransferForm({
  availableCents: availableCentsProp,
  currency,
  canTransfer,
  environment,
}: Props) {
  const router = useRouter();
  const availableCents = Number(availableCentsProp) || 0;

  const [mode, setMode] = useState<TransferMode>("key");
  const [amountReais, setAmountReais] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("cpf");
  const [emvCode, setEmvCode] = useState("");
  const [parsedEmv, setParsedEmv] = useState<ReturnType<typeof parsePixEmv> | null>(null);
  const [description, setDescription] = useState("");
  const [pixPin, setPixPin] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastWithdrawalId, setLastWithdrawalId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!cameraActive || !streamRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    const stream = streamRef.current;
    video.srcObject = stream;

    let cancelled = false;

    const startScan = () => {
      if (cancelled || !streamRef.current) return;
      const BD = (window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;
      if (BD) {
        const detector = new BD({ formats: ["qr_code"] });
        const loop = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length > 0) {
              const value = codes[0].rawValue;
              if (value && typeof value === "string" && value.length > 20) {
                handleEmvDetected(value);
                return;
              }
            }
          } catch {
            /* ignore frame errors */
          }
          scanLoopRef.current = requestAnimationFrame(loop);
        };
        scanLoopRef.current = requestAnimationFrame(loop);
      } else {
        setCameraError(
          'Leitura automática de QR não disponível neste navegador. Cole o código em "Pix copia e cola".'
        );
      }
    };

    video
      .play()
      .then(() => {
        if (!cancelled) startScan();
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError("Não foi possível iniciar a visualização da câmera.");
        }
      });

    return () => {
      cancelled = true;
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  async function startCamera() {
    setCameraError(null);
    setError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Câmera não suportada neste navegador. Use Pix copia e cola.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permissão de câmera negada. Autorize o acesso ou use copia e cola."
          : "Não foi possível abrir a câmera.";
      setCameraError(msg);
      stopCamera();
    }
  }

  function handleEmvDetected(code: string) {
    stopCamera();
    const parsed = parsePixEmv(code);
    setEmvCode(parsed.raw);
    setParsedEmv(parsed);
    if (parsed.amountCents != null) {
      setAmountReais((parsed.amountCents / 100).toFixed(2).replace(".", ","));
    }
    if (parsed.description) setDescription(parsed.description.slice(0, 140));
    setMode("copiacola");
    setStep("form");
    if (!parsed.isValid) {
      setError(parsed.errors[0] || "Código PIX com formato incompleto. Confira antes de continuar.");
    } else {
      setError(null);
    }
  }

  function validateEmvAndGoConfirm() {
    setError(null);
    const parsed = parsePixEmv(emvCode);
    setParsedEmv(parsed);
    if (!parsed.isValid && parsed.errors.length) {
      setError(parsed.errors[0]);
      return false;
    }
    if (parsed.raw.length < 20) {
      setError("Cole um código PIX válido.");
      return false;
    }
    let cents = parseAmountToCents(amountReais);
    if (parsed.amountCents != null) {
      cents = parsed.amountCents;
      setAmountReais((parsed.amountCents / 100).toFixed(2).replace(".", ","));
    }
    if (cents === null || cents < MIN_CENTS) {
      setError("Valor mínimo R$ 10,00. Informe o valor se o QR não trouxer.");
      return false;
    }
    if (cents + FEE_CENTS > availableCents) {
      setError("Saldo insuficiente para valor + taxa (R$ 3,00).");
      return false;
    }
    return true;
  }

  if (environment !== "live") {
    return (
      <div className="fxb-note">
        <Lock size={18} />
        <p>As transferências Pix ficam disponíveis apenas na conta em modo de produção.</p>
      </div>
    );
  }
  if (!canTransfer) {
    return (
      <div className="fxb-note fxb-note--warn">
        <Lock size={18} />
        <p>Seu perfil não permite transferências. Peça a um administrador.</p>
      </div>
    );
  }

  function goConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "key") {
      const cents = parseAmountToCents(amountReais);
      if (cents === null || cents < MIN_CENTS) {
        setError("Valor mínimo R$ 10,00.");
        return;
      }
      if (cents + FEE_CENTS > availableCents) {
        setError("Saldo insuficiente para valor + taxa (R$ 3,00).");
        return;
      }
      if (!pixKey.trim()) {
        setError("Informe a chave Pix.");
        return;
      }
      setStep("confirm");
      return;
    }

    if (!validateEmvAndGoConfirm()) return;
    setStep("confirm");
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!/^\d{4,8}$/.test(pixPin)) {
      setError("Informe o PIN Pix (4 a 8 dígitos).");
      return;
    }

    let cents: number;
    let bodyPixKey: string;
    let bodyPixKeyType: string;

    if (mode === "key") {
      cents = parseAmountToCents(amountReais)!;
      bodyPixKey = pixKey.trim();
      bodyPixKeyType = pixKeyType;
    } else {
      const parsed = parsedEmv || parsePixEmv(emvCode);
      cents = parsed.amountCents ?? parseAmountToCents(amountReais)!;
      bodyPixKey = parsed.raw;
      bodyPixKeyType = "qrc";
    }

    setLoading(true);
    try {
      await dashboardFetch("/digital-account/pix-pin/verify", {
        method: "POST",
        body: { pix_pin: pixPin },
      });

      const correlation_id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const result = await dashboardFetch<{ data: { id: string; status: string } }>(
        "/withdrawals",
        {
          method: "POST",
          body: {
            amount: cents,
            pix_key: bodyPixKey,
            pix_key_type: bodyPixKeyType,
            correlation_id,
          },
        }
      );

      const st = result?.data?.status || "pending";
      const wid = result?.data?.id || null;
      setLastWithdrawalId(wid);
      setSuccess(
        st === "completed"
          ? "Pix enviado e confirmado. Veja o comprovante em Comprovantes."
          : st === "processing"
            ? "Pix em processamento. Acompanhe o status em Comprovantes."
            : "Solicitação registrada. Estamos processando seu Pix."
      );
      setAmountReais("");
      setPixKey("");
      setEmvCode("");
      setParsedEmv(null);
      setPixPin("");
      setDescription("");
      setStep("form");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na transferência.");
    } finally {
      setLoading(false);
    }
  }

  const centsPreview =
    mode === "key"
      ? parseAmountToCents(amountReais)
      : parsedEmv?.amountCents ?? parseAmountToCents(amountReais);

  if (step === "confirm") {
    const isEmv = mode !== "key";
    return (
      <form onSubmit={submitTransfer} className="fxb-panel fxb-form fxb-rise">
        <div className="fxb-steps" aria-hidden>
          <span data-on="true" />
          <span data-on="true" />
        </div>
        <div className="fxb-section-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>Confirmar Pix</h2>
            <p>Confira os dados antes de enviar. Nenhum valor é debitado até a confirmação do provedor.</p>
          </div>
        </div>

        <dl className="fxb-sum">
          <div>
            <dt>Tipo</dt>
            <dd>
              {mode === "key"
                ? KEY_TYPES.find((t) => t.value === pixKeyType)?.label
                : mode === "qr"
                  ? "QR Code"
                  : "Copia e cola"}
            </dd>
          </div>
          {mode === "key" ? (
            <div>
              <dt>Chave</dt>
              <dd>{pixKey}</dd>
            </div>
          ) : (
            <div>
              <dt>Código</dt>
              <dd style={{ wordBreak: "break-all" }}>{maskEmv(emvCode)}</dd>
            </div>
          )}
          {isEmv && parsedEmv?.merchantName && (
            <div>
              <dt>Para</dt>
              <dd style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                {parsedEmv.merchantName}
                <span className="fxb-row-sub" style={{ display: "block", marginTop: 2, fontWeight: 400 }}>
                  Nome no QR (informativo)
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt>Valor</dt>
            <dd style={{ fontWeight: 700, fontSize: "1.05rem" }}>
              {centsPreview != null ? formatCurrency(centsPreview, currency) : "—"}
            </dd>
          </div>
          <div>
            <dt>Taxa</dt>
            <dd>{formatCurrency(FEE_CENTS, currency)}</dd>
          </div>
          {description && (
            <div>
              <dt>Descrição</dt>
              <dd>{description}</dd>
            </div>
          )}
          <div className="fxb-sum-total">
            <dt>Total debitado</dt>
            <dd>
              {centsPreview != null
                ? formatCurrency(centsPreview + FEE_CENTS, currency)
                : "—"}
            </dd>
          </div>
        </dl>

        <label className="block">
          <span className="fxb-label">PIN Pix</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            className="w-full"
            placeholder="Digite seu PIN"
            value={pixPin}
            onChange={(e) => setPixPin(e.target.value.replace(/\D/g, ""))}
            disabled={loading}
          />
        </label>

        {error && (
          <div className="fxb-note fxb-note--err" role="alert">
            {error}
          </div>
        )}

        <div className="fxb-btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => setStep("form")}
          >
            Voltar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Enviando…" : "Enviar Pix"}
          </button>
        </div>
        <p className="fxb-row-sub" style={{ textAlign: "center" }}>
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> O status
          final só muda após confirmação do provedor.
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="fxb-chips" role="tablist" aria-label="Forma de pagamento Pix">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "key"}
          data-active={mode === "key"}
          className="fxb-pill"
          onClick={() => {
            stopCamera();
            setMode("key");
            setError(null);
            setSuccess(null);
          }}
        >
          <KeyRound size={14} style={{ marginRight: 4 }} />
          Chave Pix
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "qr"}
          data-active={mode === "qr"}
          className="fxb-pill"
          onClick={() => {
            setMode("qr");
            setError(null);
            setSuccess(null);
            setParsedEmv(null);
            setEmvCode("");
          }}
        >
          <Camera size={14} style={{ marginRight: 4 }} />
          QR Code
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "copiacola"}
          data-active={mode === "copiacola"}
          className="fxb-pill"
          onClick={() => {
            stopCamera();
            setMode("copiacola");
            setError(null);
            setSuccess(null);
          }}
        >
          <ClipboardPaste size={14} style={{ marginRight: 4 }} />
          Copia e cola
        </button>
      </div>

      <form onSubmit={goConfirm} className="fxb-panel fxb-form fxb-rise">
        <div className="fxb-steps" aria-hidden>
          <span data-on="true" />
          <span data-on="false" />
        </div>

        {mode === "key" && (
          <>
            <label className="block">
              <span className="fxb-label">Quanto você quer enviar?</span>
              <div className="fxb-amount-wrap">
                <span>R$</span>
                <input
                  className="fxb-amount-input"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amountReais}
                  onChange={(e) => setAmountReais(e.target.value)}
                />
              </div>
              <p className="fxb-row-sub" style={{ marginTop: "0.5rem" }}>
                Saldo disponível: {formatCurrency(availableCents, currency)} · Taxa R$ 3,00 ·
                Mínimo R$ 10,00
              </p>
            </label>

            <div>
              <span className="fxb-label">Tipo da chave</span>
              <div className="fxb-chips" role="radiogroup" aria-label="Tipo da chave Pix">
                {KEY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={pixKeyType === t.value}
                    data-active={pixKeyType === t.value}
                    className="fxb-pill"
                    onClick={() => setPixKeyType(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="fxb-label">Chave Pix</span>
              <input
                className="w-full"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                autoComplete="off"
                placeholder="Digite a chave do destinatário"
              />
            </label>
          </>
        )}

        {mode === "qr" && (
          <div className="space-y-3">
            <p className="fxb-row-sub">
              Aponte a câmera para o QR Code Pix. O valor será preenchido quando estiver no código.
            </p>
            {!cameraActive ? (
              <button type="button" className="btn btn-primary w-full" onClick={startCamera}>
                Abrir câmera
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full aspect-[3/4] object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                <button
                  type="button"
                  className="absolute top-3 right-3 btn btn-secondary"
                  onClick={stopCamera}
                >
                  <X size={16} /> Fechar
                </button>
              </div>
            )}
            {cameraError && (
              <div className="fxb-note fxb-note--warn">{cameraError}</div>
            )}
            {emvCode && (
              <div className="fxb-note fxb-note--ok">
                QR lido. Revise os dados abaixo e continue.
              </div>
            )}
          </div>
        )}

        {mode === "copiacola" && (
          <>
            <label className="block">
              <span className="fxb-label">Código Pix (copia e cola)</span>
              <textarea
                className="w-full"
                rows={4}
                value={emvCode}
                onChange={(e) => {
                  setEmvCode(e.target.value);
                  setParsedEmv(null);
                }}
                placeholder="Cole aqui o código completo do Pix"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => {
                const p = parsePixEmv(emvCode);
                setParsedEmv(p);
                if (p.amountCents != null) {
                  setAmountReais((p.amountCents / 100).toFixed(2).replace(".", ","));
                }
                if (p.errors.length) setError(p.errors[0]);
                else setError(null);
              }}
            >
              Ler e validar código
            </button>
            {parsedEmv && (
              <div className={parsedEmv.isValid ? "fxb-note fxb-note--ok" : "fxb-note fxb-note--warn"}>
                {parsedEmv.isValid ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ margin: 0, fontWeight: 600, opacity: 0.9 }}>Código válido</p>
                    {parsedEmv.merchantName ? (
                      <div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            opacity: 0.7,
                            marginBottom: 2,
                          }}
                        >
                          Para
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.3 }}>
                          {parsedEmv.merchantName}
                        </div>
                      </div>
                    ) : null}
                    {parsedEmv.amountCents != null ? (
                      <div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            opacity: 0.7,
                            marginBottom: 2,
                          }}
                        >
                          Valor
                        </div>
                        <div style={{ fontSize: "1.2rem", fontWeight: 800, lineHeight: 1.2 }}>
                          {formatCurrency(parsedEmv.amountCents, currency)}
                        </div>
                      </div>
                    ) : (
                      <p className="fxb-row-sub" style={{ marginTop: 0 }}>
                        Este código não traz valor — informe abaixo.
                      </p>
                    )}
                  </div>
                ) : (
                  parsedEmv.errors.join(" ")
                )}
              </div>
            )}
            {(!parsedEmv?.amountCents || !emvCode) && (
              <label className="block">
                <span className="fxb-label">Valor a pagar</span>
                <div className="fxb-amount-wrap">
                  <span>R$</span>
                  <input
                    className="fxb-amount-input"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amountReais}
                    onChange={(e) => setAmountReais(e.target.value)}
                  />
                </div>
                <p className="fxb-row-sub" style={{ marginTop: "0.5rem" }}>
                  Saldo: {formatCurrency(availableCents, currency)} · Taxa R$ 3,00 · Mín. R$ 10,00
                </p>
              </label>
            )}
          </>
        )}

        {(mode === "qr" || mode === "copiacola") && parsedEmv?.amountCents != null && emvCode ? null : null}

        <label className="block">
          <span className="fxb-label">Descrição (opcional)</span>
          <input
            className="w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 140))}
            placeholder="Ex.: pagamento fornecedor"
            maxLength={140}
          />
        </label>

        {error && (
          <div className="fxb-note fxb-note--err" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="fxb-note fxb-note--ok">
            {success}
            {lastWithdrawalId ? (
              <span className="fxb-row-sub" style={{ display: "block", marginTop: 4 }}>
                ID {lastWithdrawalId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={mode === "qr" && !emvCode}
        >
          Continuar
        </button>
      </form>
    </div>
  );
}
