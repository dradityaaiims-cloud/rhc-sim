# Dr. Singh's RHC Simulator: an open-source, browser-based simulator linking right heart catheterization waveforms to catheter position

**Article type:** Technical report / software description (draft v0.1)
**Author:** Aditya Singh, MD
**Software:** https://doi.org/10.5281/zenodo.23743411 (MIT licence) · Source: https://github.com/dradityaaiims-cloud/rhc-sim · Live: https://dradityaaiims-cloud.github.io/rhc-sim/
**Correspondence:** draditya.aiims@gmail.com
**Target journals:** MedEdPORTAL (educational resource) or JMIR Medical Education (software/technical report). [CHOOSE; each has its own template and word limits.]

> Drafting notes (delete before submission): items in [BRACKETS] need your input or verification. Statements about the literature are left as [CITE] and must be filled with sources you have read. Nothing here reports learner outcomes, because none have been collected. MedEdPORTAL requires an implementation and evaluation section with learner data; if you target it, plan a pilot first (see 4.2).

---

## Abstract

**Background:** Interpreting the pressure waveforms recorded during right heart catheterization (RHC) is a core skill in cardiology, pulmonary hypertension and critical care, but trainees usually meet it only at the bedside, where the catheter is unseen and the tracing changes quickly. Textbooks show waveforms as static figures, detached from where the catheter tip is.

**Objective:** To describe the design, implementation and limitations of an open-source, browser-based simulator that couples a live haemodynamic monitor to a 3D view of a balloon-tipped catheter floating through the right heart.

**Methods:** The simulator is written in JavaScript with three.js and runs entirely in the browser, with no server and no data collection. A waveform engine builds each beat from keypoints timed to a synthetic ECG (a, c and v waves, x and y descents, RV end-diastolic pressure, PA dicrotic notch, wedge waves delayed relative to the left atrium) joined by a periodic monotone cubic, with spontaneous or ventilator respiratory variation. Eleven scenarios (normal, severe tricuspid and mitral regurgitation, mitral stenosis, pre-capillary and isolated post-capillary pulmonary hypertension, RV infarction, tamponade, constrictive pericarditis, atrial fibrillation and hypovolaemia) are seeded from a referenced specification. The learner advances a flow-directed catheter from the internal jugular or femoral vein, inflates the balloon to cross the tricuspid and pulmonary valves and to wedge, and meets under-wedging, over-wedging, catheter whip, over- and underdamping and catheter coiling. Four modes cover free exploration, waveform identification, a scored procedure with haemodynamic calculations (TPG, DPG, PVR, PAPi and 2022 ESC/ERS classification) and an unknown-diagnosis case.

**Results:** The simulator is deployed as a static website, released under the MIT licence, archived with a DOI (10.5281/zenodo.23743411) and covered by 42 automated tests, including tests that each scenario's computed readings fall within 2 mmHg of its specification and show its defining pattern. No learner outcome or usability data were collected.

**Conclusions:** A free, no-install simulator can make the link between catheter position and waveform visible. It is for education only, has not been validated for clinical use or for assessing competence, does not teach manual technique, and its educational effectiveness has not been evaluated.

**Keywords:** right heart catheterization; pulmonary artery catheter; haemodynamics; pulmonary hypertension; medical education; simulation; open-source software

---

## 1. Introduction

Right heart catheterization measures right atrial, right ventricular, pulmonary artery and pulmonary artery wedge pressures and cardiac output. It is the reference test for diagnosing and classifying pulmonary hypertension, and it informs the care of heart failure, shock, valve disease and pericardial disease. [CITE: 2022 ESC/ERS guidelines; RHC best-practice review.] Correct interpretation depends on recognising each waveform, knowing where it should appear as the catheter advances, timing its components against the ECG, reading at end-expiration, and recognising a valid wedge and common artefacts. [CITE: Contemporary PAC Part 1; wedge-validity study.] Errors in these steps change diagnoses, for example when an under-wedged tracing is read as a raised wedge pressure. [CITE.]

Trainees usually learn these skills during procedures. There the catheter is hidden, the tracing changes within seconds, and there is little time for explanation. Textbook figures show each waveform in isolation. Commercial haemodynamic simulators exist but are costly and tied to a site or vendor. [CITE for simulation in cardiac catheterization training, if available.]

This report describes a free simulator aimed at the *cognitive* layer of RHC: relating each waveform to the catheter's position, recognising patterns of disease, and spotting measurement pitfalls. It does not teach vascular access or manual skill. The aims were to (1) show the catheter and the tracing side by side, changing together in real time; (2) run in any modern browser with no installation; (3) keep every assumption in one inspectable, tested place; and (4) state its limits plainly.

