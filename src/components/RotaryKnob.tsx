import React, { useRef, useState } from 'react';

interface RotaryKnobProps {
  label: string;
  subLabel?: string;
  value: number; // normalized 0..1
  displayValue: string;
  onChange: (nextNormalized: number) => void;
  defaultValue?: number;
  accentColor?: string;
  size?: number;
  isLearning?: boolean;
  onSelectLearn?: () => void;
  ariaLabel?: string;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  subLabel,
  value,
  displayValue,
  onChange,
  defaultValue = 0.5,
  accentColor = '#E11D48',
  size = 52,
  isLearning = false,
  onSelectLearn,
  ariaLabel,
}) => {
  const clamped = Math.max(0, Math.min(1, value));
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(clamped);

  // Arc math: -135deg to +135deg (270deg sweep)
  const startAngle = -135;
  const endAngle = 135;
  const currentAngle = startAngle + clamped * (endAngle - startAngle);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 5;

  const polarToCartesian = (angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const describeArc = (fromDeg: number, toDeg: number) => {
    const start = polarToCartesian(fromDeg);
    const end = polarToCartesian(toDeg);
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (onSelectLearn) {
      onSelectLearn();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = clamped;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const dy = startYRef.current - e.clientY;
    const sensitivity = e.shiftKey ? 0.002 : 0.0065;
    const next = Math.max(0, Math.min(1, startValRef.current + dy * sensitivity));
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.035 : -0.035;
    onChange(Math.max(0, Math.min(1, clamped + delta)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(Math.min(1, clamped + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(Math.max(0, clamped - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(1);
    }
  };

  const indicatorStart = {
    x: cx + (radius - 13) * Math.cos(((currentAngle - 90) * Math.PI) / 180),
    y: cy + (radius - 13) * Math.sin(((currentAngle - 90) * Math.PI) / 180),
  };
  const indicatorEnd = {
    x: cx + (radius - 6) * Math.cos(((currentAngle - 90) * Math.PI) / 180),
    y: cy + (radius - 6) * Math.sin(((currentAngle - 90) * Math.PI) / 180),
  };

  return (
    <div className="flex flex-col items-center select-none min-w-[66px]">
      {subLabel && (
        <span className="text-[10px] font-mono tabular-nums text-slate-500 mb-0.5 whitespace-nowrap">
          {subLabel}
        </span>
      )}
      <button
        type="button"
        role="slider"
        aria-label={ariaLabel || label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuetext={displayValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className={`relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48] transition-transform ${
          isLearning ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#14171D]' : ''
        } ${dragging ? 'scale-105' : 'hover:scale-[1.03]'}`}
        style={{ width: size, height: size, touchAction: 'none' }}
        title={`${label}: ${displayValue} (Drag up/down or double-click to reset)`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track background arc */}
          <path
            d={describeArc(startAngle, endAngle)}
            fill="none"
            stroke="#262C36"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {clamped > 0.005 && (
            <path
              d={describeArc(startAngle, currentAngle)}
              fill="none"
              stroke={isLearning ? '#F59E0B' : accentColor}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}
          {/* Knurled metallic encoder cap */}
          <circle
            cx={cx}
            cy={cy}
            r={radius - 5.5}
            fill="#1D222B"
            stroke={dragging ? '#E2E8F0' : '#353D4B'}
            strokeWidth="1.25"
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius - 9}
            fill="#14181F"
          />
          {/* Indicator notch */}
          <line
            x1={indicatorStart.x}
            y1={indicatorStart.y}
            x2={indicatorEnd.x}
            y2={indicatorEnd.y}
            stroke={isLearning ? '#F59E0B' : '#F8FAFC'}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span className="mt-1 text-[11px] font-medium text-slate-300 leading-tight whitespace-nowrap truncate max-w-[74px]">
        {label}
      </span>
      <span className="text-[10px] font-mono tabular-nums text-slate-400 leading-tight whitespace-nowrap">
        {displayValue}
      </span>
    </div>
  );
};
