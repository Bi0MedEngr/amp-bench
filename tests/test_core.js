// Physics checks: every model against a closed-form, hand, datasheet or independently computed answer.
// Run: node tests/test_core.js
const C = require('../core.js'), P = require('../presets.js');
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg + `  got ${(+a).toPrecision(6)} want ${(+b).toPrecision(6)}`); };
const rel = (a, b, r, msg) => near(a, b, Math.abs(b) * r, msg);
const D = C.defaults(), PI = Math.PI;

// ---- power: 87 dB/2.83 V/8 Ω speaker = 87 dB/W. One speaker, 1 m, 1 W → 87 dB. 4 m → −12.04 dB. 100 W → +20 dB.
let p = { ...D.power, sens: 87, ref: '1W', Z: 8, dist: 1, n: 1, room: 0, target: 87, headroom: 0 };
near(C.power(p).Pavg, 1, 1e-9, 'power: 1 W gives rated sensitivity at 1 m');
near(C.splAt({ ...p, dist: 4 }, 1), 87 - 20 * Math.log10(4), 1e-9, 'power: inverse-square, 4 m');
near(C.power({ ...p, target: 107 }).Pavg, 100, 1e-6, 'power: +20 dB needs 100 W');
near(C.sens1W({ ...p, ref: '2.83V', Z: 4 }), 87 - 3.0103, 1e-4, 'power: 2.83 V into 4 Ω is 2 W, so −3.01 dB per watt');
let r = C.power({ ...p, target: 97, headroom: 10 }); // 10 W average, 100 W peak → 28.28 Vrms, 40 Vpk, 5 A
near(r.Ppk, 100, 1e-6, 'power: 10 dB headroom is 10× power'); near(r.Vpk, 40, 1e-6, 'power: 100 W in 8 Ω is 40 V peak'); near(r.Ipk, 5, 1e-6, 'power: and 5 A peak');

// ---- tubes: model vs datasheet typical operating point (independent data); Koren fits are approximate
for (const [k, t] of Object.entries(C.TUBES)) { const d = t.ds, i = C.tubeI(t, d.Vp, d.Vg, d.Vg2), s = C.tubeSS(t, d.Vp, d.Vg, d.Vg2);
  rel(i, d.Ip, 0.30, `tube ${k}: plate current at datasheet point (A)`); rel(s.gm, d.gm, 0.35, `tube ${k}: transconductance at datasheet point (S)`); if (d.rp) rel(s.rp, d.rp, 0.30, `tube ${k}: plate resistance (Ω)`); }
// operating point satisfies Kirchhoff and the tube law together
let tp = { ...D.tube }; r = C.tube(tp);
near(r.q.Vp + r.q.Ip * tp.Ra + r.q.Ip * tp.Rk, tp.Bp, 1e-6, 'tube: B+ = Vpk + Ip·Ra + Ip·Rk (V)');
near(-r.q.Vg, r.q.Ip * tp.Rk, 1e-9, 'tube: cathode bias Vgk = −Ip·Rk (V)');
rel(C.tubeI(r.t, r.q.Vp, r.q.Vg), r.q.Ip, 1e-9, 'tube: operating point lies on the tube curve');
near(r.ss.mu, r.ss.gm * r.ss.rp, 1e-9, 'tube: µ = gm·rp');
// small-signal gain formula vs large-signal simulation with a tiny input (two different code paths)
for (const [name, over] of [['bypassed', { bypass: true }], ['unbypassed', { bypass: false }], ['12AU7 fixed bias', { tube: '12AU7', bias: 'fixed', Vg: -6, Ra: 47e3, Bp: 250 }]]) {
  const q = C.tube({ ...D.tube, ...over, auto: false, vin: 0.002 }); rel(q.gainLS, q.gain, 2e-3, `tube ${name}: µ·R/(rp + R + (µ+1)Rk) matches simulated swing`); }
