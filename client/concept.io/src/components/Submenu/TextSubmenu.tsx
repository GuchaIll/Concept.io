
import { memo } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  type LucideIcon
} from 'lucide-react';
import { useText } from '../../hooks/Text';
import { useCanvasContext } from '../../contexts/CanvasContext';
import type { TextAlign, TextProperties } from '../../hooks/Text';

const fontOptions = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' }
];

const alignmentButtons: Array<{
  icon: LucideIcon;
  align: TextAlign;
  label: string;
}> = [
  { icon: AlignLeft, align: 'left', label: 'Align Left' },
  { icon: AlignCenter, align: 'center', label: 'Align Center' },
  { icon: AlignRight, align: 'right', label: 'Align Right' }
];

const styleButtons: Array<{
  icon: LucideIcon;
  property: keyof Pick<TextProperties, 'bold' | 'italic' | 'underline'>;
  label: string;
}> = [
  { icon: Bold, property: 'bold', label: 'Bold' },
  { icon: Italic, property: 'italic', label: 'Italic' },
  { icon: Underline, property: 'underline', label: 'Underline' }
];

export const TextSubmenu = memo(() => {
  const { canvas } = useCanvasContext();
  const { textProps, setTextProps } = useText(canvas);

  return (
    <div className="absolute left-full ml-2 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800">
      <div className="space-y-3">
        <select
          value={textProps.fontFamily}
          onChange={(e) => setTextProps({ ...textProps, fontFamily: e.target.value as typeof textProps.fontFamily })}
          className="w-full p-2 rounded-lg border border-gray-300 bg-white dark:bg-gray-700 dark:border-gray-600"
        >
          {fontOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={textProps.fontSize}
            onChange={(e) => setTextProps({ ...textProps, fontSize: Number(e.target.value) })}
            className="w-full p-2 rounded-lg border border-gray-300 dark:bg-gray-700 dark:border-gray-600"
            min="8"
            max="72"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">px</span>
        </div>
        
        <div className="flex gap-1">
          {styleButtons.map(({ icon: Icon, property, label }) => (
            <button
              key={property}
              onClick={() => setTextProps({ ...textProps, [property]: !textProps[property] })}
              className={`p-2 rounded-lg transition-colors ${
                textProps[property]
                  ? 'bg-indigo-100 dark:bg-indigo-900'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        
        <div className="flex gap-1">
          {alignmentButtons.map(({ icon: Icon, align, label }) => (
            <button
              key={align}
              onClick={() => setTextProps({ ...textProps, align })}
              className={`p-2 rounded-lg transition-colors ${
                textProps.align === align
                  ? 'bg-indigo-100 dark:bg-indigo-900'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

TextSubmenu.displayName = 'TextSubmenu';
