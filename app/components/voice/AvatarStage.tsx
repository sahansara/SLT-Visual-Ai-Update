'use client';

import { Suspense, useRef, useEffect, useMemo } from 'react';

import { Canvas, useFrame } from '@react-three/fiber';

import { useGLTF, Environment, ContactShadows } from '@react-three/drei';

import * as THREE from 'three';

import { AgentState } from './types';



// ── GLB files — all must be inside /public folder ─────────────────

const AVATAR_URL = '/agent_men.glb';

const IDLE_URL = '/Standing_Idle.glb';

const TALKING_URL = '/Talking.glb';



interface Props {

  state: AgentState;

  statusMsg: string;

  audioElementRef?: React.RefObject<HTMLAudioElement | null>;

}



// ─────────────────────────────────────────────────────────────────

// Mixamo bones:  "mixamorigHips.position"

// Avaturn bones: "Hips.position"

// Strip the prefix so Three.js can find the bones on your avatar.

// ─────────────────────────────────────────────────────────────────

function retargetClip(clip: THREE.AnimationClip): THREE.AnimationClip {

  const tracks = clip.tracks.map((track) => {

    const clone = track.clone();

    clone.name = clone.name.replace(/^mixamorig/i, '');

    return clone;

  });

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);

}



function AvatarMesh({ state }: Omit<Props, 'statusMsg'>) {

  const { scene } = useGLTF(AVATAR_URL);

  const { animations: idleRaw } = useGLTF(IDLE_URL);

  const { animations: talkRaw } = useGLTF(TALKING_URL);



  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const idleActionRef = useRef<THREE.AnimationAction | null>(null);

  const talkActionRef = useRef<THREE.AnimationAction | null>(null);

  const hasLogged = useRef(false);

  const blinkTimer = useRef(0);

  const blinkState = useRef(0);

  const headRotX = useRef(0);

  const headRotY = useRef(0);



  // ── retarget both clips once ───────────────────────────────────

  const idleClip = useMemo(() => {

    if (!idleRaw?.length) { console.warn('⚠️ No animations in idle.glb'); return null; }

    const c = retargetClip(idleRaw[0]);

    console.log('✅ Idle clip ready:', c.name, '| tracks:', c.tracks.slice(0, 3).map(t => t.name));

    return c;

  }, [idleRaw]);



  const talkClip = useMemo(() => {

    if (!talkRaw?.length) { console.warn('⚠️ No animations in Talking.glb'); return null; }

    const c = retargetClip(talkRaw[0]);

    console.log('✅ Talk clip ready:', c.name, '| tracks:', c.tracks.slice(0, 3).map(t => t.name));

    return c;

  }, [talkRaw]);



  // ── morph meshes for lip sync + expressions ───────────────────

  const morphMeshes = useMemo(() => {

    const found: THREE.SkinnedMesh[] = [];

    scene.traverse((obj) => {

      const m = obj as THREE.SkinnedMesh;

      if (m.isMesh && m.morphTargetDictionary) found.push(m);

    });

    return found;

  }, [scene]);



  const setMorph = (name: string, value: number) => {

    const aliases: Record<string, string[]> = {

      mouthOpen: ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_O'],

      eyeBlinkLeft: ['eyeBlinkLeft', 'eye_blink_left'],

      eyeBlinkRight: ['eyeBlinkRight', 'eye_blink_right'],

      mouthSmile: ['mouthSmile', 'mouthSmileLeft'],

      browInnerUp: ['browInnerUp'],

      browDownLeft: ['browDownLeft'],

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



  // ── create mixer + both actions once clips are ready ──────────

  useEffect(() => {

    if (!idleClip && !talkClip) return;



    const mixer = new THREE.AnimationMixer(scene);

    mixerRef.current = mixer;



    if (idleClip) {

      const a = mixer.clipAction(idleClip);

      a.setLoop(THREE.LoopRepeat, Infinity);

      a.setEffectiveWeight(1);

      a.setEffectiveTimeScale(1);

      idleActionRef.current = a;

    }



    if (talkClip) {

      const a = mixer.clipAction(talkClip);

      a.setLoop(THREE.LoopRepeat, Infinity);

      a.setEffectiveWeight(0);

      a.setEffectiveTimeScale(1);

      talkActionRef.current = a;

    }



    // start idle immediately

    idleActionRef.current?.reset().play();

    console.log('🎬 Mixer ready — idle playing');



    return () => {

      mixer.stopAllAction();

      mixer.uncacheRoot(scene);

      mixerRef.current = null;

      idleActionRef.current = null;

      talkActionRef.current = null;

    };

  }, [scene, idleClip, talkClip]);



  // ── crossfade between idle ↔ talking when state changes ───────

  useEffect(() => {

    const idle = idleActionRef.current;

    const talk = talkActionRef.current;



    if (state === 'speaking') {

      // ensure both are playing, crossfade idle → talk

      if (idle && !idle.isRunning()) idle.reset().play();

      if (talk) {

        talk.reset().play();

        if (idle) idle.crossFadeTo(talk, 0.4, true);

        else talk.fadeIn(0.4);

      }

      console.log('▶️ Crossfade → talking');

    } else {

      // crossfade talk → idle

      if (talk && !talk.isRunning()) talk.reset().play();

      if (idle) {

        idle.reset().play();

        if (talk) talk.crossFadeTo(idle, 0.5, true);

        else idle.fadeIn(0.5);

      }

      console.log('⏹️ Crossfade → idle');

    }

  }, [state]);



  // ── debug bones once ──────────────────────────────────────────

  useEffect(() => {

    if (hasLogged.current) return;

    hasLogged.current = true;

    const bones: string[] = [];

    scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o.name); });

    console.log('🦴 Avatar bones (first 8):', bones.slice(0, 8).join(', '));

  }, [scene]);



  // ── per-frame: advance mixer + blink + head + lip sync ────────

  useFrame((three, delta) => {

    const t = three.clock.elapsedTime;

    mixerRef.current?.update(delta);



    // blink

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



    // expressions

    if (state === 'idle') {

      setMorph('mouthSmile', 0.12);

      setMorph('mouthOpen', 0);

      setMorph('browDownLeft', 0); setMorph('browDownRight', 0);

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

      setMorph('browDownLeft', 0.28); setMorph('browDownRight', 0.28);

      setMorph('mouthOpen', 0);

      headRotX.current = THREE.MathUtils.lerp(headRotX.current, -0.14, delta * 1.5);

      headRotY.current = THREE.MathUtils.lerp(headRotY.current, 0.18, delta * 1.5);

    }

    if (state === 'speaking') {

      setMorph('browDownLeft', 0); setMorph('browDownRight', 0);

      setMorph('mouthSmile', 0.09);

      headRotX.current = THREE.MathUtils.lerp(headRotX.current, Math.sin(t * 0.8) * 0.03, delta * 3);

      headRotY.current = THREE.MathUtils.lerp(headRotY.current, Math.sin(t * 0.6) * 0.04, delta * 3);

      // layered lip sync

      const mouth = THREE.MathUtils.clamp(

        Math.abs(Math.sin(t * 8.5)) * 0.50 +

        Math.abs(Math.sin(t * 15.0)) * 0.20 +

        Math.abs(Math.sin(t * 5.8)) * 0.25 +

        (Math.random() - 0.5) * 0.06,

        0, 0.9

      );

      setMorph('mouthOpen', mouth);

    }



    scene.rotation.x = headRotX.current;

    scene.rotation.y = headRotY.current;

  });



  // ── your exact values ─────────────────────────────────────────

  return <primitive object={scene} scale={0.8} position={[0, -1.2, 0]} />;

}



function StatusLabel({ state, msg }: { state: AgentState; msg: string }) {

  const color = { idle: 'text-white/30', recording: 'text-red-400', thinking: 'text-blue-400', speaking: 'text-green-400' }[state];

  const dot = { idle: 'bg-white/20', recording: 'bg-red-400 animate-ping', thinking: 'bg-blue-400 animate-pulse', speaking: 'bg-green-400 animate-pulse' }[state];

  return (

    <div className="flex items-center gap-2 justify-center mt-3">

      <span className={`w-2 h-2 rounded-full ${dot}`} />

      <span className={`text-xs font-medium tracking-widest uppercase ${color}`}>{msg}</span>

    </div>

  );

}



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

                : state === 'thinking' ? 'rgba(0,112,184,0.12)'

                  : 'rgba(255,255,255,0.04)',

          }} />

        </div>



        {/* your exact camera values */}

        <Canvas camera={{ position: [0, 0.8, 1.6], fov: 45 }} gl={{ antialias: true, alpha: true }}

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