## 2. Methods: design and implementation

### 2.1 Architecture

The code is plain JavaScript modules built with Vite and rendered with three.js. The waveform engine, catheter model, artefact filters and scoring have no rendering dependency and are unit tested with Node's built-in test runner; the monitor and the 3D view only draw their output. The application is a static site, with no backend, accounts or analytics. Coordinates for the heart and catheter are centimetres in one patient frame (x patient-left, y superior, z anterior).

### 2.2 Cardiac cycle and waveform engine

A master clock defines, for each beat, the P wave, the QRS (PR 0.18 s), a QT interval from Bazett's formula (QTc 0.40 s) and the end of ejection at the end of the T wave. Each site's beat is a short list of keypoints placed on this timeline:

| Site | Keypoints and timing |
|---|---|
| Right atrium (and cavae) | a wave after the P wave; c wave just after the R wave; x descent in mid-systole; v wave after the T wave; y descent after tricuspid opening; slow return to the diastasis level. The cavae show the same trace, damped. |
| Right ventricle | Nearly flat diastole with a small atrial bump; end-diastolic pressure read just before the QRS; steep systolic upstroke and peak; early diastolic minimum. In constriction and RV infarction, an early dip and a plateau. |
| Pulmonary artery | Diastolic minimum at valve opening; systolic peak equal to RV systolic; dicrotic notch after the T wave; diastolic run-off. |
| Wedge | An atrial-type trace built from left atrial values and delayed by 0.1 s, so the a wave falls just after the QRS and the v wave after the T wave; no c wave. |

Keypoints are joined by a periodic monotone cubic Hermite curve (Fritsch–Butland slopes), so the trace is smooth but never overshoots: each peak and trough is exactly where the scenario places it. Displayed readings are computed from the generated beat rather than typed in, so every number on screen is consistent with the trace. The ECG is a sum of Gaussian P, Q, R, S and T waves. The monitor shows a 6-second sweep on a fixed scale chosen per case, marks each change of site, and can label the a, c, x, v and y waves, the RV end-diastolic pressure and the dicrotic notch.

### 2.3 Scenarios

Each scenario sets heart rate, cardiac output and keypoint values at every site. Seed values come from the author's research specification, which compiled normal ranges and pathological patterns from RHC best-practice reviews, pulmonary artery catheter reviews and the 2022 ESC/ERS guidelines; they are illustrative and unvalidated. Table 1 lists the end-expiratory readings the engine produces.

**Table 1.** Computed end-expiratory readings (mmHg) for each scenario. [Regenerate from `docs/waveform-values.md` before submission.]

| Scenario | RA mean | RV sys/EDP | PA sys/dia (mean) | Wedge mean | CO (L/min) | PVR (WU) |
|---|---|---|---|---|---|---|
| Normal | 5 | 24/4 | 24/10 (15) | 8 | 5.0 | 1.4 |
| Severe tricuspid regurgitation | 16 | 55/14 | 50/25 (34) | 12 | 3.0 | 7.3 |
| Severe mitral regurgitation | 5 | 40/8 | 40/24 (30) | 16 | 4.0 | 3.5 |
| Mitral stenosis | 10 | 45/10 | 45/25 (32) | 25 | 3.0 | 2.3 |
| Pre-capillary PH | 8 | 75/12 | 75/35 (49) | 9 | 3.5 | 11.4 |
| Isolated post-capillary PH | 6 | 42/10 | 42/20 (28) | 20 | 5.0 | 1.6 |
| RV infarction | 14 | 28/14 | 28/16 (20) | 12 | 2.8 | 2.9 |
| Cardiac tamponade | 16 | 30/16 | 30/20 (24) | 16 | 3.0 | 2.7 |
| Constrictive pericarditis | 16 | 40/16 | 40/20 (27) | 18 | 3.5 | 2.6 |
| Atrial fibrillation | 5 | 24/4 | 24/10 (15) | 8 | 4.0 | 1.8 |
| Hypovolaemia | 1 | 16/1 | 16/4 (8) | 3 | 4.5 | 1.1 |

Defining patterns are built in: a giant systolic cv wave with loss of the x descent in tricuspid regurgitation; giant wedge v waves in mitral regurgitation, presented as a clue rather than a severity rule; a dominant wedge a wave with a slow y descent in mitral stenosis; equalised diastolic pressures with a preserved x and absent y descent in tamponade; deep x and y descents, an RV dip and plateau and a Kussmaul sign in constriction; and RA/PCWP ≥ 0.8 with PAPi < 0.9 in RV infarction.

### 2.4 Respiration and rhythm

