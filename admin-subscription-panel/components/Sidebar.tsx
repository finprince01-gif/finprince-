
import React from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { DashboardIcon } from './icons/DashboardIcon';
import { PaymentIcon } from './icons/PaymentIcon';
import { UsersIcon } from './icons/UsersIcon';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  currentPage: string;
  navigateTo: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, currentPage, navigateTo }) => {
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 lg:hidden" 
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      
      <div 
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Admin Panel</h2>
          <button 
            onClick={() => setIsOpen(false)} 
            className="lg:hidden text-gray-500 hover:text-gray-900"
            aria-label="Close sidebar"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <nav className="mt-4">
          <ul>
            <li>
              <button
                onClick={() => { navigateTo('subscriptions'); setIsOpen(false); }}
                className={`w-full flex items-center px-4 py-3 text-left transition-colors duration-200 ${
                  currentPage === 'subscriptions'
                    ? 'text-indigo-600 font-semibold bg-indigo-50 border-l-4 border-indigo-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <UsersIcon className="h-6 w-6 mr-3" />
                <span>Admin</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => { navigateTo('dashboard'); setIsOpen(false); }}
                className={`w-full flex items-center px-4 py-3 text-left transition-colors duration-200 ${
                  currentPage === 'dashboard'
                    ? 'text-indigo-600 font-semibold bg-indigo-50 border-l-4 border-indigo-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <DashboardIcon className="h-6 w-6 mr-3" />
                <span>Dashboard</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => { navigateTo('paymentDetails'); setIsOpen(false); }}
                className={`w-full flex items-center px-4 py-3 text-left transition-colors duration-200 ${
                  currentPage === 'paymentDetails'
                    ? 'text-indigo-600 font-semibold bg-indigo-50 border-l-4 border-indigo-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <PaymentIcon className="h-6 w-6 mr-3" />
                <span>Payment Details</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
};