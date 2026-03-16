import React, { useState } from 'react';
import type { Ledger } from '../types';
import SearchableSelect from './SearchableSelect';
import Icon from './Icon';

interface BankLedgerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledgers: Ledger[];
  onSelect: (ledgerId: number) => void;
}

const BankLedgerSelectionModal: React.FC<BankLedgerSelectionModalProps> = ({ isOpen, onClose, ledgers, onSelect }) => {
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);

  if (!isOpen) return null;

  const bankLedgers = ledgers.filter(l => 
    l.group?.toLowerCase().includes('bank') || 
    l.sub_group_1?.toLowerCase().includes('bank')
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Select Bank Ledger</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Please select the bank ledger associated with the uploaded statement.
        </p>

        <div className="mb-4">
          <SearchableSelect
            options={bankLedgers.map(l => l.name)}
            value={selectedLedgerId ? bankLedgers.find(l => l.id === selectedLedgerId)?.name || '' : ''}
            onChange={(val) => {
              const ledger = bankLedgers.find(l => l.name === val);
              if (ledger) setSelectedLedgerId(ledger.id);
            }}
            placeholder="Search bank ledgers..."
          />
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedLedgerId && onSelect(selectedLedgerId)}
            disabled={!selectedLedgerId}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankLedgerSelectionModal;

