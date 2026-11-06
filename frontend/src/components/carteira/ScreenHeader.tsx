import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  description,
  icon,
  backHref = "/dashboard/carteira",
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="fxb-head fxb-rise">
      <Link href={backHref} className="fxb-back" aria-label="Voltar">
        <ArrowLeft size={18} />
      </Link>
      {icon}
      <div className="fxb-head-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </header>
  );
}
