import fs from 'fs/promises';
import path from 'path';
import { IntegratedInteraction, GeneMapping, PathwayMapping, RegulationDirection } from '../types';

interface RawInteraction {
  tf: string;
  target: string;
  source: 'TARGET' | 'DAP' | 'CHIP';
  direction?: RegulationDirection;
  metadata?: any;
}

export interface IntegratedDataset {
  interactions: IntegratedInteraction[];
  geneMapping: GeneMapping;
  pathwayMapping: PathwayMapping;
  goAnnotations: Record<string, string[]>;
  totalInteractions: number;
  stats: {
    sourceCounts: { name: 'TARGET' | 'DAP' | 'CHIP'; count: number }[];
  };
}

let cached: IntegratedDataset | null = null;

const dataPath = (...parts: string[]) => path.join(process.cwd(), 'public', 'data', ...parts);

const parseTSV = (text: string, source: 'TARGET' | 'DAP' | 'CHIP'): RawInteraction[] => {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim().toUpperCase());
  const tfIdx = headers.indexOf('TF');
  const targetIdx = headers.indexOf('TARGET');
  const posIdx = headers.indexOf('EXPERIMENTOS_POS');
  const negIdx = headers.indexOf('EXPERIMENTOS_NEG');

  if (tfIdx === -1 || targetIdx === -1) return [];

  return lines.slice(1).map(line => {
    const parts = line.split('\t');
    let direction: RegulationDirection = 'unknown';
    const p = parts[posIdx]?.trim();
    const n = parts[negIdx]?.trim();
    if (p && !n) direction = 'activation';
    else if (n && !p) direction = 'repression';
    else if (p && n) direction = 'both';

    return {
      tf: (parts[tfIdx] || '').trim(),
      target: (parts[targetIdx] || '').trim(),
      source,
      direction,
      metadata: { experimentos_pos: p, experimentos_neg: n }
    };
  }).filter(i => i.tf && i.target);
};

const parseMapping = (text: string): GeneMapping => {
  const mapping: GeneMapping = {};
  text.split(/\r?\n/).forEach(line => {
    const [id, symbol] = line.split('\t').map(s => s.trim());
    if (id && symbol) mapping[id.toUpperCase()] = symbol;
  });
  return mapping;
};

const parsePathways = (text: string): PathwayMapping => {
  const mapping: PathwayMapping = {};
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return mapping;

  const headers = lines[0].split('\t').map(h => h.trim());
  lines.slice(1).forEach(line => {
    const parts = line.split('\t');
    parts.forEach((gene, colIdx) => {
      const gId = gene.trim().toUpperCase();
      const pName = headers[colIdx];
      if (gId && pName) {
        if (!mapping[gId]) mapping[gId] = [];
        if (!mapping[gId].includes(pName)) mapping[gId].push(pName);
      }
    });
  });
  return mapping;
};

const parseGOAnnotations = (text: string): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return result;

  const headers = lines[0].split('\t').map(h => h.trim());
  headers.forEach(h => { if (h) result[h] = []; });

  lines.slice(1).forEach(line => {
    const parts = line.split('\t');
    parts.forEach((gene, colIdx) => {
      const gId = gene.trim().toUpperCase();
      const term = headers[colIdx];
      if (gId && term) result[term].push(gId);
    });
  });
  return result;
};

export async function getDataset(): Promise<IntegratedDataset> {
  if (cached) return cached;

  const [dapText, chipText, targetText, mapText, procText, goText] = await Promise.all([
    fs.readFile(dataPath('dap.tsv'), 'utf8'),
    fs.readFile(dataPath('chip.tsv'), 'utf8'),
    fs.readFile(dataPath('target.tsv'), 'utf8'),
    fs.readFile(dataPath('mapping.tsv'), 'utf8'),
    fs.readFile(dataPath('process.txt'), 'utf8'),
    fs.readFile(dataPath('go_annotations.tsv'), 'utf8')
  ]);

  const dapData = parseTSV(dapText, 'DAP');
  const chipData = parseTSV(chipText, 'CHIP');
  const targetData = parseTSV(targetText, 'TARGET');

  const geneMapping = parseMapping(mapText);
  const pathwayMapping = parsePathways(procText);
  const goAnnotations = parseGOAnnotations(goText);

  const map = new Map<string, IntegratedInteraction>();
  const resolve = (id: string) => geneMapping[id.toUpperCase()] || id.toUpperCase();

  [...dapData, ...chipData, ...targetData].forEach(item => {
    const tfLabel = resolve(item.tf);
    const targetLabel = resolve(item.target);
    const key = `${tfLabel}::${targetLabel}`;

    if (!map.has(key)) {
      map.set(key, {
        tf: tfLabel,
        target: targetLabel,
        tfId: item.tf,
        targetId: item.target,
        sources: [item.source],
        evidenceCount: 1,
        isHighConfidence: false,
        direction: item.direction || 'unknown',
        details: { [item.source]: item.metadata }
      });
    } else {
      const entry = map.get(key)!;
      if (!entry.sources.includes(item.source)) {
        entry.sources.push(item.source);
        entry.evidenceCount = entry.sources.length;
      }
      if (entry.direction === 'unknown' && item.direction && item.direction !== 'unknown') {
        entry.direction = item.direction;
      }
      if (!entry.details[item.source]) {
        entry.details[item.source] = item.metadata;
      }
    }
  });

  const interactions = Array.from(map.values()).map(val => ({
    ...val,
    isHighConfidence: val.evidenceCount >= 2
  })).sort((a, b) => b.evidenceCount - a.evidenceCount);

  cached = {
    interactions,
    geneMapping,
    pathwayMapping,
    goAnnotations,
    totalInteractions: interactions.length,
    stats: {
      sourceCounts: [
        { name: 'TARGET', count: interactions.filter(i => i.sources.includes('TARGET')).length },
        { name: 'DAP', count: interactions.filter(i => i.sources.includes('DAP')).length },
        { name: 'CHIP', count: interactions.filter(i => i.sources.includes('CHIP')).length }
      ]
    }
  };

  return cached;
}
