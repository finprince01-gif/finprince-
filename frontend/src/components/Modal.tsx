/**
 * ============================================================================
 * MODAL COMPONENT (Modal.tsx)
 * ============================================================================
 * Reusable modal dialog component for displaying messages and loading states.
 * 
 * FEATURES:
 * - Three types: loading, error, success
 * - Backdrop overlay (semi-transparent black)
 * - Close button (optional)
 * - Centered on screen
 * - Responsive design
 * - Icon indicators for each type
 * 
 * USAGE:
 * ```tsx
 * // Loading modal
 * <Modal isOpen={isLoading} title="Processing..." type="loading">
 *   Please wait while we process your request.
 * </Modal>
 * 
 * // Error modal
 * <Modal isOpen={hasError} onClose={() => setHasError(false)} title="Error" type="error">
 *   {errorMessage}
 * </Modal>
 * 
 * // Success modal
 * <Modal isOpen={showSuccess} onClose={() => setShowSuccess(false)} title="Success!" type="success">
 *   Your changes have been saved.
 * </Modal>
 * ```
 * 
 * FOR NEW DEVELOPERS:
 * - Use 'loading' type for async operations (no close button)
 * - Use 'error' type for error messages (with close button)
 * - Use 'success' type for success confirmations (with close button)
 * - Children can be any React content (text, JSX, etc.)
 */

// Import React
import React from 'react';

// Import Icon component for modal icons
import Icon from './Icon';

/**
 * Props for Modal component
 */
interface ModalProps {
  isOpen: boolean;            
  onClose?: () => void;       
  title: string;              
  type: 'loading' | 'error' | 'success' | 'warning';  
  children: React.ReactNode;  
  fullScreen?: boolean;
}

/**
 * Modal Component - Reusable dialog for messages and loading states
 */
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, type, children, fullScreen }) => {
  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-[16px] shadow-none border border-slate-200-none border border-slate-200 w-full relative ${fullScreen ? 'max-w-7xl max-h-[95vh]' : 'max-w-md p-6'}`}>
        <div className={`flex items-start space-x-4 ${fullScreen ? 'p-8 border-b border-slate-100' : ''}`}>
          {type === 'loading' && (
            <div className="w-12 h-12 flex items-center justify-center bg-indigo-100 rounded-[4px]">
              <svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          {type === 'error' && (
            <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-[4px]">
              <Icon name="warning" className="h-6 w-6 text-red-600" />
            </div>
          )}
          {type === 'warning' && (
            <div className="w-12 h-12 flex items-center justify-center bg-yellow-100 rounded-[4px]">
              <Icon name="warning" className="h-6 w-6 text-yellow-600" />
            </div>
          )}
          {type === 'success' && (
            <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-[4px]">
              <Icon name="check-circle" className="h-6 w-6 text-indigo-600" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        </div>
        <div className={`${fullScreen ? 'p-8 overflow-y-auto max-h-[calc(95vh-100px)]' : 'mt-4'}`}>
          {children}
        </div>
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <Icon name="close" className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Modal;

