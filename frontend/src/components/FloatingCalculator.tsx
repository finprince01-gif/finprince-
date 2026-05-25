import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

type Position = {
  x: number;
  y: number;
};

type HistoryItem = {
  expression: string;
  result: string;
};

type CalcButton = {
  label: string;
  value: string;
  variant?: 'number' | 'operator' | 'utility' | 'equals' | 'memory';
  span?: string;
};

const BUTTON_SIZE = 48;
const PANEL_WIDTH = 356;
const PANEL_HEIGHT = 548;
const EDGE_PADDING = 16;
const OPERATORS = ['+', '-', '*', '/', '%'];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getInitialPosition = (): Position => {
  if (typeof window === 'undefined') {
    return { x: 1200, y: 24 };
  }

  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - BUTTON_SIZE - 48),
    y: 24,
  };
};

const getPanelPosition = (buttonPosition: Position): Position => ({
  x: clamp(
    buttonPosition.x + BUTTON_SIZE - PANEL_WIDTH,
    EDGE_PADDING,
    window.innerWidth - PANEL_WIDTH - EDGE_PADDING
  ),
  y: clamp(buttonPosition.y, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING),
});

const formatResult = (value: number) => {
  if (!Number.isFinite(value)) return 'Error';
  const rounded = Number(value.toFixed(10));
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 10 });
};

const normalizeExpression = (expression: string) => expression.replace(/,/g, '').replace(/x/g, '*');

const tokenize = (expression: string) => {
  const cleaned = normalizeExpression(expression).replace(/\s+/g, '');
  const tokens = cleaned.match(/(\d+\.?\d*|\.\d+|[()+\-*/%])/g);
  if (!tokens || tokens.join('') !== cleaned) {
    throw new Error('Invalid expression');
  }
  return tokens;
};

const evaluateExpression = (expression: string) => {
  const tokens = tokenize(expression);
  const values: number[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

  const applyOperator = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();

    if (!operator || right === undefined || left === undefined) {
      throw new Error('Invalid expression');
    }

    if (operator === '+') values.push(left + right);
    if (operator === '-') values.push(left - right);
    if (operator === '*') values.push(left * right);
    if (operator === '/') values.push(left / right);
    if (operator === '%') values.push(left % right);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    const isUnaryMinus = token === '-' && (index === 0 || OPERATORS.includes(previous) || previous === '(');

    if (isUnaryMinus) {
      const next = tokens[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error('Invalid expression');
      }
      values.push(-Number(next));
      index += 1;
      continue;
    }

    if (!Number.isNaN(Number(token))) {
      values.push(Number(token));
      continue;
    }

    if (token === '(') {
      operators.push(token);
      continue;
    }

    if (token === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') {
        applyOperator();
      }
      if (operators.pop() !== '(') {
        throw new Error('Invalid expression');
      }
      continue;
    }

    while (
      operators.length > 0 &&
      operators[operators.length - 1] !== '(' &&
      precedence[operators[operators.length - 1]] >= precedence[token]
    ) {
      applyOperator();
    }
    operators.push(token);
  }

  while (operators.length > 0) {
    if (operators[operators.length - 1] === '(') {
      throw new Error('Invalid expression');
    }
    applyOperator();
  }

  if (values.length !== 1) throw new Error('Invalid expression');
  return formatResult(values[0]);
};

const displayOperator = (value: string) => {
  return value;
};

const calcButtons: CalcButton[] = [
  // Memory row
  { label: 'MC', value: 'MC', variant: 'memory' },
  { label: 'MR', value: 'MR', variant: 'memory' },
  { label: 'M+', value: 'M+', variant: 'memory' },
  { label: 'M-', value: 'M-', variant: 'memory' },
  // Row 2: %, CE, C, DEL  (matches Windows calc)
  { label: '%', value: '%', variant: 'operator' },
  { label: 'CE', value: 'CE', variant: 'utility' },
  { label: 'C', value: 'C', variant: 'utility' },
  { label: 'DEL', value: 'Back', variant: 'utility' },
  // Row 3: 1/x, x², SQRT, ÷  (matches Windows calc)
  { label: '1/x', value: '1/x', variant: 'operator' },
  { label: 'x²', value: 'x2', variant: 'operator' },
  { label: '√x', value: 'sqrt', variant: 'operator' },
  { label: '÷', value: '/', variant: 'operator' },
  // Row 4: 7 8 9 ×
  { label: '7', value: '7' },
  { label: '8', value: '8' },
  { label: '9', value: '9' },
  { label: '×', value: '*', variant: 'operator' },
  // Row 5: 4 5 6 −
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6', value: '6' },
  { label: '−', value: '-', variant: 'operator' },
  // Row 6: 1 2 3 +
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '+', value: '+', variant: 'operator' },
  // Row 7: +/- 0 . =
  { label: '+/−', value: '+/-', variant: 'operator' },
  { label: '0', value: '0', span: 'col-span-2' },
  { label: '.', value: '.' },
  { label: '=', value: '=', variant: 'equals' },
];

