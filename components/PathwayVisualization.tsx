import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { PathwayData } from '../services/pathwayLoader';
import { IntegratedInteraction } from '../types';

interface PathwayVisualizationProps {
    pathwayData: PathwayData;
    regulatoryData?: IntegratedInteraction[];
}

export default function PathwayVisualization({ pathwayData, regulatoryData }: PathwayVisualizationProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [showLabels, setShowLabels] = useState(true);
    const [highlightRegulated, setHighlightRegulated] = useState(true);

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

    const regulatedGenes = useMemo(() => {
        const set = new Set<string>();
        if (regulatoryData && highlightRegulated) {
            regulatoryData.forEach((int) => {
                set.add(int.target.toUpperCase());
                set.add(int.tf.toUpperCase());
            });
        }
        return set;
    }, [regulatoryData, highlightRegulated]);

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

        // Check if a node has regulatory data
        const isRegulated = (nodeId: string): boolean => {
            const content = nodeContentById.get(nodeId) || [];
            for (const gene of content) {
                if (regulatedGenes.has(gene.toUpperCase())) return true;
            }
            return false;
        };

        // Define gradient for compounds (PhytoLearning style)
        const defs = svg.append('defs');

        const compoundGradient = defs.append('radialGradient')
            .attr('id', 'compound-gradient')
            .attr('cx', '50%')
            .attr('cy', '50%')
            .attr('r', '50%');

        compoundGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#10b981')
            .attr('stop-opacity', 0.8);

        compoundGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#059669')
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

        // Draw edges first (so they appear behind nodes)
        const edgeGroup = svg.append('g').attr('class', 'edges');

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
        const nodeGroup = svg.append('g').attr('class', 'nodes');

        pathwayData.nodes.forEach(node => {
            const g = nodeGroup.append('g')
                .attr('transform', `translate(${node.x}, ${node.y})`);

            const regulated = isRegulated(node.node_id);

            if (node.type === 'compound') {
                // Compounds as circles with gradient (PhytoLearning emerald style)
                g.append('circle')
                    .attr('r', 12)
                    .attr('fill', 'url(#compound-gradient)')
                    .attr('stroke', '#065f46')
                    .attr('stroke-width', 2)
                    .style('filter', regulated ? 'url(#glow)' : 'none');
            } else {
                // Genes as rounded rectangles
                const rectWidth = node.width || 46;
                const rectHeight = node.height || 17;

                // Background glow for regulated genes
                if (regulated) {
                    g.append('rect')
                        .attr('x', -rectWidth / 2 - 2)
                        .attr('y', -rectHeight / 2 - 2)
                        .attr('width', rectWidth + 4)
                        .attr('height', rectHeight + 4)
                        .attr('rx', 6)
                        .attr('fill', '#10b981')
                        .attr('opacity', 0.3);
                }

                g.append('rect')
                    .attr('x', -rectWidth / 2)
                    .attr('y', -rectHeight / 2)
                    .attr('width', rectWidth)
                    .attr('height', rectHeight)
                    .attr('rx', 4)
                    .attr('fill', regulated ? '#064e3b' : '#1e293b')
                    .attr('stroke', regulated ? '#10b981' : '#475569')
                    .attr('stroke-width', regulated ? 2 : 1.5)
                    .style('filter', regulated ? 'url(#glow)' : 'none');

                // Gene label
                if (showLabels) {
                    g.append('text')
                        .text(node.display_name)
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'middle')
                        .attr('fill', regulated ? '#d1fae5' : '#e2e8f0')
                        .attr('font-size', '9px')
                        .attr('font-weight', regulated ? '700' : '600')
                        .attr('font-family', 'Inter, system-ui, sans-serif');
                }
            }

            // Tooltip on hover
            g.append('title')
                .text(() => {
                    const genes = (nodeContentById.get(node.node_id) || [])
                        .join(', ');
                    return `${node.display_name}\n${genes}${regulated ? '\n✓ Has regulatory data' : ''}`;
                });
        });

    }, [pathwayData, regulatedGenes, showLabels, highlightRegulated, nodeContentById]);

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
                    <button
                        onClick={() => setHighlightRegulated(!highlightRegulated)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${highlightRegulated
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                    >
                        {highlightRegulated ? '✓ Highlight Regulated' : 'Highlight Regulated'}
                    </button>
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showLabels
                                ? 'bg-slate-700 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        {showLabels ? 'Hide Labels' : 'Show Labels'}
                    </button>
                </div>
            </div>

            {/* SVG Canvas */}
            <div className="flex-1 relative bg-slate-950/50 overflow-hidden">
                {/* Legend */}
                <div className="absolute top-6 left-6 p-5 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl z-10 space-y-4 shadow-2xl">
                    <div className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">Legend</div>
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-3 bg-slate-800 border-2 border-slate-600 rounded"></div>
                            <span className="text-xs font-semibold text-slate-300">Gene</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600"></div>
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
