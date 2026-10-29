import { Banner } from "@/components/Badges";
import CartView from "@/components/CartView";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = typeof sp.swiggy === "string" ? sp.swiggy : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const canConnect = getEnv().config.SWIGGY_MCP_ENV === "live";

  return (
    <div className="space-y-5">
      {status === "connected" && <Banner tone="success">Swiggy account connected.</Banner>}
      {status === "error" && <Banner tone="error">Could not connect Swiggy{reason ? `: ${reason}` : ""}. Try connecting again.</Banner>}
      <CartView canConnect={canConnect} />
    </div>
  );
}
