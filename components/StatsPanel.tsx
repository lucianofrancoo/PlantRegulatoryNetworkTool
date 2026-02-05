
import React from 'react';
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { IntegratedInteraction } from '../types';

interface StatsPanelProps {
  data: IntegratedInteraction[];
}

const StatsPanel: React.FC<StatsPanelProps> = ({ data }) => {
  const sourceCounts = [
    { name: 'TARGET', count: data.filter(i => i.sources.includes('TARGET')).length },
    { name: 'DAP', count: data.filter(i => i.sources.includes('DAP')).length },
    { name: 'CHIP', count: data.filter(i => i.sources.includes('CHIP')).length },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-slate-900/50 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-slate-800">
        <h3 className="text-lg font-bold mb-4 text-emerald-400">Evidence Distribution</h3>
        <div className="h-64 min-h-64 min-w-0 w-full" style={{ minHeight: 256 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                cursor={{ fill: '#1e293b' }}
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  color: '#e2e8f0',
                  fontWeight: 600
                }}
              />
              <Pie data={sourceCounts} dataKey="count" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {sourceCounts.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-slate-800 flex flex-col justify-center">
        <h3 className="text-lg font-bold mb-6 text-emerald-400">Quick Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <p className="text-sm text-emerald-400 font-bold">Total Interactions</p>
            <p className="text-3xl font-black text-emerald-300 mt-1">{data.length}</p>
          </div>
          <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-2xl">
            <p className="text-sm text-teal-400 font-bold">High Confidence (3+)</p>
            <p className="text-3xl font-black text-teal-300 mt-1">
              {data.filter(i => i.evidenceCount === 3).length}
            </p>
          </div>
          <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
            <p className="text-sm text-cyan-400 font-bold">Unique TFs</p>
            <p className="text-3xl font-black text-cyan-300 mt-1">
              {new Set(data.map(i => i.tf)).size}
            </p>
          </div>
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
            <p className="text-sm text-blue-400 font-bold">Unique Targets</p>
            <p className="text-3xl font-black text-blue-300 mt-1">
              {new Set(data.map(i => i.target)).size}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
