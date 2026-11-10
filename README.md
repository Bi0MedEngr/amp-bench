# Amp Bench

A workbench for sketching out audio amplifier projects before buying parts, in six labs with **Show the math**:

- **Power & SPL**: how many watts a room needs, from speaker sensitivity, distance, listening level and headroom for peaks; peak voltage and current the amplifier must deliver.
- **Tube stage**: triode and pentode stages on their plate curves (12AX7, 12AT7, 12AU7, 6SN7, 6DJ8, 2A3, 300B, EL84, 6L6GC, EL34, KT88). Resistor-loaded gain stages and transformer-loaded single-ended outputs, cathode or fixed bias, DC and AC load lines, dissipation limit, idle point you can drag, gain, output resistance, bypass / coupling / Miller corners, and the output wave with its 2nd and 3rd harmonics and power.
- **Class AB**: output power, heat versus output level (including reactive speaker loads), efficiency, junction temperature and the heatsink needed.
- **Class D**: half and full bridge; output LC filter response into different loads, Q, ripple current, carrier residue, a loss budget and efficiency versus power.
- **Power supply**: transformer, rectifier (silicon, Schottky or tube), reservoir capacitor and an R-C or choke filter, simulated in time: DC voltage, ripple, charging pulses, transformer VA, capacitor ripple current, no-load voltage and bleeder discharge time.
- **Output transformer**: turns ratio, reflected load, bass and treble corners from primary and leakage inductance, insertion loss and damping factor.

Live (installable on iPad: Safari → Share → Add to Home Screen): https://bi0medengr.github.io/amp-bench/ · One self-contained HTML file, no network use. Units shown on every field (V, mA, Ω, µF, H, Hz, W, dB).

Tube voltages can kill. This is a design aid, not a substitute for knowing how to work on high-voltage equipment.

## Method and limits
Tubes use Norman Koren's triode and pentode equations (his published constants; 6SN7 and EL84 fitted here to datasheet points). They describe a typical tube: against datasheet operating points they are within 30% on plate current, most within 10%, and real tubes spread about as much. Swing is solved point by point along a resistive AC load line with the grid clamped at 0 V. Class AB is ideal class B with sine drive plus an idle term on fixed rails. Class D filter response is exact for a resistive load; its loss terms are first-order estimates and are not validated against hardware. The power supply is a time-domain simulation taken to periodic steady state by a shooting method, with diodes as a drop plus resistance and a constant-current load. The transformer model has no core saturation, core loss or winding capacitance. Push-pull tube stages are not modeled yet.

## Validation (`node tests/test_core.js`, 108 checks)
SPL: inverse-square law, power per dB, 2.83 V versus 1 W ratings. Tubes: every model against its datasheet operating point (current, gm, rp); operating point satisfies Kirchhoff and the tube law; gain formula µR/(rp + R + (µ+1)Rk) against the large-signal solver with a small input; single-ended power against (ΔV·ΔI)/8 and 2nd harmonic against the three-point load-line formula; 300B, 2A3 and EL84 output power against datasheet figures. Class B: π/4 efficiency, 2Vcc²/π²R worst-case heat, and heat with a load phase angle against integrating (Vcc − v)·i over a cycle. Class D: Butterworth L and C, Q, −3 dB point, a hand loss budget. Supply: ripple against the exact straight-line-meets-sine solution, charge balance, R-C and L-C attenuation against their transfer functions, bleeder time. Transformer: turns ratio, both corners against the full circuit, copper efficiency, damping factor. Every example runs.

## Files
`core.js` models · `explain.js` the math · `presets.js` examples · `app.js` UI · `page.html` layout · `build.sh` → `amp-bench.html` (artifact) and `docs/` (GitHub Pages web app) · `tests/` · `web/` · `fonts/` (IBM Plex, OFL).
