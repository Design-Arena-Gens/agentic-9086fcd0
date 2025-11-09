import { NextRequest, NextResponse } from "next/server";
import { fetchPriceHistory, fetchQuoteBatch, fetchSummary } from "@/lib/yahoo";
import { Assumptions, DefaultAssumptions, ScanScore, ScanInput, scoreScanner, computeIntrinsicValue } from "@/lib/analysis";

export const revalidate = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let tickers: string[] = Array.isArray(body?.tickers) ? body.tickers : [];
    if (!tickers.length && typeof body?.tickersText === "string") {
      tickers = body.tickersText
        .split(/[\s,\n]+/)
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    if (!tickers.length) {
      return NextResponse.json({ error: "No tickers provided" }, { status: 400 });
    }
    const uniqueTickers = Array.from(new Set(tickers)).slice(0, 50); // cap to 50 per request

    const assumptions: Assumptions = {
      ...DefaultAssumptions,
      ...(typeof body?.assumptions === "object" ? body.assumptions : {}),
    };

    // Batch fetch quotes first
    const quotes = await fetchQuoteBatch(uniqueTickers);

    // Fetch additional summaries and 1y history in parallel per symbol (limit concurrency naive)
    const perSymbol = await Promise.all(
      quotes.map(async (q) => {
        try {
          const [{ financials, earningsTrend }, hist] = await Promise.all([
            fetchSummary(q.symbol),
            fetchPriceHistory(q.symbol, "1y", "1d"),
          ]);
          const first = hist.closes?.find((v) => typeof v === "number");
          const last = [...hist.closes].reverse().find((v) => typeof v === "number");
          const change = first && last ? (last - first) / first : null;

          const input: ScanInput = {
            symbol: q.symbol,
            quote: q,
            financials,
            earnings: earningsTrend,
          };
          const score: ScanScore = scoreScanner({ ...input, priceChange1y: change });
          const intrinsic = computeIntrinsicValue(q, earningsTrend, assumptions);

          return {
            symbol: q.symbol,
            name: q.longName || q.shortName || q.symbol,
            currency: q.currency || "USD",
            price: q.regularMarketPrice ?? null,
            pe: q.trailingPE ?? q.forwardPE ?? null,
            peg: q.pegRatio ?? null,
            roe: financials.returnOnEquity ?? null,
            de: financials.debtToEquity ?? null,
            eps: q.epsTrailingTwelveMonths ?? null,
            score,
            priceChange1y: change,
            intrinsicValue: intrinsic.intrinsicValue,
            upsidePercent: intrinsic.upsidePercent,
          };
        } catch (e) {
          return {
            symbol: q.symbol,
            name: q.longName || q.shortName || q.symbol,
            currency: q.currency || "USD",
            price: q.regularMarketPrice ?? null,
            pe: q.trailingPE ?? q.forwardPE ?? null,
            peg: q.pegRatio ?? null,
            roe: null,
            de: null,
            eps: q.epsTrailingTwelveMonths ?? null,
            score: scoreScanner({
              symbol: q.symbol,
              quote: q,
              financials: {},
              earnings: {},
              priceChange1y: null,
            }),
            priceChange1y: null,
            intrinsicValue: null,
            upsidePercent: null,
          };
        }
      })
    );

    // Sort by score desc, then upside desc
    perSymbol.sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const bu = b.upsidePercent ?? -Infinity;
      const au = a.upsidePercent ?? -Infinity;
      return bu - au;
    });

    return NextResponse.json({ results: perSymbol, assumptions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
