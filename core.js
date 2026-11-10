// Amp Bench — engineering core. Pure functions only: no DOM, so node tests can run it directly.
// Units inside the core are SI base units: V, A, Ω, F, H, Hz, W, s. The UI scales for display (mA, µF, kΩ…).
// Labs: power (SPL and amplifier power), tube (triode / pentode stage on its load line), classab, classd,
// supply (rectifier + reservoir + RC/LC filter, time-domain periodic steady state), opt (output transformer).
const Core = (() => {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI, log10 = Math.log10;
  const par = (a, b) => (a === Infinity ? b : b === Infinity ? a : a * b / (a + b));
  const fail = message => ({ ok: false, message });
  function bisect(f, lo, hi, n = 70) { const up = f(lo) > 0; for (let i = 0; i < n; i++) { const m = (lo + hi) / 2; if ((f(m) > 0) === up) lo = m; else hi = m; } return (lo + hi) / 2; }
  // engineering notation: si(0.0012, 'A') → "1.2 mA"
  function si(v, unit = '', sig = 3) {
    if (v == null || !isFinite(v)) return v === Infinity ? '∞' : '—';
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v), P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    const [m, pre] = P.find(q => a >= q[0] * 0.9995) || P[P.length - 1];
    return String(+(v / m).toPrecision(sig)).replace('-', '−') + ' ' + pre + unit;
  }
  // amplitude of harmonic k of one full cycle of samples
  function harmonic(v, k) { let a = 0, b = 0; const N = v.length; for (let i = 0; i < N; i++) { a += v[i] * Math.cos(TAU * k * i / N); b += v[i] * Math.sin(TAU * k * i / N); } return 2 * Math.hypot(a, b) / N; }

  // ---------------------------------------------------------------- power and SPL
  // SPL at the listener = sensitivity (1 W, 1 m) + 10·log P − 20·log d + 10·log n + room gain.
  function sens1W(p) { return p.sens - (p.ref === '2.83V' ? 10 * log10(8 / p.Z) : 0); }
  function splAt(p, P) { return sens1W(p) + 10 * log10(P) - 20 * log10(p.dist) + 10 * log10(p.n) + p.room; }
  function power(p) {
    if (!(p.Z > 0 && p.dist > 0 && p.n >= 1)) return fail('Impedance, distance and speaker count must be positive.');
    const s1 = sens1W(p), base = splAt(p, 1);
    const Pavg = Math.pow(10, (p.target - base) / 10), Ppk = Pavg * Math.pow(10, p.headroom / 10);
    const Vrms = Math.sqrt(Ppk * p.Z), Vpk = Vrms * Math.SQRT2, Ipk = Vpk / p.Z, IpkMin = Vpk / (p.Zmin > 0 ? p.Zmin : p.Z);
    const curve = []; for (let i = 0; i <= 80; i++) { const P = Math.pow(10, -2 + 5 * i / 80); curve.push([P, base + 10 * log10(P)]); }
    return { ok: true, kind: 'power', s1, base, Pavg, Ppk, Vrms, Vpk, Ipk, IpkMin, curve, peakSPL: p.target + p.headroom };
  }

  // ---------------------------------------------------------------- tubes (Koren models)
  // Triode:  E1 = Vp/kp · ln(1 + exp(kp·(1/µ + Vg/√(kvb + Vp²)))),  Ip = 2·E1^ex / kg1
  // Pentode: E1 = Vg2/kp · ln(1 + exp(kp·(1/µ + Vg/Vg2))),          Ip = 2·E1^ex / kg1 · atan(Vp/kvb)
  // ds = datasheet typical operating point used by the tests. src: 'Koren' = Norman Koren's published fit,
  // 'fit' = fitted for this tool to the datasheet points.
  const TUBES = {
    '12AX7': { name: '12AX7 / ECC83', type: 'triode', mu: 100, ex: 1.4, kg1: 1060, kp: 600, kvb: 300, Pmax: 1.0, Vmax: 330, cgp: 1.7e-12, cgk: 1.6e-12, src: 'Koren', ds: { Vp: 250, Vg: -2, Ip: 1.2e-3, gm: 1.6e-3, rp: 62.5e3 } },
    '12AT7': { name: '12AT7 / ECC81', type: 'triode', mu: 60, ex: 1.35, kg1: 460, kp: 300, kvb: 300, Pmax: 2.5, Vmax: 330, cgp: 1.5e-12, cgk: 2.2e-12, src: 'Koren', ds: { Vp: 250, Vg: -2, Ip: 10e-3, gm: 5.5e-3, rp: 10.9e3 } },
    '12AU7': { name: '12AU7 / ECC82', type: 'triode', mu: 21.5, ex: 1.3, kg1: 1180, kp: 84, kvb: 300, Pmax: 2.75, Vmax: 330, cgp: 1.5e-12, cgk: 1.6e-12, src: 'Koren', ds: { Vp: 250, Vg: -8.5, Ip: 10.5e-3, gm: 2.2e-3, rp: 7.7e3 } },
    '6SN7': { name: '6SN7GTB', type: 'triode', mu: 22, ex: 1.35, kg1: 1350, kp: 120, kvb: 1200, Pmax: 5.0, Vmax: 450, cgp: 4.0e-12, cgk: 2.8e-12, src: 'fit', ds: { Vp: 250, Vg: -8, Ip: 9e-3, gm: 2.6e-3, rp: 7.7e3 } },
    '6DJ8': { name: '6DJ8 / ECC88', type: 'triode', mu: 28, ex: 1.3, kg1: 330, kp: 320, kvb: 300, Pmax: 1.8, Vmax: 130, cgp: 1.4e-12, cgk: 3.3e-12, src: 'Koren', ds: { Vp: 90, Vg: -1.3, Ip: 15e-3, gm: 12.5e-3, rp: 2.64e3 } },
    '2A3': { name: '2A3', type: 'triode', mu: 4.2, ex: 1.4, kg1: 1500, kp: 60, kvb: 300, Pmax: 15, Vmax: 300, cgp: 16.5e-12, cgk: 7.5e-12, src: 'Koren', ds: { Vp: 250, Vg: -45, Ip: 60e-3, gm: 5.25e-3, rp: 800 } },
    '300B': { name: '300B', type: 'triode', mu: 3.95, ex: 1.4, kg1: 1550, kp: 65, kvb: 300, Pmax: 40, Vmax: 450, cgp: 15e-12, cgk: 9e-12, src: 'Koren', ds: { Vp: 300, Vg: -61, Ip: 62e-3, gm: 5.5e-3, rp: 700 } },
    'EL84': { name: 'EL84 / 6BQ5', type: 'pentode', mu: 23.5, ex: 1.25, kg1: 355, kg2: 820, kp: 90, kvb: 24, Pmax: 12, Vmax: 300, src: 'fit', ds: { Vp: 250, Vg2: 250, Vg: -7.3, Ip: 48e-3, gm: 11.3e-3 } },
    '6L6GC': { name: '6L6GC', type: 'pentode', mu: 8.7, ex: 1.35, kg1: 1460, kg2: 4500, kp: 48, kvb: 12, Pmax: 30, Vmax: 500, src: 'Koren', ds: { Vp: 250, Vg2: 250, Vg: -14, Ip: 72e-3, gm: 6e-3 } },
    'EL34': { name: 'EL34 / 6CA7', type: 'pentode', mu: 11, ex: 1.35, kg1: 650, kg2: 4200, kp: 60, kvb: 24, Pmax: 25, Vmax: 800, src: 'Koren', ds: { Vp: 250, Vg2: 250, Vg: -13.5, Ip: 100e-3, gm: 11e-3 } },
    'KT88': { name: 'KT88', type: 'pentode', mu: 8.8, ex: 1.35, kg1: 730, kg2: 4200, kp: 32, kvb: 16, Pmax: 42, Vmax: 800, src: 'Koren', ds: { Vp: 250, Vg2: 250, Vg: -15, Ip: 140e-3, gm: 11.5e-3 } },
  };
  const softplus = x => (x > 40 ? x : Math.log1p(Math.exp(x)));
  function tubeI(t, Vp, Vg, Vg2) {
    if (!(Vp > 0)) return 0;
    if (t.type === 'triode') { const E1 = Vp / t.kp * softplus(t.kp * (1 / t.mu + Vg / Math.sqrt(t.kvb + Vp * Vp))); return 2 * Math.pow(E1, t.ex) / t.kg1; }
    const E1 = Vg2 / t.kp * softplus(t.kp * (1 / t.mu + Vg / Vg2));
    return 2 * Math.pow(E1, t.ex) / t.kg1 * Math.atan(Vp / t.kvb);
  }
  function screenI(t, Vg, Vg2) { if (t.type !== 'pentode') return 0; const e = Vg2 / t.mu + Vg; return e > 0 ? Math.pow(e, t.ex) / t.kg2 : 0; }
  // small-signal parameters at a point, by central differences
  function tubeSS(t, Vp, Vg, Vg2) {
    const dg = 0.005, dv = 0.05;
    const gm = (tubeI(t, Vp, Vg + dg, Vg2) - tubeI(t, Vp, Vg - dg, Vg2)) / (2 * dg);
    const gp = (tubeI(t, Vp + dv, Vg, Vg2) - tubeI(t, Vp - dv, Vg, Vg2)) / (2 * dv);
    return { gm, rp: 1 / gp, mu: gm / gp };
  }
  // DC operating point. Voltages are plate-to-cathode and grid-to-cathode.
  function tubeOp(p) {
    const t = TUBES[p.tube], se = p.mode === 'se', Rdc = se ? p.Rdc : p.Ra, cath = p.bias === 'cathode', Rk = cath ? p.Rk : 0, Vg2 = p.Vg2;
    let Vg, Ip;
    if (cath) {
      if (!(Rk > 0)) return null;
      const x = bisect(xx => { const ip = Math.max(0, xx / Rk - screenI(t, -xx, Vg2)); return tubeI(t, p.Bp - ip * Rdc - xx, -xx, Vg2) - ip; }, 0, p.Bp);
      Vg = -x; Ip = Math.max(0, x / Rk - screenI(t, -x, Vg2));
    } else {
      Vg = p.Vg; Ip = Rdc > 1e-9 ? bisect(ip => tubeI(t, p.Bp - ip * Rdc, Vg, Vg2) - ip, 0, p.Bp / Rdc) : tubeI(t, p.Bp, Vg, Vg2);
    }
    const Ig2 = screenI(t, Vg, Vg2), Vk = cath ? -Vg : 0;
    return { t, se, Rdc, cath, Rk, Vg, Ip, Ig2, Vk, Vp: p.Bp - Ip * Rdc - Vk };
  }
  // bias that puts the idle plate current at Itarget: returns { Rk } or { Vg }
  function tubeBiasFor(p, Itarget) {
    if (p.bias === 'cathode') return { Rk: bisect(rk => { const o = tubeOp({ ...p, Rk: rk }); return (o ? o.Ip : 0) - Itarget; }, 1, 1e6) };
    const t = TUBES[p.tube], lim = t.type === 'triode' ? -1.5 * p.Bp / t.mu - 10 : -1.5 * p.Vg2 / t.mu - 10;
    return { Vg: bisect(vg => tubeOp({ ...p, Vg: vg }).Ip - Itarget, lim, 0) };
  }
  function niceStep(raw) { const e = Math.pow(10, Math.floor(log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * e; }
  function tube(p, o) {
    const t = TUBES[p.tube]; if (!t) return fail('Unknown tube.');
    if (!(p.Bp > 0)) return fail('B+ must be positive.');
    const q = tubeOp(p); if (!q) return fail('Cathode resistor must be greater than zero.');
    const { se, Rdc, cath, Rk } = q, pent = t.type === 'pentode', Vg2 = p.Vg2;
    if (!(q.Ip > 1e-9)) return fail('The tube is cut off: no plate current at this bias.');
    const ss = tubeSS(t, q.Vp, q.Vg, Vg2);
    const Rac = se ? p.Zp : par(p.Ra, p.Rl > 0 ? p.Rl : Infinity);
    const RkAC = cath && !p.bypass ? Rk : 0;
    const gain = ss.mu * Rac / (ss.rp + Rac + (ss.mu + 1) * RkAC);
    const rsrc = ss.rp + (ss.mu + 1) * RkAC, Zout = se ? rsrc : par(p.Ra, rsrc);
    const fBypass = cath && p.bypass && p.Ck > 0 ? 1 / (TAU * p.Ck * par(Rk, (ss.rp + Rac) / (ss.mu + 1))) : null;
    const fCouple = !se && p.Rl > 0 && p.Cc > 0 ? 1 / (TAU * p.Cc * (Zout + p.Rl)) : null;
    const Cin = pent ? null : t.cgk + t.cgp * (1 + gain), fMiller = Cin && p.Rsrc > 0 ? 1 / (TAU * p.Rsrc * Cin) : null;
    // large-signal swing along the AC load line
    const vin = p.auto ? -q.Vg : Math.max(0, p.vin), Rsw = Rac + RkAC, Itop = q.Ip + q.Vp / Rsw;
    const at = v => {
      const f = ip => { const d = ip - q.Ip; return tubeI(t, q.Vp - d * Rsw, Math.min(0, q.Vg + v - d * RkAC), Vg2) - ip; };
      const ip = f(0) <= 0 ? 0 : bisect(f, 0, Itop * 1.0001), d = ip - q.Ip;
      return { ip, vp: q.Vp - d * Rsw, vg: Math.min(0, q.Vg + v - d * RkAC), vout: -d * Rac };
    };
    const N = 256, wave = [], vo = [];
    let ipMin = Infinity, ipMax = 0, vpMin = Infinity, vpMax = 0, gridLimit = false;
    for (let i = 0; i < N; i++) { const v = vin * Math.sin(TAU * i / N), s = at(v); wave.push({ th: i / N, vin: v, vout: s.vout, vp: s.vp, ip: s.ip }); vo.push(s.vout); ipMin = Math.min(ipMin, s.ip); ipMax = Math.max(ipMax, s.ip); vpMin = Math.min(vpMin, s.vp); vpMax = Math.max(vpMax, s.vp); if (q.Vg + v >= -1e-9 && RkAC === 0) gridLimit = true; }
    const h1 = harmonic(vo, 1), h2 = harmonic(vo, 2), h3 = harmonic(vo, 3), h4 = harmonic(vo, 4), h5 = harmonic(vo, 5);
    const thd = h1 > 0 ? Math.hypot(h2, h3, h4, h5) / h1 : 0;
    const Pout = se ? h1 * h1 / (2 * p.Zp) : null, Pq = q.Vp * q.Ip, Pin = p.Bp * (q.Ip + q.Ig2);
    // plate curves
    const iDC = p.Bp / Math.max(1e-9, Rdc + Rk);
    const xmax = o && o.xmax ? o.xmax : se ? 1.08 * Math.max(vpMax, q.Vp + q.Ip * Rsw * 0.6, p.Bp) : 1.05 * p.Bp;
    const ymax = o && o.ymax ? o.ymax : 1.15 * (se ? Math.min(Itop, Math.max(2.4 * q.Ip, ipMax)) : Math.max(iDC, Math.min(Itop, 1.6 * iDC)));
    const step = niceStep((pent ? Vg2 : xmax) / t.mu / 7), curves = [];
    for (let k = 0; k < 16; k++) {
      const vg = -k * step, pts = []; for (let i = 0; i <= 90; i++) { const V = xmax * i / 90; pts.push([V, tubeI(t, V, vg, Vg2)]); }
      if (k > 1 && pts[90][1] < 0.012 * ymax) break; curves.push({ vg, pts });
    }
    const pd = []; for (let i = 1; i <= 90; i++) { const V = xmax * i / 90; pd.push([V, t.Pmax / V]); }
    const checks = [];
    const chk = (level, title, detail) => checks.push({ level, title, detail });
    chk(Pq > t.Pmax ? 'fail' : Pq > 0.9 * t.Pmax ? 'warn' : 'pass', 'Plate dissipation at idle', `${si(Pq, 'W')} of ${si(t.Pmax, 'W')} allowed (${(100 * Pq / t.Pmax).toFixed(0)}%)`);
    chk(q.Vp > 1.1 * t.Vmax ? 'fail' : q.Vp > t.Vmax ? 'warn' : 'pass', 'Plate voltage at idle', `${si(q.Vp, 'V')} of ${si(t.Vmax, 'V')} rated`);
    chk(q.Vg > -0.7 ? 'warn' : 'pass', 'Grid bias clear of grid current', `Grid sits at ${si(q.Vg, 'V')}; grid current starts near −0.5 to −1 V`);
    if (ipMin < 0.03 * q.Ip) chk('warn', 'Swing reaches cutoff', 'The tube shuts off on part of the cycle: hard clipping on that half.');
    else chk('pass', 'Swing stays out of cutoff', `Minimum plate current ${si(ipMin, 'A')}`);
    if (vin > -q.Vg + 1e-9) chk('warn', 'Input drives the grid positive', `Input peak ${si(vin, 'V')} exceeds the ${si(-q.Vg, 'V')} bias: the grid clips unless the driver can supply grid current.`);
    return { ok: true, kind: 'tube', t, pent, se, cath, q, ss, Rac, RkAC, Rdc, gain, gainDb: 20 * log10(Math.abs(gain)), Zout, fBypass, fCouple, Cin, fMiller, vin, wave, h1, h2, h3, thd, hd2: h1 ? h2 / h1 : 0, hd3: h1 ? h3 / h1 : 0,
      gainLS: vin > 0 ? h1 / vin : gain, voPk: Math.max(...vo), voNeg: Math.min(...vo), Pout, Pq, Pin, eff: se && Pin > 0 ? Pout / Pin : null, ipMin, ipMax, vpMin, vpMax, gridLimit,
      curves, step, xmax, ymax, pd, dcLine: [[p.Bp, 0], [Math.max(0, p.Bp - ymax * (Rdc + Rk)), Math.min(ymax, iDC)]], acLine: [[q.Vp + q.Ip * Rsw, 0], [Math.max(0, q.Vp - (ymax - q.Ip) * Rsw), Math.min(ymax, Itop)]], checks };
  }

  // ---------------------------------------------------------------- class AB output stage (ideal class B + quiescent)
  // Sine drive, split rails ±Vcc, load |Z| at phase φ. Output P = Vp²cosφ/2Z, supply P = 2·Vcc·Vp/(πZ).
  function abAt(p, vp) { const c = Math.cos(p.phi * PI / 180), Pout = vp * vp * c / (2 * p.R), Psup = 2 * p.Vcc * vp / (PI * p.R) + 2 * p.Vcc * p.Iq; return { vp, Pout, Psup, Pd: Psup - Pout, eff: Psup > 0 ? Pout / Psup : 0 }; }
  function classab(p) {
    if (!(p.Vcc > 0 && p.R > 0)) return fail('Rail voltage and load must be positive.');
    const Vpk = p.Vcc - p.Vdrop; if (!(Vpk > 0)) return fail('Output stage drop is larger than the rail.');
    if (!(Math.abs(p.phi) < 89)) return fail('Load phase angle must be under 89°.');
    const c = Math.cos(p.phi * PI / 180), full = abAt(p, Vpk), worst = abAt(p, Math.min(Vpk, 2 * p.Vcc / (PI * c)));
    const nDev = 2 * Math.max(1, Math.round(p.pairs)), Pdev = worst.Pd / nDev;
    const Tj = p.Ta + worst.Pd * p.thsa + Pdev * (p.thjc + p.thcs), thsaReq = (p.Tjmax - p.Ta - Pdev * (p.thjc + p.thcs)) / worst.Pd;
    const curve = []; for (let i = 0; i <= 100; i++) curve.push(abAt(p, Vpk * Math.sqrt(i / 100)));
    const checks = [];
    checks.push({ level: Tj > p.Tjmax ? 'fail' : Tj > p.Tjmax - 20 ? 'warn' : 'pass', title: 'Junction temperature, worst case', detail: `${Tj.toFixed(0)} °C against ${p.Tjmax} °C limit` });
    checks.push({ level: thsaReq <= 0 ? 'fail' : thsaReq < 0.3 ? 'warn' : 'pass', title: 'Heatsink needed', detail: thsaReq > 0 ? `${thsaReq.toFixed(2)} °C/W or better${thsaReq < 0.3 ? ' — that is a very large or fan-cooled sink' : ''}` : 'No heatsink can do it: add device pairs or lower the rails' });
    return { ok: true, kind: 'classab', Vpk, Pmax: full.Pout, full, worst, nDev, Pdev, Tj, thsaReq, Ipk: Vpk / p.R, IrailAvg: Vpk / (PI * p.R) + p.Iq, PpkDev: p.Vcc * p.Vcc / (4 * p.R) / (nDev / 2), curve, checks };
  }

  // ---------------------------------------------------------------- class D
  function lcH(f, f0, Q) { const u = f / f0, re = 1 - u * u, im = Q === Infinity ? 0 : u / Q; return 1 / Math.hypot(re, im); }
  function dLoss(p, Po) {
    const full = p.topo === 'full', legs = full ? 2 : 1, nF = 2 * legs, Vleg = full ? p.V : 2 * p.V, Rser = legs * (p.Rds + p.dcr);
    const Irms = Math.sqrt(Po / p.R), Iavg = Irms * 2 * Math.SQRT2 / PI, dI = Vleg / (4 * p.L * p.fsw), Irip = dI / (2 * Math.sqrt(3));
    const cond = (Irms * Irms + Irip * Irip) * Rser, sw = legs * 0.5 * Vleg * Iavg * p.tsw * p.fsw, gate = nF * p.Qg * p.Vdrv * p.fsw, coss = legs * p.Coss * Vleg * Vleg * p.fsw;
    const total = cond + sw + gate + coss + p.Pidle;
    return { Po, cond, sw, gate, coss, idle: p.Pidle, total, eff: Po / (Po + total), dI };
  }
  function classd(p) {
    if (!(p.V > 0 && p.R > 0 && p.L > 0 && p.C > 0 && p.fsw > 0)) return fail('Bus voltage, load, L, C and switching frequency must be positive.');
    const full = p.topo === 'full', legs = full ? 2 : 1, Vleg = full ? p.V : 2 * p.V, Rser = legs * (p.Rds + p.dcr), Req = full ? p.R / 2 : p.R;
    const Vpk = p.M * p.V * p.R / (p.R + Rser), Pmax = Vpk * Vpk / (2 * p.R);
    const f0 = 1 / (TAU * Math.sqrt(p.L * p.C)), Q = Req * Math.sqrt(p.C / p.L);
    const loads = [['½×', p.R / 2], ['1×', p.R], ['2×', 2 * p.R], ['open', Infinity]].map(([label, R]) => {
      const q = R === Infinity ? Infinity : (full ? R / 2 : R) * Math.sqrt(p.C / p.L), pts = [];
      for (let i = 0; i <= 240; i++) { const f = Math.pow(10, 3 + 3 * i / 240); pts.push([f, Math.max(-80, Math.min(40, 20 * log10(lcH(f, f0, q))))]); }
      return { label, R, Q: q, pts };
    });
    const g20 = 20 * log10(lcH(20e3, f0, Q)), gsw = 20 * log10(lcH(p.fsw, f0, Q));
    const f3 = Q > 0 ? f0 * Math.sqrt((1 - 1 / (2 * Q * Q)) + Math.sqrt(Math.pow(1 - 1 / (2 * Q * Q), 2) + 1)) : 0;
    const carrier = (4 / PI) * (Vleg / 2) * lcH(p.fsw, f0, Q) / Math.SQRT2 * (full ? 0 : 1);
    const w0 = TAU * f0, Lbw = Math.SQRT2 * Req / w0, Cbw = 1 / (w0 * Req * Math.SQRT2);
    const fullL = dLoss(p, Pmax), eighth = dLoss(p, Pmax / 8), idle = dLoss(p, 0), eff = [];
    for (let i = 0; i <= 90; i++) { const Po = Pmax * Math.pow(10, -3 + 3 * i / 90); eff.push([Po, 100 * dLoss(p, Po).eff]); }
    const checks = [];
    checks.push({ level: Q > 1.3 ? 'warn' : Q < 0.45 ? 'warn' : 'pass', title: 'Filter damping at this load', detail: `Q = ${Q.toFixed(2)} (0.707 is flat; ${Q > 1.3 ? 'peaks in the treble' : Q < 0.45 ? 'rolls off early' : 'close to flat'})` });
    checks.push({ level: Math.abs(g20) > 1 ? 'warn' : 'pass', title: 'Response at 20 kHz', detail: `${g20 >= 0 ? '+' : '−'}${Math.abs(g20).toFixed(2)} dB` });
    checks.push({ level: p.fsw < 5 * f0 ? 'warn' : 'pass', title: 'Carrier well above the filter corner', detail: `Switching at ${(p.fsw / f0).toFixed(1)}× the corner, carrier down ${(-gsw).toFixed(0)} dB` });
    checks.push({ level: fullL.dI > 0.4 * Vpk / p.R ? 'warn' : 'pass', title: 'Inductor ripple current', detail: `${si(fullL.dI, 'A')} peak-to-peak at idle, vs ${si(Vpk / p.R, 'A')} peak signal current` });
    return { ok: true, kind: 'classd', full, Vleg, Rser, Req, Vpk, Pmax, f0, Q, f3, g20, gsw, carrier, Lbw, Cbw, loads, fullL, eighth, idle, eff, Ipk: Vpk / p.R, checks };
  }

  // ---------------------------------------------------------------- power supply (periodic steady state by shooting)
  // Source |Vpk·sin ωt| behind diode drop(s) and series resistance, reservoir C1, constant-current load,
  // optional RC or LC second stage, optional bleeder across the output.
  const RECTS = {
    si: { name: 'Silicon diode', Vd: 0.9, Rd: 0.02 }, schottky: { name: 'Schottky diode', Vd: 0.5, Rd: 0.02 },
    GZ34: { name: 'GZ34 / 5AR4 tube', Vd: 2, Rd: 67 }, '5U4GB': { name: '5U4GB tube', Vd: 4, Rd: 178 }, '5Y3GT': { name: '5Y3GT tube', Vd: 5, Rd: 440 },
  };
  function solveLin(A, b) { const n = b.length; for (let i = 0; i < n; i++) { let pv = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[pv][i])) pv = r; [A[i], A[pv]] = [A[pv], A[i]]; [b[i], b[pv]] = [b[pv], b[i]]; if (Math.abs(A[i][i]) < 1e-300) return null; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } } const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; } return x; }
  function supply(p) {
    const rect = p.rect === 'custom' ? { name: 'Custom', Vd: p.Vd, Rd: p.Rd } : RECTS[p.rect]; if (!rect) return fail('Unknown rectifier.');
    if (!(p.Vsec > 0 && p.f > 0 && p.C1 > 0 && p.I >= 0)) return fail('Secondary voltage, mains frequency and reservoir capacitor must be positive.');
    const st = p.stage, ct = p.topo === 'ct', nd = ct ? 1 : 2, w = TAU * p.f, T = 1 / p.f, Vpk = p.Vsec * Math.SQRT2, Vd = nd * rect.Vd, Rt = Math.max(1e-3, p.Rs + nd * rect.Rd);
    if (st === 'rc' && !(p.R2 > 0 && p.C2 > 0)) return fail('Filter resistor and second capacitor must be positive.');
    if (st === 'lc' && !(p.L > 0 && p.C2 > 0)) return fail('Choke inductance and second capacitor must be positive.');
    const C1 = p.C1, I = p.I, R2 = p.R2, L = p.L, dcr = p.dcr, C2 = p.C2, Rb = p.Rb > 0 ? p.Rb : Infinity;
    const NH = 4000, dt = T / (2 * NH), dim = st === 'none' ? 1 : st === 'rc' ? 2 : 3, Rser = st === 'rc' ? R2 : st === 'lc' ? dcr : 0;
    const dcOut = v1m => (st === 'none' ? v1m : (v1m - I * Rser) / (1 + Rser / Rb));
    // advance the state s = [v1, v2, iL] by `steps` from the start of a half cycle; optional recorder
    function sim(s, steps, rec) {
      let v1 = s[0], v2 = s[1], iL = s[2];
      for (let k = 0; k < steps; k++) {
        const e = Vpk * Math.abs(Math.sin(w * (k + 1) * dt)) - Vd;
        const iout = st === 'none' ? I + v1 / Rb : st === 'rc' ? (v1 - v2) / R2 : iL;
        const vnc = v1 - dt * iout / C1; let id = 0;
        if (e > vnc) { v1 = (v1 + dt / C1 * (e / Rt - iout)) / (1 + dt / (C1 * Rt)); id = (e - v1) / Rt; } else v1 = vnc;
        if (st === 'rc') v2 += dt / C2 * ((v1 - v2) / R2 - I - v2 / Rb);
        else if (st === 'lc') { iL += dt / L * (v1 - v2 - iL * dcr); v2 += dt / C2 * (iL - I - v2 / Rb); }
        if (rec) rec(k, e + Vd, v1, st === 'none' ? v1 : v2, id, iout);
      }
      return [v1, v2, iL];
    }
    let s = [Vpk - Vd, 0, 0]; s[1] = dcOut(s[0]); s[2] = I + (st === 'lc' ? s[1] / Rb : 0);
    for (let i = 0; i < 6; i++) s = sim(s, NH);
    let conv = false;
    for (let it = 0; it < 30 && !conv; it++) {
      const P = sim(s, NH), F = []; for (let i = 0; i < dim; i++) F.push(P[i] - s[i]);
      const scale = Math.max(1, Math.abs(s[0])); if (Math.max(...F.map(Math.abs)) < 1e-10 * scale) { conv = true; break; }
      const J = []; for (let i = 0; i < dim; i++) J.push(new Array(dim));
      for (let j = 0; j < dim; j++) { const d = 1e-5 * Math.max(1, Math.abs(s[j])), sp = s.slice(); sp[j] += d; const Pp = sim(sp, NH); for (let i = 0; i < dim; i++) J[i][j] = (Pp[i] - P[i]) / d - (i === j ? 1 : 0); }
      const dx = solveLin(J, F.map(x => -x)); if (!dx || dx.some(x => !isFinite(x))) break;
      for (let i = 0; i < dim; i++) s[i] += dx[i];
    }
    if (!conv) for (let i = 0; i < 600; i++) s = sim(s, NH);
    // measure two full mains cycles
    const M = 4 * NH, every = Math.round(M / 640), wave = [];
    let v1min = Infinity, v1max = -Infinity, v1sum = 0, v2min = Infinity, v2max = -Infinity, v2sum = 0, idPk = 0, id2 = 0, idSum = 0, ic2 = 0, on = 0;
    sim(s, M, (k, vs, v1, v2, id, iout) => {
      v1min = Math.min(v1min, v1); v1max = Math.max(v1max, v1); v1sum += v1; v2min = Math.min(v2min, v2); v2max = Math.max(v2max, v2); v2sum += v2;
      idPk = Math.max(idPk, id); id2 += id * id; idSum += id; ic2 += (id - iout) * (id - iout); if (id > 0) on++;
      if (k % every === 0) wave.push({ t: (k + 1) * dt, vs, v1, v2, id });
    });
    const v1avg = v1sum / M, v2avg = v2sum / M, idRms = Math.sqrt(id2 / M), Vout = st === 'none' ? v1avg : v2avg;
    if (!(v1min > 0) || !(Vout > 0)) return fail('The load pulls the supply to zero: lower the current or the series resistance.');
    const rip1 = v1max - v1min, rip2 = st === 'none' ? rip1 : v2max - v2min, IsecRms = ct ? idRms / Math.SQRT2 : idRms, VA = ct ? 2 * p.Vsec * IsecRms : p.Vsec * IsecRms;
    const Vnl = Vpk - nd * rect.Vd, Ctot = C1 + (st === 'none' ? 0 : C2), energy = 0.5 * C1 * v1avg * v1avg + (st === 'none' ? 0 : 0.5 * C2 * v2avg * v2avg);
    const tSafe = Rb !== Infinity && Vnl > 50 ? Rb * Ctot * Math.log(Vnl / 50) : null, Pbleed = Rb !== Infinity ? Vout * Vout / Rb : 0;
    const checks = [];
    checks.push({ level: rip2 / Vout > 0.05 ? 'warn' : 'pass', title: 'Output ripple', detail: `${si(rip2, 'V')} peak-to-peak, ${(100 * rip2 / Vout).toPrecision(2)}% of ${si(Vout, 'V')}` });
    checks.push({ level: Vnl > 1.25 * Vout ? 'warn' : 'pass', title: 'No-load voltage', detail: `Capacitors see up to ${si(Vnl, 'V')} with no load (before tubes warm up, or with the amp idle): rate them above that` });
    if (Vnl > 50) checks.push({ level: tSafe == null ? 'warn' : tSafe > 120 ? 'warn' : 'pass', title: 'Stored charge after switch-off', detail: tSafe == null ? `${si(energy, 'J')} stored and no bleeder: the capacitors stay charged` : `Bleeder brings it under 50 V in ${tSafe.toFixed(0)} s (${si(Pbleed, 'W')} in the bleeder)` });
    return { ok: true, kind: 'supply', rect, ct, nd, Vpk, Vnl, v1avg, v1min, v1max, rip1, v2avg, rip2, Vout, idPk, idRms, IsecRms, VA, Pdc: Vout * I, icRms: Math.sqrt(ic2 / M), idAvg: idSum / M, conduction: on / M, energy, tSafe, Pbleed, wave, conv,
      ripDb: st === 'none' || !(rip2 > 0) ? 0 : 20 * log10(rip1 / rip2), checks };
  }

  // ---------------------------------------------------------------- output transformer
  // Source resistance rp + primary DCR, shunt primary inductance, series leakage inductance, reflected load.
  function opt(p) {
    if (!(p.Zp > 0 && p.Zs > 0 && p.Zl > 0 && p.Lp > 0)) return fail('Impedances and primary inductance must be positive.');
    const n = Math.sqrt(p.Zp / p.Zs), n2 = n * n, Rref = n2 * (p.Zl + p.Rsec), src = p.rp + p.Rpri, mid = n2 * p.Zl / (src + Rref);
    const H = f => { // |Vload'/Vsource| referred to the primary
      const w = TAU * f, br = [Rref, w * p.Ll], lp = [0, w * p.Lp];
      const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
      const zp = div(mul(lp, br), [lp[0] + br[0], lp[1] + br[1]]), va = div(zp, [zp[0] + src, zp[1]]), vo = div(mul(va, [n2 * p.Zl, 0]), br);
      return Math.hypot(vo[0], vo[1]);
    };
    const pts = []; for (let i = 0; i <= 260; i++) { const f = Math.pow(10, 0.5 + 4.8 * i / 260); pts.push([f, Math.max(-30, 20 * log10(H(f) / mid))]); }
    const Rlo = par(src, Rref), fLo = Rlo / (TAU * p.Lp), fHi = p.Ll > 0 ? (src + Rref) / (TAU * p.Ll) : Infinity;
    const effCu = n2 * p.Zl / (Rref + p.Rpri), Zout = src / n2 + p.Rsec;
    const checks = [];
    checks.push({ level: fLo > 30 ? 'warn' : 'pass', title: 'Bass corner (−3 dB)', detail: `${fLo.toPrecision(3)} Hz at small signal; expect it higher at full power as the core nears saturation` });
    checks.push({ level: fHi < 30e3 ? 'warn' : 'pass', title: 'Treble corner (−3 dB)', detail: fHi === Infinity ? 'No leakage inductance entered' : `${si(fHi, 'Hz')} from leakage inductance alone (winding capacitance not modeled)` });
    checks.push({ level: Math.abs(Rref + p.Rpri - p.Zp) / p.Zp > 0.25 ? 'warn' : 'pass', title: 'Load the tube sees', detail: `${si(Rref + p.Rpri, 'Ω')} with this speaker, against the ${si(p.Zp, 'Ω')} the stage was designed for` });
    return { ok: true, kind: 'opt', n, Rref, Rin: Rref + p.Rpri, src, mid, pts, H, fLo, fHi, effCu, lossDb: -10 * log10(effCu), Zout, DF: p.Zl / Zout, LpReq: p.fT > 0 ? Rlo / (TAU * p.fT) : null, checks };
  }

  const LABS = { power, tube, classab, classd, supply, opt };
  function run(model, o) { const f = LABS[model.lab]; if (!f) return fail('Unknown lab.'); try { return f(model[model.lab], o); } catch (e) { return fail('Could not solve: ' + e.message); } }
  function defaults() {
    return {
      lab: 'tube', name: '',
      power: { sens: 87, ref: '2.83V', Z: 8, Zmin: 5, dist: 3, n: 2, target: 85, headroom: 15, room: 0 },
      tube: { tube: '12AX7', mode: 'rc', Bp: 300, Ra: 100e3, bias: 'cathode', Rk: 1500, bypass: true, Ck: 22e-6, Rl: 1e6, Cc: 22e-9, Rsrc: 68e3, Vg: -2, Vg2: 250, Zp: 3500, Rdc: 150, auto: true, vin: 1 },
      classab: { Vcc: 35, R: 8, Vdrop: 3, Iq: 0.05, pairs: 1, phi: 0, thjc: 0.83, thcs: 0.5, Tjmax: 150, Ta: 40, thsa: 1.0 },
      classd: { topo: 'half', V: 50, R: 4, M: 0.9, Rds: 0.05, dcr: 0.03, fsw: 400e3, tsw: 40e-9, Qg: 30e-9, Vdrv: 12, Coss: 150e-12, Pidle: 1, L: 22e-6, C: 0.47e-6 },
      supply: { Vsec: 275, f: 60, topo: 'ct', rect: 'GZ34', Vd: 0.9, Rd: 0.02, Rs: 60, C1: 47e-6, I: 0.12, stage: 'lc', R2: 1000, L: 10, dcr: 100, C2: 47e-6, Rb: 220e3 },
      opt: { Zp: 3500, Zs: 8, Zl: 8, rp: 800, Rpri: 150, Rsec: 0.5, Lp: 20, Ll: 15e-3, fT: 20 },
    };
  }
  return { run, defaults, si, par, bisect, harmonic, TUBES, RECTS, tubeI, screenI, tubeSS, tubeOp, tubeBiasFor, power, splAt, sens1W, tube, classab, abAt, classd, dLoss, lcH, supply, opt };
})();
if (typeof module !== 'undefined') module.exports = Core;