A 4.5-second respiratory cycle lowers intrathoracic pressures by a few mmHg during spontaneous inspiration, or raises them with a ventilator breath, so end-expiration is the peak or the trough of the swing respectively; the RA rises with inspiration in constriction. In atrial fibrillation the a waves and the atrial bump before the RV end-diastolic pressure are removed, the x descent is shallower, the ECG shows a fibrillatory baseline without P waves, and each RR interval is drawn from 0.65 to 1.35 times the mean (reproducibly). Each beat is built for its own RR, with an 80 ms blend at each beat boundary to keep the trace continuous. Any scenario can be switched to atrial fibrillation.

### 2.5 Catheter, balloon and wedge

The catheter follows a fixed centreline from the right internal jugular or femoral vein through the cava, right atrium, tricuspid valve, right ventricle and outflow tract, pulmonary valve and main pulmonary artery into a distal right pulmonary artery branch. Insertion depth is scaled to textbook landmarks (jugular: RA about 20 cm, RV 30–35, PA 40–45, wedge about 50 cm; femoral about 10–15 cm more). Teaching rules rather than mechanics govern behaviour: the balloon can only be inflated beyond the introducer sheath; the tip crosses the tricuspid and pulmonary valves only with the balloon inflated; in the distal branch an inflated balloon gives, in turn, an under-wedge (a mixed PA-like trace above the PA diastolic), a true wedge, and an over-wedge (a pressure that climbs without a or v waves); deflating restores the PA trace; and an inflated balloon cannot be withdrawn through a valve. Wedged time is tracked against a limit of about four breaths.

### 2.6 Artefacts and coiling

Monitoring artefacts act on the true pressure before it is drawn: overdamping as a first-order low-pass filter (blunted peaks, lost notch, correct mean), underdamping as a resonant second-order line (ringing, overestimated systolic, underestimated diastolic), and catheter whip as a decaying oscillation on each systolic upstroke in the pulmonary artery. Flushing clears damping and is refused while wedged; moving the catheter 1 cm clears whip. Pushing against a valve without the balloon, or on the first float in scenarios with a dilated right atrium or ventricle, leaves the tip in place while the extra length forms a visible loop and the depth climbs past the expected landmark, prompting the recommended response: deflate, withdraw to about 20 cm and float again.

### 2.7 Modes, scoring and feedback

*Free explore* allows any scenario, access route, breathing mode, rhythm and artefact. *Name that waveform* hides the catheter, the site markers and the diagnosis and asks the learner to identify the site from the trace, then explains the answer. *Do the RHC* asks the learner to record RA, RV, PA and wedge readings; it then shows the transpulmonary gradient, diastolic pressure gradient, pulmonary vascular resistance, PA pulsatility index and the 2022 ESC/ERS haemodynamic classification, and scores the run out of 100 for complete recordings (60), safety (20: pulling an inflated balloon through a valve, flushing while wedged, prolonged wedging), technique (10: attempts to cross valves without the balloon) and time (10). Readings taken during an uncorrected artefact or a bad wedge are stored as the monitor showed them and flagged in the feedback. *Diagnose the case* repeats the procedure on a hidden scenario, sometimes with a hidden artefact, and adds 20 points for the diagnosis.

### 2.8 Learning support

A guided tour runs on first visit and includes "try it" steps (advance to the RA, inflate, float to the wedge). A Learn tab covers the procedure, each waveform and its normal values, the five criteria for an adequate wedge, calculations and definitions, pitfalls and every scenario, each with a button that opens it in the simulator. A rule-based assistant ("Boba"; no AI model and no network) offers context-specific tips, for example when the learner has stayed wedged too long or when the trace shows whip, and stays silent about artefacts in the graded case. A Model & limits page documents every assumption.

### 2.9 Verification and deployment

Forty-two automated tests check, among other things, that each scenario's computed readings fall within 2 mmHg of its seed values; that each scenario shows its defining pattern; that the dicrotic notch and v waves follow the T wave and the wedge a wave follows the QRS; that traces are continuous across beats, including in atrial fibrillation; that the catheter meets SVC, RA, RV, PA, under-wedge, wedge and over-wedge in order; that coiling, re-floating, balloon rules and flushing behave as specified; that artefacts bias readings in the expected directions; and that scoring and assistant rules behave as intended. Tests and the production build run on every push to the main branch, which deploys the site to GitHub Pages. The software was also checked manually in a Chromium-based browser. [Add other browsers and devices once tested.]

## 3. Results

The simulator is available at https://dradityaaiims-cloud.github.io/rhc-sim/ and archived at doi:10.5281/zenodo.23743411. A typical session takes [X] minutes. [Add: a figure of the screen (monitor left, 3D heart right) during a float from SVC to wedge; a figure of the mitral regurgitation wedge; a figure of artefacts. Screenshots are in `docs/`.] No learner outcome, usability or validity data were collected for this report.

