// Boba's tips are plain rules over what the simulator is doing: no AI model, no network.
// Pure functions (testable in Node). Same shape as the bronchoscopy and ventilator simulators' Boba.
// ctx = { t, mode, site, balloon, notice, wedgeSecs, scenario, artefact, af, slack,
//         flags: {moved, balloonUsed, usedWaves, usedFreeze, openedLearn, toured, changedScenario, recorded},
//         quiz: {answered, secs} | null, run: {recorded: n, secs} | null }

export const RULES = [
  { id: 'wedge-long', cool: 30e3, when: (c) => c.wedgeSecs > 14, text: (c) => `You have been wedged for ${Math.round(c.wedgeSecs)} seconds, about ${Math.round(c.wedgeSecs / 4.5)} breaths. Record the PCWP and deflate (B) within about 4 breaths: a long wedge risks pulmonary infarction or pulmonary artery rupture. Then check the PA trace comes back.` },
  { id: 'coil', cool: 60e3, when: (c) => /coiling/.test(c.notice || ''), text: () => 'The depth went past where the next chamber should be and the trace did not change: the catheter has looped. Deflate, pull back to about 20 cm (the loop comes out first), then inflate and float again.' },
  { id: 'curl', cool: 60e3, when: (c) => /curls|bouncing/.test(c.notice || ''), text: () => 'This catheter is flow-directed: about 1.5 mL of air in the balloon lets the blood flow pull the tip through the tricuspid and pulmonary valves. Press B, then advance.' },
  { id: 'pullback', cool: 60e3, when: (c) => /Deflate/.test(c.notice || ''), text: () => 'Deflate first, then withdraw. Pulling an inflated balloon back through a valve can damage the leaflets or chordae.' },
  // trace problems: hinted everywhere except the graded case, where spotting them is the point
  { id: 'puw', cool: 60e3, when: (c) => c.site === 'puw' && c.mode !== 'case', text: () => 'This "wedge" still looks PA-like and sits above the PA diastolic: under-wedged, the balloon has not fully occluded the branch. Advance about 1 cm with the balloon up.' },
  { id: 'ow', cool: 60e3, when: (c) => c.site === 'ow' && c.mode !== 'case', text: () => 'The pressure is climbing with no a or v waves: over-wedged, the tip is jammed too far out. Withdraw about 1 cm (or deflate). This is the position that risks PA rupture.' },
  { id: 'whip', cool: 90e3, when: (c) => c.artefact === 'whip' && c.site === 'pa' && c.mode !== 'case', text: () => 'Sharp spikes on each PA upstroke: catheter whip. The systolic reading is falsely high. Reposition the catheter 1 to 2 cm.' },
  { id: 'over', cool: 90e3, when: (c) => c.artefact === 'over' && c.mode !== 'case', text: () => 'Rounded peaks and no dicrotic notch: the line is overdamped (bubble, clot or kink). Systolic reads low and diastolic high. Press X to flush, but never while wedged.' },
  { id: 'under', cool: 90e3, when: (c) => c.artefact === 'under' && c.mode !== 'case', text: () => 'Ringing after each upstroke: the line is underdamped. Systolic reads high and diastolic low. Flush (X) and use shorter, stiffer tubing.' },
  { id: 'af', cool: 1e12, when: (c) => c.af && c.mode !== 'quiz' && c.mode !== 'case' && (c.site === 'ra' || c.site === 'pcw'), text: () => 'Atrial fibrillation: no P waves on the ECG and no a waves on the trace, and the beats come irregularly. Average the pressure over several beats.' },
  { id: 'move', cool: 1e12, when: (c) => c.t > 20 && !c.flags.moved && c.mode !== 'quiz', text: () => 'Hold W (or the Advance button) to advance the catheter and S to withdraw. B inflates the balloon.' },
  { id: 'quiz-stuck', cool: 45e3, when: (c) => c.mode === 'quiz' && c.quiz && !c.quiz.answered && c.quiz.secs > 30,
    text: () => 'Start with diastole. Near zero and rising to an end-diastolic pressure: RV. Held up with a slow fall and a notch: PA. Low and wavy with a and v waves: RA or wedge, and the wedge waves come later after the QRS.' },
  { id: 'site-rv', cool: 1e12, when: (c) => c.site === 'rv' && !c.seenSites.has('rv'), text: () => 'You crossed the tricuspid valve. Systolic pressure jumped, but diastolic is still near zero and rises through diastole. In a real patient ventricular ectopy is common here, so do not linger in the RV.' },
  { id: 'site-pa', cool: 1e12, when: (c) => c.site === 'pa' && !c.seenSites.has('pa'), text: () => 'Through the pulmonary valve: systolic is unchanged but diastolic has stepped up, because the closed valve holds pressure in the PA. The dicrotic notch on the downstroke is pulmonary valve closure.' },
  { id: 'site-pcw', cool: 1e12, when: (c) => c.site === 'pcw' && !c.seenSites.has('pcw'), text: () => 'Wedged. The trace is atrial-looking again (a and v waves, delayed after the ECG) and its mean is below the PA diastolic. Deflate and the PA trace should come back: that confirms a true wedge.' },
  { id: 'kussmaul', cool: 1e12, when: (c) => c.scenario === 'constriction' && c.site === 'ra' && c.mode !== 'quiz' && c.mode !== 'case', text: () => 'Watch the RA during inspiration (the slow drift on the trace): in constriction it rises instead of falling. That is the Kussmaul sign.' },
  { id: 'record', cool: 60e3, when: (c) => (c.mode === 'procedure' || c.mode === 'case') && !c.flags.recorded && c.t > 30 && ['ra', 'rv', 'pa', 'pcw'].includes(c.site), text: () => 'Press Enter (or Record) to save the reading at this site. Readings are taken at end-expiration.' },
  { id: 'waves', cool: 1e12, when: (c) => c.t > 80 && !c.flags.usedWaves && c.mode === 'explore', text: () => 'Press A to switch the wave labels (a, c, v, x, y, notch) on the monitor off and on.' },
  { id: 'freeze', cool: 1e12, when: (c) => c.t > 110 && !c.flags.usedFreeze, text: () => 'Press F to freeze the monitor and study one beat against the ECG.' },
  { id: 'scenario', cool: 1e12, when: (c) => c.mode === 'explore' && c.t > 150 && !c.flags.changedScenario, text: () => 'Try another scenario from the panel below, such as constrictive pericarditis or severe mitral regurgitation, and float the catheter again.' },
  { id: 'learn', cool: 1e12, when: (c) => c.t > 200 && !c.flags.openedLearn, text: () => 'The Learn tab explains each waveform, the normal values, the calculations and every scenario.' },
  { id: 'tour', cool: 1e12, when: (c) => c.t > 40 && !c.flags.toured, text: () => 'New here? The Tour walks through the screen in about two minutes.' },
];

export const GENERAL = [
  'The a wave follows the P wave; the v wave peaks around the end of the T wave.',
  'The x descent is atrial relaxation in systole; the y descent is the tricuspid valve opening.',
  'RV and PA systolic pressures match unless there is pulmonary stenosis.',
  'A normal PCWP is below the PA diastolic. A big gap (DPG ≥ 7) suggests pulmonary vascular disease.',
  'Read pressures at end-expiration, with the transducer zeroed at the phlebostatic axis (mid-chest).',
  'PVR = (mPAP − PCWP) / cardiac output, in Wood units.',
  'A giant v wave in the wedge is classic for mitral regurgitation, but it can also appear with a stiff left atrium.',
  'Press H any time for the list of controls.',
  'This is a teaching tool with schematic anatomy and waveforms. It is not for clinical use.',
];

// Returns the first rule that applies and is not on cooldown; `fired` maps id -> last time (ms).
export function nextRule(ctx, fired, now) {
  for (const r of RULES) {
    if (now - (fired.get(r.id) ?? -Infinity) < r.cool) continue;
    let ok = false; try { ok = !!r.when(ctx); } catch { ok = false; }
    if (ok) return { ...r, key: r.id };
  }
  return null;
}
