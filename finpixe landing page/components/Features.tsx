
import React, { ReactNode } from 'react';
import { FileText, Zap, CheckCircle2, Shield, Users, Layers } from 'lucide-react';

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bg: string;
  image: string;
  tag: string;
  category: string;
  visual?: ReactNode;
}

const Features: React.FC = () => {
  const features: Feature[] = [
    {
      icon: FileText,
      title: "Comprehensive Tax Compliance",
      description: "Automate filings for GST, TDS, and Income Tax. Includes GSTR-1, GSTR-2, GSTR-3B with automatic validation.",
      color: "text-white",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=2072&auto=format&fit=crop",
      tag: "COMPLIANCE",
      category: "Report",
    },
    {
      icon: Zap,
      title: "Smart Invoicing & Payments",
      description: "Generate professional e-invoices, track receivables, and automate payment reminders to improve cash flow.",
      color: "text-amber-400",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop",
      tag: "AUTOMATION",
      category: "Vouchers",
    },
    {
      icon: CheckCircle2,
      title: "Automated Reconciliation",
      description: "AI-powered matching for Bank Statements, Vendor Ledgers, and GSTR-2A/2B to ensure books always match reality.",
      color: "text-green-400",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2070&auto=format&fit=crop",
      tag: "AI MATCHING",
      category: "Vouchers",
    },
    {
      icon: Shield,
      title: "Audit & Compliance Shield",
      description: "Proactively manage notices, track audit trails, and maintain digital documentation for stress-free audits.",
      color: "text-purple-400",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=2070&auto=format&fit=crop",
      tag: "SECURITY",
      category: "Report",
    },
    {
      icon: Users,
      title: "Vendor & Expense Mgmt",
      description: "Streamline procurement to payment. Verify vendor compliance and categorize expenses automatically.",
      color: "text-teal-400",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=2664&auto=format&fit=crop",
      tag: "OPERATIONS",
      category: "Masters",
    },
    {
      icon: Layers,
      title: "Chart of Accounts",
      description: "Flexible multi-level chart of accounts structure. Organize your financial data with infinite hierarchy and custom groupings.",
      color: "text-cyan-400",
      bg: "bg-slate-900",
      image: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?q=80&w=2072&auto=format&fit=crop",
      tag: "STRUCTURE",
      category: "Masters",
    }
  ];

  return (
    <section id="features" className="py-24 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 mb-6 uppercase tracking-wider drop-shadow-sm">
            Everything You Need for Financial Excellence
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto mb-8">
            Powerful tools to simplify your entire financial stack, from booking entries to finalizing the balance sheet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[500px]">
          {features.map((feature, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-soft hover:shadow-xl transition-all duration-300 border border-slate-100 overflow-hidden group flex flex-col h-full animate-fade-in-up">
              {/* Image Container */}
              <div className="relative h-56 overflow-hidden flex-shrink-0">
                <img 
                  src={feature.image} 
                  alt={feature.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                
                {/* Badge */}
                <div className="absolute top-4 left-4">
                  <span className="bg-[#A855F7] text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-md">
                    {feature.tag}
                  </span>
                </div>

                {/* Overlapping Icon */}
                <div className="absolute -bottom-6 left-6 z-10">
                   <div className={`w-14 h-14 rounded-full border-4 border-white shadow-md overflow-hidden ${feature.bg} flex items-center justify-center`}>
                     <feature.icon className={`w-7 h-7 ${feature.color}`} />
                   </div>
                </div>
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>

              <div className="pt-10 px-8 pb-8 flex-grow flex flex-col">
                <h3 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-lg text-slate-500 leading-relaxed mb-4">
                  {feature.description}
                </p>
                
                {feature.visual && (
                  <div className="mt-auto pt-2">
                    {feature.visual}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
