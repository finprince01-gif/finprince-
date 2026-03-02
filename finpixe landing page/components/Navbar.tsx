
import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  currentPage: 'home' | 'pricing';
  onNavigate: (page: 'home' | 'pricing', sectionId?: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/check-status`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (data.isActive) {
            setIsLoggedIn(true);
          }
        }
      } catch (error) {
        // Silently fail, user is just not logged in or API is down
      }
    };
    checkSession();
  }, []);

  const handleLinkClick = (page: 'home' | 'pricing', sectionId?: string) => {
    setMobileMenuOpen(false);
    onNavigate(page, sectionId);
  };

  const navLinkClass = (page: string) =>
    `font-medium transition-colors cursor-pointer ${currentPage === page && !isScrolled
      ? 'text-primary'
      : 'text-slate-600 hover:text-primary'
    }`;

  const mobileNavLinkClass = "text-slate-300 font-medium hover:text-white cursor-pointer";

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled || mobileMenuOpen ? 'bg-white/90 backdrop-blur-md shadow-sm py-4' : 'bg-transparent py-6'
        }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        {/* Logo */}
        <div
          onClick={() => handleLinkClick('home')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-9 h-9 bg-logo-blue rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-600/30">
            F
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight uppercase">
            FINPIXE
          </span>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <div onClick={() => handleLinkClick('home')} className={navLinkClass('home')}>Home</div>
          <div onClick={() => handleLinkClick('home', 'features')} className={navLinkClass('home')}>Features</div>
          <div onClick={() => handleLinkClick('home', 'interface')} className={navLinkClass('home')}>Interface</div>
          <div onClick={() => handleLinkClick('pricing')} className={navLinkClass('pricing')}>Pricing</div>
          <div onClick={() => handleLinkClick('home', 'about')} className={navLinkClass('home')}>About Us</div>
          <div onClick={() => handleLinkClick('home', 'contact')} className={navLinkClass('home')}>Contact Us</div>
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center space-x-4">
          <button
            onClick={() => window.location.href = `${import.meta.env.VITE_APP_URL}?view=login`}
            className="text-slate-900 font-medium hover:text-primary transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => window.location.href = `${import.meta.env.VITE_APP_URL}?view=signup`}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transform hover:-translate-y-0.5"
          >
            Sign Up
          </button>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-slate-700"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {
        mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-slate-900 border-b border-slate-800 p-6 flex flex-col space-y-4 shadow-lg h-screen">
            <div onClick={() => handleLinkClick('home')} className={mobileNavLinkClass}>Home</div>
            <div onClick={() => handleLinkClick('home', 'features')} className={mobileNavLinkClass}>Features</div>
            <div onClick={() => handleLinkClick('home', 'interface')} className={mobileNavLinkClass}>Interface</div>
            <div onClick={() => handleLinkClick('pricing')} className={mobileNavLinkClass}>Pricing</div>
            <div onClick={() => handleLinkClick('home', 'about')} className={mobileNavLinkClass}>About Us</div>
            <div onClick={() => handleLinkClick('home', 'contact')} className={mobileNavLinkClass}>Contact Us</div>

            <div className="pt-4 space-y-3">
              <button
                onClick={() => window.location.href = `${import.meta.env.VITE_APP_URL}?view=login`}
                className="w-full text-slate-300 font-medium py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => window.location.href = `${import.meta.env.VITE_APP_URL}?view=signup`}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-bold hover:from-blue-700 hover:to-purple-700 transition-colors"
              >
                Sign Up
              </button>
            </div>
          </div >
        )}
    </nav >
  );
};

export default Navbar;
