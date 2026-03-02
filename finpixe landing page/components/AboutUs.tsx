
import React from 'react';
import { Users } from 'lucide-react';

const AboutUs: React.FC = () => {
  return (
    <section id="about" className="py-24 bg-white relative overflow-hidden scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Image Side */}
          <div className="relative order-2 lg:order-1">
             <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-100">
               <img 
                 src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=2664&auto=format&fit=crop" 
                 alt="Finpixe Team Meeting" 
                 className="w-full h-full object-cover"
               />
               <div className="absolute inset-0 bg-blue-900/5 mix-blend-multiply"></div>
             </div>
             
             {/* Background Decor */}
             <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-100 rounded-full blur-3xl -z-10"></div>
             <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-100 rounded-full blur-3xl -z-10"></div>
          </div>

          {/* Text Side */}
          <div className="order-1 lg:order-2 space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
              Empowering the <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">Finance Leaders</span> of Tomorrow
            </h2>
            
            <p className="text-lg text-slate-600 leading-relaxed">
              Finpixe was born from a simple observation: Finance teams spend too much time on manual data entry and not enough time on strategy. 
            </p>
            
            <p className="text-lg text-slate-600 leading-relaxed">
              We combined world-class accounting expertise with cutting-edge AI to build a platform that automates the mundane, ensuring accuracy and compliance while freeing up CFOs to focus on growth.
            </p>

            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-100 mt-6">
               <div>
                  <h4 className="text-4xl font-black text-slate-900 mb-1">99.9%</h4>
                  <p className="text-slate-500 font-medium">Processing Accuracy</p>
               </div>
               <div>
                  <h4 className="text-4xl font-black text-slate-900 mb-1">24/7</h4>
                  <p className="text-slate-500 font-medium">AI-Powered Support</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutUs;
