'use client';
import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { AgentState } from './types';

// Use absolute paths starting with '/' to ensure Next.js finds them in the public folder
const AVATAR_URL  = '/avatar5.glb';
const IDLE_URL    = '/idle.glb';
const TALKING_URL = '/Talking.glb';

interface Props {
  state: AgentState;
  statusMsg: string;
  audioElementRef?: React.RefObject<HTMLAudioElement | null>;
}

// ─────────────────────────────────────────────────────────────────
// RETARGET FIX: We must create a brand new track, not just clone it.
// ─────────────────────────────────────────────────────────────────
function retargetClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => {
    const fixedName = track.name.replace(/mixamorig/gi, '');
    // This forces Three.js to rebuild the internal bindings with the new name
    return new (track.constructor as any)(fixedName, track.times, track.values);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// ─────────────────────────────────────────────────────────────────
// AvatarMesh
// ─────────────────────────────────────────────────────────────────
function AvatarMesh({ state }: Omit<Props, 'statusMsg'>) {
  const { scene }                 = useGLTF(AVATAR_URL);
  const { animations: idleAnims } = useGLTF(IDLE_URL);
  const { animations: talkAnims } = useGLTF(TALKING_URL);

  const mixer       = useRef<THREE.AnimationMixer | null>(null);
  const idleAction  = useRef<THREE.AnimationAction | null>(null);
  const talkAction  = useRef<THREE.AnimationAction | null>(null);

  // Retarget both clips
  const idleClip = useMemo(() => idleAnims?.length ? retargetClip(idleAnims[0]) : null, [idleAnims]);
  const talkClip = useMemo(() => talkAnims?.length ? retargetClip(talkAnims[0]) : null, [talkAnims]);

  // Find Morph Targets for the face
  const morphMeshes = useMemo(() => {
    const found: THREE.SkinnedMesh[] = [];
    scene.traverse((obj: any) => {
      if (obj.isMesh && obj.morphTargetDictionary) found.push(obj);
    });
    return found;
  }, [scene]);

  const setMorph = (name: string, value: number) => {
    const aliases: Record<string, string[]> = {
      mouthOpen:     ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_O'],
      eyeBlinkLeft:  ['eyeBlinkLeft',  'eye_blink_left'],
      eyeBlinkRight: ['eyeBlinkRight', 'eye_blink_right'],
      mouthSmile:    ['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight'],
      browInnerUp:   ['browInnerUp'],
      browDownLeft:  ['browDownLeft'],
      browDownRight: ['browDownRight'],
    };
    const targets = aliases[name] ?? [name];
    for (const mesh of morphMeshes) {
      if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) continue;
      for (const t of targets) {
        const idx = mesh.morphTargetDictionary[t];
        if (idx !== undefined) {
          mesh.morphTargetInfluences[idx] = THREE.MathUtils.clamp(value, 0, 1);
          break;
        }
      }
    }
  };

  // ── Setup Animation Mixer & Actions ────────────────────────────
  useEffect(() => {
    mixer.current = new THREE.AnimationMixer(scene);
    
    if (idleClip) {
      idleAction.current = mixer.current.clipAction(idleClip);
      idleAction.current.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (talkClip) {
      talkAction.current = mixer.current.clipAction(talkClip);
      talkAction.current.setLoop(THREE.LoopRepeat, Infinity);
    }

    // Play Idle immediately on load
    idleAction.current?.play();

    return () => {
      mixer.current?.stopAllAction();
      mixer.current = null;
    };
  }, [scene, idleClip, talkClip]);

  // ── Smooth Crossfading Between States ──────────────────────────
  useEffect(() => {
    if (!idleAction.current || !talkAction.current) return;

    if (state === 'speaking') {
      // Fade out idle, fade in talking
      talkAction.current.reset().fadeIn(0.5).play();
      idleAction.current.fadeOut(0.5);
    } else {
      // Fade out talking, fade in idle
      idleAction.current.reset().fadeIn(0.5).play();
      talkAction.current.fadeOut(0.5);
    }
  }, [state]);

  // ── Blink state refs ───────────────────────────────────────────
  const blinkTimer = useRef(0);
  const blinkState = useRef(0);
  const headRotX   = useRef(0);
  const headRotY   = useRef(0);

  // ── Per-frame Updates ──────────────────────────────────────────
  useFrame((three, delta) => {
    const t = three.clock.elapsedTime;

    // Update full-body animations
    mixer.current?.update(delta);

    // ── BLINK ─────────────────────────────────────────────────
    blinkTimer.current += delta;
    const blinkAt = 3.5;
    if (blinkTimer.current > blinkAt && blinkState.current === 0) blinkState.current = 1;
    if (blinkState.current === 1) {
      const v = Math.min((blinkTimer.current - blinkAt) / 0.055, 1);
      setMorph('eyeBlinkLeft', v); setMorph('eyeBlinkRight', v);
      if (v >= 1) blinkState.current = 2;
    }
    if (blinkState.current === 2) {
      const v = Math.max(1 - (blinkTimer.current - blinkAt - 0.055) / 0.08, 0);
      setMorph('eyeBlinkLeft', v); setMorph('eyeBlinkRight', v);
      if (v <= 0) { blinkState.current = 0; blinkTimer.current = 0; }
    }

    // ── FACIAL EXPRESSIONS ────────────────────────────────────
    if (state === 'idle') {
      setMorph('mouthSmile', 0.12);
      setMorph('mouthOpen', 0);
      setMorph('browDownLeft', 0);
      setMorph('browDownRight', 0);
      headRotX.current = THREE.MathUtils.lerp(headRotX.current, 0, delta * 2);
      headRotY.current = THREE.MathUtils.lerp(headRotY.current, 0, delta * 2);
    }
    if (state === 'recording') {
      setMorph('mouthSmile', 0.2);
      setMorph('browInnerUp', 0.25);
      setMorph('mouthOpen', 0);
      headRotX.current = THREE.MathUtils.lerp(headRotX.current, Math.sin(t * 1.2) * 0.03, delta * 3);
      headRotY.current = THREE.MathUtils.lerp(headRotY.current, 0, delta * 3);
    }
    if (state === 'thinking') {
      setMorph('mouthSmile', 0);
      setMorph('browDownLeft', 0.28);
      setMorph('browDownRight', 0.28);
      setMorph('mouthOpen', 0);
      headRotX.current = THREE.MathUtils.lerp(headRotX.current, -0.14, delta * 1.5);
      headRotY.current = THREE.MathUtils.lerp(headRotY.current,  0.18, delta * 1.5);
    }
    if (state === 'speaking') {
      setMorph('browDownLeft', 0);
      setMorph('browDownRight', 0);
      setMorph('mouthSmile', 0.09);
      headRotX.current = THREE.MathUtils.lerp(headRotX.current, Math.sin(t * 0.8) * 0.03, delta * 3);
      headRotY.current = THREE.MathUtils.lerp(headRotY.current, Math.sin(t * 0.6) * 0.04, delta * 3);

      // Procedural Lip Sync
      const jaw      = Math.abs(Math.sin(t * 8.5))  * 0.50;
      const flutter  = Math.abs(Math.sin(t * 15.0)) * 0.20;
      const syllable = Math.abs(Math.sin(t * 5.8))  * 0.25;
      const noise    = (Math.random() - 0.5) * 0.06;
      setMorph('mouthOpen', THREE.MathUtils.clamp(jaw + flutter + syllable + noise, 0, 0.9));
    }

    // Apply head rotation
    const headNode = scene.getObjectByName('Head') || scene.getObjectByName('mixamorigHead');
    if (headNode) {
      headNode.rotation.x = headRotX.current;
      headNode.rotation.y = headRotY.current;
    }
  });

  return <primitive object={scene} scale={0.82} position={[0, -0.9, 0]} />;
}

// ── Status label ──────────────────────────────────────────────────
function StatusLabel({ state, msg }: { state: AgentState; msg: string }) {
  const color = { idle: 'text-white/30', recording: 'text-red-400', thinking: 'text-blue-400', speaking: 'text-green-400' }[state];
  const dot   = { idle: 'bg-white/20', recording: 'bg-red-400 animate-ping', thinking: 'bg-blue-400 animate-pulse', speaking: 'bg-green-400 animate-pulse' }[state];
  return (
    <div className="flex items-center gap-2 justify-center mt-3">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`text-xs font-medium tracking-widest uppercase ${color}`}>{msg}</span>
    </div>
  );
}

