
export interface InteractionMetadata {
  experimentos?: string;
  experimentos_pos?: string;
  experimentos_neg?: string;
}

export type RegulationDirection = 'activation' | 'repression' | 'both' | 'unknown';

export interface Interaction {
  tf: string;
  target: string;
  source: 'TARGET' | 'DAP' | 'CHIP';
  metadata?: InteractionMetadata;
  direction?: RegulationDirection;
}

export interface IntegratedInteraction {
  tf: string;
  target: string;
  tfId?: string; // Original Gene ID
  targetId?: string; // Original Gene ID
  sources: ('TARGET' | 'DAP' | 'CHIP')[];
  evidenceCount: number;
  isHighConfidence: boolean;
  direction: RegulationDirection;
  details: {
    [key in 'TARGET' | 'DAP' | 'CHIP']?: InteractionMetadata;
  };
}

export interface DataSource {
  id: 'TARGET' | 'DAP' | 'CHIP';
  name: string;
  data: Interaction[];
}

export interface GeneMapping {
  [id: string]: string;
}

export interface PathwayMapping {
  [id: string]: string[]; // Gene -> list of biological processes
}

export interface HubData {
  displayName: string;
  type: string;
  nGenes: number;
  genesList: string[];
}

export interface HubMapping {
  [geneId: string]: HubData;
}

export type AnalysisResult = {
  summary: string;
  insights: string[];
};

export type AppView = 'explorer' | 'network' | 'ai';

export type NetworkColorMode = 'source' | 'regulation' | 'pathway';
export type NetworkLayoutMode = 'force' | 'hierarchical';
