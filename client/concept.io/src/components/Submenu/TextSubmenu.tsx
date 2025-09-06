
import React from 'react'
import type { TextProperties } from '../../hooks/Text';
import {
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight
} from 'lucide-react';

export const TextSubmenu: React.FC<{
  textProps: TextProperties;
  setTextProps: (props: TextProperties) => void;

}> = ({ textProps, setTextProps }) => {
  return (
    <div className="absolute left-full ml-2 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800">
      <div className="space-y-2">
        <select
          value={textProps.fontFamily}
          onChange={(e) => setTextProps({ ...textProps, fontFamily: e.target.value })}
          className="w-full p-1 rounded"
        >
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
        </select>
        
        <input
          type="number"
          value={textProps.fontSize}
          onChange={(e) => setTextProps({ ...textProps, fontSize: Number(e.target.value) })}
          className="w-full p-1 rounded"
          min="8"
          max="72"
        />
        
        <div className="flex gap-2">
          <button
            onClick={() => setTextProps({ ...textProps, bold: !textProps.bold })}
            className={`p-1 rounded ${textProps.bold ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => setTextProps({ ...textProps, italic: !textProps.italic })}
            className={`p-1 rounded ${textProps.italic ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => setTextProps({ ...textProps, underline: !textProps.underline })}
            className={`p-1 rounded ${textProps.underline ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <Underline size={16} />
          </button>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setTextProps({ ...textProps, align: 'left' })}
            className={`p-1 rounded ${textProps.align === 'left' ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <AlignLeft size={16} />
          </button>
          <button
            onClick={() => setTextProps({ ...textProps, align: 'center' })}
            className={`p-1 rounded ${textProps.align === 'center' ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <AlignCenter size={16} />
          </button>
          <button
            onClick={() => setTextProps({ ...textProps, align: 'right' })}
            className={`p-1 rounded ${textProps.align === 'right' ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            <AlignRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};