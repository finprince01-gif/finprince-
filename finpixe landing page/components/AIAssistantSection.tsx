
import React from 'react';
import { Sparkles, MessageSquare, CheckCircle, Calculator } from 'lucide-react';

const AIAssistantSection: React.FC = () => {
  return (
    <section className="py-24 bg-slate-900 relative overflow-hidden text-white">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px]" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Content */}
          <div className="space-y-8">
            <h2 className="text-5xl md:text-7xl font-bold leading-tight">
              Your Personal <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                AI Financial CFO
              </span>
            </h2>

            <div className="text-slate-400 text-lg leading-relaxed space-y-6">
              <p>
                Navigate the complexities of business finance with an intelligent partner that never sleeps. Our AI CFO goes beyond simple accounting—it deeply understands financial modeling, tax optimization, and cash flow dynamics. Whether you're a startup founder or a seasoned CFO, get instant, data-backed answers to complex financial questions.
              </p>
              <p>
                From analyzing monthly burn rate to predicting tax liabilities based on current sales trends, the assistant proactively safeguards your financial health. It acts as a second pair of eyes on every transaction, flagging expense anomalies and opportunities for cost savings before you close the books.
              </p>
            </div>

            <ul className="space-y-5 pt-4">
              {[
                { icon: Calculator, text: "Forecasts cash flow and burn rate" },
                { icon: MessageSquare, text: "Answers 'How profitable was Project X?' queries" },
                { icon: CheckCircle, text: "Validates expenses against budget limits" },
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                    <item.icon className="w-5 h-5 text-slate-300 group-hover:text-white" />
                  </div>
                  <span className="text-lg font-medium text-slate-200">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual - Chat Simulation */}
          <div className="relative">
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-6 shadow-2xl">
              {/* Chat Header */}
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-700">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                  <Sparkles className="text-white w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Finpixe AI</h3>
                  <p className="text-xs text-slate-400">Financial Intelligence Active</p>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="space-y-4 mb-6">
                <div className="flex justify-end">
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%] text-sm leading-relaxed">
                    What is our projected cash runway if we increase marketing spend by 20%?
                  </div>
                </div>

                <div className="flex justify-start items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="bg-slate-700/50 text-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] text-sm leading-relaxed border border-slate-600">
                    Based on current receivables and average monthly burn of ₹5L, increasing marketing spend by 20% would reduce runway from <strong>14 months to 11.5 months</strong>.
                    <br /><br />
                    However, if this leads to a conservative 10% revenue lift, you break even in 3 months.
                    <div className="mt-3 flex gap-2">
                      <button className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-full transition-colors">View Projection</button>
                      <button className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-full transition-colors">Adjust Budget</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Area */}
              <div className="relative">
                <input
                  type="text"
                  disabled
                  placeholder="Ask about revenue, expenses, or taxes..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 rounded-lg text-white">
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AIAssistantSection;
