'use client';
import { AgentState } from './types';
import { AIAvatar, UserAvatar } from './Avatars';

interface Props {
  state: AgentState;
  statusMsg: string;
}

export default function AvatarStage({ state, statusMsg }: Props) {
  const lineColor = state === 'recording' ? 'bg-red-500/50' : state === 'speaking' ? 'bg-green-500/50' : 'bg-white/10';

  return (
    <div className="shrink-0 border-b border-white/[0.05]"
      style={{ background: 'linear-gradient(180deg, #060B15 0%, #08111f 100%)' }}
    >
      {/*  added responsive gap to bring them closer together */}
      <div className="flex items-center justify-center gap-8 sm:gap-16 md:gap-24 py-5 w-full px-4 mx-auto">
        
        {/* Left Avatar */}
        <AIAvatar state={state} />

        {/* Center Connection */}
        
        <div className="shrink-0 flex flex-col items-center gap-3 w-[140px] sm:w-[180px]">
          <div className="flex items-center gap-1 w-full">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`flex-1 h-px rounded transition-all duration-500 ${lineColor}`}
                style={{ opacity: state !== 'idle' ? 0.3 + (i % 4) * 0.18 : 0.12 }} />
            ))}
          </div>
          <p className="text-[11px] text-white/35 text-center leading-relaxed font-medium">
            {statusMsg}
          </p>
        </div>

        {/* Right Avatar */}
        <UserAvatar state={state} />
        
      </div>
    </div>
  );
}