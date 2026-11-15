"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Trash2, Shield } from "lucide-react";

export type SplitPartner = {
  id: string;
  name: string;
  pixKey: string;
  percent: number;
};

const STORAGE_KEY = "fluxpay_wallet_splits_v1";

function load(): SplitPartner[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: SplitPartner[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function SplitsPanel() {
  const [partners, setPartners] = useState<SplitPartner[]>([]);
  const [name, setName] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [percent, setPercent] = useState("10");
  const [alertsOn, setAlertsOn] = useState(true);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setPartners(load());
    const a = localStorage.getItem("fluxpay_wallet_alerts");
    setAlertsOn(a !== "0");
  }, []);

  const totalPct = useMemo(
    () => partners.reduce((s, p) => s + (Number(p.percent) || 0), 0),
    [partners]
  );

  function addPartner() {
    const pct = Number(percent.replace(",", "."));
    if (!name.trim() || !pixKey.trim() || !Number.isFinite(pct) || pct <= 0) return;
    if (totalPct + pct > 100) {
      setSavedMsg("A soma dos percentuais não pode passar de 100%.");
      return;
    }
    const next = [
      ...partners,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        pixKey: pixKey.trim(),
        percent: pct,
      },
    ];
    setPartners(next);
    save(next);
    setName("");
    setPixKey("");
    setPercent("10");
    setSavedMsg("Parceiro adicionado. Regras salvas neste aparelho.");
  }

  function remove(id: string) {
    const next = partners.filter((p) => p.id !== id);
    setPartners(next);
    save(next);
  }

  function toggleAlerts() {
    const next = !alertsOn;
    setAlertsOn(next);
    localStorage.setItem("fluxpay_wallet_alerts", next ? "1" : "0");
  }

  return (
    <div className="space-y-5">
      <div className="fxb-split-alert">
        <Shield size={22} style={{ color: "var(--fx-accent)", flex: "none" }} />
        <div>
          <p style={{ fontWeight: 800 }}>Dinheiro protegido</p>
          <p style={{ fontSize: "0.88rem", color: "var(--fx-muted)", marginTop: 4 }}>
            Defina percentuais para sócios, fornecedores ou parceiros. Em cada recebimento
            você vê quanto fica com você e quanto deve ser repassado. Alertas avisam a cada
            movimentação.
          </p>
        </div>
      </div>

      <div className="fxb-panel">
        <div className="fxb-section-head">
          <div>
            <h2>Repasses automáticos</h2>
            <p>Percentuais sobre cada venda recebida</p>
          </div>
          <span className="fxb-status fxb-status--ok">{totalPct}% configurado</span>
        </div>

        <div className="fxb-list" style={{ marginBottom: 16 }}>
          {partners.length === 0 ? (
            <div className="fxb-empty">
              <h3>Nenhum parceiro ainda</h3>
              <p>Adicione quem recebe fatia das suas vendas.</p>
            </div>
          ) : (
            partners.map((p) => (
              <div key={p.id} className="fxb-row">
                <div className="fxb-row-main">
                  <p className="fxb-row-title">{p.name}</p>
                  <p className="fxb-row-sub fxb-mono">{p.pixKey}</p>
                </div>
                <div className="fxb-row-end">
                  <p className="fxb-money">{p.percent}%</p>
                </div>
                <button
                  type="button"
                  className="fxb-back"
                  aria-label="Remover"
                  onClick={() => remove(p.id)}
                  style={{ width: 36, height: 36 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="fxb-form">
          <div>
            <label className="fxb-label">Nome do parceiro</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sócio João" />
          </div>
          <div>
            <label className="fxb-label">Chave PIX</label>
            <input className="input" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="email, CPF ou aleatória" />
          </div>
          <div>
            <label className="fxb-label">Percentual (%)</label>
            <input
              className="input"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="10"
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={addPartner}>
            <Plus size={18} /> Adicionar parceiro
          </button>
          {savedMsg ? <p style={{ fontSize: "0.85rem", color: "var(--fx-muted)" }}>{savedMsg}</p> : null}
        </div>
      </div>

      <div className="fxb-panel">
        <div className="fxb-section-head">
          <div>
            <h2>Alertas de movimentação</h2>
            <p>Aviso na hora em cada entrada ou saída</p>
          </div>
          <Bell size={20} style={{ color: alertsOn ? "var(--fx-accent)" : "var(--fx-muted)" }} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={toggleAlerts} style={{ width: "100%" }}>
          {alertsOn ? "Alertas ligados" : "Alertas desligados"}
        </button>
        <p style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--fx-muted)" }}>
          Com alertas ligados, o painel destaca novas movimentações e o Modo Caixa confirma
          cada pagamento com som e tela de sucesso.
        </p>
      </div>
    </div>
  );
}