// hand check of the gain formula with the solved parameters
r = C.tube({ ...D.tube, bypass: false }); { const Rac = 100e3 * 1e6 / (100e3 + 1e6); near(r.gain, r.ss.mu * Rac / (r.ss.rp + Rac + (r.ss.mu + 1) * 1500), 1e-9, 'tube: unbypassed gain, hand formula'); }
// SE power from the classic graphical formula (Vmax−Vmin)(Imax−Imin)/8 and 2nd harmonic from the 3-point formula
r = C.tube(P.list.se300b().tube);
rel(r.Pout, (r.vpMax - r.vpMin) * (r.ipMax - r.ipMin) / 8, 0.03, '300B SE: power vs (ΔV·ΔI)/8 (W)');
rel(r.hd2, Math.abs((r.ipMax + r.ipMin) / 2 - r.q.Ip) / (r.ipMax - r.ipMin), 0.05, '300B SE: 2nd harmonic vs 3-point load-line formula');
near(r.Pout > 5 && r.Pout < 11 ? 1 : 0, 1, 0, `300B SE: output ${r.Pout.toFixed(2)} W is in the 6–10 W range real amps make`);
r = C.tube(P.list.se2a3().tube); near(r.Pout > 2.5 && r.Pout < 4.5 ? 1 : 0, 1, 0, `2A3 SE: output ${r.Pout.toFixed(2)} W (datasheet: 3.5 W)`);
r = C.tube(P.list.el84().tube); near(r.Pout > 3.5 && r.Pout < 7 ? 1 : 0, 1, 0, `EL84 SE: output ${r.Pout.toFixed(2)} W (datasheet: 5.7 W)`);
// bias solver round trip
{ const b = C.tubeBiasFor(D.tube, 0.8e-3); rel(C.tubeOp({ ...D.tube, Rk: b.Rk }).Ip, 0.8e-3, 1e-6, 'tube: bias-for-current round trip'); }

// ---- class AB: closed forms and an independent time-domain integration of device dissipation
let ab = { ...D.classab, Vcc: 40, R: 8, Vdrop: 0, Iq: 0, phi: 0 }; r = C.classab(ab);
near(r.Pmax, 100, 1e-9, 'class AB: ±40 V into 8 Ω = 100 W');
near(r.full.eff, PI / 4, 1e-12, 'class B: efficiency at full swing = π/4');
near(r.worst.Pd, 2 * 40 * 40 / (PI * PI * 8), 1e-9, 'class B: worst dissipation = 2Vcc²/(π²R)');
near(r.worst.vp, 2 * 40 / PI, 1e-9, 'class B: worst case at Vp = 2Vcc/π');
for (const phi of [0, 45, 60]) { const q = { ...ab, phi }, vp = 25, N = 20000; let e = 0;
  for (let i = 0; i < N; i++) { const th = 2 * PI * (i + 0.5) / N, v = vp * Math.sin(th), cur = vp / 8 * Math.sin(th - phi * PI / 180); e += cur > 0 ? (40 - v) * cur : (40 + v) * -cur; }
  near(C.abAt(q, vp).Pd, e / N, 1e-6, `class B: dissipation at φ = ${phi}° vs integrating (Vcc − v)·i over a cycle (W)`); }
ab = { ...D.classab, Vcc: 40, R: 8, Vdrop: 0, Iq: 0, phi: 0, pairs: 2, thjc: 1, thcs: 0.5, thsa: 0.8, Ta: 25 }; r = C.classab(ab);
{ const Pd = 2 * 1600 / (PI * PI * 8); near(r.Tj, 25 + Pd * 0.8 + Pd / 4 * 1.5, 1e-9, 'class AB: junction temperature, hand thermal chain (°C)'); }

