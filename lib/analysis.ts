import { EarningsTrend, Financials, Quote } from "@/lib/yahoo";

export type Assumptions = {
  discountRate: number; // e.g., 0.10
  baseGrowth: number; // fallback long-term growth, e.g., 0.12
  highGrowth: number; // optimistic growth, e.g., 0.20
  lowGrowth: number; // conservative growth, e.g., 0.08
  years: number; // projection years for DCF terminal, e.g., 5
  exitPE: number; // terminal multiple, e.g., 15
  dividendPayoutRatio: number; // fraction of EPS considered as cash flow, e.g., 0.2
};

export const DefaultAssumptions: Assumptions = {
  discountRate: 0.10,
  baseGrowth: 0.12,
  highGrowth: 0.18,
  lowGrowth: 0.08,
  years: 5,
  exitPE: 15,
  dividendPayoutRatio: 0.15,
};

export type ScanInput = {
  symbol: string;
  quote: Quote;
  financials: Financials;
  earnings: EarningsTrend;
};

export type ScanScore = {
  profitability: number; // 0-100
  growth: number; // 0-100
  financialHealth: number; // 0-100
  valuation: number; // 0-100
  momentum: number; // 0-100
  total: number; // 0-100
};

export type IntrinsicValueResult = {
  intrinsicValue: number | null;
  upsidePercent: number | null;
  inputsUsed: {
    epsTtm: number | null;
    growth: number;
    years: number;
    discountRate: number;
    exitPE: number;
    dividendPayoutRatio: number;
  };
};

export type FutureProjection = {
  horizonYears: number;
  low: number | null;
  base: number | null;
  high: number | null;
};

export function pickGrowth(earnings: EarningsTrend | undefined, fallback: number): number {
  const values = [earnings?.growthLongTerm, earnings?.growthNextYear, earnings?.growthThisYear].filter(
    (v): v is number => typeof v === "number" && isFinite(v)
  );
  if (values.length === 0) return fallback;
  // clamp between 0 and 0.3 for sanity
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.max(0, Math.min(0.30, avg));
}

export function scoreScanner(input: ScanInput & { priceChange1y?: number | null }): ScanScore {
  const { quote, financials } = input;

  const roe = financials.returnOnEquity ?? null; // fraction
  const de = financials.debtToEquity ?? null; // percentage
  const margin = financials.profitMargins ?? null; // fraction
  const pe = quote.trailingPE ?? quote.forwardPE ?? null;
  const peg = quote.pegRatio ?? null;

  const profitability = normalize(roe, 0.05, 0.30) * 0.6 + normalize(margin, 0.05, 0.30) * 0.4;
  const growth = normalize(pickGrowth(input.earnings, 0.12), 0.05, 0.25);
  const financialHealth = (1 - normalize(de, 30, 150)) * 0.7 + (normalize(margin, 0.05, 0.25)) * 0.3;
  const valuation = (1 - normalize(pe, 10, 35)) * 0.6 + (1 - normalize(peg, 0.8, 2.0)) * 0.4;
  const momentum = normalize(input.priceChange1y ?? null, -0.2, 0.6); // -20% to +60%

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const p = clamp01(profitability);
  const g = clamp01(growth);
  const f = clamp01(financialHealth);
  const v = clamp01(valuation);
  const m = clamp01(momentum);

  const total = Math.round((p * 0.28 + g * 0.28 + f * 0.18 + v * 0.18 + m * 0.08) * 100);

  return {
    profitability: Math.round(p * 100),
    growth: Math.round(g * 100),
    financialHealth: Math.round(f * 100),
    valuation: Math.round(v * 100),
    momentum: Math.round(m * 100),
    total,
  };
}

function normalize(value: number | null, low: number, high: number): number {
  if (value == null || !isFinite(value)) return 0.5;
  if (low === high) return 0.5;
  if (low < high) return (value - low) / (high - low);
  // inverted range
  return (low - value) / (low - high);
}

export function computeIntrinsicValue(
  quote: Quote,
  earnings: EarningsTrend | undefined,
  assumptions: Assumptions
): IntrinsicValueResult {
  const eps = quote.epsTrailingTwelveMonths ?? null;
  if (!eps || !isFinite(eps) || eps <= 0 || !quote.regularMarketPrice) {
    return {
      intrinsicValue: null,
      upsidePercent: null,
      inputsUsed: {
        epsTtm: eps ?? null,
        growth: pickGrowth(earnings, assumptions.baseGrowth),
        years: assumptions.years,
        discountRate: assumptions.discountRate,
        exitPE: assumptions.exitPE,
        dividendPayoutRatio: assumptions.dividendPayoutRatio,
      },
    };
  }

  const g = pickGrowth(earnings, assumptions.baseGrowth);
  const years = assumptions.years;
  const r = assumptions.discountRate;
  const exitPE = assumptions.exitPE;
  const payout = assumptions.dividendPayoutRatio;

  // Project EPS each year
  let presentValue = 0;
  let eps_t = eps;
  for (let t = 1; t <= years; t++) {
    eps_t = eps_t * (1 + g);
    const cashFlow = eps_t * payout; // treat a fraction of EPS as distributable
    presentValue += cashFlow / Math.pow(1 + r, t);
  }
  const terminalPrice = (eps * Math.pow(1 + g, years)) * exitPE;
  const discountedTerminal = terminalPrice / Math.pow(1 + r, years);
  const intrinsic = presentValue + discountedTerminal;

  const upside = ((intrinsic - quote.regularMarketPrice) / quote.regularMarketPrice) * 100;

  return {
    intrinsicValue: intrinsic,
    upsidePercent: upside,
    inputsUsed: {
      epsTtm: eps,
      growth: g,
      years,
      discountRate: r,
      exitPE,
      dividendPayoutRatio: payout,
    },
  };
}

export function projectFuturePrices(
  quote: Quote,
  earnings: EarningsTrend | undefined,
  assumptions: Assumptions
): FutureProjection[] {
  const price = quote.regularMarketPrice ?? null;
  const eps = quote.epsTrailingTwelveMonths ?? null;
  const baseG = pickGrowth(earnings, assumptions.baseGrowth);
  const lowG = Math.max(0, Math.min(baseG, assumptions.lowGrowth));
  const highG = Math.max(baseG, assumptions.highGrowth);
  const exitPE = assumptions.exitPE;

  const horizons = [5, 10];
  return horizons.map((h) => {
    if (!eps || !price) return { horizonYears: h, low: null, base: null, high: null };
    const epsLow = eps * Math.pow(1 + lowG, h);
    const epsBase = eps * Math.pow(1 + baseG, h);
    const epsHigh = eps * Math.pow(1 + highG, h);
    return {
      horizonYears: h,
      low: epsLow * exitPE,
      base: epsBase * exitPE,
      high: epsHigh * exitPE,
    };
  });
}
