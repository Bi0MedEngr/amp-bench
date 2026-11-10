// Worked examples. Each one is a lab plus that lab's inputs (SI units); the tests solve every one.
const Presets = (() => {
  const D = () => (typeof Core !== 'undefined' ? Core : require('./core.js')).defaults();
  const mk = (lab, name, over) => () => { const m = D(); m.lab = lab; m.name = name; Object.assign(m[lab], over); return m; };
  const list = {
    ax7: mk('tube', '12AX7 preamp stage', { tube: '12AX7', mode: 'rc', Bp: 300, Ra: 100e3, bias: 'cathode', Rk: 1500, bypass: true, Ck: 22e-6, Rl: 1e6, Cc: 22e-9, Rsrc: 68e3, auto: false, vin: 0.5 }),
    au7: mk('tube', '12AU7 line stage', { tube: '12AU7', mode: 'rc', Bp: 250, Ra: 22e3, bias: 'cathode', Rk: 1000, bypass: false, Rl: 100e3, Cc: 1e-6, Rsrc: 10e3, auto: false, vin: 2 }),
    sn7: mk('tube', '6SN7 driver for a 300B', { tube: '6SN7', mode: 'rc', Bp: 400, Ra: 33e3, bias: 'cathode', Rk: 1200, bypass: true, Ck: 100e-6, Rl: 220e3, Cc: 0.22e-6, Rsrc: 47e3, auto: true }),
    se300b: mk('tube', '300B single-ended output', { tube: '300B', mode: 'se', Bp: 430, bias: 'cathode', Rk: 1000, bypass: true, Ck: 100e-6, Zp: 3500, Rdc: 150, auto: true }),
    se2a3: mk('tube', '2A3 single-ended output', { tube: '2A3', mode: 'se', Bp: 300, bias: 'cathode', Rk: 850, bypass: true, Ck: 100e-6, Zp: 2500, Rdc: 100, auto: true }),
    el84: mk('tube', 'EL84 single-ended pentode', { tube: 'EL84', mode: 'se', Bp: 265, Vg2: 250, bias: 'cathode', Rk: 150, bypass: true, Ck: 220e-6, Zp: 5200, Rdc: 250, auto: true }),
    room: mk('power', 'Bookshelf speakers at 3 m', { sens: 87, ref: '2.83V', Z: 8, Zmin: 5, dist: 3, n: 2, target: 85, headroom: 15, room: 0 }),
    horns: mk('power', 'High-efficiency horns and a 300B', { sens: 99, ref: '1W', Z: 8, Zmin: 6, dist: 3, n: 2, target: 85, headroom: 15, room: 0 }),
    ab50: mk('classab', '50 W class AB into 8 Ω', { Vcc: 35, R: 8, Vdrop: 3, Iq: 0.05, pairs: 1, phi: 0, thjc: 0.83, thcs: 0.5, Tjmax: 150, Ta: 40, thsa: 1.0 }),
    ab200: mk('classab', 'Big class AB into a reactive 4 Ω', { Vcc: 48, R: 4, Vdrop: 4, Iq: 0.1, pairs: 3, phi: 45, thjc: 0.7, thcs: 0.5, Tjmax: 150, Ta: 40, thsa: 0.35 }),
    dhalf: mk('classd', 'Half-bridge class D, ±50 V', { topo: 'half', V: 50, R: 4, M: 0.9, Rds: 0.05, dcr: 0.03, fsw: 400e3, tsw: 40e-9, Qg: 30e-9, Vdrv: 12, Coss: 150e-12, Pidle: 1, L: 22e-6, C: 0.47e-6 }),
    dbtl: mk('classd', 'Bridge-tied class D on 48 V', { topo: 'full', V: 48, R: 8, M: 0.92, Rds: 0.085, dcr: 0.025, fsw: 600e3, tsw: 20e-9, Qg: 10e-9, Vdrv: 12, Coss: 100e-12, Pidle: 1.5, L: 10e-6, C: 0.68e-6 }),
    bplus: mk('supply', 'Tube B+ : GZ34, C-L-C', { Vsec: 275, f: 60, topo: 'ct', rect: 'GZ34', Rs: 60, C1: 47e-6, I: 0.12, stage: 'lc', L: 10, dcr: 100, C2: 47e-6, Rb: 220e3 }),
    bcrc: mk('supply', 'Preamp B+ : silicon, C-R-C', { Vsec: 230, f: 60, topo: 'bridge', rect: 'si', Rs: 40, C1: 100e-6, I: 0.02, stage: 'rc', R2: 2200, C2: 100e-6, Rb: 220e3 }),
    rail: mk('supply', 'Solid-state rail, 25 V winding', { Vsec: 25, f: 60, topo: 'bridge', rect: 'si', Rs: 0.15, C1: 10000e-6, I: 2, stage: 'none', Rb: 4700 }),
    optse: mk('opt', 'SE output transformer, 3.5 kΩ : 8 Ω', { Zp: 3500, Zs: 8, Zl: 8, rp: 800, Rpri: 150, Rsec: 0.5, Lp: 20, Ll: 15e-3, fT: 20 }),
    optpp: mk('opt', 'Push-pull transformer, 6.6 kΩ : 8 Ω', { Zp: 6600, Zs: 8, Zl: 8, rp: 3400, Rpri: 180, Rsec: 0.4, Lp: 120, Ll: 12e-3, fT: 20 }),
  };
  const titles = {}; for (const k of Object.keys(list)) titles[k] = list[k]().name;
  return { list, titles };
})();
if (typeof module !== 'undefined') module.exports = Presets;
