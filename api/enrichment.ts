import fs from 'fs/promises';
import path from 'path';
import { getDataset } from '../server/dataStore';
import { computeEnrichment } from '../services/enrichment';

const dataPath = (...parts: string[]) => path.join(process.cwd(), 'public', 'data', ...parts);

let universeCache: Set<string> | null = null;

async function getUniverse(): Promise<Set<string>> {
  if (universeCache) return universeCache;
  const text = await fs.readFile(dataPath('araport11_genes.tsv'), 'utf8');
  const genes = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.toUpperCase());
  universeCache = new Set(genes);
  return universeCache;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { terms, minConfidence = 1, selectedSources = ['TARGET', 'DAP', 'CHIP'] } = req.body || {};
    if (!Array.isArray(terms) || terms.length === 0) {
      res.status(400).json({ error: 'No terms provided' });
      return;
    }

    const dataset = await getDataset();
    const universe = await getUniverse();

    const tfTargets = new Map<string, Set<string>>();
    dataset.interactions.forEach((i) => {
      if (i.evidenceCount < minConfidence) return;
      if (!i.sources.some((s) => selectedSources.includes(s))) return;
      const tf = i.tf;
      const targetId = (i.targetId || i.target || '').toUpperCase();
      if (!targetId) return;
      const entry = tfTargets.get(tf) || new Set<string>();
      entry.add(targetId);
      tfTargets.set(tf, entry);
    });

    const resultsByTerm: Record<string, any> = {};
    const termGeneCounts: Record<string, number> = {};

    terms.forEach((termId) => {
      const genes = new Set((dataset.goAnnotations[termId] || []).map((g) => g.toUpperCase()));
      termGeneCounts[termId] = genes.size;
      resultsByTerm[termId] = computeEnrichment(tfTargets, genes, universe);
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({
      resultsByTerm,
      termGeneCounts,
      universeSize: universe.size
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute enrichment' });
  }
}
