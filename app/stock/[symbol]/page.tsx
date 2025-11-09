import { fetchSummary } from "@/lib/yahoo";
import { DefaultAssumptions, computeIntrinsicValue, projectFuturePrices } from "@/lib/analysis";

export const revalidate = 60;

export default async function StockPage({ params, searchParams }: { params: { symbol: string }; searchParams: Record<string, string> }) {
  const symbol = (params.symbol || "").toUpperCase();
  const { quote, earningsTrend, financials } = await fetchSummary(symbol);

  const assumptions = { ...DefaultAssumptions };
  if (searchParams.discountRate) assumptions.discountRate = Number(searchParams.discountRate);
  if (searchParams.growth) assumptions.baseGrowth = Number(searchParams.growth);
  if (searchParams.years) assumptions.years = Number(searchParams.years);
  if (searchParams.exitPE) assumptions.exitPE = Number(searchParams.exitPE);

  const intrinsic = computeIntrinsicValue(quote, earningsTrend, assumptions);
  const projections = projectFuturePrices(quote, earningsTrend, assumptions);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <a className="text-blue-600 hover:underline dark:text-blue-400" href="/">? Back</a>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{quote.longName || quote.shortName || symbol} ({symbol})</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Price: {fmt(quote.regularMarketPrice, quote.currency)} ? EPS TTM: {fmtNum(quote.epsTrailingTwelveMonths)} ? PE: {fmtNum(quote.trailingPE ?? quote.forwardPE)}</p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-medium">Intrinsic Value</h3>
            <div className="mt-2 text-sm">
              <div>Discount rate: {fmtPct(assumptions.discountRate)}</div>
              <div>Growth (base): {fmtPct(assumptions.baseGrowth)}</div>
              <div>Years: {assumptions.years}</div>
              <div>Exit PE: {assumptions.exitPE}</div>
            </div>
            <div className="mt-4 text-2xl font-semibold">{fmt(intrinsic.intrinsicValue, quote.currency)}</div>
            <div className={`text-sm ${colorUpside(intrinsic.upsidePercent)}`}>Upside: {fmtPct(intrinsic.upsidePercent, true)}</div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-medium">Future Projections</h3>
            <div className="mt-2 text-sm space-y-2">
              {projections.map((p) => (
                <div key={p.horizonYears} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="font-medium">{p.horizonYears}-Year</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>Low: {fmt(p.low, quote.currency)}</div>
                    <div>Base: {fmt(p.base, quote.currency)}</div>
                    <div>High: {fmt(p.high, quote.currency)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-medium">Key Metrics</h3>
            <div className="mt-2 space-y-1">
              <div>ROE: {fmtPct(financials.returnOnEquity ?? null)}</div>
              <div>Debt/Equity: {fmtNum(financials.debtToEquity ?? null)}</div>
              <div>Profit margin: {fmtPct(financials.profitMargins ?? null)}</div>
              <div>Revenue growth: {fmtPct(financials.revenueGrowth ?? null)}</div>
              <div>Earnings growth: {fmtPct(financials.earningsGrowth ?? null)}</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-500">Data from Yahoo Finance public endpoints. Estimates only, not financial advice.</p>
      </div>
    </div>
  );
}

function fmt(value: number | null | undefined, currency?: string) {
  if (value == null || !isFinite(value)) return "-";
  const f = new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 });
  return f.format(value);
}
function fmtNum(value: number | null | undefined) {
  if (value == null || !isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
function fmtPct(value: number | null | undefined, signed = false) {
  if (value == null || !isFinite(value)) return "-";
  const v = signed ? (value as number) : (value as number) * 100;
  const n = signed ? value : v;
  const pct = signed ? `${n.toFixed(1)}%` : `${v.toFixed(1)}%`;
  return pct;
}
function colorUpside(up?: number | null) {
  if (up == null || !isFinite(up)) return "";
  if (up >= 50) return "text-green-700 dark:text-green-400 font-semibold";
  if (up >= 0) return "text-green-600 dark:text-green-400";
  return "text-red-600";
}
