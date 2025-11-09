import { NextRequest, NextResponse } from "next/server";
import { fetchSummary } from "@/lib/yahoo";
import { Assumptions, DefaultAssumptions, computeIntrinsicValue, projectFuturePrices } from "@/lib/analysis";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    const a: Partial<Assumptions> = {};
    const dr = searchParams.get("discountRate");
    const gr = searchParams.get("growth");
    const years = searchParams.get("years");
    const exitPE = searchParams.get("exitPE");
    if (dr) a.discountRate = Number(dr);
    if (gr) a.baseGrowth = Number(gr);
    if (years) a.years = Number(years);
    if (exitPE) a.exitPE = Number(exitPE);

    const assumptions: Assumptions = { ...DefaultAssumptions, ...a };

    const { quote, earningsTrend, financials } = await fetchSummary(symbol);

    const intrinsic = computeIntrinsicValue(quote, earningsTrend, assumptions);
    const projections = projectFuturePrices(quote, earningsTrend, assumptions);

    return NextResponse.json({
      symbol,
      name: quote.longName || quote.shortName || symbol,
      quote,
      financials,
      earningsTrend,
      assumptions,
      intrinsic,
      projections,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
