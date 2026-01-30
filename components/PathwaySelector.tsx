import React, { useState, useEffect } from 'react';
import { loadPathway, getAvailablePathways, PathwayData } from '../services/pathwayLoader';

interface PathwaySelectorProps {
    onPathwayChange: (pathway: PathwayData | null) => void;
}

export default function PathwaySelector({ onPathwayChange }: PathwaySelectorProps) {
    const [selectedPathway, setSelectedPathway] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const availablePathways = getAvailablePathways();

    const handlePathwayChange = async (pathwayId: string) => {
        setSelectedPathway(pathwayId);

        if (!pathwayId) {
            onPathwayChange(null);
            return;
        }

        setLoading(true);
        const pathwayData = await loadPathway(pathwayId);
        setLoading(false);

        onPathwayChange(pathwayData);
    };

    return (
        <div style={{
            padding: '15px',
            backgroundColor: '#1a1a2e',
            borderRadius: '8px',
            marginBottom: '15px'
        }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '14px' }}>
                Pathway View
            </h3>

            <select
                value={selectedPathway}
                onChange={(e) => handlePathwayChange(e.target.value)}
                disabled={loading}
                style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#16213e',
                    color: '#fff',
                    border: '1px solid #0f3460',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: loading ? 'wait' : 'pointer'
                }}
            >
                <option value="">Select a pathway...</option>
                {availablePathways.map(pathway => (
                    <option key={pathway.id} value={pathway.id}>
                        {pathway.name}
                    </option>
                ))}
            </select>

            {loading && (
                <div style={{
                    marginTop: '10px',
                    color: '#888',
                    fontSize: '12px',
                    textAlign: 'center'
                }}>
                    Loading pathway data...
                </div>
            )}

            {selectedPathway && !loading && (
                <div style={{
                    marginTop: '10px',
                    padding: '8px',
                    backgroundColor: '#0f3460',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#aaa'
                }}>
                    <div>Pathway loaded successfully</div>
                </div>
            )}
        </div>
    );
}
