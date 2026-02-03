
import { DataSource, IntegratedInteraction, Interaction, GeneMapping, PathwayMapping, RegulationDirection } from '../types';

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
}

const parseTSV = (text: string, source: 'TARGET' | 'DAP' | 'CHIP'): RawInteraction[] => {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  // Detect headers
  const delimiter = '\t';
  const headers = lines[0].split(delimiter).map(h => h.trim().toUpperCase());

  const tfIdx = headers.indexOf('TF');
  const targetIdx = headers.indexOf('TARGET');
  const posIdx = headers.indexOf('EXPERIMENTOS_POS');
  const negIdx = headers.indexOf('EXPERIMENTOS_NEG');

  if (tfIdx === -1 || targetIdx === -1) return [];

  return lines.slice(1).map(line => {
    const parts = line.split(delimiter);
    let direction: RegulationDirection = 'unknown';

    // Direction logic mostly for TARGET (or if DAP/CHIP has exp columns)
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

// Returns Map: GO Term -> Set of Gene IDs
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
      if (gId && term) {
        result[term].push(gId);
      }
    });
  });
  return result;
};

export const loadIntegratedData = async (onProgress?: (msg: string) => void): Promise<IntegratedDataset> => {
  onProgress?.("Loading regulatory datasets...");

  try {
    const [dapText, chipText, targetText, mapText, procText, goText] = await Promise.all([
      fetch('/data/dap.tsv').then(r => r.ok ? r.text() : ''),
      fetch('/data/chip.tsv').then(r => r.ok ? r.text() : ''),
      fetch('/data/target.tsv').then(r => r.ok ? r.text() : ''),
      fetch('/data/mapping.tsv').then(r => r.ok ? r.text() : ''),
      fetch('/data/process.txt').then(r => r.ok ? r.text() : ''),
      fetch('/data/go_annotations.tsv').then(r => r.ok ? r.text() : '')
    ]);

    onProgress?.("Parsing datasets...");

    const dapData = parseTSV(dapText, 'DAP');
    const chipData = parseTSV(chipText, 'CHIP');
    const targetData = parseTSV(targetText, 'TARGET');

    onProgress?.("Processing annotations...");
    const geneMapping = parseMapping(mapText);
    const pathwayMapping = parsePathways(procText);
    const goAnnotations = parseGOAnnotations(goText);

    onProgress?.("Integrating network model...");
    const map = new Map<string, IntegratedInteraction>();

    const resolve = (id: string) => geneMapping[id.toUpperCase()] || id.toUpperCase();

    [...dapData, ...chipData, ...targetData].forEach(item => {
      // Use resolved symbols for aggregation key
      const tfLabel = resolve(item.tf);
      const targetLabel = resolve(item.target);
      const key = `${tfLabel}::${targetLabel}`;

      if (!map.has(key)) {
        map.set(key, {
          tf: tfLabel,
          target: targetLabel,
          tfId: item.tf, // The raw input is usually the ID (e.g. AT1G...)
          targetId: item.target,
          sources: [item.source],
          evidenceCount: 1,
          isHighConfidence: false, // Will calculate after
          direction: item.direction || 'unknown',
          details: { [item.source]: item.metadata }
        });
      } else {
        const entry = map.get(key)!;
        if (!entry.sources.includes(item.source)) {
          entry.sources.push(item.source);
          entry.evidenceCount = entry.sources.length;
        }
        // If we find a specific direction later, overwrite 'unknown'
        if (entry.direction === 'unknown' && item.direction && item.direction !== 'unknown') {
          entry.direction = item.direction;
        }
        // Merge metadata
        if (!entry.details[item.source]) {
          entry.details[item.source] = item.metadata;
        }
      }
    });

    // Final pass for confidence
    const integrated = Array.from(map.values()).map(val => ({
      ...val,
      isHighConfidence: val.evidenceCount >= 2 // Example rule
    })).sort((a, b) => b.evidenceCount - a.evidenceCount);

    return {
      interactions: integrated,
      geneMapping,
      pathwayMapping,
      goAnnotations,
      totalInteractions: integrated.length
    };

  } catch (error) {
    console.error("Data loading failed", error);
    throw error;
  }
};