// ---- class D
let cd = { ...D.classd, topo: 'half', V: 50, R: 8, M: 1, Rds: 0, dcr: 0, tsw: 0, Qg: 0, Coss: 0, Pidle: 0, L: 45.02e-6, C: 0.3517e-6 }; r = C.classd(cd);
near(r.Pmax, 50 * 50 / 16, 1e-9, 'class D: lossless ±50 V into 8 Ω = 156.25 W');
near(r.fullL.eff, 1, 1e-12, 'class D: no loss terms → 100%');
rel(r.f0, 40e3, 1e-3, 'class D: Butterworth L = √2·R/ω, C = 1/(√2·ω·R) lands on 40 kHz'); near(r.Q, Math.SQRT1_2, 1e-3, 'class D: and Q = 0.707');
rel(r.f3, r.f0, 1e-3, 'class D: Butterworth −3 dB equals the corner'); near(20 * Math.log10(C.lcH(r.f3, r.f0, r.Q)), -3.0103, 1e-3, 'class D: response at f3 is −3.01 dB');
near(C.lcH(r.f0, r.f0, 2.5), 2.5, 1e-12, 'class D: gain at resonance = Q');
rel(r.Lbw, cd.L, 1e-3, 'class D: suggested Butterworth L'); rel(r.Cbw, cd.C, 1e-3, 'class D: suggested Butterworth C');
cd = { ...D.classd, topo: 'half', V: 50, R: 4, M: 0.9, Rds: 0.05, dcr: 0.03, fsw: 400e3, tsw: 40e-9, Qg: 30e-9, Vdrv: 12, Coss: 150e-12, Pidle: 1, L: 22e-6, C: 0.47e-6 };
{ const l = C.dLoss(cd, 100), Irms = 5, dI = 100 / (4 * 22e-6 * 400e3), hand = (25 + dI * dI / 12) * 0.08 + 0.5 * 100 * (5 * 2 * Math.SQRT2 / PI) * 40e-9 * 400e3 + 2 * 30e-9 * 12 * 400e3 + 150e-12 * 1e4 * 400e3 + 1;
  near(l.total, hand, 1e-9, 'class D: loss budget at 100 W, hand sum (W)'); near(l.dI, 2.841, 1e-3, 'class D: ripple 2Vcc/(4·L·f) (A p-p)'); }
r = C.classd({ ...cd, topo: 'full', V: 48, R: 8 }); near(r.Q, 4 * Math.sqrt(0.47 / 22), 1e-9, 'class D bridge: each leg sees half the load');

// ---- supply: ideal diode + C + constant current has an exact answer. Cap discharges on a straight line from the
// peak until it meets the rising |sine|. Solve that crossing here, independently of the simulator.
{ const Vs = 20, f = 60, Cc = 4700e-6, I = 1, Vp = Vs * Math.SQRT2, w = 2 * PI * f;
  // conduction ends where the diode current C·dv/dt = I: −C·Vp·w·sin(wt) = I after the peak → t1; then linear discharge
  const t1 = Math.asin(I / (Cc * Vp * w)) / w, v1 = Vp * Math.cos(w * t1);
  let lo = 0.25 / f, hi = 0.5 / f; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (v1 - I * (m - t1) / Cc > -Vp * Math.cos(w * m)) lo = m; else hi = m; }
  const vmin = v1 - I * (lo - t1) / Cc;
  r = C.supply({ ...D.supply, Vsec: Vs, f, topo: 'bridge', rect: 'custom', Vd: 0, Rd: 0, Rs: 0, C1: Cc, I, stage: 'none', Rb: 0 });
  rel(r.rip1, Vp - vmin, 0.01, 'supply: ripple, ideal diode + C + constant current, exact crossing (V p-p)');
  near(r.v1max, Vp, 0.02, 'supply: ideal peak = √2·Vsec (V)');
  rel(Vp - vmin, I / (2 * f * Cc), 0.2, 'supply: and the I/(2fC) rule of thumb is within 20%');
  near(r.idAvg, I, 1e-3, 'supply: charge balance, mean diode current = load current (A)'); }
