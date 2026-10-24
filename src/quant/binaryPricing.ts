/**
 * Exact Quantitative Pricing for Kalshi BTC 15-Minute Binary Prediction Contracts
 * Implements Black-Scholes digital cash-or-nothing option pricing, Bachelier normal model,
 * volatility calibration, Brier score verification, and calibration curve generation.
 */

/**
 * Standard Normal Cumulative Distribution Function (Abramowitz & Stegun approximation)
 * Maximum absolute error < 1.5e-7
 */
export function normalCdf(x: number): number {
  if (isNaN(x)) return 0.5;
  if (x < -8.0) return 0.0;
  if (x > 8.0) return 1.0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard Normal Probability Density Function
 */
export function normalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export interface BinaryPricingInputs {
  spotPrice: number; // Current BTC spot (e.g. 68520)
  strikePrice: number; // Contract strike price (e.g. 68500)
  timeToExpirySec: number; // Seconds remaining in 15m contract (1 to 900)
  annualizedVol: number; // Annualized volatility (e.g. 0.55 for 55% BTC vol)
  riskFreeRate?: number; // Default 0.045
}

export interface BinaryPricingOutput {
  pYes: number; // Fair probability of YES (0.00 to 1.00)
  pNo: number; // Fair probability of NO (0.00 to 1.00)
  fairPriceYesCents: number; // In cents (1 to 99)
  fairPriceNoCents: number; // In cents (1 to 99)
  d2: number;
  deltaBtc: number; // Sensitivity of contract price to $1 change in spot BTC
  thetaPerMinuteCents: number; // Time decay per minute
  vegaCents: number; // Sensitivity to 1% change in vol
  moneynessPct: number; // (Spot - Strike) / Strike * 100
  uncertaintyEstimate: number; // Std error of probability estimate
}

/**
 * Calculate Black-Scholes binary / cash-or-nothing digital option price
 * Contract pays $1.00 (100 cents) if Spot >= Strike at settlement, else $0.00.
 */
export function calculateBinaryPrice(inputs: BinaryPricingInputs): BinaryPricingOutput {
  const {
    spotPrice,
    strikePrice,
    timeToExpirySec,
    annualizedVol,
    riskFreeRate = 0.045,
  } = inputs;

  // Prevent divide by zero or extreme past expiry conditions
  const tau = Math.max(timeToExpirySec, 0.5) / (365.25 * 86400); // Time in years
  const sigma = Math.max(annualizedVol, 0.10); // Minimum 10% vol floor

  const volSqrtTau = sigma * Math.sqrt(tau);
  const logMoneyness = Math.log(spotPrice / strikePrice);

  // Black-Scholes d2 (for digital / binary call payoff 1_{S_T >= K})
  const d2 = (logMoneyness + (riskFreeRate - 0.5 * sigma * sigma) * tau) / volSqrtTau;

  const rawPYes = normalCdf(d2);
  // Bound strictly between 0.01 and 0.99 for practical prediction market boundaries
  const pYes = Math.min(Math.max(rawPYes, 0.01), 0.99);
  const pNo = 1.0 - pYes;

  const fairPriceYesCents = Math.round(pYes * 100);
  const fairPriceNoCents = Math.round(pNo * 100);

  // Greeks
  const pdfVal = normalPdf(d2);
  // Digital Delta: d(P)/dS = pdf(d2) / (S * sigma * sqrt(tau))
  const deltaBtc = pdfVal / (spotPrice * volSqrtTau);
  
  // Digital Vega: d(P)/dsigma
  const vega = pdfVal * (-(logMoneyness + riskFreeRate * tau) / (sigma * volSqrtTau) - 0.5 * Math.sqrt(tau));
  const vegaCents = vega * 100 * 0.01;

  // Theta: change in value per minute of elapsed time
  const timeSecDelta = 60;
  const tauNext = Math.max(timeToExpirySec - timeSecDelta, 0.5) / (365.25 * 86400);
  const d2Next = (logMoneyness + (riskFreeRate - 0.5 * sigma * sigma) * tauNext) / (sigma * Math.sqrt(tauNext));
  const thetaPerMinuteCents = (normalCdf(d2Next) - rawPYes) * 100;

  const moneynessPct = ((spotPrice - strikePrice) / strikePrice) * 100;

  // Uncertainty estimate: standard error driven by parameter uncertainty in rolling RV
  // With N=30 1-minute samples, standard error of vol is ~ vol / sqrt(2N) ~ 13% relative error
  const volStdError = sigma / Math.sqrt(60);
  const uncertaintyEstimate = Math.abs(pdfVal * (Math.abs(d2) / sigma) * volStdError);

  return {
    pYes,
    pNo,
    fairPriceYesCents,
    fairPriceNoCents,
    d2,
    deltaBtc,
    thetaPerMinuteCents,
    vegaCents,
    moneynessPct,
    uncertaintyEstimate: Math.min(uncertaintyEstimate, 0.25),
  };
}

/**
 * Kalshi fee schedule computation
 * For binary contracts: taker fee is typically $0.015/contract, maker fee is $0.01/contract
 * capped at maximum permitted per contract
 */
export function calculateKalshiFee(contracts: number, isTaker: boolean): number {
  const ratePerContract = isTaker ? 0.015 : 0.01;
  return Math.round(contracts * ratePerContract * 100) / 100;
}

/**
 * Expected Net Value (EV) calculation after fees and execution costs
 * @param modelProb Model probability of winning (0 to 1)
 * @param executionPriceCents Executable buy price in cents (e.g. 54¢)
 * @param contracts Number of contracts (e.g. 10)
 * @param isTaker Whether order crosses spread as taker
 * @param estimatedSlippageCents Expected price impact / slippage in cents
 */
export function calculateExpectedNetValue(
  modelProb: number,
  executionPriceCents: number,
  contracts: number,
  isTaker: boolean,
  estimatedSlippageCents = 0
): {
  grossEvCents: number;
  totalFeesDollars: number;
  netEvDollars: number;
  netEvCentsPerContract: number;
  edgeCents: number;
  isPositiveEv: boolean;
} {
  const effectiveEntryPriceCents = executionPriceCents + estimatedSlippageCents;
  
  // Payoff on win = 100¢ - effectiveEntryPriceCents
  // Payoff on loss = -effectiveEntryPriceCents
  const grossEvCentsPerContract = modelProb * 100 - effectiveEntryPriceCents;
  const edgeCents = grossEvCentsPerContract;

  const totalFeesDollars = calculateKalshiFee(contracts, isTaker) * 2; // entry + potential exit
  const grossEvDollars = (grossEvCentsPerContract / 100) * contracts;
  const netEvDollars = grossEvDollars - totalFeesDollars;
  const netEvCentsPerContract = (netEvDollars / contracts) * 100;

  return {
    grossEvCents: grossEvCentsPerContract,
    totalFeesDollars,
    netEvDollars: Math.round(netEvDollars * 100) / 100,
    netEvCentsPerContract: Math.round(netEvCentsPerContract * 10) / 10,
    edgeCents: Math.round(edgeCents * 10) / 10,
    isPositiveEv: netEvDollars > 0.05, // Require buffer above zero
  };
}

/**
 * Calculate Realized Volatility from rolling 1-minute close prices
 */
export function calculateRealizedVol(closePrices: number[]): number {
  if (closePrices.length < 5) return 0.50; // Default 50% baseline

  const logReturns: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    const r = Math.log(closePrices[i] / closePrices[i - 1]);
    logReturns.push(r);
  }

  const mean = logReturns.reduce((acc, v) => acc + v, 0) / logReturns.length;
  const variance = logReturns.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (logReturns.length - 1);
  const stdPerMin = Math.sqrt(variance);

  // Annualize: minutes in year = 365.25 * 1440 = 525,960
  const annualized = stdPerMin * Math.sqrt(525960);
  // Cap at realistic extremes (15% to 180%)
  return Math.min(Math.max(annualized, 0.15), 1.80);
}

