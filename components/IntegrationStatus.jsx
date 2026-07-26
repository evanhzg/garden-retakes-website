import React, { useState, useEffect } from 'react';

export default function IntegrationStatus({ jobId }) {
    const [status, setStatus] = useState('pending');
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!jobId) return;

        const pollStatus = async () => {
            try {
                // Adjust this endpoint to match your actual backend URL that queries the skin_jobs table
                const response = await fetch(`/api/jobs/${jobId}/status`);
                if (!response.ok) {
                    throw new Error('Failed to fetch status');
                }
                
                const data = await response.json();
                setStatus(data.status);

                // Stop polling if completed or failed
                if (data.status === 'completed' || data.status === 'failed') {
                    clearInterval(intervalId);
                }
            } catch (err) {
                console.error(err);
                setError(err.message);
            }
        };

        pollStatus(); // Initial fetch
        const intervalId = setInterval(pollStatus, 5000); // Poll every 5 seconds

        return () => clearInterval(intervalId);
    }, [jobId]);

    const getStatusColor = (currentStatus) => {
        switch (currentStatus) {
            case 'pending': return 'text-yellow-500';
            case 'processing': return 'text-blue-500';
            case 'completed': return 'text-green-500';
            case 'failed': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    if (error) {
        return (
            <div className="p-4 rounded-md bg-red-100 border border-red-200 text-red-700 font-medium shadow-sm">
                Error checking status: {error}
            </div>
        );
    }

    return (
        <div className="p-6 rounded-lg bg-slate-800 border border-slate-700 shadow-xl max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-white">Weapon Integration Status</h2>
            <div className="flex items-center space-x-4">
                <div className={`text-lg font-semibold uppercase tracking-wider ${getStatusColor(status)}`}>
                    {status}
                </div>
                {status === 'processing' && (
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                )}
            </div>
            
            {status === 'completed' && (
                <div className="mt-4 p-3 bg-green-900/30 border border-green-500/50 rounded text-green-400 text-sm">
                    ✓ Assets successfully compiled and uploaded to repository.
                </div>
            )}
            
            {status === 'failed' && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm">
                    ✗ The automated pipeline failed to process this item. Please check worker logs.
                </div>
            )}

            <p className="text-sm text-slate-400 mt-6 pt-4 border-t border-slate-700">
                Job ID: {jobId ? <span className="font-mono text-slate-300">{jobId}</span> : 'No active job selected'}
            </p>
        </div>
    );
}