## 4. Discussion

The simulator places the catheter and the waveform side by side and lets the learner cause each change: the systolic jump across the tricuspid valve, the diastolic step-up across the pulmonary valve, and the return of an atrial-type trace on wedging. It also lets learners make the common mistakes safely: recording an under-wedged trace, missing whip or damping, pulling back with the balloon up, or leaving the balloon wedged. [Relate to the literature on haemodynamic interpretation errors and simulation in procedural training: CITE.] The open code allows instructors to inspect and change every value, and the scenario format allows new cases to be added.

### 4.1 Limitations

- **Not validated.** Nothing has been reviewed by an independent expert panel, and the scenario values are illustrative. [Plan: review by an interventional or advanced heart failure cardiologist and a pulmonary hypertension specialist.]
- **Schematic waveforms.** Traces are drawn from keypoints, not from a model of cardiac mechanics or fluid dynamics; real traces vary widely between patients.
- **Schematic anatomy and catheter.** Ellipsoid chambers, a fixed path and rule-based crossing and coiling; no catheter mechanics, wrong-way passages (hepatic veins, coronary sinus, left pulmonary artery) or fluoroscopy.
- **Right heart only.** No simultaneous left ventricular trace, so the transmitral gradient and the respiratory discordance that separates constriction from restriction cannot be shown.
- **Limited rhythms and physiology.** Sinus rhythm and atrial fibrillation only (no heart block, cannon a waves, ectopy or pacing); no oxygen saturations, shunt runs or Fick output; cardiac output is given; PEEP transmission, zeroing and levelling errors and balloon volume are not modelled.
- **Simplified artefacts and complications.** Artefacts are filters and rules; valve injury, pulmonary artery rupture and infarction are represented only by warnings and score penalties.
- **No manual-skill training**, haptics or vascular access.

### 4.2 Future work

Expert review of the scenarios; an optional left ventricular trace; oximetry runs and shunt scenarios; heart block with cannon a waves; provocative testing (exercise, fluid challenge); and a prospective educational evaluation, for example a pre/post waveform-interpretation test with a usability scale in residents and fellows, with appropriate ethical review. [Needed for MedEdPORTAL.]

## 5. Conclusions

An open, browser-based simulator that couples a 3D catheter to a live haemodynamic monitor can be built and distributed at no cost and with no data collection. It is intended for education only; its effectiveness remains to be evaluated and it has not been validated for clinical use.

---

## Declarations

**Availability.** Software DOI: 10.5281/zenodo.23743411. Source code at https://github.com/dradityaaiims-cloud/rhc-sim under the MIT licence. [State the licence of the teaching content if it should differ.]

**Clinical-use statement.** This software is an educational tool. It is not a medical device, has not been validated for clinical use, and must not be used for clinical decisions, procedure planning, assessment or exams. All cases are simulated. No patient data are collected or should be entered.

**Use of AI assistance (ICMJE-style disclosure).** The software was developed with AI coding assistance (Claude, Anthropic), directed, reviewed and tested by the author, who takes responsibility for the code and content. The research specification used to seed scenario values was compiled with an AI research tool (Perplexity) and checked by the author. [Confirm. If AI tools were used to draft or edit this manuscript, state which tool, version and for what, as the target journal requires. AI cannot be listed as an author.]

**Ethics.** No human participants or patient data. [Confirm with your institution or journal whether a statement is needed.]

**Funding.** None. **Competing interests.** None declared. Not affiliated with or endorsed by any catheter or haemodynamic monitoring manufacturer; "Swan-Ganz style" describes a class of balloon-tipped, flow-directed catheters only. [Confirm.]

**Acknowledgements.** [Add.]

## References

1. Humbert M, Kovacs G, Hoeper MM, et al. 2022 ESC/ERS Guidelines for the diagnosis and treatment of pulmonary hypertension. Eur Heart J 2022;43:3618–3731.
2. Singh A. Dr. Singh's RHC Simulator (Version 0.1.0) [Computer software]. 2026. doi:10.5281/zenodo.23743411.
3. Fritsch FN, Butland J. A method for constructing local monotone piecewise cubic interpolants. SIAM J Sci Stat Comput 1984;5:300–304.
4. [Add the sources behind the research specification that you have read: the RHC best-practice review, Contemporary PAC Part 1, BJA Education pulmonary artery catheterisation, the PAWP measurement study, and the pericardial constriction and RV infarction reviews. VERIFY each citation.]
5. [Add literature on simulation in cardiac catheterization and haemodynamic training for the Introduction and Discussion.]
