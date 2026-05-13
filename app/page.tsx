'use client';
import { useState, useRef, useEffect } from 'react';
import { AgentState, AppLanguage, LANGUAGES, Turn } from './components/voice/types';
import Navbar from './components/voice/Navbar';
import Sidebar from './components/voice/Sidebar';
import AvatarStage from './components/voice/AvatarStage';
import InputBar from './components/voice/InputBar';
import FloatingChat from './components/voice/FloatingChat';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('voice_session_id');
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('voice_session_id', id);
  }
  return id;
}

export default function VoicePage() {
  const [state, setState] = useState<AgentState>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  //Language State 
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [ttsWarning, setTtsWarning] = useState('');

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { setSessionId(getSessionId()); }, []);

  // Check if browser supports TTS voice
  useEffect(() => {
    if (language === 'en') { setTtsWarning(''); return; }
    const check = () => {
      const voices = window.speechSynthesis.getVoices();
      const cfg = LANGUAGES[language];
      const supported = voices.some(v => v.lang.startsWith(cfg.bcp47.split('-')[0]));
      setTtsWarning(supported ? '' : `${cfg.nativeLabel} voice not found on this device — text will show but audio may be in default voice`);
    };
    window.speechSynthesis.onvoiceschanged = check;
    check();
  }, [language]);

  // Dynamic Status Message 
  const statusMsg = {
    idle: attachedFile
      ? `📎 ${attachedFile.name} ready — hold mic`
      : LANGUAGES[language].nativeLabel === 'English'
        ? 'Hold the mic to speak'
        : `${LANGUAGES[language].nativeLabel} — mic hold කරන්න`,
    recording: 'Listening... release when done',
    thinking:  'Browsing & thinking...',
    speaking:  'Speaking — tap to stop',
  }[state];

  const startRecording = async () => {
    if (state === 'speaking') window.speechSynthesis.cancel();
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mediaRef.current = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mediaRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRef.current.onstop = handleSend;
      mediaRef.current.start();
      setState('recording');
    } catch {
      setError('microphone access denied — allow mic in browser settings');
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && state === 'recording') {
      mediaRef.current.stop();
      mediaRef.current.stream.getTracks().forEach(t => t.stop());
      setState('thinking');
    }
  };

  const handleSend = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', new File([blob], 'recording.webm', { type: 'audio/webm' }));
    formData.append('sessionId', sessionId);
    formData.append('language', language);
    if (attachedFile) formData.append('file', attachedFile);

    try {
      const res  = await fetch('/api/voice', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) { setError(data.error); setState('idle'); return; }

      const turn: Turn = {
        id: Date.now(),
        heard: data.transcription,
        answer: data.answer,
        lang: language,
        file: attachedFile ? { name: attachedFile.name, type: attachedFile.type } : undefined,
        timestamp: new Date(),
      };

      setTurns(prev => [...prev, turn]);
      setAttachedFile(null);
      setState('speaking');
      speak(data.answer, language);
    } catch {
      setError('server connection failed');
      setState('idle');
    }
  };

  // Dynamic TTS Language and Rate 
  const speak = (text: string, lang: AppLanguage = language) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
    utt.lang   = LANGUAGES[lang].bcp47;
    utt.rate   = lang === 'si' ? 0.85 : lang === 'ta' ? 0.88 : 0.95;
    utt.onend  = () => setState('idle');
    utt.onerror = () => setState('idle');
    window.speechSynthesis.speak(utt);
  };

  // Language change handler 
  const handleLanguageChange = (lang: AppLanguage) => {
    window.speechSynthesis.cancel();
    setLanguage(lang);
    setError('');
  };

  const clearSession = () => {
    window.speechSynthesis.cancel();
    localStorage.removeItem('voice_session_id');
    setSessionId(getSessionId());
    setTurns([]);
    setState('idle');
    setChatOpen(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
        *, body { font-family: 'Poppins', sans-serif !important; margin: 0; }
        @keyframes soundbar { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.07) transparent; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(13,107,58,0.4); }

        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes chat-slide-down {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(24px) scale(0.97); }
        }
        .chat-panel-enter { animation: chat-slide-up   0.28s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .chat-panel-exit  { animation: chat-slide-down 0.22s ease-in forwards; }

        @keyframes badge-pop {
          0%   { transform: scale(0);    }
          70%  { transform: scale(1.25); }
          100% { transform: scale(1);    }
        }
        .badge-pop { animation: badge-pop 0.3s ease-out forwards; }

        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0    rgba(0,166,81,0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(0,166,81,0);    }
          100% { box-shadow: 0 0 0 0    rgba(0,166,81,0);    }
        }
        .pulse-ring { animation: pulse-ring 1.6s ease-out infinite; }
      `}</style>

      <div className={`h-screen text-white flex flex-col overflow-hidden ${
        theme === 'light' ? 'bg-[#f0f4f8]' : 'bg-[#060B15]'
      }`}>

        <Navbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(s => !s)}
          turnCount={turns.length}
          language={language}
          onLanguageChange={handleLanguageChange}
        />

        {/* TTS warning banner */}
        {ttsWarning && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center shrink-0">
            <p className="text-xs text-amber-400 font-medium">⚠️ {ttsWarning}</p>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <Sidebar open={sidebarOpen} turns={turns} sessionId={sessionId} onNewSession={clearSession} />

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

            {/* Avatar fills the whole area */}
            <div className="flex-1 w-full h-full relative">
              <AvatarStage state={state} statusMsg={statusMsg} theme={theme} />

              {/*floating chat*/}
              <FloatingChat
                turns={turns}
                chatOpen={chatOpen}
                setChatOpen={setChatOpen}
                state={state}
                onReplay={(text, lang) => speak(text, lang)}
              />

              {/*theme toggle*/}
              <button
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className="absolute top-4 right-4 z-30 w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
                style={{
                  background:  theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
                  borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)'  : 'rgba(0,0,0,0.12)',
                }}
                title="Toggle theme"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>

            </div>

            {/* Input Bar pinned to bottom */}
            <div className="w-full shrink-0 z-20 relative shadow-[0_-20px_40px_rgba(6,11,21,0.8)]">
              <InputBar
                state={state}
                statusMsg={statusMsg}
                attachedFile={attachedFile}
                error={error}
                onPointerDown={(e) => { e.preventDefault(); if (state === 'idle' || state === 'speaking') startRecording(); }}
                onPointerUp={(e)   => { e.preventDefault(); if (state === 'recording') stopRecording(); }}
                onMicClick={() => { if (state === 'speaking') { window.speechSynthesis.cancel(); setState('idle'); } }}
                onFileChange={setAttachedFile}
              />
            </div>

          </div>
        </div>
      </div>
    </>
  );
}