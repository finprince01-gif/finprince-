
import React from 'react';
import { 
  ArrowUpRight, ArrowDownRight, Cloud, Briefcase
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, CartesianGrid, ReferenceDot
} from 'recharts';

const chartData = [
  { name: 'Aug 24', purchases: 1000000, sales: 5000 },
  { name: 'Sep 24', purchases: 750000, sales: 6000 },
  { name: 'Oct 24', purchases: 500000, sales: 7000 },
  { name: 'Nov 25', purchases: 0, sales: 11800 },
];

const transactions = [
  { type: 'Purchase', party: '-', amount: '₹0.00' },
  { type: 'Sales', party: 'PRAKASH ELECTRICALS', amount: '₹11773.17' },
  { type: 'Purchase', party: 'PRAKASH ELECTRICALS', amount: '₹221093.35' },
  { type: 'Purchase', party: 'SRI GANESH ENGINEERING WORKS', amount: '₹737500.00' },
];

const ProductPreview: React.FC = () => {
  return (
    <section id="interface" className="py-24 bg-slate-50 overflow-hidden scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 mb-6 uppercase tracking-wider drop-shadow-sm">
            A Familiar, Yet Superior Interface
          </h2>
          <p className="text-slate-500 text-lg">
            Designed for productivity. Experience our intuitive, AI-enhanced dashboard with zero learning curve.
          </p>
        </div>

        {/* Browser Frame */}
        <div className="relative mx-auto max-w-[1200px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden mb-24">
          {/* Fake Browser Toolbar */}
          <div className="bg-slate-100 px-4 py-3 flex items-center gap-2 border-b border-slate-200">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
            </div>
            <div className="flex-1 text-center text-xs font-medium text-slate-500">
              app.finpixe.com/admin/dashboard
            </div>
          </div>

          {/* App UI */}
          <div className="bg-[#F8F9FA] p-8 min-h-[800px]">
            <h1 className="text-2xl font-bold text-slate-900 mb-8">AI Accounting Admin Dashboard</h1>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Total Sales */}
              <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-500 mb-4">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">Total Sales</p>
                <h3 className="text-3xl font-bold text-slate-900">₹11.8k</h3>
              </div>

              {/* Total Purchases */}
              <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 mb-4">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">Total Purchases</p>
                <h3 className="text-3xl font-bold text-slate-900">₹958.6k</h3>
              </div>

              {/* Receivables */}
              <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 mb-4">
                  <Cloud className="w-5 h-5" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">Receivables</p>
                <h3 className="text-3xl font-bold text-slate-900">₹0.0k</h3>
              </div>

              {/* Payables */}
              <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-500 mb-4">
                  <Briefcase className="w-5 h-5" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">Payables</p>
                <h3 className="text-3xl font-bold text-slate-900">₹0.0k</h3>
              </div>
            </div>

            {/* Main Content Split */}
            <div className="grid lg:grid-cols-3 gap-8">
              
              {/* Left Column: Monthly Activity Chart */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col">
                <h3 className="font-bold text-slate-900 mb-6">Monthly Activity</h3>
                
                <div className="flex-1 flex flex-col">
                  <div className="text-center mb-4">
                    <h4 className="text-sm font-medium text-slate-700">Sales vs Purchases Trend</h4>
                    <p className="text-xs text-slate-400">Last 2 months</p>
                  </div>

                  <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10}} 
                          dy={10} 
                          ticks={['Aug 24', 'Nov 25']} // Only show start and end
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10}} 
                          tickFormatter={(value) => `₹${value/1000}k`}
                        />
                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        
                        {/* Purchases Line (Red) */}
                        <Line 
                          type="linear" 
                          dataKey="purchases" 
                          stroke="#ef4444" 
                          strokeWidth={2} 
                          dot={false}
                        />
                        <ReferenceDot x="Aug 24" y={1000000} r={4} fill="#ef4444" stroke="none" />
                        <ReferenceDot x="Nov 25" y={0} r={4} fill="#ef4444" stroke="none" />

                        {/* Sales Line (Blue) */}
                        <Line 
                          type="linear" 
                          dataKey="sales" 
                          stroke="#3b82f6" 
                          strokeWidth={2} 
                          dot={false}
                        />
                        <ReferenceDot x="Aug 24" y={5000} r={4} fill="#3b82f6" stroke="none" />
                        <ReferenceDot x="Nov 25" y={11800} r={4} fill="#3b82f6" stroke="none" />
                      </LineChart>
                    </ResponsiveContainer>
                    
                    {/* Legend */}
                    <div className="flex justify-center gap-4 text-xs mt-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full border border-red-500 bg-white"></div>
                        <span className="text-red-500">Purchases</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full border border-blue-500 bg-white"></div>
                        <span className="text-blue-500">Sales</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Summary Blocks */}
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">Total Sales</p>
                      <p className="text-xl font-bold text-blue-700">₹11.8k</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <p className="text-xs text-red-600 font-medium mb-1">Total Purchases</p>
                      <p className="text-xl font-bold text-red-700">₹958.6k</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Recent Transactions */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 h-full">
                <h3 className="font-bold text-slate-900 mb-6">Recent Transactions</h3>
                <div className="space-y-6">
                  {transactions.map((t, i) => (
                    <div key={i} className="flex justify-between items-start pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-slate-900 mb-1">{t.type}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t.party}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{t.amount}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductPreview;
