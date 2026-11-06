import "./carteira.css";
import { WalletNav } from "@/components/carteira/WalletNav";

/**
 * Moldura visual exclusiva da Carteira Digital.
 * Não altera o menu principal nem outras áreas da plataforma.
 */
export default function CarteiraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fxb">
      <div className="fxb-inner">
        <WalletNav />
        <div className="fxb-page">{children}</div>
      </div>
    </div>
  );
}
