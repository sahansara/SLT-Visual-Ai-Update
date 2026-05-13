import { useRef } from 'react';
import * as THREE from 'three';

export function useSpeakingAnimation() {
  const phonemeTimer    = useRef(0);
  const phonemeIndex    = useRef(0);
  const phonemeDuration = useRef(0.08);
  const sJaw        = useRef(0);
  const sWide       = useRef(0);
  const sPress      = useRef(0);
  const sFunnel     = useRef(0);
  const sUpperLip   = useRef(0);
  const sLowerLip   = useRef(0);
  const sDimple     = useRef(0);
  const sSmile      = useRef(0.09);
  const sCheek      = useRef(0);
  const sRollLower  = useRef(0);
  const sRollUpper  = useRef(0);
  const sBrowInner  = useRef(0);
  const sBrowDown   = useRef(0);
  const sBrowOuter  = useRef(0);
  const sEyeWide    = useRef(0);
  const sEyeSquint  = useRef(0);
  const sNoseSneer  = useRef(0);
  const breathTimer    = useRef(0);
  const inBreathPause  = useRef(false);
  const breathPauseDur = useRef(0);
  const microTimer  = useRef(0);
  const microPhase  = useRef(0);
  const headNodVel  = useRef(0);
  const headNodPos  = useRef(0);
  const jawVel      = useRef(0);
  const jawPos      = useRef(0);
  const ns1 = useRef(Math.random() * 100);
  const ns2 = useRef(Math.random() * 100);
  const ns3 = useRef(Math.random() * 100);
  const prevPhonemeJaw = useRef(0);

  type Viseme = {
    jaw: number; wide: number; press: number; funnel: number;
    rollL: number; rollU: number; upper: number; lower: number;
    smile: number; sneer: number; dur: number;
  };

  const VISEMES: Viseme[] = [
    { jaw:0.0,  wide:0.0,  press:0.72, funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.05, sneer:0.0,  dur:0.055 },
    { jaw:0.68, wide:0.08, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.12, upper:0.22, lower:0.28, smile:0.08, sneer:0.0,  dur:0.100 },
    { jaw:0.30, wide:0.70, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.10, lower:0.0,  smile:0.18, sneer:0.0,  dur:0.090 },
    { jaw:0.18, wide:0.0,  press:0.0,  funnel:0.80, rollL:0.0,  rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.0,  sneer:0.0,  dur:0.090 },
    { jaw:0.50, wide:0.0,  press:0.0,  funnel:0.38, rollL:0.0,  rollU:0.0,  upper:0.08, lower:0.12, smile:0.04, sneer:0.0,  dur:0.085 },
    { jaw:0.35, wide:0.05, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.06, lower:0.08, smile:0.07, sneer:0.0,  dur:0.075 },
    { jaw:0.40, wide:0.25, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.08, upper:0.14, lower:0.10, smile:0.10, sneer:0.0,  dur:0.080 },
    { jaw:0.10, wide:0.10, press:0.0,  funnel:0.0,  rollL:0.30, rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.06, sneer:0.0,  dur:0.050 },
    { jaw:0.12, wide:0.0,  press:0.0,  funnel:0.0,  rollL:0.50, rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.04, sneer:0.05, dur:0.060 },
    { jaw:0.15, wide:0.22, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.05, lower:0.0,  smile:0.14, sneer:0.0,  dur:0.055 },
    { jaw:0.20, wide:0.0,  press:0.0,  funnel:0.30, rollL:0.0,  rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.05, sneer:0.0,  dur:0.065 },
    { jaw:0.28, wide:0.0,  press:0.0,  funnel:0.45, rollL:0.10, rollU:0.05, upper:0.0,  lower:0.0,  smile:0.04, sneer:0.0,  dur:0.070 },
    { jaw:0.05, wide:0.05, press:0.28, funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.05, sneer:0.0,  dur:0.045 },
    { jaw:0.0,  wide:0.0,  press:0.10, funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.0,  lower:0.0,  smile:0.07, sneer:0.0,  dur:0.040 },
    { jaw:0.22, wide:0.42, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.0,  upper:0.06, lower:0.0,  smile:0.12, sneer:0.0,  dur:0.070 },
    { jaw:0.45, wide:0.35, press:0.0,  funnel:0.0,  rollL:0.0,  rollU:0.14, upper:0.18, lower:0.14, smile:0.14, sneer:0.0,  dur:0.095 },
  ];

  const runFrame = (
    t: number,
    delta: number,
    setMorph: (name: string, value: number) => void,
    headRotX: React.MutableRefObject<number>,
    headRotY: React.MutableRefObject<number>,
  ) => {
    const noise = (seed: number, f1: number, f2: number, f3: number) =>
      Math.sin(t * f1 + seed) * 0.5 +
      Math.sin(t * f2 + seed * 1.3) * 0.3 +
      Math.sin(t * f3 + seed * 2.1) * 0.2;
    const easeInOut = (x: number) =>
      x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

    // Breath pause
    breathTimer.current += delta;
    if (!inBreathPause.current && breathTimer.current > 3.0 + Math.random() * 3.0) {
      inBreathPause.current = true;
      breathPauseDur.current = 0.12 + Math.random() * 0.18;
      breathTimer.current = 0;
    }
    if (inBreathPause.current && breathTimer.current > breathPauseDur.current) {
      inBreathPause.current = false;
      breathTimer.current = 0;
    }
    const breathMult = inBreathPause.current ? 0.0 : 1.0;

    // Viseme
    phonemeTimer.current += delta;
    const pIdx = phonemeIndex.current % VISEMES.length;
    const vis  = VISEMES[pIdx];
    if (phonemeTimer.current >= phonemeDuration.current) {
      phonemeTimer.current = 0;
      phonemeDuration.current = vis.dur * (0.75 + Math.random() * 0.5);
      const roll = Math.random();
      if (roll < 0.08) phonemeIndex.current += 0;
      else if (roll < 0.14) phonemeIndex.current += 2;
      else phonemeIndex.current += 1;
      prevPhonemeJaw.current = vis.jaw;
    }
    const progress = Math.min(phonemeTimer.current / Math.max(phonemeDuration.current, 0.001), 1);
    const blend = easeInOut(progress);

    // Jaw spring
    const jawTarget = vis.jaw * blend * breathMult;
    const jawDelta  = jawTarget - jawPos.current;
    jawVel.current += (jawDelta * 320.0 - jawVel.current * 18.0) * delta;
    jawPos.current  = THREE.MathUtils.clamp(jawPos.current + jawVel.current * delta, 0, 0.95);
    const jawNoise =
      noise(ns1.current, 9.7, 19.3, 31.1) * 0.038 +
      noise(ns2.current, 4.1,  8.3, 13.7) * 0.022 +
      noise(ns3.current, 1.7,  3.3,  5.9) * 0.012;
    const finalJaw = THREE.MathUtils.clamp(jawPos.current + jawNoise * breathMult, 0, 0.92);
    sJaw.current = THREE.MathUtils.lerp(sJaw.current, finalJaw, delta * 30);
    setMorph('mouthOpen', sJaw.current);

    // Wide
    const wideTarget = vis.wide * blend * breathMult;
    sWide.current = THREE.MathUtils.lerp(sWide.current, wideTarget, wideTarget > sWide.current ? delta * 28 : delta * 14);
    setMorph('mouthLeft',  THREE.MathUtils.clamp(sWide.current * 0.75, 0, 1));
    setMorph('mouthRight', THREE.MathUtils.clamp(sWide.current * 0.68, 0, 1));

    // Press
    const pressTarget = vis.press * blend * breathMult;
    sPress.current = THREE.MathUtils.lerp(sPress.current, pressTarget, pressTarget > sPress.current ? delta * 32 : delta * 18);
    setMorph('mouthClose',      sPress.current);
    setMorph('mouthPressLeft',  sPress.current * 0.35);
    setMorph('mouthPressRight', sPress.current * 0.35);

    // Funnel
    const funnelTarget = vis.funnel * blend * breathMult;
    sFunnel.current = THREE.MathUtils.lerp(sFunnel.current, funnelTarget, delta * 22);
    setMorph('mouthFunnel', sFunnel.current * 0.65);
    setMorph('mouthPucker', sFunnel.current * 0.48);

    // Roll lower/upper
    sRollLower.current = THREE.MathUtils.lerp(sRollLower.current, vis.rollL * blend * breathMult, delta * 26);
    setMorph('mouthRollLower', sRollLower.current);
    sRollUpper.current = THREE.MathUtils.lerp(sRollUpper.current, vis.rollU * blend * breathMult, delta * 20);
    setMorph('mouthRollUpper', sRollUpper.current);

    // Upper/lower lip
    sUpperLip.current = THREE.MathUtils.lerp(sUpperLip.current, vis.upper * blend * breathMult, delta * 24);
    sLowerLip.current = THREE.MathUtils.lerp(sLowerLip.current, vis.lower * blend * breathMult, delta * 20);
    setMorph('mouthUpperUpLeft',    sUpperLip.current);
    setMorph('mouthUpperUpRight',   sUpperLip.current * 0.92);
    setMorph('mouthLowerDownLeft',  sLowerLip.current);
    setMorph('mouthLowerDownRight', sLowerLip.current * 0.96);

    // Smile + dimple
    sSmile.current = THREE.MathUtils.lerp(sSmile.current, (vis.smile + (finalJaw > 0.4 ? 0.07 : 0)) * breathMult + 0.05, delta * 8);
    setMorph('mouthSmile', sSmile.current);
    sDimple.current = THREE.MathUtils.lerp(sDimple.current, sSmile.current * 0.55, delta * 10);
    setMorph('mouthDimpleLeft',  sDimple.current);
    setMorph('mouthDimpleRight', sDimple.current * 0.88);

    // Nose sneer
    sNoseSneer.current = THREE.MathUtils.lerp(sNoseSneer.current, vis.sneer * blend * breathMult, delta * 16);
    setMorph('noseSneerLeft',  sNoseSneer.current * 0.6);
    setMorph('noseSneerRight', sNoseSneer.current * 0.45);

    // Cheek
    sCheek.current = THREE.MathUtils.lerp(sCheek.current, sSmile.current * 0.55 + (finalJaw > 0.45 ? 0.10 : 0), delta * 7);
    setMorph('cheekSquintLeft',  sCheek.current);
    setMorph('cheekSquintRight', sCheek.current * 0.92);

    // Head nod
    const jawImpulse = Math.max(0, finalJaw - prevPhonemeJaw.current) * 0.6;
    headNodVel.current += jawImpulse * 0.4;
    headNodVel.current *= Math.pow(0.0001, delta);
    headNodPos.current += headNodVel.current * delta;
    headNodPos.current = THREE.MathUtils.lerp(headNodPos.current, 0, delta * 3);
    headRotX.current = THREE.MathUtils.lerp(headRotX.current, Math.sin(t * 0.7) * 0.025 + Math.sin(t * 1.9) * 0.010 + headNodPos.current, delta * 3.5);
    headRotY.current = THREE.MathUtils.lerp(headRotY.current, Math.sin(t * 0.5) * 0.032 + Math.sin(t * 1.4) * 0.012, delta * 3.0);

    // Micro-expressions
    microTimer.current += delta;
    if (microTimer.current > 2.0 + Math.random() * 3.0) {
      microTimer.current = 0;
      microPhase.current = (microPhase.current + 1) % 5;
    }
    const mP = microPhase.current;
    const mT = Math.min(microTimer.current * 5.0, 1);
    const mFade = mT < 0.15 ? mT / 0.15 : mT > 0.85 ? (1 - mT) / 0.15 : 1;

    sBrowInner.current = THREE.MathUtils.lerp(sBrowInner.current, mP === 1 ? 0.42 * mFade : mP === 4 ? 0.55 * mFade : 0, delta * 5);
    setMorph('browInnerUp', sBrowInner.current);

    sBrowDown.current = THREE.MathUtils.lerp(sBrowDown.current, mP === 2 ? 0.28 * mFade : 0, delta * 4);
    setMorph('browDownLeft',  sBrowDown.current);
    setMorph('browDownRight', sBrowDown.current * 0.85);

    sBrowOuter.current = THREE.MathUtils.lerp(sBrowOuter.current, mP === 3 ? 0.35 * mFade : 0, delta * 4);
    setMorph('browOuterUpLeft',  sBrowOuter.current);
    setMorph('browOuterUpRight', sBrowOuter.current * 0.22);

    const eyeWideSine = (Math.sin(t * 0.3) * 0.5 + 0.5) * 0.04;
    sEyeWide.current = THREE.MathUtils.lerp(sEyeWide.current, (mP === 4 ? 0.22 * mFade : 0) + eyeWideSine, delta * 5);
    setMorph('eyeWideLeft',  sEyeWide.current);
    setMorph('eyeWideRight', sEyeWide.current * 0.90);

    sEyeSquint.current = THREE.MathUtils.lerp(sEyeSquint.current, mP === 2 ? 0.16 * mFade : finalJaw > 0.5 ? 0.08 : 0, delta * 5);
    setMorph('eyeSquintLeft',  sEyeSquint.current);
    setMorph('eyeSquintRight', sEyeSquint.current * 0.88);

    // Breath pause cleanup
    if (inBreathPause.current) {
      sJaw.current    = THREE.MathUtils.lerp(sJaw.current,    0,    delta * 12);
      sWide.current   = THREE.MathUtils.lerp(sWide.current,   0,    delta * 10);
      sFunnel.current = THREE.MathUtils.lerp(sFunnel.current, 0,    delta * 10);
      sPress.current  = THREE.MathUtils.lerp(sPress.current,  0.08, delta * 8);
      setMorph('mouthOpen',  sJaw.current);
      setMorph('mouthClose', sPress.current);
    }
  };

  return { runFrame };
}