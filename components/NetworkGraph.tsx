
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { IntegratedInteraction, NetworkColorMode, NetworkLayoutMode, PathwayMapping, HubMapping } from '../types';
import { PathwayData } from '../services/pathwayLoader';

interface NetworkGraphProps {
  data: IntegratedInteraction[];
  pathwayMapping: PathwayMapping;
  hubMapping: HubMapping;
  selectedSources: string[];
  onToggleSource: (source: string) => void;
  graphScope: 'global' | 'direct' | 'cascade';
  onSetGraphScope: (scope: 'global' | 'direct' | 'cascade') => void;
  pathwayData?: PathwayData | null;
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({
  data, pathwayMapping, hubMapping,
  selectedSources, onToggleSource,
  graphScope, onSetGraphScope,
  pathwayData
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [colorMode, setColorMode] = useState<NetworkColorMode>('source');
  const [layoutMode, setLayoutMode] = useState<NetworkLayoutMode>('hierarchical');
  const [showLabels, setShowLabels] = useState(true);
  const [isPathwayMode, setIsPathwayMode] = useState(false);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = 800;

    const displayData = data
      .sort((a, b) => b.evidenceCount - a.evidenceCount)
      .slice(0, 300);

    const nodesMap = new Map();
    const regulatorSet = new Set(data.map(d => d.tf.toUpperCase()));
    const targetsSet = new Set(data.map(d => d.target.toUpperCase()));

    displayData.forEach(d => {
      const tfId = d.tf.toUpperCase();
      const targetId = d.target.toUpperCase();

      if (!nodesMap.has(tfId)) {
        nodesMap.set(tfId, {
          id: tfId, isRegulator: true, level: targetsSet.has(tfId) ? 1 : 0
        });
      }
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          isRegulator: regulatorSet.has(targetId),
          level: regulatorSet.has(targetId) ? 1 : 2
        });
      }
    });

    const links = displayData.map(d => ({
      source: d.tf.toUpperCase(), target: d.target.toUpperCase(),
      weight: d.evidenceCount, direction: d.direction, sources: d.sources
    }));

    const nodes = Array.from(nodesMap.values());
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`).html("");

    const defs = svg.append("defs");
    const markers = [
      { id: 'arr-act', color: '#10b981', path: 'M0,-5L10,0L0,5' },
      { id: 'arr-rep', color: '#ef4444', path: 'M0,-5 L2,-5 L2,5 L0,5 Z' },
      { id: 'arr-def', color: '#94a3b8', path: 'M0,-5L10,0L0,5' }
    ];
    markers.forEach(m => {
      defs.append("marker").attr("id", m.id).attr("viewBox", "0 -5 10 10").attr("refX", 32).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", m.path).attr("fill", m.color);
    });

    const simulation = d3.forceSimulation(nodes as any);

    if (layoutMode === 'force') {
      simulation.force("link", d3.forceLink(links).id((d: any) => d.id).distance(110))
        .force("charge", d3.forceManyBody().strength(-500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(45));
    } else if (layoutMode === 'hierarchical') {
      simulation.force("link", d3.forceLink(links).id((d: any) => d.id).distance(60))
        .force("x", d3.forceX(width / 2).strength(0.2))
        .force("y", d3.forceY((d: any) => (d.level + 1) * (height / 4)).strength(3))
        .force("collision", d3.forceCollide().radius(40));
    } else if (layoutMode === 'grid') {
      // Grid Layout
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const stepX = width / (cols + 1);
      const stepY = height / (cols + 1);

      simulation.force("link", d3.forceLink(links).id((d: any) => d.id).strength(0)) // No link force in grid
        .force("x", d3.forceX((d: any, i: number) => ((i % cols) + 1) * stepX).strength(1))
        .force("y", d3.forceY((d: any, i: number) => (Math.floor(i / cols) + 1) * stepY).strength(1))
        .force("collision", d3.forceCollide().radius(30));
    }

    const link = svg.append("g").selectAll("line").data(links).join("line")
      .attr("stroke-opacity", 0.7)
      .attr("stroke-width", d => d.weight >= 2 ? 3 : 1.5)
      .attr("stroke-dasharray", d => d.weight === 1 ? "4,4" : "none")
      .attr("stroke", d => colorMode === 'regulation' ? (d.direction === 'activation' ? '#10b981' : d.direction === 'repression' ? '#ef4444' : '#94a3b8') : (d.sources.includes('TARGET') ? '#2563eb' : '#6366f1'))
      .attr("marker-end", d => d.direction === 'activation' ? "url(#arr-act)" : d.direction === 'repression' ? "url(#arr-rep)" : "url(#arr-def)");

    const node = svg.append("g").selectAll("g").data(nodes).join("g")
      .call(d3.drag<SVGGElement, any>().on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    const triangle = d3.symbol().type(d3.symbolTriangle).size(260);

    node.each(function (d: any) {
      const el = d3.select(this);
      const hub = hubMapping[d.id];
      const processes = pathwayMapping[d.id] || [];

      let fill = "#ffffff";
      if (colorMode === 'pathway' && processes.length > 0) {
        if (processes.some(p => p.includes('ABA') || p.includes('WATER'))) fill = '#3b82f6';
        else if (processes.some(p => p.includes('AUXIN'))) fill = '#10b981';
        else if (processes.some(p => p.includes('ETHYLENE'))) fill = '#f59e0b';
        else if (processes.some(p => p.includes('JASMONIC'))) fill = '#ef4444';
        else fill = '#8b5cf6';
      }

      // Aura para Hubs
      if (hub) {
        el.append("circle").attr("r", 16).attr("fill", "rgba(79, 70, 229, 0.15)").attr("stroke", "rgba(79, 70, 229, 0.4)").attr("stroke-width", 1).attr("stroke-dasharray", "2,2");
      }

      if (d.isRegulator) {
        el.append("path").attr("d", triangle()).attr("fill", fill).attr("stroke", "#1e293b").attr("stroke-width", 2.5);
      } else {
        el.append("circle").attr("r", 10).attr("fill", fill).attr("stroke", "#64748b").attr("stroke-width", 2);
      }

      // Badge de n_genes para Hubs
      if (hub && hub.nGenes > 0) {
        el.append("text").text(hub.nGenes).attr("y", -14).attr("class", "text-[8px] font-black fill-indigo-600 text-center").attr("text-anchor", "middle");
      }
    });

    if (showLabels) {
      node.append("text").text((d: any) => hubMapping[d.id]?.displayName || d.id).attr("x", 18).attr("y", 4)
        .attr("class", "text-[11px] font-black fill-slate-800 pointer-events-none select-none").style("text-shadow", "0 0 5px white");
    }

    simulation.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [data, colorMode, layoutMode, pathwayMapping, hubMapping, showLabels, pathwayData, isPathwayMode]);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden h-[800px] relative animate-in fade-in duration-500">
      <div className="p-8 border-b border-slate-700 flex flex-wrap items-center justify-between gap-6 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <div><h3 className="text-xl font-black text-white tracking-tight">Network Visualization</h3></div>
          {/* Graph Scope Controls */}
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl border border-slate-700 p-1 shadow-sm w-fit">
            <button onClick={() => onSetGraphScope('global')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${graphScope === 'global' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400 hover:bg-slate-700'}`}>Global</button>
            <button onClick={() => onSetGraphScope('direct')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${graphScope === 'direct' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400 hover:bg-slate-700'}`}>Direct</button>
            <button onClick={() => onSetGraphScope('cascade')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${graphScope === 'cascade' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400 hover:bg-slate-700'}`}>Cascade</button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          {/* Source Toggles (Moved from Sidebar) */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase mr-1">Sources:</span>
            {(['TARGET', 'DAP', 'CHIP'] as const).map(s => (
              <button
                key={s}
                onClick={() => onToggleSource(s)}
                className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1.5 transition-all ${selectedSources.includes(s) ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s === 'TARGET' ? 'bg-emerald-300' : s === 'DAP' ? 'bg-blue-300' : 'bg-violet-300'}`}></span>
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800/50 rounded-2xl border border-slate-700 p-1.5 shadow-sm">
              <button onClick={() => setLayoutMode('force')} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${layoutMode === 'force' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400'}`}>Free</button>
              <button onClick={() => setLayoutMode('hierarchical')} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${layoutMode === 'hierarchical' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400'}`}>Cascade</button>
              <button onClick={() => setLayoutMode('grid')} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${layoutMode === 'grid' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-400'}`}>Grid</button>
            </div>
            <div className="flex bg-slate-800/50 rounded-2xl border border-slate-700 p-1.5 shadow-sm">
              <button onClick={() => setColorMode('source')} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${colorMode === 'source' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400'}`}>Source</button>
              <button onClick={() => setColorMode('pathway')} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${colorMode === 'pathway' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400'}`}>Processes</button>
            </div>
            <button onClick={() => setShowLabels(!showLabels)} className={`p-2.5 rounded-2xl border transition-all ${showLabels ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
      <div className="relative flex-1 bg-slate-950/50">
        <div className="absolute top-8 left-8 p-6 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-3xl z-10 space-y-4 pointer-events-none shadow-2xl">
          <div><div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">Legend</div><div className="space-y-2">
            <div className="flex items-center gap-3"><div className="w-4 h-4 bg-slate-700" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div><span className="text-[11px] font-black text-slate-300">Regulator</span></div>
            <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full border-2 border-slate-500 bg-slate-900"></div><span className="text-[11px] font-black text-slate-300">Target</span></div>
            <div className="flex items-center gap-3"><div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 border-dashed"></div><span className="text-[11px] font-black text-emerald-400">Hub (Pathway)</span></div>
          </div></div>
          {colorMode === 'pathway' && (
            <div className="pt-2"><div className="text-[10px] font-black uppercase text-emerald-400 mb-2">Hormones</div><div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>ABA</div><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>AUX</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>JAS</div><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>ETH</div>
            </div></div>
          )}
        </div>
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing"></svg>
      </div>
    </div>
  );
};

export default NetworkGraph;
