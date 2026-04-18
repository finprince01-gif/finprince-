
import React from 'react';
import { Mail, Clock, Facebook, Linkedin, Twitter, Instagram } from 'lucide-react';

const ContactUs: React.FC = () => {
  return (
    <section id="contact" className="py-24 bg-white relative overflow-hidden scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          
          {/* Left Side - Info */}
          <div className="space-y-8 pt-4">
            <div>
              <h4 className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 font-bold text-3xl mb-4">Get in touch</h4>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight">
                We Would Love To Hear From You.
              </h2>
            </div>

            <div className="space-y-8 mt-8">
              {/* Email Support */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Email Support</h3>
                  <p className="text-slate-600">info@finpixe.com</p>
                </div>
              </div>

              {/* Work Hours */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Work Hours</h3>
                  <p className="text-slate-600">Monday-Friday</p>
                  <p className="text-slate-600">10:00 am to 6:00 pm</p>
                </div>
              </div>
            </div>

            <div className="pt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Follow our social media</h3>
              <div className="flex gap-6">
                <a href="#" className="text-slate-900 hover:text-indigo-600 transition-colors"><Facebook size={24} /></a>
                <a href="#" className="text-slate-900 hover:text-indigo-600 transition-colors"><Linkedin size={24} /></a>
                <a href="#" className="text-slate-900 hover:text-indigo-600 transition-colors"><Twitter size={24} /></a>
                <a href="#" className="text-slate-900 hover:text-indigo-600 transition-colors"><Instagram size={24} /></a>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 md:p-10">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Send us a message</h3>
            <p className="text-slate-500 mb-8">
              Please feel free to send us any questions, feedback or suggestions you might have.
            </p>

            <form className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-slate-700">Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    placeholder="Name" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="company" className="text-sm font-medium text-slate-700">Company</label>
                  <input 
                    type="text" 
                    id="company" 
                    placeholder="Company" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-slate-700">Phone</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    placeholder="Phone" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
                  <input 
                    type="email" 
                    id="email" 
                    placeholder="Email" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-slate-700">Message</label>
                <textarea 
                  id="message" 
                  rows={4} 
                  placeholder="Message" 
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50 resize-none"
                ></textarea>
              </div>

              <button 
                type="button" 
                className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm tracking-wider uppercase hover:opacity-90 transition-opacity shadow-lg shadow-purple-200"
              >
                Send Message
              </button>
            </form>
          </div>

        </div>
      </div>
    </section>
  );
};

export default ContactUs;
