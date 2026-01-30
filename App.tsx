
import React, { useState, useMemo, useEffect } from 'react';
import { IntegratedInteraction, AnalysisResult, AppView, PathwayMapping, HubMapping } from './types';
import StatsPanel from './components/StatsPanel';
import NetworkGraph from './components/NetworkGraph';
import { analyzeNetwork } from './services/geminiService';
import { loadIntegratedData } from './services/dataLoader';

const App: React.FC = () => {
  const [data, setData] = useState<IntegratedInteraction[]>([]);
  const [pathwayMapping, setPathwayMapping] = useState<PathwayMapping>({});
  const [goAnnotations, setGoAnnotations] = useState<Record<string, string[]>>({});
  const [hubMapping, setHubMapping] = useState<HubMapping>({});

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing GeneReg Integrator...");

  const [activeView, setActiveView] = useState<AppView>('explorer');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [minConfidence, setMinConfidence] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPathway, setSelectedPathway] = useState<string>('all');
  const [selectedGoTerm, setSelectedGoTerm] = useState<string>('all');
  const [priorityTfFilter, setPriorityTfFilter] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'symbol' | 'id'>('geneId'); // Default to GeneID as requested

  const [selectedSources, setSelectedSources] = useState<string[]>(['TARGET', 'DAP', 'CHIP']);
  const [graphScope, setGraphScope] = useState<'global' | 'direct' | 'cascade'>('global');

  const PRIORITY_GO_TERMS = [
    { id: 'all', label: 'Todos los Procesos' },
    { id: 'Water deprivation', label: 'Water Deprivation (GO:0009414)' },
    { id: 'Response to ABA', label: 'Response to ABA (GO:0009737)' },
    { id: 'ABA-activated signaling pathway', label: 'ABA Signaling (GO:0009738)' },
    { id: 'Response to osmotic stress', label: 'Osmotic Stress (GO:0006970)' },
    { id: 'Response to auxin', label: 'Auxin Response (GO:0009733)' }
  ];

  const PRIORITY_TFS = ['NLP7', 'TGA1', 'HB7', 'ABF2', 'GBF3', 'MYBR1']; // MYBR1 is MYB44

  // Initialization: Load pre-integrated data
  useEffect(() => {
    const init = async () => {
      try {
        const result = await loadIntegratedData((msg) => setLoadingMsg(msg));
        setData(result.interactions);
        setPathwayMapping(result.pathwayMapping);
        setGoAnnotations(result.goAnnotations || {});
        // If hub mapping was loaded, we would set it here. For now empty.
        setHubMapping({});
      } catch (e) {
        console.error(e);
        setErrorMessage("Error crítico: No se pudieron cargar los datos regulatorios locales.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const allPathways = useMemo(() => {
    const pSet = new Set<string>();
    (Object.values(pathwayMapping) as string[][]).forEach(p => p.forEach(v => pSet.add(v)));
    return Array.from(pSet).sort();
  }, [pathwayMapping]);

  const filteredData = useMemo(() => {
    let output = data.filter(i => {
      const matchesSearch = i.tf.toUpperCase().includes(searchTerm.toUpperCase()) || i.target.toUpperCase().includes(searchTerm.toUpperCase());
      const matchesConfidence = i.evidenceCount >= minConfidence;

      let matchesPathway = true;
      if (selectedPathway !== 'all') {
        const p1 = pathwayMapping[i.tf.toUpperCase()] || [];
        const p2 = pathwayMapping[i.target.toUpperCase()] || [];
        matchesPathway = p1.includes(selectedPathway) || p2.includes(selectedPathway);
      }

      let matchesGo = true;
      if (selectedGoTerm !== 'all') {
        const genesInGo = goAnnotations[selectedGoTerm] || [];
        matchesGo = genesInGo.includes(i.tf.toUpperCase()) || genesInGo.includes(i.target.toUpperCase());
      }

      let matchesTf = true;
      if (priorityTfFilter) {
        matchesTf = i.tf.toUpperCase() === priorityTfFilter;
      }

      const matchesSource = i.sources.some(s => selectedSources.includes(s));

      return matchesSearch && matchesConfidence && matchesPathway && matchesGo && matchesTf && matchesSource;
    });

    // Stage 2: Scope Logic (Global vs Direct vs Cascade)
    if (graphScope === 'global') {
      if (priorityTfFilter) {
        output = output.filter(i => i.tf.toUpperCase() === priorityTfFilter);
      }
    } else {
      // Direct or Cascade requires a "Center"
      const center = priorityTfFilter || (output.some(i => i.tf.toUpperCase() === searchTerm.toUpperCase()) ? searchTerm.toUpperCase() : null);

      if (center) {
        if (graphScope === 'direct') {
          output = output.filter(i => i.tf.toUpperCase() === center);
        } else if (graphScope === 'cascade') {
          const level1 = output.filter(i => i.tf.toUpperCase() === center);
          const level1Targets = new Set(level1.map(i => i.target.toUpperCase()));
          const level2 = output.filter(i => level1Targets.has(i.tf.toUpperCase()));
          output = [...level1, ...level2];
          // Deduplicate
          output = Array.from(new Set(output));
        }
      }
    }

    return output;
  }, [data, searchTerm, minConfidence, selectedPathway, pathwayMapping, selectedGoTerm, goAnnotations, priorityTfFilter, selectedSources, graphScope]);

  const handleDownloadTSV = () => {
    const headers = ['TF', 'Target', 'Evidence_Sources', 'Direction', 'Evidence_Count', 'Processes'];
    const rows = filteredData.map(row => {
      const tfVal = exportFormat === 'symbol' ? row.tf : (row.tfId || row.tf);
      const targetVal = exportFormat === 'symbol' ? row.target : (row.targetId || row.target);

      return [
        tfVal,
        targetVal,
        row.sources.join('|'),
        row.direction,
        row.evidenceCount,
        (pathwayMapping[row.target] || []).join('|')
      ].join('\t');
    });

    const blob = new Blob([headers.join('\t') + '\n' + rows.join('\n')], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genereg_export_${exportFormat}_${new Date().toISOString().split('T')[0]}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAiAnalysis = async () => {
    if (filteredData.length === 0) return;
    setIsAnalyzing(true);
    setActiveView('ai');
    try {
      const result = await analyzeNetwork(filteredData.slice(0, 50)); // Limit analysis to top 50 filtered
      setAiAnalysis(result);
    } catch (e) { setErrorMessage("Error en análisis AI"); }
    finally { setIsAnalyzing(false); }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-bold tracking-tight">GeneReg Integrator</h2>
        <p className="text-slate-400 mt-2 animate-pulse">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">GI</div>
          <h1 className="text-lg font-bold text-white tracking-tight leading-tight">GeneReg<br />Integrator</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="mb-6 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Base de Datos</div>
            <div className="text-xs font-medium text-slate-300 flex justify-between">
              <span>Interacciones:</span>
              <span className="text-white font-bold">{data.length}</span>
            </div>
            <div className="text-xs font-medium text-slate-300 flex justify-between mt-1">
              <span>Genes/Procesos:</span>
              <span className="text-white font-bold">{Object.keys(pathwayMapping).length}</span>
            </div>
          </div>

          <button onClick={() => setActiveView('explorer')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeView === 'explorer' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            Explorar Recurso
          </button>
          <button onClick={() => setActiveView('network')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeView === 'network' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            Visualizar Red
          </button>

          <div className="pt-6 border-t border-slate-800 mt-4">
            {/* Legend moved to Graph View */}
          </div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10 shadow-sm">
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-slate-800">Regulatory Dashboard</h2>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase">Contexto GO:</span>
                <select value={selectedGoTerm} onChange={(e) => setSelectedGoTerm(e.target.value)} className="bg-transparent text-xs font-bold text-indigo-600 outline-none cursor-pointer max-w-[250px]">
                  {PRIORITY_GO_TERMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              {PRIORITY_TFS.map(tf => (
                <button
                  key={tf}
                  onClick={() => {
                    const newVal = priorityTfFilter === tf ? null : tf;
                    setPriorityTfFilter(newVal);
                    if (newVal) setGraphScope('direct');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${priorityTfFilter === tf ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button onClick={() => setExportFormat('geneId')} className={`px-2 py-1 text-[10px] font-bold rounded ${exportFormat === 'geneId' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>ID</button>
              <button onClick={() => setExportFormat('symbol')} className={`px-2 py-1 text-[10px] font-bold rounded ${exportFormat === 'symbol' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Symbol</button>
            </div>
            <button onClick={handleDownloadTSV} className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-black hover:bg-emerald-100 transition-all uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
              TSV
            </button>
            <button onClick={handleAiAnalysis} disabled={filteredData.length === 0 || isAnalyzing} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all uppercase tracking-widest">
              {isAnalyzing ? 'Analizando...' : 'Gemini AI'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {errorMessage && <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm font-bold rounded-2xl border border-red-100 flex justify-between items-center"><span>{errorMessage}</span><button onClick={() => setErrorMessage(null)}>✕</button></div>}

          {activeView === 'explorer' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <StatsPanel data={filteredData} />
              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                  <input type="text" placeholder="Buscar gen, TF o palabra clave..." className="max-w-xs w-full pl-4 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-indigo-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <span className="text-xs font-bold text-slate-400">{filteredData.length} interacciones visibles</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase tracking-widest border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Regulador (TF)</th>
                        <th className="px-6 py-4">Gen Objetivo (Target)</th>
                        <th className="px-6 py-4">Evidencia Integrada</th>
                        <th className="px-6 py-4">Dirección</th>
                        <th className="px-6 py-4">Contexto Biológico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredData.slice(0, 100).map((row, idx) => {
                        const isHub = !!hubMapping[row.target];
                        const hub = hubMapping[row.target];

                        return (
                          <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                            <td className="px-6 py-4 text-xs font-black text-slate-900">{row.tf}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${isHub ? 'text-indigo-600' : 'text-slate-600'}`}>{row.target}</span>
                                {isHub && <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-black">HUB</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1">
                                {row.sources.map(s => (
                                  <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-full font-black text-white ${s === 'TARGET' ? 'bg-emerald-400' : s === 'DAP' ? 'bg-blue-400' : 'bg-violet-400'}`}>{s}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tight ${row.direction === 'activation' ? 'bg-emerald-50 text-emerald-600' : row.direction === 'repression' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>{row.direction}</span>
                            </td>
                            <td className="px-6 py-4">
                              {isHub ? (
                                <div className="text-[10px] font-medium text-indigo-500 italic max-w-xs truncate" title={hub?.genesList.join(', ')}>
                                  Hub Reg (GeneReg)
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {(pathwayMapping[row.target] || []).slice(0, 3).map(p => <span key={p} className="text-[8px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{p}</span>)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredData.length > 100 && <div className="p-4 text-center text-xs text-slate-400 font-medium">Mostrando primeros 100 resultados de {filteredData.length}</div>}
                </div>
              </div>
            </div>
          ) : activeView === 'network' ? (
            <NetworkGraph
              data={filteredData.slice(0, 300)}
              pathwayMapping={pathwayMapping}
              hubMapping={hubMapping}
              selectedSources={selectedSources}
              onToggleSource={(s) => setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
              graphScope={graphScope}
              onSetGraphScope={setGraphScope}
            /> // Limit graph for performace
          ) : (
            <div className="bg-white p-12 rounded-[48px] border border-slate-100 shadow-2xl max-w-4xl mx-auto mt-10 animate-in zoom-in-95 duration-500">
              <h3 className="text-3xl font-black mb-8 text-slate-900 tracking-tight">Interpretación Funcional (AI)</h3>
              {aiAnalysis ? (
                <div className="space-y-10">
                  <p className="text-xl text-slate-600 italic border-l-8 border-indigo-500 pl-8 font-medium leading-relaxed">{aiAnalysis.summary}</p>
                  <div className="grid md:grid-cols-2 gap-8">
                    {aiAnalysis.insights.map((ins, i) => (
                      <div key={i} className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all hover:shadow-xl">
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black mb-4">0{i + 1}</div>
                        <p className="text-base font-bold text-slate-800 leading-relaxed">{ins}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 font-bold text-lg">
                  <div className="animate-pulse mb-4">🤖</div>
                  Generando insights biológicos sobre la red filtrada...
                </div>
              )}
            </div>
          )
          }
        </div>
      </main>
    </div>
  );
};

export default App;
