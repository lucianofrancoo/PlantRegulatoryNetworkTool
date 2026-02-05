import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { PathwayData } from '../services/pathwayLoader';
import { IntegratedInteraction } from '../types';

interface PathwayVisualizationProps {
    pathwayData: PathwayData;
    regulatoryData?: IntegratedInteraction[];
    geneMapping?: Record<string, string>;
}

export default function PathwayVisualization({ pathwayData, regulatoryData, geneMapping = {} }: PathwayVisualizationProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [showLabels, setShowLabels] = useState(true);
    const [highlightRegulated, setHighlightRegulated] = useState(true);
    const [selectedTF, setSelectedTF] = useState<string>('all');
    const [selectedSources, setSelectedSources] = useState<string[]>(['TARGET', 'DAP', 'CHIP']);
    const [sourceFilterMode, setSourceFilterMode] = useState<'OR' | 'AND'>('OR');
    const zoomRef = useRef<any>(null);

    // Get unique TFs for selector
    const availableTFs = useMemo(() => {
        if (!regulatoryData) return ['all'];
        return ['all', ...Array.from(new Set(regulatoryData.map(d => d.tf))).sort()];
    }, [regulatoryData]);

    // Filter regulatory data based on selected TF and sources
    const filteredRegulatoryData = useMemo(() => {
        if (!regulatoryData) return [];
        return regulatoryData.filter(interaction => {
            const matchesTF = selectedTF === 'all' || interaction.tf === selectedTF;

            let matchesSource = false;
            if (sourceFilterMode === 'OR') {
                // OR mode: interaction must have at least ONE of the selected sources
                matchesSource = interaction.sources.some(s => selectedSources.includes(s));
            } else {
                // AND mode: interaction must have ALL selected sources
                matchesSource = selectedSources.every(s => interaction.sources.includes(s));
            }

            return matchesTF && matchesSource;
        });
    }, [regulatoryData, selectedTF, selectedSources, sourceFilterMode]);

    const nodeContentById = useMemo(() => {
        const map = new Map<string, string[]>();
        if (!pathwayData) return map;
        pathwayData.nodeContent.forEach((nc) => {
            const list = map.get(nc.node_id);
            if (list) {
                list.push(nc.gene_or_compound_id);
            } else {
                map.set(nc.node_id, [nc.gene_or_compound_id]);
            }
        });
        return map;
    }, [pathwayData]);

    // Build a set of regulated gene IDs (not symbols)
    const regulatedGenes = useMemo(() => {
        const set = new Set<string>();
        if (filteredRegulatoryData && highlightRegulated) {
            filteredRegulatoryData.forEach((int) => {
                // Add both the ID and the symbol to handle both formats
                if (int.targetId) set.add(int.targetId.toUpperCase());
                if (int.tfId) set.add(int.tfId.toUpperCase());
                set.add(int.target.toUpperCase());
                set.add(int.tf.toUpperCase());
            });
        }
        return set;
    }, [filteredRegulatoryData, highlightRegulated]);

    useEffect(() => {
        if (!svgRef.current || !pathwayData) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        // Get pathway bounds from KGML coordinates
        const xCoords = pathwayData.nodes.map(n => n.x);
        const yCoords = pathwayData.nodes.map(n => n.y);
        const minX = Math.min(...xCoords) - 50;
        const maxX = Math.max(...xCoords) + 50;
        const minY = Math.min(...yCoords) - 50;
        const maxY = Math.max(...yCoords) + 50;

        const width = maxX - minX;
        const height = maxY - minY;

        svg.attr('viewBox', `${minX} ${minY} ${width} ${height}`);

        // Create main group for zoom/pan
        const mainGroup = svg.append('g').attr('class', 'main-group');

        // Zoom and Pan behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 10]) // Allow zoom from 10% to 1000%
            .on('zoom', (event) => {
                mainGroup.attr('transform', event.transform);
            });

        svg.call(zoom as any);
        zoomRef.current = { svg, zoom }; // Save for button controls

        // Check if a node has regulatory data
        const isRegulated = (nodeId: string): boolean => {
            const content = nodeContentById.get(nodeId) || [];
            for (const gene of content) {
                if (regulatedGenes.has(gene.toUpperCase())) return true;
            }
            return false;
        };

        // Get regulated and non-regulated genes for a node
        const getRegulatedGenesInNode = (nodeId: string): { regulated: string[], nonRegulated: string[] } => {
            const content = nodeContentById.get(nodeId) || [];
            const regulated: string[] = [];
            const nonRegulated: string[] = [];

            content.forEach(gene => {
                if (!gene) return; // Skip undefined/empty genes
                if (regulatedGenes.has(gene.toUpperCase())) {
                    regulated.push(gene);
                } else {
                    nonRegulated.push(gene);
                }
            });

            return { regulated, nonRegulated };
        };

        // Calculate pathway regions for background clouds
        const pathwayRegions = {
            auxin: { nodes: [] as typeof pathwayData.nodes, color: '#3b82f6', name: 'Auxin' },
            aba: { nodes: [] as typeof pathwayData.nodes, color: '#f97316', name: 'ABA' },
            jasmonate: { nodes: [] as typeof pathwayData.nodes, color: '#22c55e', name: 'Jasmonate' }
        };

        pathwayData.nodes.forEach(node => {
            const role = node.pathway_role;
            if (role === 'auxin') {
                pathwayRegions.auxin.nodes.push(node);
            } else if (role === 'aba' || role === 'aba_4016') {
                pathwayRegions.aba.nodes.push(node);
            } else if (role === '4075' || role === '4016') {
                pathwayRegions.jasmonate.nodes.push(node);
            }
        });

        // Define gradient for compounds (PhytoLearning style)
        const defs = mainGroup.append('defs');

        const compoundGradient = defs.append('radialGradient')
            .attr('id', 'compound-gradient')
            .attr('cx', '50%')
            .attr('cy', '50%')
            .attr('r', '50%');

        compoundGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#64748b')
            .attr('stop-opacity', 0.8);

        compoundGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#475569')
            .attr('stop-opacity', 1);

        // Glow filter for regulated genes
        const glow = defs.append('filter')
            .attr('id', 'glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');

        glow.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');

        const feMerge = glow.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Draw pathway background regions (clouds)
        const backgroundGroup = mainGroup.append('g').attr('class', 'pathway-backgrounds');

        Object.entries(pathwayRegions).forEach(([pathway, data]) => {
            if (data.nodes.length === 0) return;

            // Calculate bounding box with padding
            const padding = 40;
            const xs = data.nodes.map(n => n.x);
            const ys = data.nodes.map(n => n.y);
            const widths = data.nodes.map(n => n.width || 46);
            const heights = data.nodes.map(n => n.height || 17);

            const minX = Math.min(...xs.map((x, i) => x - widths[i] / 2)) - padding;
            const maxX = Math.max(...xs.map((x, i) => x + widths[i] / 2)) + padding;
            const minY = Math.min(...ys.map((y, i) => y - heights[i] / 2)) - padding;
            const maxY = Math.max(...ys.map((y, i) => y + heights[i] / 2)) + padding;

            // Draw rounded rectangle background
            backgroundGroup.append('rect')
                .attr('x', minX)
                .attr('y', minY)
                .attr('width', maxX - minX)
                .attr('height', maxY - minY)
                .attr('rx', 30)
                .attr('ry', 30)
                .attr('fill', data.color)
                .attr('opacity', 0.08)
                .attr('stroke', data.color)
                .attr('stroke-width', 2)
                .attr('stroke-opacity', 0.15)
                .style('pointer-events', 'none');
        });

        // Draw edges first (so they appear behind nodes)
        const edgeGroup = mainGroup.append('g').attr('class', 'edges');

        pathwayData.edges.forEach(edge => {
            const sourceNode = pathwayData.nodes.find(n => n.node_id === edge.from);
            const targetNode = pathwayData.nodes.find(n => n.node_id === edge.to);

            if (!sourceNode || !targetNode) return;

            const color = edge.regulation === 'activation' ? '#10b981' :
                edge.regulation === 'repression' ? '#ef4444' : '#64748b';

            // Draw edge
            edgeGroup.append('line')
                .attr('x1', sourceNode.x)
                .attr('y1', sourceNode.y)
                .attr('x2', targetNode.x)
                .attr('y2', targetNode.y)
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('stroke-opacity', 0.6)
                .attr('marker-end', `url(#arrow-${edge.regulation})`);
        });

        // Define arrow markers
        ['activation', 'repression', 'unknown'].forEach(type => {
            const color = type === 'activation' ? '#10b981' :
                type === 'repression' ? '#ef4444' : '#64748b';

            defs.append('marker')
                .attr('id', `arrow-${type}`)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('refY', 0)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', type === 'repression' ? 'M0,-5 L2,-5 L2,5 L0,5 Z' : 'M0,-5L10,0L0,5')
                .attr('fill', color);
        });

        // Draw nodes
        const nodeGroup = mainGroup.append('g').attr('class', 'nodes');

        pathwayData.nodes.forEach(node => {
            const g = nodeGroup.append('g')
                .attr('transform', `translate(${node.x}, ${node.y})`);

            // Only genes can be regulated, not compounds
            const regulated = node.type === 'gene' ? isRegulated(node.node_id) : false;
            const { regulated: regulatedGenesList, nonRegulated: nonRegulatedGenesList } = getRegulatedGenesInNode(node.node_id);

            if (node.type === 'compound') {
                // Compounds as circles with neutral gray gradient
                const circle = g.append('circle')
                    .attr('r', 18)  // Increased from 12
                    .attr('fill', 'url(#compound-gradient)')
                    .attr('stroke', '#334155')
                    .attr('stroke-width', 2.5) // Increased from 2
                    .style('cursor', 'pointer');

                // Hover effect for compounds
                circle.on('mouseenter', function () {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', 22) // Increased from 14
                        .attr('stroke-width', 4) // Increased
                        .style('filter', 'url(#glow)');
                }).on('mouseleave', function () {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', 18) // Back to 18
                        .attr('stroke-width', 2.5)
                        .style('filter', 'none');
                });

                // Compound label above the circle
                if (showLabels) {
                    g.append('text')
                        .text(node.display_name)
                        .attr('text-anchor', 'middle')
                        .attr('y', -24) // Adjusted position from -18
                        .attr('fill', '#e2e8f0')
                        .attr('font-size', '14px') // Increased from 11px
                        .attr('font-weight', '700')
                        .attr('font-family', 'Inter, system-ui, sans-serif')
                        .attr('stroke', '#0f172a')
                        .attr('stroke-width', '0.4px') // Increased slightly
                        .attr('paint-order', 'stroke')
                        .style('pointer-events', 'none');
                }
            } else {
                // Genes as rounded rectangles
                const scale = 1.3; // Scale factor for genes
                const rectWidth = (node.width || 46) * scale;
                const rectHeight = (node.height || 17) * scale;

                // Background glow for regulated genes
                const glowRect = regulated ? g.append('rect')
                    .attr('x', -rectWidth / 2 - 2)
                    .attr('y', -rectHeight / 2 - 2)
                    .attr('width', rectWidth + 4)
                    .attr('height', rectHeight + 4)
                    .attr('rx', 6) // Increased from 4
                    .attr('fill', '#10b981')
                    .attr('opacity', 0.3) : null;

                const mainRect = g.append('rect')
                    .attr('x', -rectWidth / 2)
                    .attr('y', -rectHeight / 2)
                    .attr('width', rectWidth)
                    .attr('height', rectHeight)
                    .attr('rx', 6) // Increased from 4
                    .attr('fill', regulated ? '#064e3b' : '#1e293b')
                    .attr('stroke', regulated ? '#10b981' : '#475569')
                    .attr('stroke-width', regulated ? 2 : 1.5)
                    .style('filter', regulated ? 'url(#glow)' : 'none')
                    .style('cursor', 'pointer');

                // Gene label
                const label = showLabels ? g.append('text')
                    .text(node.display_name)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', regulated ? '#d1fae5' : '#e2e8f0')
                    .attr('font-size', '12px') // Increased from 9px
                    .attr('font-weight', '700') // Default to bold
                    .attr('font-family', 'Inter, system-ui, sans-serif')
                    .style('pointer-events', 'none') : null;

                // Hover effect for genes
                mainRect.on('mouseenter', function () {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('stroke', '#10b981')
                        .attr('stroke-width', 3)
                        .style('filter', 'url(#glow)');

                    if (glowRect) {
                        glowRect.transition().duration(200).attr('opacity', 0.6);
                    }

                    if (label) {
                        label.transition().duration(200).attr('fill', '#d1fae5').attr('font-weight', '700');
                    }
                }).on('mouseleave', function () {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('stroke', regulated ? '#10b981' : '#475569')
                        .attr('stroke-width', regulated ? 2 : 1.5)
                        .style('filter', regulated ? 'url(#glow)' : 'none');

                    if (glowRect) {
                        glowRect.transition().duration(200).attr('opacity', 0.3);
                    }

                    if (label) {
                        label.transition().duration(200)
                            .attr('fill', regulated ? '#d1fae5' : '#e2e8f0')
                            .attr('font-weight', regulated ? '700' : '600');
                    }
                });
            }

            // Enhanced tooltip with regulated genes highlighted and symbols
            g.append('title')
                .text(() => {
                    let tooltip = `${node.display_name}\n\n`;

                    // Helper function to format gene with symbol
                    const formatGene = (geneId: string): string => {
                        const symbol = geneMapping[geneId.toUpperCase()];
                        return symbol ? `${geneId} (${symbol})` : geneId;
                    };

                    if (regulatedGenesList.length > 0) {
                        tooltip += `✅ REGULATED GENES (${regulatedGenesList.length}):\n`;
                        tooltip += regulatedGenesList.map(formatGene).join('\n') + '\n';
                    }

                    if (nonRegulatedGenesList.length > 0) {
                        tooltip += `\n⚪ Other genes (${nonRegulatedGenesList.length}):\n`;
                        tooltip += nonRegulatedGenesList.map(formatGene).join('\n');
                    }

                    if (regulatedGenesList.length === 0 && nonRegulatedGenesList.length === 0) {
                        tooltip += '(No genes mapped)';
                    }

                    return tooltip;
                });
        });

    }, [pathwayData, regulatedGenes, showLabels, highlightRegulated, nodeContentById, geneMapping]);

    // Zoom control functions
    const handleZoomIn = () => {
        if (zoomRef.current) {
            const { svg, zoom } = zoomRef.current;
            svg.transition().duration(300).call(zoom.scaleBy, 1.3);
        }
    };

    const handleZoomOut = () => {
        if (zoomRef.current) {
            const { svg, zoom } = zoomRef.current;
            svg.transition().duration(300).call(zoom.scaleBy, 0.7);
        }
    };

    const handleZoomReset = () => {
        if (zoomRef.current) {
            const { svg, zoom } = zoomRef.current;
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        }
    };

    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden h-[800px] relative">
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">{pathwayData.name}</h3>
                        <p className="text-sm text-emerald-400 font-medium">KEGG Pathway Visualization</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* TF Selector */}
                    <select
                        value={selectedTF}
                        onChange={(e) => setSelectedTF(e.target.value)}
                        className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-bold text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="all">All TFs</option>
                        {availableTFs.filter(tf => tf !== 'all').map(tf => (
                            <option key={tf} value={tf}>{tf}</option>
                        ))}
                    </select>

                    {/* Source Filters with AND/OR toggle */}
                    <div className="flex items-center gap-2">
                        {/* AND/OR Toggle */}
                        <div className="flex items-center bg-slate-800/50 border border-slate-700 rounded-xl p-1">
                            <button
                                onClick={() => setSourceFilterMode('OR')}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${sourceFilterMode === 'OR'
                                    ? 'bg-cyan-500 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-slate-300'
                                    }`}
                                title="Show genes regulated by ANY selected source"
                            >
                                OR
                            </button>
                            <button
                                onClick={() => setSourceFilterMode('AND')}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${sourceFilterMode === 'AND'
                                    ? 'bg-orange-500 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-slate-300'
                                    }`}
                                title="Show genes regulated by ALL selected sources"
                            >
                                AND
                            </button>
                        </div>

                        {/* Source Selection Buttons */}
                        <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2">
                            {['TARGET', 'DAP', 'CHIP'].map(source => (
                                <button
                                    key={source}
                                    onClick={() => {
                                        if (selectedSources.includes(source)) {
                                            setSelectedSources(selectedSources.filter(s => s !== source));
                                        } else {
                                            setSelectedSources([...selectedSources, source]);
                                        }
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${selectedSources.includes(source)
                                        ? source === 'TARGET'
                                            ? 'bg-emerald-500 text-white'
                                            : source === 'DAP'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-violet-500 text-white'
                                        : 'bg-slate-700 text-slate-400'
                                        }`}
                                >
                                    {source}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 border border-slate-700">
                        <button
                            onClick={handleZoomIn}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                            title="Zoom In (scroll up)"
                        >
                            🔍+
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                            title="Zoom Out (scroll down)"
                        >
                            🔍−
                        </button>
                        <button
                            onClick={handleZoomReset}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                            title="Reset Zoom"
                        >
                            ↺
                        </button>
                    </div>

                    <button
                        onClick={() => setHighlightRegulated(!highlightRegulated)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${highlightRegulated
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                    >
                        {highlightRegulated ? '✓ Highlight' : 'Highlight'}
                    </button>
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showLabels
                            ? 'bg-slate-700 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        {showLabels ? 'Labels' : 'No Labels'}
                    </button>
                </div>
            </div>

            {/* SVG Canvas */}
            <div className="flex-1 relative bg-slate-950/50 overflow-hidden">
                {/* Legend */}
                <div className="absolute top-6 left-6 p-5 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl z-10 space-y-4 shadow-2xl max-w-xs">
                    <div className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">Legend</div>

                    {/* Controls Info */}
                    <div className="pb-3 border-b border-slate-700">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">Controls</div>
                        <div className="space-y-1 text-[10px] text-slate-300">
                            <div>🖱️ Scroll: Zoom in/out</div>
                            <div>🖱️ Drag: Pan/Move</div>
                            <div>🔍 Hover: See genes</div>
                        </div>
                    </div>
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-3 bg-slate-800 border-2 border-slate-600 rounded"></div>
                            <span className="text-xs font-semibold text-slate-300">Gene</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-500 to-slate-600"></div>
                            <span className="text-xs font-semibold text-slate-300">Compound</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-3 bg-slate-900 border-2 border-emerald-500 rounded shadow-lg shadow-emerald-500/50"></div>
                            <span className="text-xs font-semibold text-emerald-300">Regulated</span>
                        </div>
                    </div>
                    <div className="pt-3 border-t border-slate-700">
                        <div className="text-xs font-bold uppercase text-slate-400 mb-2">Regulation</div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-0.5 bg-emerald-500"></div>
                                <span className="text-xs font-medium text-slate-300">Activation</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-0.5 bg-red-500"></div>
                                <span className="text-xs font-medium text-slate-300">Repression</span>
                            </div>
                        </div>
                    </div>
                    <div className="pt-3 border-t border-slate-700">
                        <div className="text-xs font-bold uppercase text-slate-400 mb-2">Pathway Regions</div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-3 rounded" style={{ backgroundColor: '#3b82f6', opacity: 0.3 }}></div>
                                <span className="text-xs font-medium text-slate-300">Auxin</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-3 rounded" style={{ backgroundColor: '#f97316', opacity: 0.3 }}></div>
                                <span className="text-xs font-medium text-slate-300">ABA</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-3 rounded" style={{ backgroundColor: '#22c55e', opacity: 0.3 }}></div>
                                <span className="text-xs font-medium text-slate-300">Jasmonate</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Badge */}
                <div className="absolute top-6 right-6 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-black text-emerald-400">{pathwayData.nodes.length}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nodes</div>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-teal-400">{pathwayData.edges.length}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Edges</div>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-cyan-400">{pathwayData.geneIds.size}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Genes</div>
                        </div>
                    </div>
                </div>

                <svg ref={svgRef} className="w-full h-full"></svg>
            </div>
        </div>
    );
}
