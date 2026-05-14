import { useRef } from 'react';
import * as THREE from 'three';

//  Key systems:
//  16-viseme phoneme machine  — realistic English phoneme sequencing
//  Jaw spring physics         — mass / stiffness / damping, no lerp snapping
//   Lip coarticulation         — each lip channel has its own inertia
//   Eyelid physics             — independent spring per lid, saccade + drift
//   Emotional arc system       — slow-moving background emotion colours everything
//   Micro-expression beats     — short involuntary brow/cheek/nose pulses
//   Breath pause system        — natural inter-phrase silence
//   Natural asymmetry          — every channel slightly offset L vs R
//   Perlin-style noise layers  — 3-octave layered sines, never periodic
//  Head spring nod            — jaw impulse fires downward head bounce


export function useSpeakingAnimation() {

  //  Phoneme machine 
  const phonemeTimer    = useRef(0);
  const phonemeIndex    = useRef(0);
  const phonemeDuration = useRef(0.08);
  const prevJaw         = useRef(0);

  //  Jaw spring
  const jawPos = useRef(0);
  const jawVel = useRef(0);

  // Per channel smooth targets 
  const sJaw       = useRef(0);
  const sWide      = useRef(0);   // EE / I stretch
  const sPress     = useRef(0);   // B M P bilabial
  const sFunnel    = useRef(0);   // OO W pucker
  const sPucker    = useRef(0);
  const sRollL     = useRef(0);   // lower lip roll (F V T)
  const sRollU     = useRef(0);   // upper lip roll
  const sUpperL    = useRef(0);   // upper lip raise (L side)
  const sUpperR    = useRef(0);   // upper lip raise (R side, lags)
  const sLowerL    = useRef(0);   // lower lip depress (L)
  const sLowerR    = useRef(0);   // lower lip depress (R, lags)
  const sDimpleL   = useRef(0);
  const sDimpleR   = useRef(0);
  const sSmile     = useRef(0.08);
  const sCheekL    = useRef(0);
  const sCheekR    = useRef(0);
  const sSneerL    = useRef(0);
  const sSneerR    = useRef(0);
  // Jaw lateral micro-drift
  const sJawSideVel = useRef(0);
  const sJawSidePos = useRef(0);

  // Eyelid physics (each lid is an independent underdamped spring)
  // Left eye
  const lidLPos = useRef(0);   
  const lidLVel = useRef(0);
  // Right eye
  const lidRPos = useRef(0);
  const lidRVel = useRef(0);
  // Blink trigger
  const blinkTimer2    = useRef(0);          
  const nextBlinkIn    = useRef(3.0 + Math.random() * 3.0);
  const blinkPhase     = useRef<'open'|'closing'|'opening'>('open');
  // Saccade 
  const saccadeTimer   = useRef(0);
  const saccadeTargetX = useRef(0);
  const saccadeTargetY = useRef(0);
  const eyeGazeX       = useRef(0);
  const eyeGazeY       = useRef(0);
  // Eyelid squint accumulator 
  const squintAcc      = useRef(0);

  // Brow channels 
  const sBrowInnerL  = useRef(0);
  const sBrowInnerR  = useRef(0);
  const sBrowDownL   = useRef(0);
  const sBrowDownR   = useRef(0);
  const sBrowOuterL  = useRef(0);
  const sBrowOuterR  = useRef(0);
  // Brow micro-tremor 
  const browTremorL  = useRef(0);
  const browTremorR  = useRef(0);

  // Emotional arc 
  
  const emotionPhase   = useRef(0);
  const emotionTimer   = useRef(0);
  const emotionBlend   = useRef(0);   // 0→1 blend into new phase
  const prevEmotion    = useRef(0);
  // Emotion param outputs (recalculated each frame from blend)
  const eSmile         = useRef(0.08);  // smile bias
  const eBrowInner     = useRef(0);     // brow inner bias
  const eBrowDown      = useRef(0);     // brow furrow bias
  const eEyeWide       = useRef(0);     // eye wide bias
  const eCheek         = useRef(0);     // cheek raise bias

  //  Micro-expression beat system 
  const microTimer  = useRef(0);
  const microPhase  = useRef(0);  // 0=none 1=brow-raise 2=furrow 3=question 4=surprise 5=warm-squint
  const microFade   = useRef(0);

  //  Breath / pause system 
  const breathTimer    = useRef(0);
  const inPause        = useRef(false);
  const pauseDur       = useRef(0);
  const pauseBlend     = useRef(1);    // 1=speaking 0=paused, lerped smoothly

  //  Head nod spring 
  const nodPos = useRef(0);
  const nodVel = useRef(0);

  //  Noise seeds 
  const ns = [
    useRef(Math.random() * 1000),
    useRef(Math.random() * 1000),
    useRef(Math.random() * 1000),
    useRef(Math.random() * 1000),
    useRef(Math.random() * 1000),
    useRef(Math.random() * 1000),
  ];

  //  16-Viseme table 
  // jaw | wide | press | funnel | rollL | rollU | upper | lower | smile | sneer | dur
  type V = [number,number,number,number,number,number,number,number,number,number,number];
  const VISEMES: V[] = [
    // 0  B/M/P  bilabial stop
    [0.00, 0.00, 0.78, 0.00, 0.00, 0.00, 0.00, 0.00, 0.04, 0.00, 0.050],
    // 1  A      open vowel (father)
    [0.72, 0.08, 0.00, 0.00, 0.00, 0.14, 0.24, 0.30, 0.08, 0.00, 0.095],
    // 2  EE/I   high front vowel
    [0.28, 0.75, 0.00, 0.00, 0.00, 0.00, 0.10, 0.00, 0.20, 0.00, 0.085],
    // 3  OO/W   rounded high back
    [0.16, 0.00, 0.00, 0.85, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.085],
    // 4  OH     rounded mid-open
    [0.52, 0.00, 0.00, 0.40, 0.00, 0.00, 0.08, 0.14, 0.04, 0.00, 0.080],
    // 5  UH     mid-central (schwa)
    [0.32, 0.06, 0.00, 0.00, 0.00, 0.00, 0.06, 0.08, 0.06, 0.00, 0.070],
    // 6  EH     mid-front (bet)
    [0.42, 0.28, 0.00, 0.00, 0.00, 0.09, 0.15, 0.10, 0.10, 0.00, 0.075],
    // 7  T/D/N/L tongue-alveolar
    [0.08, 0.12, 0.00, 0.00, 0.28, 0.00, 0.00, 0.00, 0.06, 0.00, 0.045],
    // 8  F/V    labiodental
    [0.10, 0.00, 0.00, 0.00, 0.55, 0.00, 0.00, 0.00, 0.04, 0.06, 0.055],
    // 9  S/Z    sibilant
    [0.14, 0.24, 0.00, 0.00, 0.00, 0.00, 0.05, 0.00, 0.15, 0.00, 0.050],
    // 10 SH/CH  palato-alveolar
    [0.18, 0.00, 0.00, 0.32, 0.00, 0.00, 0.00, 0.00, 0.05, 0.00, 0.060],
    // 11 R      rhotic
    [0.26, 0.00, 0.00, 0.48, 0.12, 0.06, 0.00, 0.00, 0.04, 0.00, 0.065],
    // 12 K/G    velar stop
    [0.04, 0.06, 0.30, 0.00, 0.00, 0.00, 0.00, 0.00, 0.05, 0.00, 0.042],
    // 13 silence micro-pause
    [0.00, 0.00, 0.08, 0.00, 0.00, 0.00, 0.00, 0.00, 0.06, 0.00, 0.038],
    // 14 IH     near-high front (bit)
    [0.20, 0.44, 0.00, 0.00, 0.00, 0.00, 0.06, 0.00, 0.12, 0.00, 0.065],
    // 15 AY     diphthong (face)
    [0.48, 0.38, 0.00, 0.00, 0.00, 0.15, 0.20, 0.16, 0.15, 0.00, 0.090],
  ];

  // Emotion parameter tables  [smile, browInner, browDown, eyeWide, cheek]
  const EMOTIONS = [
    [0.08, 0.00, 0.00, 0.02, 0.05],  // 0 neutral
    [0.14, 0.12, 0.00, 0.06, 0.10],  // 1 engaged
    [0.10, 0.30, 0.10, 0.14, 0.08],  // 2 emphatic
    [0.04, 0.00, 0.18, 0.00, 0.02],  // 3 thoughtful
    [0.20, 0.08, 0.00, 0.04, 0.18],  // 4 warm
  ];

  

  // 3-octave layered noise (never repeats within a session)
  const noise3 = (seed: number, t: number, f1: number, f2: number, f3: number) =>
    Math.sin(t * f1 + seed)         * 0.50 +
    Math.sin(t * f2 + seed * 1.618) * 0.30 +
    Math.sin(t * f3 + seed * 2.718) * 0.20;

  // Smooth ease-in-out
  const ease = (x: number) =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  // Spring step: returns new [pos, vel]
  const springStep = (
    pos: number, vel: number,
    target: number, k: number, d: number,
    dt: number
  ): [number, number] => {
    const f = (target - pos) * k - vel * d;
    const nv = vel + f * dt;
    const np = pos + nv * dt;
    return [np, nv];
  };
  //  runFrame   called every frame by AvatarMesh when state === 'speaking'
   const runFrame = (
    t: number,
    delta: number,
    setMorph: (name: string, value: number) => void,
    headRotX: React.MutableRefObject<number>,
    headRotY: React.MutableRefObject<number>,
  ) => {
    const dt = Math.min(delta, 0.05); // cap at 50ms to avoid physics blow-up

    //  1. BREATH / PAUSE
    breathTimer.current += dt;
    if (!inPause.current && breathTimer.current > 3.2 + Math.random() * 2.8) {
      inPause.current  = true;
      pauseDur.current = 0.10 + Math.random() * 0.20;
      breathTimer.current = 0;
    }
    if (inPause.current && breathTimer.current > pauseDur.current) {
      inPause.current = false;
      breathTimer.current = 0;
    }
    // Smooth breath gate so mouth doesn't snap shut
    pauseBlend.current = THREE.MathUtils.lerp(
      pauseBlend.current,
      inPause.current ? 0.0 : 1.0,
      dt * 14
    );
    const pb = pauseBlend.current;

    //  2. EMOTIONAL ARC 
    emotionTimer.current += dt;
    const emotionInterval = 4.0 + Math.random() * 5.0;
    if (emotionTimer.current > emotionInterval) {
      emotionTimer.current = 0;
      prevEmotion.current  = emotionPhase.current;
      emotionPhase.current = (emotionPhase.current + 1 + Math.floor(Math.random() * 3)) % 5;
      emotionBlend.current = 0;
    }
    emotionBlend.current = Math.min(emotionBlend.current + dt * 0.6, 1); // ~1.7s crossfade
    const eb   = ease(emotionBlend.current);
    const eOld = EMOTIONS[prevEmotion.current];
    const eNew = EMOTIONS[emotionPhase.current];
    const lerp1 = (a: number, b: number) => a + (b - a) * eb;
    eSmile.current    = lerp1(eOld[0], eNew[0]);
    eBrowInner.current= lerp1(eOld[1], eNew[1]);
    eBrowDown.current = lerp1(eOld[2], eNew[2]);
    eEyeWide.current  = lerp1(eOld[3], eNew[3]);
    eCheek.current    = lerp1(eOld[4], eNew[4]);

    //  3. MICRO-EXPRESSION BEATS 
    microTimer.current += dt;
    const microInterval = 1.8 + Math.random() * 2.5;
    if (microTimer.current > microInterval) {
      microTimer.current = 0;
      microPhase.current = (microPhase.current + 1) % 6;
    }
    // fade in 150ms, sustain, fade out 150ms
    const mRaw  = microTimer.current / Math.max(microInterval, 0.001);
    microFade.current =
      mRaw < 0.12 ? mRaw / 0.12 :
      mRaw > 0.88 ? (1 - mRaw) / 0.12 : 1.0;
    const mf = microFade.current;
    const mp = microPhase.current;

    //  4. VISEME / PHONEME MACHINE 
    phonemeTimer.current += dt;
    const pIdx = phonemeIndex.current % VISEMES.length;
    const vis  = VISEMES[pIdx];
    if (phonemeTimer.current >= phonemeDuration.current) {
      phonemeTimer.current = 0;
      phonemeDuration.current = vis[10] * (0.70 + Math.random() * 0.55);
      const roll = Math.random();
      if      (roll < 0.07) phonemeIndex.current += 0; // elongate
      else if (roll < 0.13) phonemeIndex.current += 2; // skip (fast)
      else                  phonemeIndex.current += 1;
      prevJaw.current = vis[0];
    }
    const prog  = Math.min(phonemeTimer.current / Math.max(phonemeDuration.current, 0.001), 1);
    const blend = ease(prog);

    //  5. JAW SPRING DYNAMICS ─
    // Noise: 3 octaves — syllable shimmer + word rhythm + phrase envelope
    const jawNoise =
      noise3(ns[0].current, t, 11.3, 22.7, 37.9) * 0.032 +
      noise3(ns[1].current, t,  4.7,  9.1, 15.3) * 0.018 +
      noise3(ns[2].current, t,  1.9,  3.7,  6.1) * 0.010;

    const jawTarget = vis[0] * blend * pb + Math.abs(jawNoise) * pb;
    const [jPos, jVel] = springStep(jawPos.current, jawVel.current, jawTarget, 280, 16, dt);
    jawPos.current = THREE.MathUtils.clamp(jPos, 0, 0.95);
    jawVel.current = jVel;
    const finalJaw = THREE.MathUtils.clamp(jawPos.current, 0, 0.92);

    sJaw.current = THREE.MathUtils.lerp(sJaw.current, finalJaw, dt * 35);
    setMorph('mouthOpen', sJaw.current);

    //  6. JAW LATERAL MICRO-DRIFT ─
    // Chin subtly drifts left/right with speech — never perfectly centred
    const jawDriftTarget = noise3(ns[3].current, t, 1.1, 2.3, 4.1) * 0.04 * pb;
    const [jdPos, jdVel] = springStep(sJawSidePos.current, sJawSideVel.current, jawDriftTarget, 60, 8, dt);
    sJawSidePos.current = THREE.MathUtils.clamp(jdPos, -0.06, 0.06);
    sJawSideVel.current = jdVel;
    // Apply as small left/right asymmetry on lower lip
    const jawDrift = sJawSidePos.current;

    //  7. LIP CHANNELS ─
    // Each channel uses its OWN lerp speed to model different tissue inertia

    // Wide / EE stretch — snaps open fast (elastic corners), closes slower
    const wT = vis[1] * blend * pb;
    sWide.current = THREE.MathUtils.lerp(sWide.current, wT,
      wT > sWide.current ? dt * 30 : dt * 12);
    setMorph('mouthLeft',  THREE.MathUtils.clamp(sWide.current * 0.78 + jawDrift, 0, 1));
    setMorph('mouthRight', THREE.MathUtils.clamp(sWide.current * 0.70 - jawDrift, 0, 1));

    // Bilabial press — snaps shut hard, peels open slowly
    const pT = vis[2] * blend * pb;
    sPress.current = THREE.MathUtils.lerp(sPress.current, pT,
      pT > sPress.current ? dt * 38 : dt * 16);
    setMorph('mouthClose',      sPress.current * 0.95);
    setMorph('mouthPressLeft',  sPress.current * 0.38);
    setMorph('mouthPressRight', sPress.current * 0.32); // slight asymmetry

    // Funnel / OO — medium inertia (lips heavier than corners)
    const fT = vis[3] * blend * pb;
    sFunnel.current = THREE.MathUtils.lerp(sFunnel.current, fT, dt * 20);
    setMorph('mouthFunnel', sFunnel.current * 0.68);

    // Pucker — lags behind funnel slightly (different muscle group)
    sPucker.current = THREE.MathUtils.lerp(sPucker.current, fT * 0.72, dt * 16);
    setMorph('mouthPucker', sPucker.current * 0.50);

    // Lower lip roll (F/V, T/D) — fast twitch muscle
    const rlT = vis[4] * blend * pb;
    sRollL.current = THREE.MathUtils.lerp(sRollL.current, rlT, dt * 32);
    setMorph('mouthRollLower', sRollL.current);

    // Upper lip roll — slower, more subtle
    const ruT = vis[5] * blend * pb;
    sRollU.current = THREE.MathUtils.lerp(sRollU.current, ruT, dt * 22);
    setMorph('mouthRollUpper', sRollU.current);

    //  8. UPPER / LOWER LIP DEPRESS — asymmetric sides ─
    const ulT = vis[6] * blend * pb;
    const llT = vis[7] * blend * pb;
    // Left leads, right lags by ~1 frame equivalent
    sUpperL.current = THREE.MathUtils.lerp(sUpperL.current, ulT,          dt * 26);
    sUpperR.current = THREE.MathUtils.lerp(sUpperR.current, ulT * 0.88,   dt * 22);
    sLowerL.current = THREE.MathUtils.lerp(sLowerL.current, llT + jawDrift * 0.5, dt * 22);
    sLowerR.current = THREE.MathUtils.lerp(sLowerR.current, llT - jawDrift * 0.5, dt * 20);
    setMorph('mouthUpperUpLeft',    sUpperL.current);
    setMorph('mouthUpperUpRight',   sUpperR.current);
    setMorph('mouthLowerDownLeft',  sLowerL.current);
    setMorph('mouthLowerDownRight', sLowerR.current);

    //  9. SMILE — emotion-biased + vowel accent ─
    const smileTarget = eSmile.current
      + vis[8] * blend          // phoneme's own smile component
      + (finalJaw > 0.38 ? 0.06 : 0)   // jaw-open bonus
      + (mp === 5 ? 0.12 * mf : 0);    // warm-squint micro beat
    sSmile.current = THREE.MathUtils.lerp(sSmile.current, smileTarget * pb + 0.04, dt * 7);
    setMorph('mouthSmile', sSmile.current);

    // Dimples deepen with smile, asymmetric
    sDimpleL.current = THREE.MathUtils.lerp(sDimpleL.current, sSmile.current * 0.58, dt * 10);
    sDimpleR.current = THREE.MathUtils.lerp(sDimpleR.current, sSmile.current * 0.50, dt * 11);
    setMorph('mouthDimpleLeft',  sDimpleL.current);
    setMorph('mouthDimpleRight', sDimpleR.current);

    //  10. NOSE SNEER — F/V consonants lift the nostril 
    const sneerT = vis[9] * blend * pb;
    sSneerL.current = THREE.MathUtils.lerp(sSneerL.current, sneerT * 0.65, dt * 18);
    sSneerR.current = THREE.MathUtils.lerp(sSneerR.current, sneerT * 0.48, dt * 18);
    setMorph('noseSneerLeft',  sSneerL.current);
    setMorph('noseSneerRight', sSneerR.current);

    //  11. CHEEKS — emotion + smile + open vowel ─
    const cheekBase = eCheek.current + sSmile.current * 0.52 + (finalJaw > 0.44 ? 0.09 : 0);
    sCheekL.current = THREE.MathUtils.lerp(sCheekL.current, cheekBase,        dt * 6);
    sCheekR.current = THREE.MathUtils.lerp(sCheekR.current, cheekBase * 0.90, dt * 6);
    setMorph('cheekSquintLeft',  sCheekL.current);
    setMorph('cheekSquintRight', sCheekR.current);

    //  12. BROW MICRO-TREMOR 
    // Eyebrows are never perfectly still — tiny 2–4 Hz involuntary tremor
    browTremorL.current = noise3(ns[4].current, t, 2.3, 5.1, 8.7) * 0.018;
    browTremorR.current = noise3(ns[5].current, t, 2.1, 4.9, 8.3) * 0.018;

    //  13. BROW CHANNELS — emotion + micro-beat 
    // Inner up
    const biTarget =
      eBrowInner.current
      + (mp === 1 ? 0.40 * mf : 0)   // brow-raise beat
      + (mp === 4 ? 0.55 * mf : 0)   // surprise beat
      + browTremorL.current;
    sBrowInnerL.current = THREE.MathUtils.lerp(sBrowInnerL.current, biTarget,          dt * 5);
    sBrowInnerR.current = THREE.MathUtils.lerp(sBrowInnerR.current, biTarget * 0.88,   dt * 5);
    setMorph('browInnerUp', (sBrowInnerL.current + sBrowInnerR.current) * 0.5);

    // Down / furrow
    const bdTarget =
      eBrowDown.current
      + (mp === 2 ? 0.30 * mf : 0)   // focus beat
      + browTremorL.current * 0.5;
    sBrowDownL.current = THREE.MathUtils.lerp(sBrowDownL.current, bdTarget,         dt * 4);
    sBrowDownR.current = THREE.MathUtils.lerp(sBrowDownR.current, bdTarget * 0.82,  dt * 4);
    setMorph('browDownLeft',  sBrowDownL.current);
    setMorph('browDownRight', sBrowDownR.current);

    // Outer up (questioning — mainly one side)
    const boTarget = mp === 3 ? 0.38 * mf : 0;
    sBrowOuterL.current = THREE.MathUtils.lerp(sBrowOuterL.current, boTarget,        dt * 4);
    sBrowOuterR.current = THREE.MathUtils.lerp(sBrowOuterR.current, boTarget * 0.20, dt * 4);
    setMorph('browOuterUpLeft',  sBrowOuterL.current);
    setMorph('browOuterUpRight', sBrowOuterR.current);

    //  14. EYELID PHYSICS 
    // Independent underdamped spring per lid for natural asymmetric blinking
    blinkTimer2.current += dt;
    if (blinkTimer2.current >= nextBlinkIn.current && blinkPhase.current === 'open') {
      blinkPhase.current   = 'closing';
      blinkTimer2.current  = 0;
      nextBlinkIn.current  = 2.8 + Math.random() * 3.5;
    }

    let lidTarget = 0; // open
    if (blinkPhase.current === 'closing') {
      // Drive lids to close in ~55ms
      lidTarget = 1;
      if (lidLPos.current > 0.92) {
        blinkPhase.current = 'opening';
      }
    }
    if (blinkPhase.current === 'opening') {
      lidTarget = 0;
      if (lidLPos.current < 0.05) {
        blinkPhase.current = 'open';
      }
    }

    // Left lid spring — slightly faster
    const [llPos, llVel] = springStep(lidLPos.current, lidLVel.current, lidTarget, 520, 22, dt);
    lidLPos.current = THREE.MathUtils.clamp(llPos, 0, 1);
    lidLVel.current = llVel;

    // Right lid spring — tiny lag (perfectly synchronous lids look CG)
    const rightTarget = THREE.MathUtils.lerp(lidTarget, lidLPos.current, 0.08);
    const [lrPos, lrVel] = springStep(lidRPos.current, lidRVel.current, rightTarget, 480, 21, dt);
    lidRPos.current = THREE.MathUtils.clamp(lrPos, 0, 1);
    lidRVel.current = lrVel;

    // Squint accumulator — builds up during emotional or intense speech
    const squintTarget = eEyeWide.current * 0.5
      + (mp === 5 ? 0.14 * mf : 0)   // warm squint
      + (mp === 2 ? 0.18 * mf : 0)   // focus squint
      + (finalJaw > 0.50 ? 0.07 : 0); // natural squint on wide mouth
    squintAcc.current = THREE.MathUtils.lerp(squintAcc.current, squintTarget, dt * 5);

    // Apply blink + squint to morph targets
    setMorph('eyeBlinkLeft',   THREE.MathUtils.clamp(lidLPos.current + squintAcc.current * 0.4, 0, 1));
    setMorph('eyeBlinkRight',  THREE.MathUtils.clamp(lidRPos.current + squintAcc.current * 0.4, 0, 1));
    setMorph('eyeSquintLeft',  squintAcc.current);
    setMorph('eyeSquintRight', squintAcc.current * 0.90);

    // Eye wide — surprise / emotion, recedes during squint
    const eyeWideTarget = eEyeWide.current
      + (mp === 4 ? 0.25 * mf : 0)   // surprise beat
      - squintAcc.current * 0.5;
    setMorph('eyeWideLeft',  THREE.MathUtils.clamp(eyeWideTarget, 0, 1));
    setMorph('eyeWideRight', THREE.MathUtils.clamp(eyeWideTarget * 0.88, 0, 1));

    //  15. SACCADE — tiny involuntary eye dart every 0.8–2 s ─
    saccadeTimer.current += dt;
    if (saccadeTimer.current > 0.8 + Math.random() * 1.2) {
      saccadeTimer.current  = 0;
      // Very small — just enough to feel alive, not enough to look broken
      saccadeTargetX.current = (Math.random() - 0.5) * 0.022;
      saccadeTargetY.current = (Math.random() - 0.5) * 0.012;
    }
    eyeGazeX.current = THREE.MathUtils.lerp(eyeGazeX.current, saccadeTargetX.current, dt * 18);
    eyeGazeY.current = THREE.MathUtils.lerp(eyeGazeY.current, saccadeTargetY.current, dt * 18);
    // Saccade drives a micro head tilt (eyes and head move together)
    headRotY.current = THREE.MathUtils.lerp(
      headRotY.current,
      eyeGazeX.current * 0.35,
      dt * 4
    );

    //  16. HEAD NOD — jaw impulse fires downward bounce ─
    const jawImpulse = Math.max(0, finalJaw - prevJaw.current) * 0.55;
    nodVel.current += jawImpulse * 0.5;
    const [nPos, nVel] = springStep(nodPos.current, nodVel.current, 0, 18, 5, dt);
    nodPos.current = nPos;
    nodVel.current = nVel;

    // Conversational head drift — two slow sines at irrational ratio
    const driftX = Math.sin(t * 0.72) * 0.024 + Math.sin(t * 1.87) * 0.009 + nodPos.current;
    const driftY = Math.sin(t * 0.53) * 0.030 + Math.sin(t * 1.41) * 0.011 + eyeGazeX.current * 0.35;
    headRotX.current = THREE.MathUtils.lerp(headRotX.current, driftX, dt * 3.2);
    headRotY.current = THREE.MathUtils.lerp(headRotY.current, driftY, dt * 2.8);

    //  17. BREATH PAUSE CLEANUP — smooth close ─
    if (inPause.current) {
      sJaw.current    = THREE.MathUtils.lerp(sJaw.current,    0,    dt * 10);
      sWide.current   = THREE.MathUtils.lerp(sWide.current,   0,    dt * 8);
      sFunnel.current = THREE.MathUtils.lerp(sFunnel.current, 0,    dt * 8);
      sPucker.current = THREE.MathUtils.lerp(sPucker.current, 0,    dt * 8);
      sPress.current  = THREE.MathUtils.lerp(sPress.current,  0.06, dt * 6);
      setMorph('mouthOpen',  sJaw.current);
      setMorph('mouthClose', sPress.current);
    }

    // Update prevJaw for next frame impulse detection
    prevJaw.current = finalJaw;
  };

  return { runFrame };
}