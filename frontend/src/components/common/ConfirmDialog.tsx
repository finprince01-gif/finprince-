import React from 'react';
import Icon from '../Icon';
import { useToast } from '../../context/ToastContext';

const ConfirmDialog: React.FC = () => {
    const { confirmState, closeConfirm } = useToast();

    if (!confirmState.isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-start justify-end p-6 pointer-events-none">
            <div className="fixed inset-0 bg-black/20 pointer-events-auto" onClick={() => closeConfirm(false)} />
            <div
                className="
          relative w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-100 
          pointer-events-auto transform transition-all duration-300 ease-out animate-slide-in
        "
            >
                <div className="p-5">
                    <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                            <Icon name="warning" className="w-6 h-6 text-orange-600" />
                        </div>
                        <div className="flex-1 pt-1">
                            <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Confirm Action</h3>
                            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                                {confirmState.message}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        <button
                            onClick={() => closeConfirm(false)}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => closeConfirm(true)}
                            className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md shadow-indigo-200 transition-all active:scale-95"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
