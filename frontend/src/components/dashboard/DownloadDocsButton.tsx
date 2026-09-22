"use client";

import { Download } from "lucide-react";

export function DownloadDocsButton({
  markdown,
  filename = "fluxpay-api.md",
}: {
  markdown: string;
  filename?: string;
}) {
  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={handleDownload} className="btn-secondary text-sm inline-flex items-center gap-2">
      <Download className="w-4 h-4" />
      Baixar documentação
    </button>
  );
}
