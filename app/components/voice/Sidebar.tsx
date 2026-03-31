'use client';
import { Turn } from './types';

interface Props {
  open: boolean;
  turns: Turn[];
  sessionId: string;
  onNewSession: () => void;
}

export default function Sidebar({ open, turns, sessionId, onNewSession }: Props) {
  return (
    <aside className={`${open ? 'w-64' : 'w-0'} shrink-0 transition-all duration-300 overflow-hidden
      border-r border-white/[0.07] bg-[#070C17] flex flex-col`}
    >
      {/* header with gradient accent */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#1a5276,#0d6b3a)' }} />

      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-bold text-sm text-white/80">Conversations</span>
        <span className="text-[10px] text-white/25 bg-white/5 px-2 py-0.5 rounded-full">{turns.length}</span>
      </div>

      <button onClick={onNewSession}
        className="mx-3 mt-3 py-2.5 rounded-xl text-xs font-semibold text-white/50
          border border-white/[0.08] hover:border-white/20 hover:text-white hover:bg-white/[0.04] transition
          flex items-center justify-center gap-2">
        <span className="text-base leading-none">+</span> New Conversation
      </button>

      {/* history */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {turns.length === 0 ? (
          <p className="text-[11px] text-white/20 text-center mt-10 leading-relaxed">
            no conversations yet<br/>start talking to see history
          </p>
        ) : (
          turns.map((t, i) => (
            <div key={t.id} className="px-3 py-2.5 rounded-xl hover:bg-white/[0.04] cursor-pointer transition group">
              <p className="text-xs text-white/50 truncate group-hover:text-white/80 transition leading-relaxed">
                <span className="text-white/20 mr-1">{i + 1}.</span>{t.heard}
              </p>
              <p className="text-[10px] text-white/20 mt-0.5 flex items-center gap-1.5">
                {t.timestamp.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}
                {t.file && <span>· 📎</span>}
              </p>
            </div>
          ))
        )}
      </div>

      {/* memory badge */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
          <p className="text-[10px] text-white/30 font-semibold flex items-center gap-1.5">
            <span>🧠</span> Memory · {turns.length} turns stored
          </p>
          <p className="text-[10px] text-white/15 font-mono truncate">{sessionId.slice(0, 26)}</p>
        </div>
      </div>
    </aside>
  );
}