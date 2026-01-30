
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { IntegratedInteraction } from '../types';

interface StatsPanelProps {
  data: IntegratedInteraction[];
}

const StatsPanel: React.FC<StatsPanelProps> = ({ data }) => {
  const evidenceCounts = [
    { name: '1 Source', count: data.filter(i => i.evidenceCount === 1).length },
    { name: '2 Sources', count: data.filter(i => i.evidenceCount === 2).length },
    { name: '3 Sources', count: data.filter(i => i.evidenceCount === 3).length },
  ];

  const COLORS = ['#94a3b8', '#3b82f6', '#1e40af'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Evidence Distribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evidenceCounts}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip cursor={{fill: '#f1f5f9'}} />
              <Bar dataKey="count">
                {evidenceCounts.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
        <h3 className="text-lg font-semibold mb-6 text-gray-800">Quick Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-600 font-medium">Total Interactions</p>
            <p className="text-3xl font-bold text-blue-900">{data.length}</p>
          </div>
          <div className="p-4 bg-emerald-50 rounded-lg">
            <p className="text-sm text-emerald-600 font-medium">High Confidence (3+)</p>
            <p className="text-3xl font-bold text-emerald-900">
              {data.filter(i => i.evidenceCount === 3).length}
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-600 font-medium">Unique TFs</p>
            <p className="text-3xl font-bold text-purple-900">
              {new Set(data.map(i => i.tf)).size}
            </p>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-600 font-medium">Unique Targets</p>
            <p className="text-3xl font-bold text-amber-900">
              {new Set(data.map(i => i.target)).size}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
