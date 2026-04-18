
import React from 'react';
import { Clock, CheckCircle2, Shield, Layers } from 'lucide-react';

const benefits = [
  {
    icon: Clock,
    title: "Accelerated Financial Close",
    description: "Close your books in record time. Our intelligent engine automates data extraction, categorization, and reconciliation, reducing the monthly closing cycle by days.",
    color: "text-blue-500",
    bg: "bg-blue-50"
  },
  {
    icon: CheckCircle2,
    title: "Financial Accuracy",
    description: "AI-driven validation algorithms cross-reference every transaction against bank feeds and tax rules. Detect duplicate invoices, pricing errors, and discrepancies in real-time.",
    color: "text-green-500",
    bg: "bg-green-50"
  },
  {
    icon: Shield,
    title: "Proactive Compliance",
    description: "Stay ahead of regulatory deadlines for GST, TDS, and Advance Tax. Receive automated alerts and ensure every filing is accurate and submitted on time.",
    color: "text-purple-500",
    bg: "bg-purple-50"
  },
  {
    icon: Layers,
    title: "360° Financial View",
    description: "Shatter data silos. Integrate your Banking, Invoicing, Inventory, and Tax data into a single, cohesive dashboard. One source of truth for your entire business health.",
    color: "text-orange-500",
    bg: "bg-orange-50"
  }
];

const Benefits: React.FC = () => {
  return (
    <section id="benefits" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Why CFOs & Finance Teams Love Us</h2>
          <div className="h-1 w-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full"></div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((item, idx) => (
            <div key={idx} className="p-8 rounded-2xl bg-slate-50 hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-soft transition-all duration-300 flex flex-col min-h-[260px]">
               <div className={`w-14 h-14 ${item.bg} rounded-xl flex items-center justify-center mb-6`}>
                 <item.icon className={`w-7 h-7 ${item.color}`} />
               </div>
               <h3 className="text-2xl font-bold text-slate-900 mb-3">{item.title}</h3>
               <p className="text-lg text-slate-500 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
