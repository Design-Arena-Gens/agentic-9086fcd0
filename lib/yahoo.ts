export type Quote = {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  priceToBook?: number;
  pegRatio?: number;
  currency?: string;
};

export type Financials = {
  returnOnEquity?: number; // fraction (e.g., 0.22)
  debtToEquity?: number; // percentage (e.g., 45)
  operatingMargins?: number; // fraction
  profitMargins?: number; // fraction
  freeCashflow?: number; // absolute number
  revenueGrowth?: number; // fraction
  earningsGrowth?: number; // fraction
  targetMeanPrice?: number;
};

export type EarningsTrend = {
  growthLongTerm?: number; // analysts long-term growth (fraction)
  growthNextYear?: number;
  growthThisYear?: number;
};

export type Summary = {
  quote: Quote;
  financials: Financials;
  earningsTrend: EarningsTrend;
};

const YAHOO_BASE = "https://query1.finance.yahoo.com";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Yahoo request failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchQuoteBatch(symbols: string[]): Promise<Quote[]> {
  const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const data = await fetchJson<any>(url);
  const results = (data?.quoteResponse?.result || []) as any[];
  return results.map((r) => ({
    symbol: r.symbol,
    shortName: r.shortName,
    longName: r.longName,
    regularMarketPrice: r.regularMarketPrice,
    marketCap: r.marketCap,
    trailingPE: r.trailingPE,
    forwardPE: r.forwardPE,
    epsTrailingTwelveMonths: r.epsTrailingTwelveMonths,
    priceToBook: r.priceToBook,
    pegRatio: r.pegRatio,
    currency: r.currency,
  }));
}

export async function fetchSummary(symbol: string): Promise<Summary> {
  const url = `${YAHOO_BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics,price,earningsTrend`;
  const data = await fetchJson<any>(url);
  const q = data?.quoteSummary?.result?.[0];
  const financialData = q?.financialData || {};
  const earningsTrend = q?.earningsTrend || {};
  const price = q?.price || {};

  const fin: Financials = {
    returnOnEquity: q?.defaultKeyStatistics?.returnOnEquity?.raw ?? financialData?.returnOnEquity?.raw,
    debtToEquity: q?.defaultKeyStatistics?.debtToEquity?.raw ?? financialData?.debtToEquity?.raw,
    operatingMargins: financialData?.operatingMargins?.raw,
    profitMargins: financialData?.profitMargins?.raw,
    freeCashflow: financialData?.freeCashflow?.raw,
    revenueGrowth: financialData?.revenueGrowth?.raw,
    earningsGrowth: financialData?.earningsGrowth?.raw,
    targetMeanPrice: financialData?.targetMeanPrice?.raw,
  };

  const et: EarningsTrend = {
    growthLongTerm: earningsTrend?.trend?.find((t: any) => t.period === "+5y")?.growth?.raw,
    growthNextYear: earningsTrend?.trend?.find((t: any) => t.period === "+1y")?.growth?.raw,
    growthThisYear: earningsTrend?.trend?.find((t: any) => t.period === "0y")?.growth?.raw,
  };

  const quote: Quote = {
    symbol: price?.symbol ?? symbol,
    shortName: price?.shortName,
    longName: price?.longName,
    regularMarketPrice: price?.regularMarketPrice?.raw,
    marketCap: price?.marketCap?.raw,
    trailingPE: price?.trailingPE?.raw,
    forwardPE: price?.forwardPE?.raw,
    epsTrailingTwelveMonths: price?.epsTrailingTwelveMonths?.raw,
    priceToBook: price?.priceToBook?.raw,
    pegRatio: price?.pegRatio?.raw,
    currency: price?.currency,
  };

  return { quote, financials: fin, earningsTrend: et };
}

export async function fetchPriceHistory(symbol: string, range: string = "1y", interval: string = "1d") {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const data = await fetchJson<any>(url);
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: number[] = result?.indicators?.quote?.[0]?.close || [];
  return { timestamps, closes };
}
