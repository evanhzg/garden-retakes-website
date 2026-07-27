"use client";

import React, { useState } from 'react';
import IntegrationStatus from '@/components/IntegrationStatus';

export default function SkinRequestPage() {
    const [workshopUrl, setWorkshopUrl] = useState('');
    const [previewImages, setPreviewImages] = useState([]);
    const [jobId, setJobId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleScrape = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/scrape-workshop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workshopUrl })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch workshop data');
            
            setPreviewImages(data.imageUrls);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitJob = async (imageUrl) => {
        setLoading(true);
        setError(null);
        try {
            console.log("Submitting job for image:", imageUrl);
            const res = await fetch('/api/jobs', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workshopUrl, imageUrl }) 
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to submit job');
            
            setJobId(data.id);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2 text-white">Request Custom Skin</h1>
                    <p className="text-slate-400">Paste a Steam Workshop URL to start the automated baking and compilation pipeline.</p>
                </div>

                <form onSubmit={handleScrape} className="space-y-4 bg-slate-800 p-6 rounded-lg border border-slate-700">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-slate-300">Steam Workshop URL</label>
                        <div className="flex space-x-4">
                            <input
                                type="url"
                                value={workshopUrl}
                                onChange={(e) => setWorkshopUrl(e.target.value)}
                                placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..."
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-6 rounded-md transition-colors"
                            >
                                {loading ? 'Scanning...' : 'Scan Workshop'}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                </form>

                {previewImages.length > 0 && !jobId && (
                    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                        <h2 className="text-xl font-bold mb-4 text-white">Select Texture Map</h2>
                        <p className="text-sm text-slate-400 mb-6">We found these images on the workshop page. Select the raw texture map you want to bake.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {previewImages.map((url, i) => (
                                <div key={i} className="group relative rounded-md overflow-hidden border border-slate-600 bg-slate-900 aspect-video">
                                    <img src={url} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <button 
                                            onClick={() => handleSubmitJob(url)}
                                            className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded"
                                        >
                                            Process This Image
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {jobId && (
                    <div className="mt-8">
                        <IntegrationStatus jobId={jobId} />
                    </div>
                )}
            </div>
        </div>
    );
}
