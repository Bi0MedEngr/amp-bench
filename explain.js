// Amp Bench — "show the math" per lab: the method, then your numbers.
const Explain = (() => {
  'use strict';
  const C = typeof Core !== 'undefined' ? Core : require('./core.js');
  const si = C.si;
  function num(v, sig = 4) { if (v == null || !isFinite(v)) return v === Infinity ? '∞' : '—'; const a = Math.abs(v); if (a === 0) return '0'; return (a >= 1e6 || a < 1e-3 ? v.toExponential(sig - 1) : String(+v.toPrecision(sig))).replace('-', '−'); }
  const sub = s => `<sub>${s}</sub>`;
  const eq = lines => `<div class="eqs">${lines.filter(Boolean).map(l => l.startsWith('=') ? `<div class="sub">${l}</div>` : l.startsWith('→') ? `<div class="res">${l.slice(1).trim()}</div>` : `<div>${l}</div>`).join('')}</div>`;
  const pct = v => num(100 * v, 3) + '%';

  function explain(model, r) {
    if (!r || !r.ok) return [{ title: 'No solution', html: `<p>${r ? r.message : ''}</p>` }];
    const out = [], p = model[model.lab], S = (title, html) => out.push({ title, html });
    if (r.kind === 'power') {
      S('Sensitivity per watt', `<p>Speaker sensitivity is the sound level at 1 m for a standard input. Makers quote it either per watt or per 2.83 V. 2.83 V is 1 W only into 8 Ω; into a lower impedance the same voltage is more power, so the per-watt figure is lower.</p>` +
        eq([`S${sub('1W')} = S${sub('2.83V')} − 10·log(8/Z)`, `→ ${num(r.s1)} dB at 1 W, 1 m (Z = ${num(p.Z)} Ω)`]));
      S('Level at the listening seat', `<p>Each tenfold in power adds 10 dB. In free space level falls 6 dB per doubling of distance. Two speakers playing unrelated signals add 3 dB. A real room returns some of the energy; enter that as room gain (0 is the cautious choice).</p>` +
        eq([`SPL = S${sub('1W')} + 10·log P − 20·log d + 10·log n + room`, `= at 1 W: ${num(r.s1)} − ${num(20 * Math.log10(p.dist))} + ${num(10 * Math.log10(p.n))} + ${num(p.room)} = ${num(r.base)} dB`, `Average ${num(p.target)} dB needs P = 10^((${num(p.target)} − ${num(r.base)})/10)`, `→ ${si(r.Pavg, 'W')} average per channel`]));
      S('Headroom for peaks', `<p>Music peaks sit well above its average level: 10 dB for compressed pop, 15 to 20 dB for acoustic and orchestral recordings. The amplifier must reach the peaks without clipping, so its rated power is the peak figure.</p>` +
        eq([`P${sub('rated')} = P${sub('avg')} · 10^(headroom/10) = ${si(r.Pavg, 'W')} × ${num(Math.pow(10, p.headroom / 10))}`, `→ ${si(r.Ppk, 'W')} per channel, peaks of ${num(r.peakSPL)} dB`, `V${sub('rms')} = √(P·Z) = ${si(r.Vrms, 'V')}, V${sub('peak')} = √2·V${sub('rms')} = ${si(r.Vpk, 'V')}`, `I${sub('peak')} = V${sub('peak')}/Z = ${si(r.Ipk, 'A')}; at the ${num(p.Zmin)} Ω minimum, ${si(r.IpkMin, 'A')}`]));
      return out;
    }
    if (r.kind === 'tube') {
      const t = r.t, q = r.q;
      S('The tube model', `<p>${t.name}: plate current from Norman Koren's equations${t.src === 'fit' ? ', with constants fitted for this tool to the datasheet operating points' : ', with his published constants'}. Real tubes of one type differ from each other by ±20% or more, so treat the curves as a typical sample.</p>` +
        eq(r.pent ? [`E${sub('1')} = V${sub('g2')}/k${sub('p')} · ln(1 + exp(k${sub('p')}·(1/µ + V${sub('g')}/V${sub('g2')})))`, `I${sub('p')} = 2·E${sub('1')}^x / k${sub('g1')} · atan(V${sub('p')}/k${sub('vb')})`, `= µ ${t.mu}, x ${t.ex}, k${sub('g1')} ${t.kg1}, k${sub('p')} ${t.kp}, k${sub('vb')} ${t.kvb}, screen at ${num(p.Vg2)} V`]
          : [`E${sub('1')} = V${sub('p')}/k${sub('p')} · ln(1 + exp(k${sub('p')}·(1/µ + V${sub('g')}/√(k${sub('vb')} + V${sub('p')}²))))`, `I${sub('p')} = 2·E${sub('1')}^x / k${sub('g1')}`, `= µ ${t.mu}, x ${t.ex}, k${sub('g1')} ${t.kg1}, k${sub('p')} ${t.kp}, k${sub('vb')} ${t.kvb}`]));
      S('Operating point', `<p>The idle point is where the tube's curve meets the DC load line. ${r.cath ? 'With cathode bias the tube sets its own grid voltage: plate current through the cathode resistor lifts the cathode, which is the same as pushing the grid negative.' : 'The grid is held at a fixed negative voltage.'} Both conditions are solved together by bisection.</p>` +
        eq([`B+ = V${sub('pk')} + I${sub('p')}·R${sub('dc')} + V${sub('k')}` + (r.se ? ' (R' + sub('dc') + ' = primary winding resistance)' : ' (R' + sub('dc') + ' = plate resistor)'), r.cath ? `V${sub('gk')} = −I${sub('k')}·R${sub('k')}` : `V${sub('gk')} = ${num(p.Vg)} V`,
          `→ V${sub('pk')} = ${si(q.Vp, 'V')}, I${sub('p')} = ${si(q.Ip, 'A')}, V${sub('gk')} = ${si(q.Vg, 'V')}` + (r.pent ? `, screen ${si(q.Ig2, 'A')}` : ''), `Plate dissipation = V${sub('pk')}·I${sub('p')} = ${si(r.Pq, 'W')} (limit ${si(t.Pmax, 'W')})`]));
      S('Small-signal gain', `<p>At the idle point the tube acts like a generator µ·v${sub('g')} behind its plate resistance r${sub('p')}. The slopes of the model there give g${sub('m')} and r${sub('p')}. The signal sees the AC load: ${r.se ? 'the transformer primary impedance' : 'the plate resistor in parallel with the next stage'}. An unbypassed cathode resistor feeds back and lowers the gain.</p>` +
        eq([`g${sub('m')} = ∂I${sub('p')}/∂V${sub('g')} = ${si(r.ss.gm, 'S')}, r${sub('p')} = ∂V${sub('p')}/∂I${sub('p')} = ${si(r.ss.rp, 'Ω')}, µ = g${sub('m')}·r${sub('p')} = ${num(r.ss.mu)}`, `R${sub('ac')} = ${si(r.Rac, 'Ω')}`, `A = µ·R${sub('ac')} / (r${sub('p')} + R${sub('ac')} + (µ + 1)·R${sub('k')})` + (r.RkAC ? '' : ' with R' + sub('k') + ' bypassed (0)'),
          `→ A = ${num(r.gain)} (${num(r.gainDb, 3)} dB), inverting`, `Output resistance ${r.se ? '(source seen by the transformer)' : '= R' + sub('a') + ' ∥ (r' + sub('p') + ' + (µ + 1)R' + sub('k') + ')'} = ${si(r.Zout, 'Ω')}`]));
      const fr = [];
      if (r.fBypass != null) fr.push(`Cathode bypass: f = 1/(2π·C${sub('k')}·(R${sub('k')} ∥ (r${sub('p')} + R${sub('ac')})/(µ + 1))) = ${si(r.fBypass, 'Hz')} (full gain above this)`);
      if (r.fCouple != null) fr.push(`Coupling capacitor: f = 1/(2π·C${sub('c')}·(Z${sub('out')} + R${sub('load')})) = ${si(r.fCouple, 'Hz')}`);
      if (r.fMiller != null) fr.push(`Miller: C${sub('in')} = C${sub('gk')} + C${sub('gp')}·(1 + A) = ${si(r.Cin, 'F')}; with ${si(p.Rsrc, 'Ω')} source, f = 1/(2π·R·C${sub('in')}) = ${si(r.fMiller, 'Hz')}`);
      if (fr.length) S('Frequency limits', `<p>Three RC corners bound the stage. Stray wiring capacitance (5 to 20 pF, not included) adds to the Miller figure.</p>` + eq(fr));
      S('Swing and distortion', `<p>A sine of ${si(r.vin, 'V')} peak is applied to the grid and the tube equation is solved at 256 points around the cycle along the AC load line (slope −1/R${sub('ac')} through the idle point). Unequal spacing of the curves makes the two half-cycles unequal: that is mostly 2nd harmonic for a triode, 3rd for a pentode. The harmonics come from a Fourier sum of the resulting wave. The grid is clamped at 0 V, as with a driver that cannot supply grid current.</p>` +
        eq([`Plate swings ${si(r.vpMin, 'V')} to ${si(r.vpMax, 'V')}; current ${si(r.ipMin, 'A')} to ${si(r.ipMax, 'A')}`, `Output: +${si(r.voPk, 'V')} / ${si(r.voNeg, 'V')}, fundamental ${si(r.h1, 'V')} peak`, `2nd harmonic ${pct(r.hd2)}, 3rd ${pct(r.hd3)}, THD (2nd–5th) ${pct(r.thd)}`,
          r.se ? `→ P = V${sub('1')}²/(2·Z${sub('p')}) = ${si(r.Pout, 'W')} into the primary, ${pct(r.eff)} of the ${si(r.Pin, 'W')} drawn from B+` : `→ large-signal gain ${num(r.gainLS)}`,
          r.se ? `= Graphical check: (V${sub('max')} − V${sub('min')})(I${sub('max')} − I${sub('min')})/8 = ${si((r.vpMax - r.vpMin) * (r.ipMax - r.ipMin) / 8, 'W')}` : null]));
      return out;
    }
    if (r.kind === 'classab') {
      const c = Math.cos(p.phi * Math.PI / 180);
      S('Output power', `<p>The output can swing to within a few volts of the rail (driver and emitter-resistor drops). Rail voltage here is the loaded value: an unregulated supply sags several volts at full power.</p>` +
        eq([`V${sub('peak')} = V${sub('cc')} − V${sub('drop')} = ${num(p.Vcc)} − ${num(p.Vdrop)} = ${si(r.Vpk, 'V')}`, `P = V${sub('peak')}²·cos φ/(2·|Z|)`, `→ ${si(r.Pmax, 'W')}, I${sub('peak')} = ${si(r.Ipk, 'A')}`]));
      S('Where the heat comes from', `<p>Each device carries a half-sine of current while the voltage across it is the rail minus the output. Averaged over a cycle the supply delivers 2·V${sub('cc')}·V${sub('p')}/(π·|Z|); what does not reach the load is heat. The heat peaks at partial power, not full power. A reactive load (speaker impedance with phase angle φ) takes the same current but less real power, so more stays in the transistors.</p>` +
        eq([`P${sub('supply')} = 2·V${sub('cc')}·V${sub('p')}/(π·|Z|) + 2·V${sub('cc')}·I${sub('q')}`, `P${sub('heat')} = P${sub('supply')} − V${sub('p')}²·cos φ/(2·|Z|)`, `Worst case at V${sub('p')} = 2·V${sub('cc')}/(π·cos φ)${r.worst.vp >= r.Vpk - 1e-9 ? ' (beyond full swing here, so full swing is the worst case)' : ''} = ${si(r.worst.vp, 'V')}`,
          `→ worst-case heat ${si(r.worst.Pd, 'W')} at ${si(r.worst.Pout, 'W')} out (cos φ = ${num(c, 3)})`, `= At full power: ${si(r.full.Pd, 'W')} heat, efficiency ${pct(r.full.eff)} (ideal class B limit is π/4 = 78.5%)`]));
      S('Heatsink', `<p>Heat flows junction → case → sink → air through a chain of thermal resistances. The sink carries all the heat; each device's own junction-to-sink path carries only its share.</p>` +
        eq([`T${sub('j')} = T${sub('a')} + P${sub('total')}·θ${sub('sa')} + P${sub('device')}·(θ${sub('jc')} + θ${sub('cs')})`, `= ${r.nDev} devices share ${si(r.worst.Pd, 'W')}: ${si(r.Pdev, 'W')} each`, `= ${num(p.Ta)} + ${num(r.worst.Pd)}×${num(p.thsa)} + ${num(r.Pdev)}×(${num(p.thjc)} + ${num(p.thcs)})`, `→ T${sub('j')} = ${num(r.Tj, 3)} °C`, `Sink needed for ${num(p.Tjmax)} °C: θ${sub('sa')} ≤ ${r.thsaReq > 0 ? num(r.thsaReq, 3) + ' °C/W' : 'not achievable'}`]) +
        `<p>Peak instantaneous power in one device with a resistive load is V${sub('cc')}²/(4·R) = ${si(r.PpkDev, 'W')} per pair member; check it against the transistor's safe operating area at the rail voltage.</p>`);
      return out;
    }
    if (r.kind === 'classd') {
      S('Output power', `<p>${r.full ? 'A full bridge swings the load between +V and −V of a single supply.' : 'A half bridge switches the output between the two rails.'} The modulator cannot reach 100% duty, and FET and inductor resistance take a share of the voltage.</p>` +
        eq([`V${sub('peak')} = M·V${sub('bus')}·R/(R + R${sub('series')}) = ${num(p.M)} × ${num(p.V)} × ${num(p.R)}/(${num(p.R)} + ${num(r.Rser)})`, `→ ${si(r.Vpk, 'V')} peak, ${si(r.Pmax, 'W')} into ${num(p.R)} Ω`]));
      const l = r.fullL;
      S('Loss budget', `<p>First-order estimates of the kind used in FET application notes. They show which term dominates; the real figure depends on layout, dead time and gate drive.</p>` +
        eq([`Conduction: (I${sub('rms')}² + I${sub('ripple')}²)·R${sub('series')} = ${si(l.cond, 'W')}`, `Switching: ½·V${sub('leg')}·I${sub('avg')}·t${sub('sw')}·f${sub('sw')} per leg = ${si(l.sw, 'W')}`, `Gate drive: Q${sub('g')}·V${sub('drive')}·f${sub('sw')} per FET = ${si(l.gate, 'W')}`, `Output capacitance: C${sub('oss')}·V${sub('leg')}²·f${sub('sw')} per leg = ${si(l.coss, 'W')}`, `Idle (controller, drivers): ${si(l.idle, 'W')}`,
          `→ at full power: ${si(l.total, 'W')} lost, ${pct(l.eff)} efficient`, `= at ⅛ power (typical loud music): ${si(r.eighth.total, 'W')} lost, ${pct(r.eighth.eff)}`]));
      S('Output filter', `<p>The LC low-pass removes the carrier. The speaker is its damping resistor, so the response depends on the load: a higher impedance peaks, a lower one droops. ${r.full ? 'In a bridge each leg has its own L and C and sees half the load.' : ''}</p>` +
        eq([`f${sub('0')} = 1/(2π√(LC)) = ${si(r.f0, 'Hz')}`, `Q = R${sub('eq')}·√(C/L) = ${num(r.Req)} × √(${si(p.C, 'F')}/${si(p.L, 'H')}) = ${num(r.Q, 3)}`, `|H| = 1/√((1 − (f/f${sub('0')})²)² + (f/(f${sub('0')}·Q))²)`, `→ at 20 kHz: ${num(r.g20, 3)} dB; −3 dB at ${si(r.f3, 'Hz')}; carrier ${num(r.gsw, 3)} dB`,
          `= Flat (Butterworth, Q = 0.707) at this corner and load: L = √2·R/ω${sub('0')} = ${si(r.Lbw, 'H')}, C = 1/(√2·ω${sub('0')}·R) = ${si(r.Cbw, 'F')}`, `Ripple current at idle: V${sub('leg')}/(4·L·f${sub('sw')}) = ${si(l.dI, 'A')} peak-to-peak`]));
      return out;
    }
    if (r.kind === 'supply') {
      S('What is simulated', `<p>The winding is a sine source behind its resistance and the rectifier's drop. Whenever the source exceeds the reservoir capacitor's voltage the diode conducts and tops the capacitor up; the rest of the time the load drains it. The circuit is stepped in time (${4000} steps per half cycle) and the repeating steady state is found directly by a shooting method, so slow choke-capacitor ringing does not have to die out first. The load is a constant current.</p>` +
        eq([`V${sub('peak')} = √2·V${sub('sec')} = ${si(r.Vpk, 'V')}`, `${r.rect.name}: ${num(r.rect.Vd)} V + ${num(r.rect.Rd)} Ω each, ${r.nd} in the path (${r.ct ? 'center-tapped full wave' : 'bridge'})`, `No-load output = V${sub('peak')} − drops = ${si(r.Vnl, 'V')}`]));
      S('Reservoir capacitor', eq([`Result: ${si(r.v1avg, 'V')} average, ripple ${si(r.rip1, 'V')} peak-to-peak`, `= Rule of thumb ΔV ≈ I/(2·f·C) = ${si(p.I / (2 * p.f * p.C1), 'V')} (ignores the conduction time, so it reads high)`, `Diodes conduct ${pct(r.conduction)} of the time, in pulses of ${si(r.idPk, 'A')} peak`, `Capacitor ripple current ${si(r.icRms, 'A')} rms: check its rating`]));
      if (p.stage !== 'none') S(p.stage === 'rc' ? 'R-C filter' : 'L-C filter', `<p>The second stage is a divider that passes DC and blocks ripple. Ripple is mostly at twice the mains frequency.</p>` +
        eq(p.stage === 'rc' ? [`DC drop = I·R = ${si(p.I * p.R2, 'V')}`, `Attenuation at ${num(2 * p.f)} Hz = 1/√(1 + (ωRC)²) = ${num(-20 * Math.log10(1 / Math.hypot(1, 2 * Math.PI * 2 * p.f * p.R2 * p.C2)), 3)} dB`, `→ ${si(r.Vout, 'V')} out, ripple ${si(r.rip2, 'V')} p-p (${num(r.ripDb, 3)} dB below the reservoir)`]
          : [`DC drop = I·DCR = ${si(p.I * p.dcr, 'V')}`, `Attenuation at ${num(2 * p.f)} Hz = 1/|1 − ω²LC + jωC·DCR| = ${num(-20 * Math.log10(1 / Math.hypot(1 - Math.pow(2 * Math.PI * 2 * p.f, 2) * p.L * p.C2, 2 * Math.PI * 2 * p.f * p.C2 * p.dcr)), 3)} dB`, `Choke-capacitor resonance at ${si(1 / (2 * Math.PI * Math.sqrt(p.L * p.C2)), 'Hz')}: keep it well below ${num(2 * p.f)} Hz`, `→ ${si(r.Vout, 'V')} out, ripple ${si(r.rip2, 'V')} p-p (${num(r.ripDb, 3)} dB below the reservoir)`]));
      S('Transformer rating', `<p>A capacitor-input rectifier draws current in short pulses, so the winding's rms current is well above the DC load current and the transformer must be rated for it.</p>` +
        eq([`Winding current ${si(r.IsecRms, 'A')} rms for ${si(p.I, 'A')} DC (${num(r.IsecRms / Math.max(1e-12, p.I), 3)}×)`, r.ct ? `VA = 2 × V${sub('sec')} × I${sub('rms')} (two half windings, each used half the time)` : `VA = V${sub('sec')} × I${sub('rms')}`, `→ ${si(r.VA, 'VA')} for ${si(r.Pdc, 'W')} of DC`]));
      S('Stored energy', eq([`E = ½·C·V² = ${si(r.energy, 'J')}`, r.tSafe != null ? `Bleeder: t = R·C·ln(V/50) = ${num(r.tSafe, 3)} s to fall below 50 V, dissipating ${si(r.Pbleed, 'W')} while running` : (r.Vnl > 50 ? 'No bleeder: the capacitors hold their charge after switch-off.' : 'Below 50 V.')]) + (r.Vnl > 50 ? `<p>Voltages here can kill. Measure the capacitors before touching anything, even with a bleeder fitted.</p>` : ''));
      return out;
    }
    S('Turns ratio', `<p>A transformer multiplies impedance by the square of its turns ratio. The tube sees the speaker, plus the winding resistances, scaled up.</p>` +
      eq([`n = √(Z${sub('p')}/Z${sub('s')}) = √(${num(p.Zp)}/${num(p.Zs)}) = ${num(r.n)} : 1`, `R′ = n²·(Z${sub('speaker')} + R${sub('sec')}) = ${si(r.Rref, 'Ω')}`, `→ load on the tube = R′ + R${sub('pri')} = ${si(r.Rin, 'Ω')}`]));
    S('Bass: primary inductance', `<p>The primary inductance sits across the signal. At low frequency its reactance falls and shunts the signal away. The corner is where it equals the source and load resistances in parallel.</p>` +
      eq([`f${sub('low')} = ((r${sub('p')} + R${sub('pri')}) ∥ R′) / (2π·L${sub('p')}) = ${si(C.par(r.src, r.Rref), 'Ω')} / (2π × ${num(p.Lp)} H)`, `→ ${num(r.fLo, 3)} Hz`, r.LpReq != null ? `= For ${num(p.fT)} Hz: L${sub('p')} ≥ ${si(r.LpReq, 'H')}` : null]) +
      `<p>This is the small-signal figure. At full power the core approaches saturation, inductance falls and bass distortion rises; a single-ended transformer also carries DC and needs an air gap. Neither is modeled.</p>`);
    S('Treble: leakage inductance', eq([`f${sub('high')} = (r${sub('p')} + R${sub('pri')} + R′) / (2π·L${sub('leak')})`, `→ ${si(r.fHi, 'Hz')}`]) + `<p>Winding capacitance, which resonates with the leakage inductance and usually sets the real limit, is not modeled.</p>`);
    S('Losses and damping', eq([`Copper efficiency = n²·Z / (n²·(Z + R${sub('sec')}) + R${sub('pri')}) = ${pct(r.effCu)} (${num(r.lossDb, 3)} dB insertion loss)`, `Output impedance at the speaker terminals = (r${sub('p')} + R${sub('pri')})/n² + R${sub('sec')} = ${si(r.Zout, 'Ω')}`, `→ damping factor = Z/Z${sub('out')} = ${num(r.DF, 3)} (before any feedback)`]));
    return out;
  }
  return { explain, num };
})();
if (typeof module !== 'undefined') module.exports = Explain;