export interface CandleVolInput {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Parkinson High-Low Volatility Estimator
 * Statistically ~5x more efficient than close-to-close realized volatility
 * Formula: sigma_P^2 = (1 / (4 * ln(2) * N)) * sum( (ln(H_i / L_i))^2 )
 */
export function calculateParkinsonVol(candles: { high: number; low: number }[]): number {
  if (candles.length < 3) return 0.48;

  let sumLogHLSquared = 0;
  let validCount = 0;

  for (const c of candles) {
    if (c.high > 0 && c.low > 0 && c.high >= c.low) {
      const hlRatio = Math.max(c.high / Math.max(c.low, 0.01), 1.00001);
      const logHL = Math.log(hlRatio);
      sumLogHLSquared += logHL * logHL;
      validCount++;
    }
  }

  if (validCount === 0) return 0.48;

  const parkinsonVariance = sumLogHLSquared / (4 * Math.LN2 * validCount);
  const annualized = Math.sqrt(parkinsonVariance) * Math.sqrt(525960);

  return Math.min(Math.max(annualized, 0.15), 1.80);
}

/**
 * Garman-Klass OHLC Volatility Estimator
 * Minimum-variance estimator for Brownian motion with continuous drift
 * ~7.4x more efficient than close-to-close realized volatility
 * Formula: sigma_GK^2 = (1 / N) * sum( 0.5 * ln(H/L)^2 - (2*ln(2) - 1) * ln(C/O)^2 )
 */
export function calculateGarmanKlassVol(candles: CandleVolInput[]): number {
  if (candles.length < 3) return 0.47;

  const k = 2 * Math.LN2 - 1; // ~0.386294
  let sumGk = 0;
  let validCount = 0;

  for (const c of candles) {
    if (c.high > 0 && c.low > 0 && c.open > 0 && c.close > 0) {
      const logHL = Math.log(Math.max(c.high / Math.max(c.low, 0.01), 1.00001));
      const logCO = Math.log(Math.max(c.close / Math.max(c.open, 0.01), 1.00001));
      const term = 0.5 * logHL * logHL - k * logCO * logCO;
      sumGk += Math.max(term, 0); // ensure non-negative contribution
      validCount++;
    }
  }

  if (validCount === 0) return 0.47;

  const gkVariance = sumGk / validCount;
  const annualized = Math.sqrt(gkVariance) * Math.sqrt(525960);

  return Math.min(Math.max(annualized, 0.15), 1.80);
}

/**
 * Brier Score computation: (1/N) * sum((forecast - outcome)^2)
 * Perfect score = 0, coin flip = 0.25
 */
export function calculateBrierScore(
  forecasts: { predictedProb: number; actualOutcome: 1 | 0 }[]
): number {
  if (forecasts.length === 0) return 0.25;
  const sumSquaredDiff = forecasts.reduce(
    (acc, f) => acc + Math.pow(f.predictedProb - f.actualOutcome, 2),
    0
  );
  return Math.round((sumSquaredDiff / forecasts.length) * 10000) / 10000;
}

/**
 * Reliability Curve / Calibration bins
 * Groups forecasts into 10 decile buckets (0-10%, 10-20%, ...)
 * Computes observed frequency in each bucket to verify true calibration
 */
export interface CalibrationBin {
  binMin: number;
  binMax: number;
  binCenter: number;
  forecastCount: number;
  meanPredicted: number;
  observedFrequency: number;
  brierContribution: number;
}

export function generateReliabilityDiagram(
  forecasts: { predictedProb: number; actualOutcome: 1 | 0 }[]
): CalibrationBin[] {
  const numBins = 10;
  const bins: CalibrationBin[] = Array.from({ length: numBins }, (_, i) => {
    const binMin = i * 0.1;
    const binMax = (i + 1) * 0.1;
    return {
      binMin,
      binMax,
      binCenter: (binMin + binMax) / 2,
      forecastCount: 0,
      meanPredicted: 0,
      observedFrequency: 0,
      brierContribution: 0,
    };
  });

  const binItems: { predicted: number; outcome: number }[][] = Array.from({ length: numBins }, () => []);

  for (const f of forecasts) {
    let binIdx = Math.floor(f.predictedProb * numBins);
    if (binIdx >= numBins) binIdx = numBins - 1;
    if (binIdx < 0) binIdx = 0;
    binItems[binIdx].push({ predicted: f.predictedProb, outcome: f.actualOutcome });
  }

  return bins.map((bin, idx) => {
    const items = binItems[idx];
    if (items.length === 0) {
      return {
        ...bin,
        forecastCount: 0,
        meanPredicted: bin.binCenter,
        observedFrequency: bin.binCenter,
        brierContribution: 0,
      };
    }
    const sumPred = items.reduce((acc, it) => acc + it.predicted, 0);
    const sumOut = items.reduce((acc, it) => acc + it.outcome, 0);
    const count = items.length;
    const meanPred = sumPred / count;
    const obsFreq = sumOut / count;
    const brierContrib = items.reduce((acc, it) => acc + Math.pow(it.predicted - it.outcome, 2), 0) / count;

    return {
      ...bin,
      forecastCount: count,
      meanPredicted: Math.round(meanPred * 100) / 100,
      observedFrequency: Math.round(obsFreq * 100) / 100,
      brierContribution: Math.round(brierContrib * 1000) / 1000,
    };
  });
}