const FloatingCalculator: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [expression, setExpression] = useState('0');
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const suppressClickRef = useRef(false);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    moved: boolean;
  } | null>(null);

  const currentValue = useMemo(() => {
    const normalized = normalizeExpression(expression);
    const lastNumber = normalized.split(/[+\-*/%()]/).filter(Boolean).pop();
    const numeric = Number(lastNumber || normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  }, [expression]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: clamp(prev.x, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
        y: clamp(prev.y, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
      }));
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, string> = {
        Enter: '=',
        Backspace: 'Back',
        Escape: 'C',
      };
      const value = keyMap[event.key] || event.key;
      if (/^[0-9.+\-*/%()]$/.test(value) || ['=', 'Back', 'C'].includes(value)) {
        event.preventDefault();
        handleButtonPress(value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, expression, hasResult, memory]);

  useEffect(() => {
    if (!showHistory) return undefined;

    const handlePointerDownOutsideHistory = (event: PointerEvent) => {
      const target = event.target as Node;

      if (historyPanelRef.current?.contains(target) || historyToggleRef.current?.contains(target)) {
        return;
      }

      setShowHistory(false);
    };

    window.addEventListener('pointerdown', handlePointerDownOutsideHistory);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutsideHistory);
  }, [showHistory]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const dragPosition = isOpen ? getPanelPosition(position) : position;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: dragPosition.x,
      initialY: dragPosition.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      drag.moved = true;
    }

    if (isOpen) {
      const nextPanelX = clamp(drag.initialX + deltaX, EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING);
      const nextPanelY = clamp(drag.initialY + deltaY, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING);

      setPosition({
        x: clamp(nextPanelX + PANEL_WIDTH - BUTTON_SIZE, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
        y: clamp(nextPanelY, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
      });
      return;
    }

    setPosition({
      x: clamp(drag.initialX + deltaX, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
      y: clamp(drag.initialY + deltaY, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    suppressClickRef.current = drag.moved;
    dragState.current = null;
  };

  const setResult = (nextExpression: string, result: string) => {
    setExpression(result);
    setHistory(prev => [{ expression: nextExpression, result }, ...prev].slice(0, 8));
    setHasResult(true);
  };

  const appendValue = (value: string) => {
    setExpression(prev => {
      if (prev === 'Error') return value;
      if (hasResult && !OPERATORS.includes(value) && value !== ')' && value !== '.') {
        setHasResult(false);
        return value;
      }
      if (hasResult) {
        setHasResult(false);
      }

      if (value === '.') {
        const currentNumber = normalizeExpression(prev).split(/[+\-*/%()]/).pop() || '';
        if (currentNumber.includes('.')) return prev;
      }

      if (OPERATORS.includes(value) && OPERATORS.includes(normalizeExpression(prev).slice(-1))) {
        return prev.slice(0, -1) + displayOperator(value);
      }

      if (prev === '0' && !['.', '+', '-', '*', '/', '%', ')'].includes(value)) {
        return displayOperator(value);
      }

      return prev + displayOperator(value);
    });
  };

  const calculate = () => {
    try {
      const result = evaluateExpression(expression);
      setResult(expression, result);
    } catch {
      setExpression('Error');
      setHasResult(true);
    }
  };

  const applyUnary = (label: string, operation: (value: number) => number) => {
    const result = formatResult(operation(Number(normalizeExpression(expression))));
    setResult(`${label}(${expression})`, result);
  };

  const handleButtonPress = (value: string) => {
    if (value === 'C') {
      setExpression('0');
      setHasResult(false);
      return;
    }

    if (value === 'CE') {
      setExpression('0');
      return;
    }

    if (value === 'Back') {
      setExpression(prev => (prev.length > 1 && prev !== 'Error' ? prev.slice(0, -1) : '0'));
      setHasResult(false);
      return;
    }

    if (value === '=') {
      calculate();
      return;
    }

    if (value === '+/-') {
      setExpression(prev => {
        const normalized = normalizeExpression(prev);
        const numeric = Number(normalized);
        if (Number.isFinite(numeric)) return formatResult(-numeric);
        return `-(${prev})`;
      });
      return;
    }

    if (value === 'sqrt') {
      applyUnary('sqrt', Math.sqrt);
      return;
    }

    if (value === 'x2') {
      applyUnary('square', valueToSquare => valueToSquare * valueToSquare);
      return;
    }

    if (value === '1/x') {
      applyUnary('reciprocal', valueToInvert => 1 / valueToInvert);
      return;
    }

    if (value === 'MC') {
      setMemory(0);
      return;
    }

    if (value === 'MR') {
      setExpression(formatResult(memory));
      setHasResult(true);
      return;
    }

    if (value === 'M+') {
      setMemory(prev => prev + currentValue);
      return;
    }

    if (value === 'M-') {
      setMemory(prev => prev - currentValue);
      return;
    }

    appendValue(value);
  };

  const buttonClass = (variant: 'number' | 'operator' | 'utility' | 'equals' | 'memory' = 'number') => {
    const variants = {
      number: 'bg-white text-slate-900 border-slate-200 shadow-sm hover:bg-slate-50',
      operator: 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100',
      utility: 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100',
      equals: 'bg-indigo-600 text-white border-indigo-600 shadow-[0_8px_18px_rgba(79,70,229,0.25)] hover:bg-indigo-700',
      memory: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100',
    };

    return `h-11 rounded-[10px] border text-xs font-black transition-all duration-150 active:scale-95 ${variants[variant]}`;
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setIsOpen(true);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragState.current = null;
        }}
        className="fixed flex items-center justify-center rounded-2xl text-white hover:scale-105 active:scale-95 transition-transform duration-150 cursor-grab active:cursor-grabbing"
        style={{
          left: position.x,
          top: position.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          zIndex: 40,
          touchAction: 'none',
          background: 'linear-gradient(145deg, #6366f1 0%, #4f46e5 100%)',
          boxShadow: '0 4px 14px rgba(79,70,229,0.45)',
        }}
        title="Calculator"
        aria-label="Open calculator"
      >
        <Icon name="calculator" className="w-7 h-7" />
      </button>
    );
  }

  const panelPosition = getPanelPosition(position);
  const memoryLabel = memory === 0 ? 'Memory empty' : `M ${formatResult(memory)}`;

  return (
    <section
      className="fixed bg-slate-50 border border-white/80 rounded-[14px] shadow-[0_24px_60px_rgba(15,23,42,0.24)] overflow-hidden"
      style={{
        left: panelPosition.x,
        top: panelPosition.y,
        width: PANEL_WIDTH,
        zIndex: 45,
      }}
      aria-label="Calculator"
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragState.current = null;
        }}
        className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-10 h-10 rounded-full text-white"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 55%, #2563eb 100%)',
              boxShadow: '0 6px 18px rgba(109,40,217,0.45)',
            }}
          >
            <Icon name="calculator" className="w-4 h-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Calculator</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{memoryLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={historyToggleRef}
            onPointerDown={event => {
              event.stopPropagation();
              dragState.current = null;
            }}
            onPointerMove={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              setShowHistory(prev => !prev);
            }}
            className={`flex items-center justify-center w-8 h-8 rounded-[8px] hover:bg-slate-100 ${showHistory ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-700'}`}
            title="History"
            aria-label="Toggle calculator history"
          >
            <Icon name="history" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={event => {
              event.stopPropagation();
              dragState.current = null;
            }}
            onPointerMove={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              setIsOpen(false);
              setShowHistory(false);
            }}
            className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Close calculator"
            aria-label="Close calculator"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative p-4">
        <div className="rounded-[14px] bg-white px-4 py-4 overflow-hidden shadow-sm border border-slate-200">
          <div className="min-h-5 text-right text-[11px] font-black uppercase tracking-wider text-slate-400 truncate">
            Advanced mode
          </div>
          <div className="min-h-[68px] flex items-end justify-end">
            <div className="max-w-full text-right text-[34px] font-black text-slate-950 break-all leading-tight">
              {expression}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 mt-3">
          {calcButtons.map(button => (
            <button
              key={button.value}
              type="button"
              onClick={() => handleButtonPress(button.value)}
              className={[
                buttonClass(button.variant),
                button.span || '',
              ].join(' ')}
            >
              {button.label}
            </button>
          ))}
        </div>

        {showHistory && (
          <div ref={historyPanelRef} className="absolute inset-4 top-[132px] rounded-[14px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] overflow-hidden z-10">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">History</span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                  title="Clear history"
                  aria-label="Clear calculator history"
                >
                  <Icon name="trash-2" className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs font-semibold text-slate-400">
                  No calculations yet
                </div>
              ) : (
                history.map((item, index) => (
                  <button
                    key={`${item.expression}-${index}`}
                    type="button"
                    onClick={() => {
                      setExpression(item.result);
                      setHasResult(true);
                      setShowHistory(false);
                    }}
                    className="w-full px-4 py-3 text-right hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="text-xs font-bold text-slate-400 truncate">{item.expression} =</div>
                    <div className="text-xl font-black text-slate-900 truncate">{item.result}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default FloatingCalculator;
