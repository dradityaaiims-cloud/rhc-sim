# Scenario values (after the research spec)

End-expiratory readings computed from the generated waveforms (mmHg). Seed values from the research spec; means are true time averages.

| Scenario | HR | CO | RA (a / v / mean) | RV (sys / EDP) | PA (sys / dia / mean) | Wedge (a / v / mean / ED) | PVR (WU) | PAPi |
|---|---|---|---|---|---|---|---|---|
| Normal | 75 | 5 | 7 / 6 / 5 | 24 / 4 | 24 / 10 / 15 | 9 / 11 / 8 / 8 | 1.4 | 2.8 |
| Severe tricuspid regurgitation | 80 | 3 | 15 / 32 / 16 | 55 / 14 | 50 / 25 / 34 | 13 / 15 / 12 / 12 | 7.3 | 1.56 |
| Severe mitral regurgitation | 88 | 4 | 8 / 7 / 5 | 40 / 8 | 40 / 24 / 30 | 15 / 40 / 16 / 14 | 3.5 | 3.2 |
| Mitral stenosis | 90 | 3 | 13 / 11 / 10 | 45 / 10 | 45 / 25 / 32 | 32 / 26 / 25 / 30 | 2.3 | 2 |
| Pre-capillary PH (PAH) | 90 | 3.5 | 13 / 9 / 8 | 75 / 12 | 75 / 35 / 49 | 10 / 12 / 9 / 9 | 11.4 | 5 |
| Isolated post-capillary PH (left heart failure) | 85 | 5 | 8 / 7 / 6 | 42 / 10 | 42 / 20 / 28 | 21 / 25 / 20 / 20 | 1.6 | 3.67 |
| RV infarction | 70 | 2.8 | 17 / 16 / 14 | 28 / 14 | 28 / 16 / 20 | 13 / 14 / 12 / 12 | 2.9 | 0.86 |
| Cardiac tamponade | 115 | 3 | 18 / 17 / 16 | 30 / 16 | 30 / 20 / 24 | 18 / 18 / 16 / 17 | 2.7 | 0.63 |
| Constrictive pericarditis | 95 | 3.5 | 20 / 19 / 16 | 40 / 16 | 40 / 20 / 27 | 21 / 22 / 18 / 19 | 2.6 | 1.25 |
| Atrial fibrillation | 80 | 4 | – / 6 / 5 | 24 / 4 | 24 / 10 / 15 | – / 11 / 7 / 7 | 2 | 2.8 |
| Hypovolaemia | 110 | 4.5 | 2 / 2 / 1 | 16 / 1 | 16 / 4 / 8 | 4 / 4 / 3 / 4 | 1.1 | 12 |

## Timing

- RA a wave after the P wave, c just after the R wave, v after the T wave, then y.
- RV EDP read just before the QRS; nearly flat RV diastole with a small a bump.
- PA dicrotic notch after the T wave (end of ejection set at the end of the T wave).
- Wedge = left atrial waves delayed 100 ms: a just after the QRS, v after the T, no c wave.
- Breathing: spontaneous by default (end-expiration = peak); ventilator option (end-expiration = trough).