const fund = (w, key) => { const n = w.length, v = w.map(q => q[key]); return C.harmonic(v, 4); }; // 2 mains cycles recorded → ripple fundamental is bin 4
{ const s = { ...D.supply, Vsec: 230, topo: 'bridge', rect: 'si', Rs: 40, C1: 100e-6, I: 0.02, stage: 'rc', R2: 2200, C2: 100e-6, Rb: 0 }; r = C.supply(s);
  near(r.v2avg, r.v1avg - 0.02 * 2200, 0.02, 'supply C-R-C: DC out = DC in − I·R (V)');
  rel(fund(r.wave, 'v2') / fund(r.wave, 'v1'), 1 / Math.hypot(1, 2 * PI * 120 * 2200 * 100e-6), 0.02, 'supply C-R-C: 120 Hz attenuation = 1/√(1 + (ωRC)²)');
  near(r.conv ? 1 : 0, 1, 0, 'supply C-R-C: shooting method converged'); }
{ const s = { ...D.supply, Rb: 0 }; r = C.supply(s); const w = 2 * PI * 120;
  near(r.v2avg, r.v1avg - 0.12 * 100, 0.02, 'supply C-L-C: DC out = DC in − I·DCR (V)');
  rel(fund(r.wave, 'v2') / fund(r.wave, 'v1'), 1 / Math.hypot(1 - w * w * 10 * 47e-6, w * 47e-6 * 100), 0.02, 'supply C-L-C: 120 Hz attenuation = 1/|1 − ω²LC + jωC·DCR|');
  near(r.conv ? 1 : 0, 1, 0, 'supply C-L-C: shooting method converged');
  near(r.idAvg, 0.12, 1e-4, 'supply C-L-C: charge balance (A)');
  const b = C.supply({ ...s, Rb: 220e3 }); rel(b.tSafe, 220e3 * 94e-6 * Math.log(b.Vnl / 50), 1e-9, 'supply: bleeder time to 50 V = R·C·ln(V/50) (s)'); }
{ const a = C.supply({ ...D.supply, topo: 'ct', rect: 'si', stage: 'none' }), b = C.supply({ ...D.supply, topo: 'bridge', rect: 'si', stage: 'none' });
  rel(a.VA / b.VA, Math.SQRT2 * a.idRms / b.idRms, 1e-9, 'supply: center-tap winding VA = √2 × bridge for the same current'); }

// ---- output transformer
let ot = { ...D.opt, Zp: 3200, Zs: 8, Zl: 8, rp: 800, Rpri: 0, Rsec: 0, Lp: 20, Ll: 0 }; r = C.opt(ot);
near(r.n, 20, 1e-12, 'OPT: 3200:8 is a 20:1 turns ratio'); near(r.Rref, 3200, 1e-9, 'OPT: 8 Ω reflects as 3.2 kΩ');
near(r.fLo, (800 * 3200 / 4000) / (2 * PI * 20), 1e-9, 'OPT: bass corner = (rp ∥ R′)/(2πLp)');
near(20 * Math.log10(r.H(r.fLo) / r.mid), -3.0103, 1e-3, 'OPT: full circuit is −3.01 dB at the bass corner');
near(r.DF, 8 / (800 / 400), 1e-9, 'OPT: damping factor = Z / (rp/n²)');
r = C.opt({ ...ot, Lp: 1e6, Ll: 20e-3 }); near(r.fHi, 4000 / (2 * PI * 20e-3), 1e-6, 'OPT: treble corner = (rp + R′)/(2πLleak)');
near(20 * Math.log10(r.H(r.fHi) / r.mid), -3.0103, 1e-2, 'OPT: full circuit is −3.01 dB at the treble corner');
r = C.opt({ ...ot, Rpri: 160, Rsec: 0.4 }); near(r.effCu, 3200 / (400 * 8.4 + 160), 1e-12, 'OPT: copper efficiency = n²Z/(n²(Z + Rs) + Rp)');
r = C.opt({ ...ot, fT: 10 }); near(r.LpReq, 640 / (2 * PI * 10), 1e-9, 'OPT: inductance needed for a 10 Hz corner (H)');

// ---- every example solves, with finite headline numbers and no failed checks
for (const k of Object.keys(P.list)) { const m = P.list[k](), s = C.run(m); const bad = s.ok && s.checks ? s.checks.filter(c => c.level === 'fail').length : 0;
  near(s.ok && !bad ? 1 : 0, 1, 0, `example ${k} (${m.lab}) solves${s.ok ? '' : ': ' + s.message}${bad ? ' but fails a check' : ''}`); }
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
