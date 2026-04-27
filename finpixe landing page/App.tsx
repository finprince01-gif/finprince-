
import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import ProductPreview from './components/ProductPreview';
import AIAssistantSection from './components/AIAssistantSection';
import Pricing from './components/Pricing';
import AboutUs from './components/AboutUs';
import ContactUs from './components/ContactUs';
import Footer from './components/Footer';

type PageView = 'home' | 'pricing';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageView>('home');

  const handleNavigation = (page: PageView, sectionId?: string) => {
    setCurrentPage(page);
    
    if (sectionId) {
      // Allow time for the view to switch and DOM to render before scrolling
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          const navbarHeight = 80; // Approximate navbar height
          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
          const offsetPosition = elementPosition - navbarHeight;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
          });
        }
      }, 100);
    } else {
      // Scroll to top when changing pages without a specific section
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar currentPage={currentPage} onNavigate={handleNavigation} />
      <main className="flex-grow">
        {currentPage === 'home' ? (
          <>
            <Hero />
            <Features />
            <ProductPreview />
            <AIAssistantSection />
            <AboutUs />
            <ContactUs />
          </>
        ) : (
          <Pricing />
        )}
      </main>
      <Footer />
    </div>
  );
}
