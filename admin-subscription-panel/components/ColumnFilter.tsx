import React, { useState, useRef, useEffect } from 'react';
import { ColumnsIcon } from './icons/ColumnsIcon';

interface Column {
  key: string;
  label: string;
}

interface ColumnFilterProps {
  columns: Column[];
  visibleColumns: Set<string>;
  setVisibleColumns: (visible: Set<string>) => void;
}

export const ColumnFilter: React.FC<ColumnFilterProps> = ({ columns, visibleColumns, setVisibleColumns }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);
  
  const handleToggleColumn = (columnKey: string) => {
    const newVisibleColumns = new Set(visibleColumns);
    if (newVisibleColumns.has(columnKey)) {
      if (columns.filter(c => newVisibleColumns.has(c.key)).length > 1) { 
        newVisibleColumns.delete(columnKey);
      }
    } else {
      newVisibleColumns.add(columnKey);
    }
    setVisibleColumns(newVisibleColumns);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-lg text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <ColumnsIcon className="h-5 w-5" />
        <span>Columns</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
          <div className="p-2">
            <p className="text-sm font-semibold text-gray-300 px-2 pt-1 pb-2">Toggle Columns</p>
            {columns.map((column) => (
              <label key={column.key} className="flex items-center space-x-3 px-2 py-2 rounded-md hover:bg-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 bg-gray-600 border-gray-500 rounded text-indigo-600 focus:ring-indigo-500"
                  checked={visibleColumns.has(column.key)}
                  onChange={() => handleToggleColumn(column.key)}
                />
                <span className="text-gray-200">{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
