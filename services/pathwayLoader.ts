/**
 * Pathway Data Loader
 * Loads pathway TSV files and merges with regulatory data
 */

export interface PathwayNode {
    node_id: string;
    display_name: string;
    type: 'gene' | 'compound' | 'process';
    pathway_role: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PathwayEdge {
    from: string;
    to: string;
    type: string;
    regulation: 'activation' | 'repression' | 'unknown';
    subtype: string;
}

export interface PathwayNodeContent {
    node_id: string;
    display_name: string;
    type: string;
    gene_or_compound_id: string;
    x: number;
    y: number;
}

export interface PathwayData {
    name: string;
    nodes: PathwayNode[];
    edges: PathwayEdge[];
    nodeContent: PathwayNodeContent[];
    geneIds: Set<string>;
}

const AVAILABLE_PATHWAYS = [
    { id: 'aba', name: 'ABA Response', dir: 'aba' },
    { id: 'auxin', name: 'Auxin Signaling', dir: 'auxin' },
    { id: 'water_deprivation', name: 'Water Deprivation', dir: 'water_deprivation' },
    { id: 'osmotic_stress', name: 'Osmotic Stress', dir: 'osmotic_stress' }
];

export async function loadPathway(pathwayId: string): Promise<PathwayData | null> {
    const pathway = AVAILABLE_PATHWAYS.find(p => p.id === pathwayId);
    if (!pathway) {
        console.error(`Unknown pathway: ${pathwayId}`);
        return null;
    }

    try {
        const baseUrl = `/data/pathways/${pathway.dir}`;

        // Load TSV files
        const [nodesRes, edgesRes, contentRes] = await Promise.all([
            fetch(`${baseUrl}/nodes.tsv`),
            fetch(`${baseUrl}/edges.tsv`),
            fetch(`${baseUrl}/content.tsv`)
        ]);

        if (!nodesRes.ok || !edgesRes.ok || !contentRes.ok) {
            console.error(`Failed to load pathway ${pathwayId}`);
            return null;
        }

        const [nodesText, edgesText, contentText] = await Promise.all([
            nodesRes.text(),
            edgesRes.text(),
            contentRes.text()
        ]);

        // Parse TSVs
        const nodes = parseTSV<PathwayNode>(nodesText, (row) => ({
            node_id: row.node_id,
            display_name: row.display_name,
            type: row.type as 'gene' | 'compound' | 'process',
            pathway_role: row.auxin_role || row.pathway_role || 'unknown',
            x: parseFloat(row.x),
            y: parseFloat(row.y),
            width: parseFloat(row.width),
            height: parseFloat(row.height)
        }));

        const edges = parseTSV<PathwayEdge>(edgesText, (row) => ({
            from: row.from,
            to: row.to,
            type: row.type,
            regulation: row.regulation as 'activation' | 'repression' | 'unknown',
            subtype: row.subtype
        }));

        const nodeContent = parseTSV<PathwayNodeContent>(contentText, (row) => ({
            node_id: row.node_id,
            display_name: row.display_name,
            type: row.type,
            gene_or_compound_id: row.gene_or_compound_id,
            x: parseFloat(row.x),
            y: parseFloat(row.y)
        }));

        // Extract all gene IDs
        const geneIds = new Set(
            nodeContent
                .filter(nc => nc.type === 'gene')
                .map(nc => nc.gene_or_compound_id)
        );

        return {
            name: pathway.name,
            nodes,
            edges,
            nodeContent,
            geneIds
        };
    } catch (error) {
        console.error(`Error loading pathway ${pathwayId}:`, error);
        return null;
    }
}

function parseTSV<T>(text: string, mapper: (row: Record<string, string>) => T): T[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split('\t');
    const result: T[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const row: Record<string, string> = {};

        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });

        result.push(mapper(row));
    }

    return result;
}

export function getAvailablePathways() {
    return AVAILABLE_PATHWAYS;
}
