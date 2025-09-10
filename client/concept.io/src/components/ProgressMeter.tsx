interface ProgressMeterProps {
  value: number;
  max: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ProgressMeter: React.FC<ProgressMeterProps> = ({ 
  value, 
  max, 
  label,
  size = 'md',
  showLabel = true 
}) => {
  const percentage = (value / max) * 100;
  
  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3'
  };

  const height = heightClasses[size];
  
  return (
    <div className="w-120 relative right-0 max-w-[80%]">
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm font-medium text-gray-700">{value}/{max}</span>
        </div>
      )}
      <div className={`w-full ${height} bg-gray-200 rounded-full`}>
        <div
          className={`${height} rounded-full bg-blue-600 transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
