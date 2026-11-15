import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { SplitsPanel } from "@/components/carteira/SplitsPanel";
import { Percent } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SplitsPage() {
  return (
    <div className="fxb-narrow">
      <ScreenHeader
        title="Splits e repasses"
        description="Divida recebimentos entre sócios e parceiros, com alerta em cada movimentação"
        icon={<Percent size={22} />}
      />
      <SplitsPanel />
    </div>
  );
}