// ── Sound waves ───────────────────────────────────────────────────
function SoundWaves({ state }: { state: AgentState }) {
  if (state !== 'speaking' && state !== 'recording') return null;
  const color = state === 'speaking' ? '#00A651' : '#ef4444';
  return (
    <div className="flex items-end justify-center gap-0.5 h-8 mt-2">
      {[4, 8, 14, 20, 16, 10, 6, 12, 18, 14, 8, 4].map((h, i) => (
        <div key={i} className="w-1 rounded-full" style={{
          height: `${h}px`, backgroundColor: color,
          animation: `soundbar ${0.4 + (i % 3) * 0.15}s ease-in-out ${i * 0.05}s infinite alternate`,
          opacity: 0.7 + (i % 2) * 0.3,
        }} />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────
export default function AvatarStage({ state, statusMsg, audioElementRef }: Props) {
  return (
    <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060B15 0%, #08111f 60%, #060B15 100%)' }}
    >
      <div className="w-full h-full relative flex-1">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 sm:w-96 sm:h-96 rounded-full blur-[100px] transition-all duration-1000" style={{
            backgroundColor: state === 'speaking' ? 'rgba(0,166,81,0.12)'
              : state === 'recording' ? 'rgba(239,68,68,0.12)'
              : state === 'thinking'  ? 'rgba(0,112,184,0.12)'
              : 'rgba(255,255,255,0.04)',
          }} />
        </div>

        <Canvas camera={{ position: [0, 0.5, 1.2], fov: 45 }} gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent', width: '100%', height: '100%' }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[1, 2, 2]} intensity={1.2} />
          <directionalLight position={[-1, 0, 1]} intensity={0.4} color="#4488ff" />
          <directionalLight position={[0, -1, 0]} intensity={0.2} color="#ff8844" />
          <Environment preset="city" />
          <Suspense fallback={null}>
            <AvatarMesh state={state} audioElementRef={audioElementRef} />
            <ContactShadows position={[0, -1.6, 0]} opacity={0.3} scale={1} blur={1} />
          </Suspense>
        </Canvas>
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-10 flex flex-col items-center pointer-events-none">
        <SoundWaves state={state} />
        <StatusLabel state={state} msg={statusMsg} />
      </div>
    </div>
  );
}

useGLTF.preload(AVATAR_URL);
useGLTF.preload(IDLE_URL);
useGLTF.preload(TALKING_URL);