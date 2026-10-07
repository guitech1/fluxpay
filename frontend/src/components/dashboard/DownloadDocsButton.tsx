"use client";

import { Download } from "lucide-react";
import { buildProfessionalHtmlDoc } from "@/lib/api-docs-content";

/**
 * Gera HTML profissional (capa, indice, tipografia) para abrir/imprimir como PDF.
 * Sem dependencia extra: o usuario usa Imprimir > Salvar como PDF do navegador.
 */
export function DownloadDocsButton({
  markdown,
  filename = "fluxpay-api.html",
  apiBaseUrl = "",
  environment = "test",
}: {
  markdown?: string;
  filename?: string;
  apiBaseUrl?: string;
  environment?: string;
}) {
  function handleDownload() {
    const html =
      markdown && markdown.includes("<!DOCTYPE html>")
        ? markdown
        : buildProfessionalHtmlDoc(apiBaseUrl, environment);

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".html") ? filename : filename.replace(/\.md$/, ".html");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="btn-secondary text-sm inline-flex items-center gap-2"
    >
      <Download className="w-4 h-4" />
      Baixar documentacao
    </button>
  );
}
