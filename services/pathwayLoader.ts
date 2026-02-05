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
    { id: 'hormone_signaling', name: '🌿 Integrated Hormone Signaling (Auxin + ABA + Jasmonate + MAPK)', dir: 'AUX_ABA_JAS_MAPK_merged' }
    // More pathways can be added here in the future
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

        // Parse TSVs with safety checks
        console.log(`[PathwayLoader] Raw header nodes:`, nodesText.split('\n')[0]);

        const nodes = parseTSV<PathwayNode>(nodesText, (row) => {
            const x = parseFloat(row.x || '0');
            const y = parseFloat(row.y || '0');
            const w = parseFloat(row.width || '46');
            const h = parseFloat(row.height || '17');

            if (isNaN(x) || isNaN(y)) {
                console.warn('[PathwayLoader] NaN coordinate detected for node:', row);
            }

            return {
                node_id: row.node_id || `unknown-${Math.random()}`,
                display_name: row.display_name || '?',
                type: (row.type || 'gene') as 'gene' | 'compound' | 'process',
                pathway_role: row.auxin_role || row.pathway_role || 'unknown',
                x: isNaN(x) ? 0 : x,
                y: isNaN(y) ? 0 : y,
                width: isNaN(w) ? 46 : w,
                height: isNaN(h) ? 17 : h
            };
        });

        console.log(`[PathwayLoader] Parsed ${nodes.length} nodes`);

        const edges = parseTSV<PathwayEdge>(edgesText, (row) => ({
            from: row.from,
            to: row.to,
            type: row.type,
            regulation: (row.regulation as 'activation' | 'repression' | 'unknown') || 'unknown',
            subtype: row.subtype
        }));

        const nodeContent = parseTSV<PathwayNodeContent>(contentText, (row) => ({
            node_id: row.node_id,
            display_name: row.display_name,
            type: row.type || 'gene',
            gene_or_compound_id: row.gene_or_compound_id || row.gene_id || row.symbol || '',
            x: parseFloat(row.x || '0'),
            y: parseFloat(row.y || '0')
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
    // Handle both Windows (\r\n) and Unix (\n) line endings
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    // Clean headers: trim and remove BOM if present
    const headers = lines[0].split('\t').map(h => h.trim().replace(/^\ufeff/, ''));

    // Debug first row parsing
    if (lines.length > 1) {
        console.log('[PathwayLoader] Headers:', headers);
        console.log('[PathwayLoader] First row raw:', lines[1]);
    }

    const result: T[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');

        // Skip lines that don't match header length roughly
        if (values.length < headers.length * 0.5) continue;

        const row: Record<string, string> = {};

        headers.forEach((header, index) => {
            // Trim values to remove \r or spaces
            row[header] = (values[index] || '').trim();
        });

        try {
            result.push(mapper(row));
        } catch (e) {
            console.warn(`[PathwayLoader] Failed to map row ${i}:`, row, e);
        }
    }

    return result;
}

export function getAvailablePathways() {
    return AVAILABLE_PATHWAYS;
}

// Load specific hormone pathway data with camelCase properties for PathwayView
export async function loadPathwayData(hormone: string) {
    const hormonePathwayMap: Record<string, string> = {
        'aba': 'auxin_subpathway',
        'auxin': 'auxin_subpathway',
        'water_deprivation': 'auxin_subpathway',
        'osmotic_stress': 'auxin_subpathway'
    };

    const pathwayFile = hormonePathwayMap[hormone] || 'auxin_subpathway';

    try {
        const [nodesRes, edgesRes, contentRes] = await Promise.all([
            fetch(`/${pathwayFile}_nodes.tsv`),
            fetch(`/${pathwayFile}_edges.tsv`),
            fetch(`/${pathwayFile}_node_content.tsv`)
        ]);

        if (!nodesRes.ok || !edgesRes.ok || !contentRes.ok) {
            console.error(`Failed to load pathway ${pathwayFile}`);
            return null;
        }

        const [nodesText, edgesText, contentText] = await Promise.all([
            nodesRes.text(),
            edgesRes.text(),
            contentRes.text()
        ]);

        // Parse nodes with camelCase properties
        const nodes = parseTSV(nodesText, (row: any) => ({
            nodeId: row.node_id,
            displayName: row.display_name,
            type: row.type as 'gene' | 'compound',
            x: parseFloat(row.x),
            y: parseFloat(row.y),
            width: parseFloat(row.width),
            height: parseFloat(row.height)
        }));

        // Parse edges with camelCase properties
        const edges = parseTSV(edgesText, (row: any) => ({
            source: row.from,
            target: row.to,
            type: row.regulation || row.type || 'unknown'
        }));

        // Parse node content with camelCase properties
        const nodeContent = parseTSV(contentText, (row: any) => ({
            nodeId: row.node_id,
            geneId: row.gene_or_compound_id,
            displayName: row.display_name,
            type: row.type
        }));

        return {
            nodes,
            edges,
            nodeContent
        };
    } catch (error) {
        console.error(`Error loading pathway data for ${hormone}:`, error);
        return null;
    }
}
