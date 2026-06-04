import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// --- Типы ---
type TableShape = 'rectangle' | 'circle';
type TimerStatus = 'idle' | 'running' | 'paused';
type BorderColor = 'blue' | 'yellow' | 'red' | 'green';

interface Timer {
  id: string;
  elapsedSeconds: number;
  status: TimerStatus;
  startTime: number | null;
  pausedElapsed: number;
}

interface Table {
  id: string;
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: TableShape;
  timers: Timer[];
  selectedTimerId: string | null;
  isDraggable: boolean;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Форматирование времени в формат MM:SS
const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Определение цвета рамки стола
const getBorderColor = (timers: Timer[]): BorderColor => {
  let maxElapsed = 0;
  for (const timer of timers) {
    if (timer.elapsedSeconds > maxElapsed) {
      maxElapsed = timer.elapsedSeconds;
    }
  }

  if (maxElapsed >= 20) return 'red';
  if (maxElapsed >= 10) return 'yellow';
  if (timers.length > 0 && timers.some(t => t.status === 'running')) return 'blue';
  if (timers.length === 0) return 'blue';
  return 'green';
};

// Функции для работы с localStorage
const saveToLocalStorage = (tables: Table[], viewState: { x: number; y: number; scale: number }) => {
  try {
    const tablesToSave = tables.map(table => ({
      ...table,
      timers: table.timers.map(timer => {
        if (timer.status === 'running' && timer.startTime) {
          const now = Date.now() / 1000;
          const actualElapsed = timer.pausedElapsed + (now - timer.startTime);
          return {
            ...timer,
            elapsedSeconds: actualElapsed,
            startTime: null,
            pausedElapsed: actualElapsed,
          };
        }
        return timer;
      })
    }));
    
    localStorage.setItem('restaurant-tables', JSON.stringify({
      tables: tablesToSave,
      timestamp: Date.now(),
      viewState
    }));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

const loadFromLocalStorage = (): { tables: Table[]; viewState: { x: number; y: number; scale: number } } | null => {
  try {
    const saved = localStorage.getItem('restaurant-tables');
    if (saved) {
      const { tables: savedTables, timestamp, viewState } = JSON.parse(saved);
      const now = Date.now() / 1000;
      const savedTime = timestamp / 1000;
      const timeDiff = now - savedTime;
      
      const tables = savedTables.map((table: any) => ({
        ...table,
        isDraggable: table.isDraggable !== undefined ? table.isDraggable : true,
        timers: table.timers.map((timer: any) => {
          if (timer.status === 'running') {
            const updatedElapsed = timer.elapsedSeconds + timeDiff;
            return {
              ...timer,
              elapsedSeconds: updatedElapsed,
              pausedElapsed: updatedElapsed,
              startTime: Date.now() / 1000,
            };
          }
          return timer;
        })
      }));
      
      return { tables, viewState: viewState || { x: 0, y: 0, scale: 1 } };
    }
  } catch (error) {
    console.error('Error loading from localStorage:', error);
  }
  return null;
};

// --- Компонент таймера на столе ---
const TableTimerDisplay: React.FC<{ 
  timer: Timer;
  timerId: string;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ timer, timerId, isSelected, onSelect }) => {
  const [displaySeconds, setDisplaySeconds] = useState(timer.elapsedSeconds);

  useEffect(() => {
    if (timer.status !== 'running') {
      setDisplaySeconds(timer.elapsedSeconds);
      return;
    }
    
    const updateTimer = () => {
      if (timer.startTime) {
        const now = Date.now() / 1000;
        const elapsed = timer.pausedElapsed + (now - timer.startTime);
        setDisplaySeconds(elapsed);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    
    return () => clearInterval(interval);
  }, [timer.status, timer.startTime, timer.pausedElapsed]);

  const roundedSeconds = Math.floor(displaySeconds);
  const formattedTime = formatTime(roundedSeconds);

  return (
    <div 
      className={`table-timer ${isSelected ? 'selected' : ''}`}
      onClick={(e) => { 
        e.stopPropagation(); 
        onSelect();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <span className="timer-display">{formattedTime}</span>
    </div>
  );
};

// --- Компонент стола ---
const TableItem: React.FC<{
  table: Table;
  isSelected: boolean;
  onSelect: () => void;
  onSelectTimer: (tableId: string, timerId: string) => void;
  onToggleDraggable: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  scale: number;
}> = ({ table, isSelected, onSelect, onSelectTimer, onToggleDraggable, onDrag, scale }) => {
  const [currentTimers, setCurrentTimers] = useState(table.timers);
  const borderColor = getBorderColor(currentTimers);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tableX: 0, tableY: 0 });

  useEffect(() => {
    setCurrentTimers(table.timers);
  }, [table.timers]);

  useEffect(() => {
    const runningTimers = currentTimers.filter(t => t.status === 'running' && t.startTime);
    if (runningTimers.length === 0) return;

    const interval = setInterval(() => {
      setCurrentTimers(prev => prev.map(timer => {
        if (timer.status === 'running' && timer.startTime) {
          const now = Date.now() / 1000;
          const elapsed = timer.pausedElapsed + (now - timer.startTime);
          return { ...timer, elapsedSeconds: elapsed };
        }
        return timer;
      }));
    }, 100);

    return () => clearInterval(interval);
  }, [currentTimers]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.table-timer')) return;
    e.stopPropagation();
    e.preventDefault();
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tableX: table.x,
      tableY: table.y,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.table-timer')) return;
    e.stopPropagation();
    
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      tableX: table.x,
      tableY: table.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = (e.clientX - dragStartRef.current.x) / scale;
      const deltaY = (e.clientY - dragStartRef.current.y) / scale;
      const newX = dragStartRef.current.tableX + deltaX;
      const newY = dragStartRef.current.tableY + deltaY;
      onDrag(table.id, newX, newY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = (touch.clientX - dragStartRef.current.x) / scale;
      const deltaY = (touch.clientY - dragStartRef.current.y) / scale;
      const newX = dragStartRef.current.tableX + deltaX;
      const newY = dragStartRef.current.tableY + deltaY;
      onDrag(table.id, newX, newY);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
    };
  }, [isDragging, scale, table.id, onDrag]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleDraggable(table.id);
  };

  const handleTouchDouble = (e: React.TouchEvent) => {
    e.stopPropagation();
    onToggleDraggable(table.id);
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: table.x,
    top: table.y,
    width: table.shape === 'circle' ? Math.min(table.width, table.height) : table.width,
    height: table.shape === 'circle' ? Math.min(table.width, table.height) : table.height,
    borderRadius: table.shape === 'circle' ? '50%' : '8px',
    backgroundColor: 'white',
    border: `3px solid ${borderColor === 'blue' ? '#3b82f6' : borderColor === 'yellow' ? '#eab308' : borderColor === 'red' ? '#ef4444' : '#22c55e'}`,
    boxShadow: isSelected ? '0 0 0 4px rgba(59,130,246,0.5)' : '0 2px 8px rgba(0,0,0,0.1)',
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 0.3s ease',
    zIndex: isDragging ? 1000 : 'auto',
    touchAction: 'none',
  };

  return (
    <div 
      style={style} 
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={handleDoubleClick}
      onTouchEnd={handleTouchDouble}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      <div className="table-number">
        Стол {table.number}
        {!table.isDraggable && <span className="locked-icon">🔒</span>}
      </div>
      <div className="timers-container">
        {currentTimers.map(timer => (
          <TableTimerDisplay 
            key={timer.id}
            timer={timer}
            timerId={timer.id}
            isSelected={table.selectedTimerId === timer.id}
            onSelect={() => onSelectTimer(table.id, timer.id)}
          />
        ))}
      </div>
    </div>
  );
};

// --- Компонент таймера в сайдбаре ---
const SidebarTimer: React.FC<{
  timer: Timer;
  tableId: string;
  isSelected: boolean;
  onSelect: () => void;
  onPause: () => void;
  onStart: () => void;
  onReset: () => void;
  onDelete: () => void;
}> = ({ timer, isSelected, onSelect, onPause, onStart, onReset, onDelete }) => {
  const [displaySeconds, setDisplaySeconds] = useState(timer.elapsedSeconds);

  useEffect(() => {
    if (timer.status !== 'running') {
      setDisplaySeconds(timer.elapsedSeconds);
      return;
    }
    
    const updateTimer = () => {
      if (timer.startTime) {
        const now = Date.now() / 1000;
        const elapsed = timer.pausedElapsed + (now - timer.startTime);
        setDisplaySeconds(elapsed);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    
    return () => clearInterval(interval);
  }, [timer.status, timer.startTime, timer.pausedElapsed]);

  const roundedSeconds = Math.floor(displaySeconds);
  const formattedTime = formatTime(roundedSeconds);

  return (
    <div className={`timer-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="timer-info">
        <div className="timer-time">{formattedTime}</div>
        <div className="timer-status">
          {timer.status === 'running' ? '▶ Running' : timer.status === 'paused' ? '⏸ Paused' : '⏹ Stopped'}
        </div>
      </div>
      <div className="timer-controls">
        {timer.status === 'running' ? (
          <button onClick={(e) => { e.stopPropagation(); onPause(); }}>⏸</button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onStart(); }}>▶</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onReset(); }}>⟳</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}>🗑</button>
      </div>
    </div>
  );
};

// --- Компонент сайдбара ---
const SidebarComponent: React.FC<{
  table: Table;
  onClose: () => void;
  onAddTimer: () => void;
  onSelectTimer: (timerId: string) => void;
  onPauseTimer: (timerId: string) => void;
  onStartTimer: (timerId: string) => void;
  onResetTimer: (timerId: string) => void;
  onDeleteTimer: (timerId: string) => void;
  selectedTimerId: string | null;
}> = ({ 
  table, 
  onClose, 
  onAddTimer, 
  onSelectTimer,
  onPauseTimer,
  onStartTimer,
  onResetTimer,
  onDeleteTimer,
  selectedTimerId 
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Стол {table.number}</h3>
        <button className="close-sidebar" onClick={onClose} title="Закрыть">
          ✕
        </button>
      </div>
      <div className="sidebar-section">
        <h4>Таймеры</h4>
        <button onClick={onAddTimer}>+ Добавить таймер</button>
        <div className="timers-list">
          {table.timers.length === 0 ? (
            <div className="no-timers">Нет таймеров</div>
          ) : (
            table.timers.map(timer => (
              <SidebarTimer
                key={timer.id}
                timer={timer}
                tableId={table.id}
                isSelected={selectedTimerId === timer.id}
                onSelect={() => onSelectTimer(timer.id)}
                onPause={() => onPauseTimer(timer.id)}
                onStart={() => onStartTimer(timer.id)}
                onReset={() => onResetTimer(timer.id)}
                onDelete={() => onDeleteTimer(timer.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- Компонент рабочей области с зумом и панорамированием ---
const Workspace: React.FC<{
  children: React.ReactNode;
  onViewStateChange: (viewState: { x: number; y: number; scale: number }) => void;
}> = ({ children, onViewStateChange }) => {
  const [viewState, setViewState] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [initialTouchDistance, setInitialTouchDistance] = useState(0);
  const [initialScale, setInitialScale] = useState(1);

  // Обработчик зума колесиком мыши
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(0.3, viewState.scale + delta), 3);

    const rect = workspaceRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newX = mouseX - (mouseX - viewState.x) * (newScale / viewState.scale);
      const newY = mouseY - (mouseY - viewState.y) * (newScale / viewState.scale);

      const newViewState = { x: newX, y: newY, scale: newScale };
      setViewState(newViewState);
      onViewStateChange(newViewState);
    }
  };

  // Обработчики для панорамирования мышью
  const handleMouseDown = (e: React.MouseEvent) => {
    // Панорамирование только если клик на пустом месте (не на столе)
    if (e.target === workspaceRef.current || (e.target as HTMLElement).classList.contains('workspace-content')) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: viewState.x,
        startY: viewState.y,
      };
      workspaceRef.current?.style.setProperty('cursor', 'grabbing');
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;
      const newViewState = {
        ...viewState,
        x: panStartRef.current.startX + deltaX,
        y: panStartRef.current.startY + deltaY,
      };
      setViewState(newViewState);
      onViewStateChange(newViewState);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    workspaceRef.current?.style.setProperty('cursor', 'grab');
  };

  // Обработчики для touch-событий (мобильные)
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      setInitialTouchDistance(distance);
      setInitialScale(viewState.scale);
    } else if (e.touches.length === 1) {
      // Проверяем, что тап был на пустом месте
      const target = e.target as HTMLElement;
      if (target === workspaceRef.current || target.classList.contains('workspace-content')) {
        setIsPanning(true);
        const touch = e.touches[0];
        panStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          startX: viewState.x,
          startY: viewState.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialTouchDistance > 0) {
      e.preventDefault();
      const newDistance = getTouchDistance(e.touches);
      const scaleFactor = newDistance / initialTouchDistance;
      const newScale = Math.min(Math.max(0.3, initialScale * scaleFactor), 3);
      
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (rect) {
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const newX = centerX - (centerX - viewState.x) * (newScale / viewState.scale);
        const newY = centerY - (centerY - viewState.y) * (newScale / viewState.scale);
        
        const newViewState = { x: newX, y: newY, scale: newScale };
        setViewState(newViewState);
        onViewStateChange(newViewState);
      }
    } else if (e.touches.length === 1 && isPanning) {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - panStartRef.current.x;
      const deltaY = touch.clientY - panStartRef.current.y;
      const newViewState = {
        ...viewState,
        x: panStartRef.current.startX + deltaX,
        y: panStartRef.current.startY + deltaY,
      };
      setViewState(newViewState);
      onViewStateChange(newViewState);
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    setInitialTouchDistance(0);
  };

  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved?.viewState) {
      setViewState(saved.viewState);
    }
  }, []);

  return (
    <div
      ref={workspaceRef}
      className="workspace"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: 'grab' }}
    >
      <div
        className="workspace-content"
        style={{
          transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
        }}
      >
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, { scale: viewState.scale } as any);
          }
          return child;
        })}
      </div>
    </div>
  );
};

// --- Главное приложение ---
const App: React.FC = () => {
  const savedData = loadFromLocalStorage();
  
  const [tables, setTables] = useState<Table[]>(() => {
    if (savedData?.tables && savedData.tables.length > 0) {
      return savedData.tables;
    }
    return [
      { 
        id: generateId(), 
        number: 1, 
        x: 100, 
        y: 100, 
        width: 120, 
        height: 80, 
        shape: 'rectangle', 
        timers: [],
        selectedTimerId: null,
        isDraggable: true
      },
      { 
        id: generateId(), 
        number: 2, 
        x: 300, 
        y: 200, 
        width: 100, 
        height: 100, 
        shape: 'circle', 
        timers: [],
        selectedTimerId: null,
        isDraggable: true
      },
    ];
  });
  
  const [viewState, setViewState] = useState(savedData?.viewState || { x: 0, y: 0, scale: 1 });
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [newTableShape, setNewTableShape] = useState<TableShape>('rectangle');
  const [newTableSize, setNewTableSize] = useState({ width: 120, height: 80 });

  const selectedTable = tables.find(t => t.id === selectedTableId);

  useEffect(() => {
    saveToLocalStorage(tables, viewState);
  }, [tables, viewState]);

  const addTable = () => {
    const maxNumber = Math.max(...tables.map(t => t.number), 0);
    const newTable: Table = {
      id: generateId(),
      number: maxNumber + 1,
      x: 50,
      y: 50,
      width: newTableSize.width,
      height: newTableShape === 'circle' ? Math.min(newTableSize.width, newTableSize.height) : newTableSize.height,
      shape: newTableShape,
      timers: [],
      selectedTimerId: null,
      isDraggable: true,
    };
    setTables([...tables, newTable]);
    setShowAddTableModal(false);
  };

  const deleteSelectedTable = () => {
    if (selectedTableId) {
      setTables(prev => prev.filter(t => t.id !== selectedTableId));
      setSelectedTableId(null);
    }
  };

  const updateTablePosition = (id: string, x: number, y: number) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  };

  const toggleTableDraggable = (id: string) => {
    setTables(prev => prev.map(t => 
      t.id === id ? { ...t, isDraggable: !t.isDraggable } : t
    ));
  };

  const addTimerToTable = (tableId: string) => {
    const newTimer: Timer = {
      id: generateId(),
      elapsedSeconds: 0,
      status: 'running',
      startTime: Date.now() / 1000,
      pausedElapsed: 0,
    };
    setTables(prev => prev.map(t => 
      t.id === tableId ? 
      { ...t, timers: [...t.timers, newTimer] } : 
      t
    ));
  };

  const resetTimer = (tableId: string, timerId: string) => {
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        timers: t.timers.map(timer => 
          timer.id === timerId ? {
            ...timer,
            elapsedSeconds: 0,
            status: 'running',
            startTime: Date.now() / 1000,
            pausedElapsed: 0,
          } : timer
        )
      };
    }));
  };

  const deleteTimer = (tableId: string, timerId: string) => {
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      const newTimers = t.timers.filter(timer => timer.id !== timerId);
      return {
        ...t,
        timers: newTimers,
        selectedTimerId: t.selectedTimerId === timerId ? null : t.selectedTimerId,
      };
    }));
  };

  const pauseTimer = (tableId: string, timerId: string) => {
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        timers: t.timers.map(timer => {
          if (timer.id !== timerId) return timer;
          if (timer.status !== 'running') return timer;
          
          const now = Date.now() / 1000;
          const additionalElapsed = timer.startTime ? now - timer.startTime : 0;
          const totalElapsed = timer.pausedElapsed + additionalElapsed;
          
          return {
            ...timer,
            elapsedSeconds: totalElapsed,
            status: 'paused',
            startTime: null,
            pausedElapsed: totalElapsed,
          };
        })
      };
    }));
  };

  const startTimer = (tableId: string, timerId: string) => {
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        timers: t.timers.map(timer => 
          timer.id === timerId && timer.status !== 'running' ? {
            ...timer,
            status: 'running',
            startTime: Date.now() / 1000,
          } : timer
        )
      };
    }));
  };

  const selectTimer = (tableId: string, timerId: string) => {
    setTables(prev => prev.map(t => ({
      ...t,
      selectedTimerId: t.id === tableId ? timerId : null
    })));
    setSelectedTableId(tableId);
  };

  const selectTable = (tableId: string) => {
    setTables(prev => prev.map(t => ({
      ...t,
      selectedTimerId: null
    })));
    setSelectedTableId(tableId);
  };

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={() => setShowAddTableModal(true)}>+ Добавить стол</button>
        <button 
          onClick={deleteSelectedTable} 
          disabled={!selectedTableId}
          className={!selectedTableId ? 'disabled' : ''}
        >
          🗑 Удалить стол
        </button>
      </div>

      <Workspace onViewStateChange={setViewState}>
        {tables.map(table => (
          <TableItem
            key={table.id}
            table={table}
            isSelected={selectedTableId === table.id}
            onSelect={() => selectTable(table.id)}
            onSelectTimer={selectTimer}
            onToggleDraggable={toggleTableDraggable}
            onDrag={updateTablePosition}
            scale={viewState.scale}
          />
        ))}
      </Workspace>

      {selectedTable && (
        <SidebarComponent
          table={selectedTable}
          onClose={() => setSelectedTableId(null)}
          onAddTimer={() => addTimerToTable(selectedTable.id)}
          onSelectTimer={(timerId) => selectTimer(selectedTable.id, timerId)}
          onPauseTimer={(timerId) => pauseTimer(selectedTable.id, timerId)}
          onStartTimer={(timerId) => startTimer(selectedTable.id, timerId)}
          onResetTimer={(timerId) => resetTimer(selectedTable.id, timerId)}
          onDeleteTimer={(timerId) => deleteTimer(selectedTable.id, timerId)}
          selectedTimerId={selectedTable.selectedTimerId}
        />
      )}

      {showAddTableModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Новый стол</h3>
            <label>
              Форма:
              <select value={newTableShape} onChange={e => setNewTableShape(e.target.value as TableShape)}>
                <option value="rectangle">Прямоугольник</option>
                <option value="circle">Круг</option>
              </select>
            </label>
            <label>
              Ширина: <input type="number" value={newTableSize.width} onChange={e => setNewTableSize({ ...newTableSize, width: +e.target.value })} />
            </label>
            <label>
              Высота: <input type="number" value={newTableSize.height} onChange={e => setNewTableSize({ ...newTableSize, height: +e.target.value })} />
            </label>
            <button onClick={addTable}>Создать</button>
            <button onClick={() => setShowAddTableModal(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;