import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';

/**
 * PHASE 6I: OBSERVABILITY & FORENSICS.
 * Real-time operational telemetry for hyperscale validation.
 */
const ForensicDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Mocking API call to backend metrics endpoint
        // In reality, this would hit /api/forensic-metrics/
        const mockData = {
          queue_depth: {
            ocr: Math.floor(Math.random() * 50),
            ai: Math.floor(Math.random() * 100),
            assembly: Math.floor(Math.random() * 20),
            export: Math.floor(Math.random() * 10),
          },
          ai_latency: {
            p50: 2500 + Math.random() * 500,
            p95: 4500 + Math.random() * 1500,
          },
          db_contention: {
            lock_wait_ms: Math.random() * 50,
            active_transactions: Math.floor(Math.random() * 30),
          },
          throughput: Math.floor(Math.random() * 15), // pages/sec
          timestamp: new Date().toLocaleTimeString(),
        };

        setMetrics(mockData);
        setHistory(prev => [...prev.slice(-19), mockData]);
      } catch (err) {
        console.error("Failed to fetch metrics", err);
      }
    };

    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) return <div>Initializing Forensic Telemetry...</div>;

  return (
    <div className="p-6 bg-slate-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-blue-400">Forensic Scaling Dashboard</h1>
        <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
          <span className="text-slate-400 mr-2">System Status:</span>
          <span className="text-green-400 font-mono">HYPERSCALE_STABLE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard title="Total Throughput" value={`${metrics.throughput} p/s`} color="text-blue-400" />
        <MetricCard title="AI P95 Latency" value={`${(metrics.ai_latency.p95 / 1000).toFixed(2)}s`} color="text-purple-400" />
        <MetricCard title="Queue Backlog" value={Object.values(metrics.queue_depth).reduce((a: any, b: any) => a + b, 0)} color="text-orange-400" />
        <MetricCard title="DB Lock Wait" value={`${metrics.db_contention.lock_wait_ms.toFixed(1)}ms`} color="text-red-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Queue Saturation */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-300">Queue Saturation (by Role)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'OCR', depth: metrics.queue_depth.ocr },
                { name: 'AI', depth: metrics.queue_depth.ai },
                { name: 'Assembly', depth: metrics.queue_depth.assembly },
                { name: 'Export', depth: metrics.queue_depth.export },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                <Bar dataKey="depth" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Trends */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-300">AI Latency Trends (P95)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                <Area type="monotone" dataKey={(d) => d.ai_latency.p95} stroke="#a855f7" fillOpacity={1} fill="url(#colorLatency)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, color }: any) => (
  <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
    <div className="text-slate-400 text-sm font-medium mb-1">{title}</div>
    <div className={`text-3xl font-bold ${color}`}>{value}</div>
  </div>
);

export default ForensicDashboard;
