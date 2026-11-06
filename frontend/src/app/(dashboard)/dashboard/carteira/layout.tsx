import "./carteira.css";
import { WalletNav } from "@/components/carteira/WalletNav";

/**
 * Moldura visual exclusiva da Carteira Digital.
 * Ocupa a viewport completa e não herda o menu lateral,
 * cabeçalho nem navegação inferior do dashboard convencional.
 * O estilo e o código visual entregues são preservados.
 */
export default function CarteiraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fxb fxb-isolated">
      <div className="fxb-inner">
        <WalletNav />
        <div className="fxb-page">{children}</div>
      </div>
    </div>
  );
}
