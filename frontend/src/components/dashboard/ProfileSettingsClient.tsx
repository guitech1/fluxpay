"use client";

import { useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { ScoreBadge } from "@/components/score/ScoreBadge";
import { Alert, SubmitButton } from "@/components/dashboard/ui-client";
import { formatCurrency } from "@/lib/utils";

export function ProfileSettingsClient({ canWrite }: { canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [work, setWork] = useState("");
  const [avatar, setAvatar] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [score, setScore] = useState<{
    score: number;
    level: string;
    level_label: string;
    progress_to_next: number;
    explanation: string;
  } | null>(null);
  const [totalSold, setTotalSold] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const res = await dashboardFetch<{ data: any }>("/profile");
        const d = res.data;
        setSlug(d.slug || "");
        setDisplayName(d.public_display_name || d.name || "");
        setBio(d.public_bio || "");
        setWork(d.public_work || "");
        setAvatar(d.public_avatar_url || "");
        setEnabled(!!d.public_profile_enabled);
        setScore(d.score || null);
        setTotalSold(d.total_sold_cents || 0);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await dashboardFetch("/profile", {
        method: "PATCH",
        body: {
          slug,
          public_display_name: displayName,
          public_bio: bio,
          public_work: work,
          public_avatar_url: avatar || null,
          public_profile_enabled: enabled,
        },
      });
      setOk(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-flux-muted py-12 text-center">Carregando...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <form onSubmit={save} className="lg:col-span-3 card space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {ok && <Alert tone="info">Perfil atualizado.</Alert>}

        <div>
          <label className="label">Slug publico</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-flux-muted shrink-0">/u/</span>
            <input
              className="input font-mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={!canWrite || busy}
              pattern="[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?"
              required
            />
          </div>
        </div>

        <div>
          <label className="label">Nome de exibicao</label>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!canWrite || busy}
            maxLength={80}
          />
        </div>

        <div>
          <label className="label">Com o que eu trabalho</label>
          <input
            className="input"
            value={work}
            onChange={(e) => setWork(e.target.value)}
            placeholder="Ex.: Desenvolvedor, Loja de roupas"
            disabled={!canWrite || busy}
            maxLength={120}
          />
        </div>

        <div>
          <label className="label">Bio</label>
          <textarea
            className="input min-h-[100px]"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={!canWrite || busy}
            maxLength={500}
          />
        </div>

        <div>
          <label className="label">URL da foto</label>
          <input
            className="input"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://..."
            disabled={!canWrite || busy}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canWrite || busy}
          />
          Perfil publico ativo
        </label>

        {canWrite && (
          <SubmitButton type="submit" loading={busy}>
            Salvar perfil
          </SubmitButton>
        )}
      </form>

      <div className="lg:col-span-2 space-y-4">
        <div className="card space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-flux-muted">
            Total vendido (live)
          </div>
          <div className="text-2xl font-semibold">{formatCurrency(totalSold)}</div>
          <p className="text-xs text-flux-muted">Calculado automaticamente. Nao editavel.</p>
        </div>
        {score && (
          <>
            <ScoreBadge
              score={score.score}
              level={score.level}
              levelLabel={score.level_label}
              showProgress
              progress={score.progress_to_next}
              size="lg"
            />
            <p className="text-xs text-flux-muted leading-relaxed">{score.explanation}</p>
          </>
        )}
      </div>
    </div>
  );
}
