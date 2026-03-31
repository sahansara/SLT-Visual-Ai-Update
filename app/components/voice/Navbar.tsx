'use client';
import Image from 'next/image';
import { AppLanguage, LANGUAGES } from './types'; 

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  turnCount: number;
  language: AppLanguage; 
  onLanguageChange: (lang: AppLanguage) => void; 
}

export default function Navbar({ sidebarOpen, onToggleSidebar, turnCount, language, onLanguageChange }: Props) {
  return (
    <header 
      // 1. Added w-full and justify-between to push the two sides apart
      className="h-14 shrink-0 flex items-center justify-between px-4 w-full relative z-10"
      style={{ background: 'linear-gradient(90deg, #0f2a4a 0%, #1a5276 40%, #0d6b3a 100%)' }}
    >
      
      {/* Grouped Toggle and Logo together */}
      <div className="flex items-center gap-4">
        {/* sidebar toggle */}
        <button onClick={onToggleSidebar}
          className="w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition text-sm shrink-0">
          {sidebarOpen ? '✕' : '☰'}
        </button>

        {/* logo */}
        <div className="flex items-center gap-10">
          <Image src="/logo.png" alt="SLT Mobitel" width={80} height={80} className="object-contain" />
          <div className="hidden sm:flex flex-col leading-none">
            
            <span className="text-white/80 text-[15px] font-medium tracking-wider">VOICE AI AGENT</span>
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      {/* Removed ml-auto, as justify-between handles the spacing now */}
      <div className="flex items-center gap-3">
        {turnCount > 0 && (
          <span className="text-[11px] text-white/40 bg-white/10 px-2.5 py-1 rounded-full">
            {turnCount} turns
          </span>
        )}

        {/* 4. INJECTED FEATURE: language selector pills */}
        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1 border border-white/15">
          {(Object.values(LANGUAGES)).map(lang => (
            <button
              key={lang.code}
              onClick={() => onLanguageChange(lang.code)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-200
                ${language === lang.code
                  ? 'bg-white text-[#0f2a4a] shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
            >
              {lang.nativeLabel}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {/* 5. INJECTED FEATURE: Dynamic flag instead of hardcoded "EN" */}
          <span className="text-xs text-white font-semibold">{LANGUAGES[language].flag} Live</span>
        </div>
      </div>
      
    </header>
  );
}