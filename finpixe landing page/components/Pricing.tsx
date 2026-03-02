
import React, { useState } from 'react';
import { Check } from 'lucide-react';

const Pricing: React.FC = () => {
  const [selectedPlan, setSelectedPlan] = useState<string>("Starter");

  const plans = [
    {
      name: "Free",
      price: "₹0",
      period: "/month",
      description: "Perfect for freelancers and side hustlers just starting their journey.",
      features: [
        "Up to 5 invoices per month",
        "Basic AI assistance",
        "Email support",
        "Standard templates"
      ],
      popular: false
    },
    {
      name: "Starter",
      price: "₹1200",
      period: "/month",
      description: "Ideal for growing startups and small businesses needing automation.",
      features: [
        "Up to 100 invoices per month",
        "Advanced AI processing",
        "Priority email support",
        "Custom templates",
        "Basic reporting"
      ],
      popular: true
    },
    {
      name: "Pro",
      price: "₹5000",
      period: "/month",
      description: "For enterprises requiring scale, power, and dedicated support.",
      features: [
        "Unlimited invoices",
        "Premium AI features",
        "Phone & email support",
        "Advanced reporting",
        "API access",
        "Multi-user access"
      ],
      popular: false
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-slate-50 relative overflow-hidden scroll-mt-24">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-100/20 rounded-full blur-3xl -z-10" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h3 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 mb-6 uppercase tracking-wider drop-shadow-sm">
            Unlock Premium Features
          </h3>
          <p className="text-slate-600 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
            Experience the full power of Finpixe. Upgrade to a paid plan today to unlock advanced AI insights, unlimited transactions, and priority support for a seamless and superior accounting experience.
          </p>

          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Choose Your Plan</h2>
          <p className="text-slate-500 text-lg">
            Select the perfect plan for your business needs.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {plans.map((plan, index) => {
            const isSelected = selectedPlan === plan.name;

            return (
              <div
                key={index}
                className={`relative rounded-2xl transition-all duration-300 flex flex-col cursor-pointer ${isSelected
                    ? 'bg-white border-2 border-indigo-500 shadow-2xl scale-105 z-10'
                    : 'bg-white border border-slate-200 shadow-soft hover:shadow-lg hover:border-indigo-200 scale-100 z-0'
                  }`}
                onClick={() => setSelectedPlan(plan.name)}
              >
                {plan.popular && (
                  <div className={`absolute -top-4 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-wide py-1.5 px-4 rounded-full shadow-lg transition-colors ${isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                      : 'bg-indigo-100 text-indigo-600 border border-indigo-200'
                    }`}>
                    Most Popular
                  </div>
                )}

                <div className="p-8 flex-1">
                  <h3 className={`text-xl font-bold mb-2 ${isSelected ? 'text-indigo-600' : 'text-slate-900'}`}>
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                    <span className="text-slate-500 font-medium">{plan.period}</span>
                  </div>

                  <p className="text-slate-500 text-sm leading-relaxed mb-8">
                    {plan.description}
                  </p>

                  <div className="space-y-4 mb-8">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}`}>
                          <Check size={12} strokeWidth={3} />
                        </div>
                        <span className="text-slate-600 text-sm font-medium">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-8 pt-0 mt-auto">
                  <button
                    className={`w-full py-3.5 rounded-xl font-bold transition-all duration-200 ${isSelected
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-purple-500/30'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200'
                      }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `${import.meta.env.VITE_APP_URL}?view=signup&plan=${plan.name}`;
                    }}
                  >
                    {isSelected ? 'Get Started' : 'Choose Plan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
