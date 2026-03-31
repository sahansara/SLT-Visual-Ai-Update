'use client';
import { useRef } from 'react';
import { AgentState } from './types';

interface Props {
  state: AgentState;
  statusMsg: string;
  attachedFile: File | null;
  error: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onMicClick: () => void;
  onFileChange: (f: File | null) => void;
}

export default function InputBar({
  state, statusMsg, attachedFile, error,
  onPointerDown, onPointerUp, onMicClick, onFileChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const micGradient = {
    idle:      'from-[#1a5276] to-[#0d3a5c]',
    recording: 'from-red-600 to-red-900',
    thinking:  'from-[#0d6b3a] to-[#074d29]',
    speaking:  'from-violet-600 to-violet-900',
  }[state];

  const micIcon = { idle: '🎤', recording: '⏹', thinking: '🙇', speaking: '🔊' }[state];

  return (
    <div className="shrink-0 border-t border-white/[0.06] px-4 py-3"
      style={{ background: 'rgba(6,11,21,0.97)', backdropFilter: 'blur(12px)' }}
    >
      {/* ADDED: justify-center and increased the gap slightly (gap-4 sm:gap-6) for breathing room */}
      <div className="max-w-8xl mx-auto flex items-center justify-center gap-4 sm:gap-6 w-full">
        
        {/* file attach */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)} />
        <button onClick={() => fileRef.current?.click()}
          className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg transition shrink-0
            ${attachedFile
              ? 'border-purple-500/50 bg-purple-500/15 text-purple-300'
              : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white hover:border-white/20'
            }`}>
          {attachedFile ? '📎' : '📂'}
        </button>

        {/* file pill */}
        {attachedFile && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs max-w-[160px]">
            <span className="truncate font-medium">{attachedFile.name}</span>
            <button onClick={() => onFileChange(null)} className="shrink-0 hover:text-red-400 transition text-base leading-none">✕</button>
          </div>
        )}

        {/* REMOVED: flex-1 from this container so it stops pushing everything apart */}
        <div className="flex items-center justify-center px-3">
          <p className="text-xs text-white/20 hidden sm:block font-medium">
            {state === 'idle' ? 'hold mic · attach files · voice only' : statusMsg}
          </p>
        </div>

        {/* mic button */}
        <button
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onClick={onMicClick}
          disabled={state === 'thinking'}
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${micGradient}
            flex items-center justify-center text-xl transition-all duration-200 shrink-0
            shadow-lg hover:scale-105 active:scale-95 select-none touch-none
            disabled:opacity-50 disabled:cursor-wait disabled:animate-pulse`}
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          {micIcon}
        </button>
      </div>

      {error && (
        <p className="text-center text-xs text-red-400 mt-2 max-w-3xl mx-auto font-medium">⚠️ {error}</p>
      )}
    </div>
  );
}