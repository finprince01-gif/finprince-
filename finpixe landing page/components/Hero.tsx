import React from 'react';
import { ArrowRight, Play, ShieldCheck, TrendingUp, PieChart } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

const data = [
  { name: 'Jan', uv: 2000 },
  { name: 'Feb', uv: 3000 },
  { name: 'Mar', uv: 2500 },
  { name: 'Apr', uv: 4500 },
  { name: 'May', uv: 3800 },
  { name: 'Jun', uv: 5500 },
];

const Hero: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-50/50 to-transparent -z-10" />
      <div className="absolute top-20 right-20 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-20 w-72 h-72 bg-blue-100/30 rounded-full blur-3xl -z-10" />

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div className="space-y-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full text-indigo-600 text-sm font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            New: AI-Driven Cash Flow Forecasting
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-[1.15] tracking-tight">
            AI-Powered <br /> Financial Operations <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Made Simple.
            </span>
          </h1>

          <p className="text-2xl text-slate-600 max-w-2xl leading-relaxed">
            Streamline your entire financial operations with intelligent automation. From reconciling bank feeds and categorizing expenses to handling complex tax compliance and generating audit-ready reports—Finpixe does it all. Unlock a real-time, CFO-level view of your business health and drive growth with AI-powered financial insights.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => window.location.href = `${import.meta.env.VITE_APP_URL}?view=signup`}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 group"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => window.location.href = import.meta.env.VITE_APP_URL}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-full font-bold text-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current text-indigo-600" />
              Live Demo
            </button>
          </div>

          <div className="pt-8 flex items-center gap-8 text-sm font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              Bank-Grade Security
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Real-time Analytics
            </div>
          </div>
        </div>

        {/* Right Content - Abstract UI Composition */}
        <div className="relative hidden lg:block h-[600px] w-full">
          {/* Base Card - Dashboard */}
          <div className="absolute top-10 right-0 w-[500px] bg-white rounded-2xl shadow-soft border border-slate-100 p-6 z-10 animate-[float_6s_ease-in-out_infinite]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Net Profit</h3>
                <p className="text-slate-500 text-sm">Financial Health Score</p>
              </div>
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">+24.5%</span>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Area type="monotone" dataKey="uv" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex gap-4">
              <div className="flex-1 bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500 mb-1">Operating Cash</p>
                <p className="text-lg font-bold text-slate-800">₹45,230</p>
              </div>
              <div className="flex-1 bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500 mb-1">Runway</p>
                <p className="text-lg font-bold text-slate-800">14 Months</p>
              </div>
            </div>
          </div>

          {/* Floating Card - AI Chat */}
          <div className="absolute bottom-20 left-10 w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-100 z-20 p-5 animate-[float_8s_ease-in-out_infinite_1s]">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-50 pb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white">
                <span className="font-bold text-lg">AI</span>
              </div>
              <div>
                <p className="font-bold text-slate-800">Financial Advisor</p>
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Analyzing
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-100 rounded-lg rounded-tl-none p-3 text-sm text-slate-700">
                Warning: Marketing spend is 15% higher than projected for Q3.
              </div>
              <div className="bg-indigo-50 text-indigo-700 rounded-lg rounded-tr-none p-3 text-sm ml-8 border border-indigo-100">
                Reallocate budget from travel expenses?
              </div>
              <button className="w-full mt-2 bg-indigo-600 text-white text-xs py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                Approve Reallocation
              </button>
            </div>
          </div>

          {/* Decorative Icon Blob */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-white rounded-2xl shadow-xl flex items-center justify-center z-30 animate-bounce-slow">
            <PieChart className="w-12 h-12 text-purple-600" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;