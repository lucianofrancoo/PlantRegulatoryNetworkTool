export interface EnrichmentResult {
  tf: string;
  overlap: number;
  tfTargets: number;
  pathwayGenes: number;
  oddsRatio: number;
  pValue: number;
  fdr: number;
}

const logFactorialCache: number[] = [0];

function logFactorial(n: number): number {
  if (n < 0) return 0;
  for (let i = logFactorialCache.length; i <= n; i += 1) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  }
  return logFactorialCache[n];
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function hypergeomPmf(k: number, N: number, K: number, n: number): number {
  const logP = logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n);
  return Math.exp(logP);
}

export function fisherRightTail(a: number, b: number, c: number, d: number): { pValue: number; oddsRatio: number } {
  const N = a + b + c + d;
  const K = a + c;
  const n = a + b;
  const maxK = Math.min(K, n);
  let p = 0;
  for (let k = a; k <= maxK; k += 1) {
    p += hypergeomPmf(k, N, K, n);
  }

  const denom = b * c;
  const oddsRatio = denom === 0 ? (a > 0 ? Infinity : 0) : (a * d) / denom;
  return { pValue: Math.min(1, p), oddsRatio };
}

export function bhFdr(pValues: number[]): number[] {
  const indexed = pValues.map((p, idx) => ({ p, idx }))
    .sort((a, b) => a.p - b.p);

  const m = pValues.length;
  const qValues = new Array(m).fill(1);
  let prev = 1;

  for (let i = m - 1; i >= 0; i -= 1) {
    const rank = i + 1;
    const q = Math.min(prev, (indexed[i].p * m) / rank);
    prev = q;
    qValues[indexed[i].idx] = q;
  }

  return qValues;
}

export function computeEnrichment(
  tfTargets: Map<string, Set<string>>,
  pathwayGenes: Set<string>,
  universe: Set<string>
): EnrichmentResult[] {
  const universeSize = universe.size;
  const pathway = new Set<string>();
  pathwayGenes.forEach((g) => {
    const gene = g.toUpperCase();
    if (universe.has(gene)) pathway.add(gene);
  });

  const results: EnrichmentResult[] = [];

  tfTargets.forEach((targets, tf) => {
    const targetGenes = new Set<string>();
    targets.forEach((g) => {
      const gene = g.toUpperCase();
      if (universe.has(gene)) targetGenes.add(gene);
    });

    const a = Array.from(targetGenes).filter((g) => pathway.has(g)).length;
    const b = targetGenes.size - a;
    const c = pathway.size - a;
    const d = universeSize - a - b - c;

    if (targetGenes.size === 0 || pathway.size === 0) return;

    const { pValue, oddsRatio } = fisherRightTail(a, b, c, d);
    results.push({
      tf,
      overlap: a,
      tfTargets: targetGenes.size,
      pathwayGenes: pathway.size,
      oddsRatio,
      pValue,
      fdr: 1
    });
  });

  const fdr = bhFdr(results.map((r) => r.pValue));
  results.forEach((r, idx) => {
    r.fdr = fdr[idx];
  });

  return results.sort((a, b) => a.pValue - b.pValue || b.overlap - a.overlap);
}
