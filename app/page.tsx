"use client";
import { useMemo, useState } from "react";

type ScanRow = {
  symbol: string;
  name: string;
  currency: string;
  price: number | null;
  pe: number | null;
  peg: number | null;
  roe: number | null;
  de: number | null;
  eps: number | null;
  priceChange1y: number | null;
  score: { total: number };
  intrinsicValue: number | null;
  upsidePercent: number | null;
};

const DEFAULT_TICKERS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
  "NFLX",
  "AMD",
  "AVGO",
  "ADBE",
  "CRM",
  "COST",
  "INTU",
  "NOW",
  "PANW",
  "SHOP",
  "DDOG",
  "MDB",
  "SNOW",
].join(", ");

export default function Home() {
  const [tickers, setTickers] = useState<string>(DEFAULT_TICKERS);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => rows ?? [], [rows]);

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickersText: tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to scan");
      setRows(data.results as ScanRow[]);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Multibagger Stock Scanner</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Paste symbols (comma or newline separated). We fetch public Yahoo data and compute a score, intrinsic value, and upside.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <textarea
              className="h-40 w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL, MSFT, NVDA..."
            />
          </div>
          <div className="flex items-start gap-3">
            <button
              onClick={runScan}
              disabled={loading}
              className="rounded-lg bg-black px-5 py-3 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading ? "Scanning..." : "Run Scan"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {sorted && sorted.length > 0 && (
          <div className="mt-8 overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead>
                <tr className="text-left text-sm">
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">PE</th>
                  <th className="px-3 py-2">PEG</th>
                  <th className="px-3 py-2">ROE</th>
                  <th className="px-3 py-2">D/E</th>
                  <th className="px-3 py-2">EPS TTM</th>
                  <th className="px-3 py-2">Intrinsic</th>
                  <th className="px-3 py-2">Upside</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {sorted.map((r, idx) => (
                  <tr key={r.symbol} className="hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <a className="text-blue-600 hover:underline dark:text-blue-400" href={`/stock/${r.symbol}`}>
                        {r.symbol}
                      </a>
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-medium">{r.score.total}</td>
                    <td className="px-3 py-2">{fmt(r.price, r.currency)}</td>
                    <td className="px-3 py-2">{fmtNum(r.pe)}</td>
                    <td className="px-3 py-2">{fmtNum(r.peg)}</td>
                    <td className="px-3 py-2">{fmtPct(r.roe)}</td>
                    <td className="px-3 py-2">{fmtNum(r.de)}</td>
                    <td className="px-3 py-2">{fmtNum(r.eps)}</td>
                    <td className="px-3 py-2">{fmt(r.intrinsicValue, r.currency)}</td>
                    <td className={`px-3 py-2 ${colorUpside(r.upsidePercent)}`}>{fmtPct(r.upsidePercent, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          This tool uses public Yahoo endpoints without API keys and may rate limit. Metrics are estimates and not financial advice.
        </p>
      </div>
    </div>
  );
}

function fmt(value: number | null, currency?: string) {
  if (value == null || !isFinite(value)) return "-";
  const f = new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 });
  return f.format(value);
}
function fmtNum(value: number | null) {
  if (value == null || !isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
function fmtPct(value: number | null, signed = false) {
  if (value == null || !isFinite(value)) return "-";
  const v = signed ? value : value * 100;
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
