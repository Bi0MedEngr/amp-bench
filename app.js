// Amp Bench — UI. Model → Core.run → charts and results for six labs. Charts are drawn on one canvas as
// stacked panels with a hover readout; the tube lab's idle point can be dragged to re-bias the stage.
(() => {
  'use strict';
  const STORE_KEY = 'amp-bench:model:v1';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const si = Core.si, num = Explain.num, log10 = Math.log10;
  let model, res, downloads = null, hover = null, drag = null, mathOpen = false, panels = [], charts = [];
  const undoStack = [], redoStack = [];
  const LABS = [['power', 'Power & SPL'], ['tube', 'Tube stage'], ['classab', 'Class AB'], ['classd', 'Class D'], ['supply', 'Power supply'], ['opt', 'Output transformer']];
  const METHOD = {
    power: 'Free-field inverse-square law from the rated sensitivity, speakers summed as unrelated sources. Real rooms add a few dB (room gain) and speakers compress at high power, which is not modeled. Peak figures assume the amplifier must pass the peaks unclipped.',
    tube: 'Koren tube models: a typical tube, not yours. Against datasheet operating points the models here are within 30% on current (most within 10%); real tubes spread about as much. The swing is solved point by point along a resistive AC load line with the grid clamped at 0 V. Not modeled: reactive speaker loads, grid current, screen voltage sag, supply sag, push-pull stages.',
    classab: 'Ideal class B with sine drive plus a constant idle term, on fixed rails. Heat is exact for that model, including a load phase angle. Not modeled: rail sag and ripple, crossover behavior, emitter resistors, safe-operating-area limits, thermal capacity (music runs cooler than a continuous sine).',
    classd: 'Filter response is the exact second-order LC with a resistive load. Loss terms are first-order estimates and are not validated against hardware: use them to see which term dominates. Not modeled: dead time, body-diode recovery, inductor core loss and saturation, feedback taken after the filter (which flattens the load dependence).',
    supply: 'Time-domain simulation of the rectifier at periodic steady state with a constant-current load. Diodes are a fixed drop plus resistance; for tube rectifiers that is a rough stand-in for their curved characteristic. Not modeled: transformer leakage inductance, mains variation, capacitor ESR, a load that varies with the signal.',
    opt: 'Low-frequency transformer model: source resistance, primary inductance, leakage inductance and winding resistances with a resistive speaker. Not modeled: core saturation and DC in single-ended primaries, core loss, winding capacitance and the resonances it causes, feedback.',
  };

  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(model)); } catch (e) { /* storage unavailable */ } }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 3400); }
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function normalize(m) {
    const d = Core.defaults(); if (!m || typeof m !== 'object') return d;
    const o = { lab: LABS.some(l => l[0] === m.lab) ? m.lab : d.lab, name: typeof m.name === 'string' ? m.name : '' };
    for (const [k] of LABS) o[k] = Object.assign({}, d[k], m[k] && typeof m[k] === 'object' ? m[k] : {});
    return o;
  }
  const L = () => model[model.lab];
  function edit(fn, o = {}) { undoStack.push(JSON.stringify(model)); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; fn(); update(o); }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(model)); model = JSON.parse(undoStack.pop()); update(); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(model)); model = JSON.parse(redoStack.pop()); update(); }
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);

  function update(o = {}) {
    res = Core.run(model, drag ? drag.view : undefined);
    if (!o.fast) { persist(); renderInputs(); }
    renderResults(); renderStatus(); draw();
    if (mathOpen && !o.fast) renderMath();
  }
  function renderStatus() {
    const st = $('#status'); $('#modelName').textContent = model.name || '';
    if (!res.ok) { st.textContent = res.message; st.classList.add('bad'); return; }
    st.classList.remove('bad'); const r = res;
    st.textContent = ({
      power: () => `${si(r.Ppk, 'W')} per channel for ${num(L().target, 3)} dB with ${num(L().headroom, 3)} dB peaks`,
      tube: () => `${si(r.q.Vp, 'V')}, ${si(r.q.Ip, 'A')} idle · gain ${num(r.gain, 3)}${r.se ? ` · ${si(r.Pout, 'W')} out` : ''} · THD ${num(100 * r.thd, 2)}%`,
      classab: () => `${si(r.Pmax, 'W')} out · ${si(r.worst.Pd, 'W')} worst-case heat · Tj ${r.Tj.toFixed(0)} °C`,
      classd: () => `${si(r.Pmax, 'W')} out · ${num(100 * r.fullL.eff, 3)}% efficient · filter ${si(r.f0, 'Hz')}, Q ${num(r.Q, 2)}`,
      supply: () => `${si(r.Vout, 'V')} DC · ripple ${si(r.rip2, 'V')} p-p · transformer ${si(r.VA, 'VA')}`,
      opt: () => `${num(r.n, 3)} : 1 · ${num(r.fLo, 2)} Hz to ${si(r.fHi, 'Hz')} · ${num(r.lossDb, 2)} dB loss`,
    })[r.kind]();
  }

  // ---------- inputs ----------
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
    for (const k of kids) if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    return e;
  }
  // f: display factor (display = stored × f)
  function field(key, label, unit, o = {}) {
    const obj = L(), f = o.f || 1, v = obj[key];
    const inp = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: +(+(v * f).toPrecision(10)).toPrecision(7), 'data-key': key });
    inp.addEventListener('change', () => {
      const x = parseFloat(inp.value);
      if (!isFinite(x) || (o.min != null && x < o.min) || (o.max != null && x > o.max)) { inp.value = +(v * f).toPrecision(7); toast(`${label}: must be${o.min != null ? ' at least ' + o.min : ''}${o.min != null && o.max != null ? ' and' : ''}${o.max != null ? ' at most ' + o.max : ''} ${unit || ''}`); return; }
      edit(() => { obj[key] = x / f; });
    });
    return h('label', { class: 'field' }, h('span', { text: label }), h('span', { class: 'inp' }, inp, unit ? h('em', { text: unit }) : null));
  }
  function select(key, label, options, o = {}) {
    const obj = L(), s = h('select', { 'data-key': key, class: o.wide ? 'wide' : null });
    for (const [v, tt] of options) s.appendChild(h('option', { value: v, text: tt, selected: String(v) === String(obj[key]) }));
    s.addEventListener('change', () => edit(() => { obj[key] = o.num ? +s.value : s.value; if (o.then) o.then(obj); }));
    return o.wide ? h('div', { class: 'field' }, s) : h('label', { class: 'field' }, h('span', { text: label }), s);
  }
  function check(key, label) { const obj = L(), c = h('input', { type: 'checkbox' }); c.checked = !!obj[key]; c.addEventListener('change', () => edit(() => { obj[key] = c.checked; })); return h('label', { class: 'optn' }, c, h('span', { text: label })); }
  function seg(options, value, onPick, cls) { const s = h('div', { class: 'seg' + (cls ? ' ' + cls : '') }); for (const [v, tt] of options) s.appendChild(h('button', { text: tt, class: v === value ? 'on' : null, onclick: () => onPick(v) })); return s; }
  const segKey = (key, options) => seg(options, L()[key], v => { if (v !== L()[key]) edit(() => { L()[key] = v; }); });
  const H2 = t => h('h2', { text: t }), note = t => h('p', { class: 'note', text: t });

  function renderInputs() {
    const box = $('#inputs'), focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    box.innerHTML = '';
    box.append(H2('Lab'), seg(LABS, model.lab, v => { if (v !== model.lab) edit(() => { model.lab = v; model.name = ''; }); }, 'labs'));
    const p = L(), lab = model.lab;
    if (lab === 'power') {
      box.append(H2('Speaker'), field('sens', 'Sensitivity', 'dB', { min: 60, max: 120 }), select('ref', 'Rated at', [['2.83V', '2.83 V, 1 m'], ['1W', '1 W, 1 m']]), field('Z', 'Nominal impedance', 'Ω', { min: 1 }), field('Zmin', 'Minimum impedance', 'Ω', { min: 0.5 }), field('n', 'Speakers playing', '', { min: 1, max: 16 }));
      box.append(H2('Listening'), field('dist', 'Distance', 'm', { min: 0.1 }), field('target', 'Average level', 'dB SPL', { min: 40, max: 130 }), field('headroom', 'Headroom for peaks', 'dB', { min: 0, max: 30 }), field('room', 'Room gain', 'dB', { min: -10, max: 15 }));
      box.append(note('Levels: conversation 60 dB, loud listening 85 dB, a live rock show 100 to 105 dB. Headroom: 10 dB for compressed pop, 15 to 20 dB for acoustic and orchestral recordings.'));
    } else if (lab === 'tube') {
      const t = Core.TUBES[p.tube], pent = t && t.type === 'pentode', se = p.mode === 'se';
      box.append(H2('Tube'), select('tube', 'Type', Object.entries(Core.TUBES).map(([k, v]) => [k, `${v.name} (${v.type})`]), { wide: true }));
      box.append(segKey('mode', [['rc', 'Gain stage'], ['se', 'Single-ended output']]));
      box.append(H2(se ? 'Supply and transformer' : 'Supply and plate load'), field('Bp', 'B+ supply', 'V', { min: 1, max: 2000 }));
      if (se) box.append(field('Zp', 'Primary impedance', 'Ω', { min: 10 }), field('Rdc', 'Primary DC resistance', 'Ω', { min: 0 }));
      else box.append(field('Ra', 'Plate resistor', 'kΩ', { f: 1e-3, min: 0.01 }));
      if (pent) box.append(field('Vg2', 'Screen voltage', 'V', { min: 1 }));
      box.append(H2('Bias'), segKey('bias', [['cathode', 'Cathode resistor'], ['fixed', 'Fixed grid voltage']]));
      if (p.bias === 'cathode') { box.append(field('Rk', 'Cathode resistor', 'Ω', { min: 0.1 }), check('bypass', 'Bypass capacitor fitted')); if (p.bypass) box.append(field('Ck', 'Bypass capacitor', 'µF', { f: 1e6, min: 0 })); }
      else box.append(field('Vg', 'Grid voltage', 'V', { max: 0 }));
      box.append(note('Or drag the dot on the load line to set the idle current.'));
      if (!se) box.append(H2('Next stage'), field('Rl', 'Load (grid resistor)', 'kΩ', { f: 1e-3, min: 0 }), field('Cc', 'Coupling capacitor', 'nF', { f: 1e9, min: 0 }));
      if (!pent) box.append(H2('Driven from'), field('Rsrc', 'Source resistance', 'kΩ', { f: 1e-3, min: 0 }));
      box.append(H2('Signal'), check('auto', 'Drive the grid all the way to 0 V'));
      if (!p.auto) box.append(field('vin', 'Input signal, peak', 'V', { min: 0 }));
    } else if (lab === 'classab') {
      box.append(H2('Rails and load'), field('Vcc', 'Rail voltage, each (±)', 'V', { min: 1 }), field('R', 'Load impedance', 'Ω', { min: 0.5 }), field('phi', 'Load phase angle', '°', { min: 0, max: 80 }), field('Vdrop', 'Output stage drop', 'V', { min: 0 }), field('Iq', 'Idle current', 'mA', { f: 1e3, min: 0 }));
      box.append(note('Use the rail voltage under load. Speakers reach 30 to 60° phase angle at some frequencies; 45° is a fair worst case.'));
      box.append(H2('Output devices and cooling'), field('pairs', 'Device pairs', '', { min: 1, max: 20 }), field('thjc', 'Junction to case', '°C/W', { min: 0 }), field('thcs', 'Case to sink (pad)', '°C/W', { min: 0 }), field('thsa', 'Heatsink to air', '°C/W', { min: 0 }), field('Tjmax', 'Junction limit', '°C', { min: 50 }), field('Ta', 'Air temperature', '°C', {}));
    } else if (lab === 'classd') {
      box.append(H2('Stage'), segKey('topo', [['half', 'Half bridge'], ['full', 'Full bridge (BTL)']]), field('V', p.topo === 'full' ? 'Supply voltage' : 'Rail voltage, each (±)', 'V', { min: 1 }), field('R', 'Load impedance', 'Ω', { min: 0.5 }), field('M', 'Maximum modulation', '', { min: 0.1, max: 1 }), field('fsw', 'Switching frequency', 'kHz', { f: 1e-3, min: 20 }));
      box.append(H2('Output filter' + (p.topo === 'full' ? ' (each leg)' : '')), field('L', 'Inductor', 'µH', { f: 1e6, min: 0.01 }), field('C', 'Capacitor', 'µF', { f: 1e6, min: 0.001 }), field('dcr', 'Inductor resistance', 'mΩ', { f: 1e3, min: 0 }));
      box.append(H2('FETs'), field('Rds', 'On resistance', 'mΩ', { f: 1e3, min: 0 }), field('tsw', 'Rise + fall time', 'ns', { f: 1e9, min: 0 }), field('Qg', 'Gate charge', 'nC', { f: 1e9, min: 0 }), field('Vdrv', 'Gate drive', 'V', { min: 0 }), field('Coss', 'Output capacitance', 'pF', { f: 1e12, min: 0 }), field('Pidle', 'Controller idle power', 'W', { min: 0 }));
    } else if (lab === 'supply') {
      box.append(H2('Transformer'), segKey('topo', [['bridge', 'Bridge'], ['ct', 'Center tap, full wave']]), field('Vsec', p.topo === 'ct' ? 'Secondary, each half' : 'Secondary voltage', 'V rms', { min: 0.5 }), select('f', 'Mains frequency', [[60, '60 Hz'], [50, '50 Hz']], { num: true }), field('Rs', 'Winding resistance', 'Ω', { min: 0 }));
      box.append(note('Winding resistance: secondary plus the primary reflected through the turns ratio' + (p.topo === 'ct' ? ', per half.' : '.')));
      box.append(H2('Rectifier'), select('rect', 'Type', [...Object.entries(Core.RECTS).map(([k, v]) => [k, v.name]), ['custom', 'Custom']]));
      if (p.rect === 'custom') box.append(field('Vd', 'Drop per diode', 'V', { min: 0 }), field('Rd', 'Resistance per diode', 'Ω', { min: 0 }));
      box.append(H2('Reservoir and load'), field('C1', 'Reservoir capacitor', 'µF', { f: 1e6, min: 0.01 }), field('I', 'Load current', 'mA', { f: 1e3, min: 0 }));
      box.append(H2('Filter stage'), segKey('stage', [['none', 'None'], ['rc', 'R-C'], ['lc', 'L-C (choke)']]));
      if (p.stage === 'rc') box.append(field('R2', 'Series resistor', 'Ω', { min: 0.01 }), field('C2', 'Second capacitor', 'µF', { f: 1e6, min: 0.01 }));
      if (p.stage === 'lc') box.append(field('L', 'Choke', 'H', { min: 0.0001 }), field('dcr', 'Choke resistance', 'Ω', { min: 0 }), field('C2', 'Second capacitor', 'µF', { f: 1e6, min: 0.01 }));
      box.append(H2('Safety'), field('Rb', 'Bleeder resistor', 'kΩ', { f: 1e-3, min: 0 }), note('0 means no bleeder.'));
    } else {
      box.append(H2('Transformer'), field('Zp', 'Primary impedance', 'Ω', { min: 1 }), field('Zs', 'Secondary tap', 'Ω', { min: 0.1 }), field('Lp', 'Primary inductance', 'H', { min: 0.001 }), field('Ll', 'Leakage inductance', 'mH', { f: 1e3, min: 0 }), field('Rpri', 'Primary resistance', 'Ω', { min: 0 }), field('Rsec', 'Secondary resistance', 'Ω', { min: 0 }));
      box.append(H2('Around it'), field('rp', 'Source (plate) resistance', 'Ω', { min: 0 }), field('Zl', 'Speaker impedance', 'Ω', { min: 0.1 }), field('fT', 'Bass corner wanted', 'Hz', { min: 0 }));
      box.append(note('Source resistance: one tube’s plate resistance for single-ended, twice that for push-pull in class A (plate to plate). The Tube stage lab reports it.'));
    }
    if (focusKey) { const el = box.querySelector(`[data-key="${focusKey}"]`); if (el) el.focus(); }
  }

  // ---------- results ----------
  const ICON = { pass: '<path d="M4 9.5 7.5 13 14 5.5"/>', warn: '<path d="M9 2.5 16.5 15h-15z"/><path d="M9 7.5v3.5M9 13v.2"/>', fail: '<path d="m4.5 4.5 9 9M13.5 4.5l-9 9"/>' };
  function renderResults() {
    const box = $('#results'); box.innerHTML = '';
    if (!res.ok) { box.append(H2('Results'), note(res.message)); return; }
    const stat = (v, l) => h('div', { class: 'stat' }, h('b', { text: v, title: v }), h('span', { text: l }));
    const r = res, p = L(), st = [], notes = [], pc = v => num(100 * v, 3) + '%';
    if (r.kind === 'power') {
      st.push(stat(si(r.Ppk, 'W'), 'Amplifier power, per channel'), stat(si(r.Pavg, 'W'), 'Average power in use'), stat(si(r.Vpk, 'V'), 'Peak output voltage'), stat(si(r.Vrms, 'V'), 'RMS voltage at rated power'), stat(si(r.Ipk, 'A'), 'Peak current, nominal load'), stat(si(r.IpkMin, 'A'), 'Peak current, minimum load'), stat(`${num(r.s1, 3)} dB`, 'Sensitivity at 1 W, 1 m'), stat(`${num(r.peakSPL, 3)} dB`, 'Peak level at the seat'));
      notes.push(`Rails of at least ±${Math.ceil(r.Vpk + 4)} V (class AB or half-bridge class D) reach this without clipping.`);
      if (r.Ppk < 10) notes.push('Low-power tube territory: a single-ended triode or small push-pull amp covers this.');
      if (r.Ppk > 400) notes.push('That is a lot of amplifier. More sensitive speakers save far more than more watts: +3 dB of sensitivity halves the power.');
    } else if (r.kind === 'tube') {
      st.push(stat(si(r.q.Vp, 'V'), 'Plate to cathode, idle'), stat(si(r.q.Ip, 'A'), 'Plate current, idle'), stat(si(r.q.Vg, 'V'), 'Grid bias'), stat(si(r.Pq, 'W'), 'Plate dissipation'));
      st.push(stat(`${num(r.gain, 3)}×`, `Voltage gain (${num(r.gainDb, 3)} dB)`), stat(si(r.Zout, 'Ω'), r.se ? 'Source resistance into the transformer' : 'Output resistance'));
      if (r.se) st.push(stat(si(r.Pout, 'W'), 'Output power'), stat(pc(r.eff), 'Efficiency from B+'));
      else st.push(stat(si(r.h1, 'V'), 'Output, peak'), stat(si(r.h1 / Math.SQRT2, 'V'), 'Output, rms'));
      st.push(stat(pc(r.thd), 'Distortion (THD)'), stat(`${num(100 * r.hd2, 2)} / ${num(100 * r.hd3, 2)}%`, '2nd / 3rd harmonic'), stat(si(r.ss.rp, 'Ω'), 'Plate resistance rp'), stat(si(r.ss.gm, 'S'), `gm (µ = ${num(r.ss.mu, 3)})`));
      if (r.fBypass != null) st.push(stat(si(r.fBypass, 'Hz'), 'Bypass corner'));
      if (r.fCouple != null) st.push(stat(si(r.fCouple, 'Hz'), 'Coupling corner'));
      if (r.fMiller != null) st.push(stat(si(r.fMiller, 'Hz'), `Miller corner (${si(r.Cin, 'F')})`));
      if (r.se) notes.push(`Input for full power: ${si(r.vin, 'V')} peak (${si(r.vin / Math.SQRT2, 'V')} rms). The driver stage must swing that cleanly.`);
      if (r.se) notes.push(`Take ${si(r.Zout, 'Ω')} into the Output transformer lab as the source resistance.`);
    } else if (r.kind === 'classab') {
      st.push(stat(si(r.Pmax, 'W'), 'Output power'), stat(si(r.worst.Pd, 'W'), 'Worst-case heat'), stat(si(r.full.Pd, 'W'), 'Heat at full power'), stat(pc(r.full.eff), 'Efficiency at full power'), stat(`${r.Tj.toFixed(0)} °C`, 'Junction, worst case'), stat(r.thsaReq > 0 ? `${num(r.thsaReq, 3)} °C/W` : 'none', 'Heatsink needed'), stat(si(r.Pdev, 'W'), `Heat per device (${r.nDev})`), stat(si(r.Ipk, 'A'), 'Peak load current'), stat(si(r.IrailAvg, 'A'), 'Rail current at full power'), stat(si(r.full.Psup, 'W'), 'Supply power at full power'));
      notes.push(`Worst heat is at ${si(r.worst.Pout, 'W')} out (${num(100 * r.worst.Pout / r.Pmax, 2)}% of full power), not at full power.`);
      if (p.phi > 0) notes.push(`With a resistive load the same stage would run ${si(Core.classab({ ...p, phi: 0 }).worst.Pd, 'W')} worst case.`);
    } else if (r.kind === 'classd') {
      st.push(stat(si(r.Pmax, 'W'), 'Output power'), stat(pc(r.fullL.eff), 'Efficiency at full power'), stat(pc(r.eighth.eff), 'Efficiency at ⅛ power'), stat(si(r.fullL.total, 'W'), 'Heat at full power'), stat(si(r.eighth.total, 'W'), 'Heat at ⅛ power'), stat(si(r.idle.total, 'W'), 'Heat at idle'), stat(si(r.f0, 'Hz'), 'Filter corner'), stat(num(r.Q, 3), 'Filter Q at this load'), stat(`${r.g20 >= 0 ? '+' : ''}${num(r.g20, 2)} dB`, 'Response at 20 kHz'), stat(si(r.fullL.dI, 'A'), 'Ripple current, p-p'), stat(si(r.Ipk, 'A'), 'Peak load current'));
      if (!r.full) st.push(stat(si(r.carrier, 'V'), 'Carrier left at the output, rms'));
      const l = r.fullL, parts = [['conduction', l.cond], ['switching', l.sw], ['gate drive', l.gate], ['output capacitance', l.coss], ['idle', l.idle]].sort((a, b) => b[1] - a[1]);
      notes.push(`Largest loss at full power: ${parts[0][0]} (${si(parts[0][1], 'W')}), then ${parts[1][0]} (${si(parts[1][1], 'W')}).`);
      notes.push(`For a flat response into ${num(p.R, 3)} Ω at this corner: ${si(r.Lbw, 'H')} and ${si(r.Cbw, 'F')}${r.full ? ' per leg' : ''}.`);
    } else if (r.kind === 'supply') {
      st.push(stat(si(r.Vout, 'V'), 'DC output'), stat(si(r.rip2, 'V'), 'Output ripple, p-p'));
      if (p.stage !== 'none') st.push(stat(si(r.v1avg, 'V'), 'DC at the reservoir'), stat(si(r.rip1, 'V'), 'Reservoir ripple, p-p'), stat(`${num(r.ripDb, 3)} dB`, 'Ripple cut by the filter'));
      st.push(stat(si(r.Vnl, 'V'), 'No-load voltage'), stat(si(r.VA, 'VA'), 'Transformer rating needed'), stat(si(r.IsecRms, 'A'), 'Winding current, rms'), stat(si(r.idPk, 'A'), 'Diode peak current'), stat(si(r.icRms, 'A'), 'Reservoir ripple current'), stat(si(r.Pdc, 'W'), 'DC power delivered'), stat(si(r.energy, 'J'), 'Stored energy'));
      if (/GZ34|5U4|5Y3/.test(p.rect) && p.C1 > ({ GZ34: 60e-6, '5U4GB': 40e-6, '5Y3GT': 20e-6 })[p.rect]) notes.push('That reservoir capacitor is larger than this rectifier tube’s datasheet allows; the charging pulses will shorten its life.');
      if (!r.conv) notes.push('The steady-state solver fell back to a long run; results may still be settling.');
    } else {
      st.push(stat(`${num(r.n, 4)} : 1`, 'Turns ratio'), stat(si(r.Rin, 'Ω'), 'Load on the tube'), stat(`${num(r.fLo, 3)} Hz`, 'Bass corner (−3 dB)'), stat(si(r.fHi, 'Hz'), 'Treble corner (−3 dB)'), stat(`${num(r.lossDb, 2)} dB`, 'Insertion loss'), stat(pc(r.effCu), 'Copper efficiency'), stat(si(r.Zout, 'Ω'), 'Output impedance'), stat(num(r.DF, 3), 'Damping factor'));
      if (r.LpReq != null) st.push(stat(si(r.LpReq, 'H'), `Inductance for ${num(p.fT, 3)} Hz`));
      if (Math.abs(p.Zl - p.Zs) / p.Zs > 0.05) notes.push(`A ${num(p.Zl, 3)} Ω speaker on the ${num(p.Zs, 3)} Ω tap makes the tube see ${si(r.Rin, 'Ω')} instead of ${si(p.Zp, 'Ω')}.`);
    }
    box.append(H2('Results'), h('div', { class: 'stats' }, ...st));
    if (r.checks && r.checks.length) { const ul = h('ul', { class: 'checks' }); for (const c of r.checks) ul.append(h('li', { class: c.level }, h('span', { html: `<svg viewBox="0 0 18 18">${ICON[c.level]}</svg>` }), h('div', {}, h('b', { text: c.title }), h('span', { text: c.detail })))); box.append(H2('Checks'), ul); }
    for (const n of notes) box.append(note(n));
    box.append(h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn primary', text: 'Show the math', onclick: openMath })));
    box.append(H2('Method and limits'), h('p', { class: 'method', text: METHOD[r.kind] }));
  }

  // ---------- charts ----------
  function niceStep(raw) { const e = Math.pow(10, Math.floor(log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
  function niceRange(lo, hi, pad = 0.08) { if (!(hi > lo)) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; } const d = (hi - lo) * pad, s = niceStep((hi - lo + 2 * d) / 5); return [Math.floor((lo - d) / s + 1e-9) * s, Math.ceil((hi + d) / s - 1e-9) * s]; }
  const tick = v => { const a = Math.abs(v); return (a >= 1e6 ? +(v / 1e6).toPrecision(3) + 'M' : a >= 1e3 ? +(v / 1e3).toPrecision(3) + 'k' : String(+v.toPrecision(3))).replace('-', '−'); };
  const ext = (series, i) => { let lo = Infinity, hi = -Infinity; for (const s of series) for (const q of s.pts) { lo = Math.min(lo, q[i]); hi = Math.max(hi, q[i]); } return [lo, hi]; };
  function buildCharts() {
    const r = res, p = L(), c = { s1: css('--s1'), s2: css('--s2'), s3: css('--s3'), s4: css('--s4'), ink3: css('--ink-3'), curve: css('--curve'), accent: css('--accent'), fail: css('--fail') };
    if (r.kind === 'power') {
      const y = niceRange(r.curve[0][1], Math.max(r.curve[80][1], r.peakSPL));
      return [{ frac: 1, title: 'Level at the listening seat', xlabel: 'Amplifier power per channel (W)', ylabel: 'dB SPL', xlog: true, xmin: 0.01, xmax: 1000, ymin: y[0], ymax: y[1], xunit: 'W', yunit: 'dB',
        series: [{ pts: r.curve, color: c.s1, width: 2.5, label: 'Sound level' }], hlines: [{ y: p.target, label: 'average' }, { y: r.peakSPL, label: 'peaks' }],
        marks: [{ x: r.Pavg, y: p.target, label: si(r.Pavg, 'W'), color: c.s3 }, { x: r.Ppk, y: r.peakSPL, label: si(r.Ppk, 'W'), color: c.accent }] }];
    }
    if (r.kind === 'tube') {
      const mA = pts => pts.map(q => [q[0], q[1] * 1e3]);
      const series = r.curves.map(cv => ({ pts: mA(cv.pts), color: c.curve, width: 1.2, hover: false, endLabel: `${tick(cv.vg)} V` }));
      series.push({ pts: mA(r.pd), color: c.fail, width: 1.4, dash: [5, 4], hover: false, label: 'Dissipation limit' }, { pts: mA(r.dcLine), color: c.s1, width: 1.8, hover: false, label: 'DC load line' }, { pts: mA(r.acLine), color: c.s2, width: 1.8, hover: false, label: 'AC load line' },
        { pts: r.wave.map(w => [w.vp, w.ip * 1e3]), color: c.accent, width: 4, hover: false, label: 'Signal swing' });
      const ys = niceRange(Math.min(r.voNeg, -r.h1), Math.max(r.voPk, r.h1), 0.1);
      return [{ frac: 0.63, title: `${r.t.name} plate curves`, xlabel: 'Plate-to-cathode voltage (V)', ylabel: 'Plate current (mA)', xmin: 0, xmax: r.xmax, ymin: 0, ymax: r.ymax * 1e3, series, free: true, xunit: 'V', yunit: 'mA',
        marks: [{ x: r.q.Vp, y: r.q.Ip * 1e3, label: 'idle', color: c.accent, big: true }] },
      { frac: 0.37, title: 'Output over one cycle', xlabel: 'Phase (°)', ylabel: 'Volts', xmin: 0, xmax: 360, ymin: ys[0], ymax: ys[1], xunit: '°', yunit: 'V', xstep: 90,
        series: [{ pts: r.wave.map(w => [w.th * 360, w.vout]), color: c.s2, width: 2.2, label: 'Output' }, { pts: r.wave.map(w => [w.th * 360, -r.h1 * Math.sin(2 * Math.PI * w.th)]), color: c.ink3, width: 1.3, dash: [4, 4], label: 'Pure sine, same size' }] }];
    }
    if (r.kind === 'classab') {
      const heat = r.curve.map(q => [q.Pout, q.Pd]), sup = r.curve.map(q => [q.Pout, q.Psup]), y = niceRange(0, r.full.Psup, 0);
      return [{ frac: 0.58, title: 'Where the power goes', xlabel: 'Output power (W)', ylabel: 'Watts', xmin: 0, xmax: r.Pmax, ymin: 0, ymax: y[1], xunit: 'W', yunit: 'W',
        series: [{ pts: sup, color: c.s1, width: 2.2, label: 'Drawn from the supply' }, { pts: heat, color: c.s2, width: 2.2, label: 'Heat in the output devices' }], marks: [{ x: r.worst.Pout, y: r.worst.Pd, label: `worst ${si(r.worst.Pd, 'W')}`, color: c.s2 }] },
      { frac: 0.42, title: 'Efficiency', xlabel: 'Output power (W)', ylabel: '%', xmin: 0, xmax: r.Pmax, ymin: 0, ymax: 100, xunit: 'W', yunit: '%', series: [{ pts: r.curve.map(q => [q.Pout, 100 * q.eff]), color: c.s3, width: 2.2, label: 'Efficiency' }] }];
    }
    if (r.kind === 'classd') {
      const cols = [c.s4, c.s1, c.s3, c.s2];
      return [{ frac: 0.58, title: 'Output filter response', xlabel: 'Frequency (Hz)', ylabel: 'dB', xlog: true, xmin: 1e3, xmax: 1e6, ymin: -50, ymax: 20, xunit: 'Hz', yunit: 'dB', clipY: true,
        series: r.loads.map((l, i) => ({ pts: l.pts, color: cols[i], width: i === 1 ? 2.6 : 1.6, label: l.R === Infinity ? 'No load' : `${num(l.R, 3)} Ω` })), vlines: [{ x: 20e3, label: '20 kHz' }, { x: p.fsw, label: 'carrier' }] },
      { frac: 0.42, title: 'Efficiency', xlabel: 'Output power (W)', ylabel: '%', xlog: true, xmin: r.Pmax / 1000, xmax: r.Pmax, ymin: 0, ymax: 100, xunit: 'W', yunit: '%', series: [{ pts: r.eff, color: c.s3, width: 2.2, label: 'Efficiency' }], vlines: [{ x: r.Pmax / 8, label: '⅛ power' }] }];
    }
    if (r.kind === 'supply') {
      const t = k => r.wave.map(w => [w.t * 1e3, w[k]]), tmax = 2e3 / p.f, ser = [{ pts: t('vs'), color: c.curve, width: 1.3, label: 'Rectified winding' }, { pts: t('v1'), color: c.s1, width: 2.2, label: 'Reservoir' }];
      if (p.stage !== 'none') ser.push({ pts: t('v2'), color: c.s2, width: 2.2, label: 'Output' });
      const lo = Math.min(r.v1min, r.Vout) - Math.max(1.5 * r.rip1, 0.03 * r.Vpk), y = niceRange(Math.max(0, lo), r.Vpk, 0.02), yi = niceRange(0, r.idPk, 0);
      return [{ frac: 0.58, title: 'Voltages', xlabel: 'Time (ms)', ylabel: 'Volts', xmin: 0, xmax: tmax, ymin: y[0], ymax: y[1], xunit: 'ms', yunit: 'V', series: ser, clipY: true },
      { frac: 0.42, title: 'Charging pulses', xlabel: 'Time (ms)', ylabel: 'Amps', xmin: 0, xmax: tmax, ymin: 0, ymax: yi[1] * 1.08, xunit: 'ms', yunit: 'A', series: [{ pts: t('id'), color: c.s3, width: 2, label: 'Rectifier current' }], hlines: [{ y: p.I, label: 'load current' }] }];
    }
    const vl = [{ x: r.fLo, label: '−3 dB' }]; if (isFinite(r.fHi)) vl.push({ x: r.fHi, label: '−3 dB' });
    return [{ frac: 1, title: 'Frequency response through the transformer', xlabel: 'Frequency (Hz)', ylabel: 'dB, relative to midband', xlog: true, xmin: Math.pow(10, 0.5), xmax: Math.pow(10, 5.3), ymin: -15, ymax: 3, xunit: 'Hz', yunit: 'dB', clipY: true,
      series: [{ pts: r.pts, color: c.s1, width: 2.5, label: 'Response' }], vlines: vl, band: [20, 20e3] }];
  }

  const cv = $('#cv'), ctx = cv.getContext('2d'), qh = $('#qh');
  function resize() { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); ctx.setTransform(d, 0, 0, d, 0, 0); draw(); }
  function interp(pts, x) { if (x < pts[0][0] || x > pts[pts.length - 1][0]) return null; let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= x) lo = m; else hi = m; } const a = pts[lo], b = pts[hi]; return b[0] === a[0] ? a[1] : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  function plot(R, c) {
    const ink = css('--ink'), ink2 = css('--ink-2'), ink3 = css('--ink-3'), grid = css('--grid'), line = css('--line'), paper = css('--paper');
    const sans = '"IBM Plex Sans", system-ui, sans-serif', mono = '"IBM Plex Mono", ui-monospace, monospace', cond = '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';
    // title + legend, flowed onto as many rows as needed
    ctx.font = `600 13.5px ${cond}`; const items = [{ title: c.title, w: ctx.measureText(c.title).width + 16 }];
    ctx.font = `12px ${sans}`; for (const s of c.series) if (s.label) items.push({ s, w: ctx.measureText(s.label).width + 34 });
    let rows = 1, cx = 0; for (const it of items) { if (cx + it.w > R.w - 24 && cx > 0) { rows++; cx = 0; } it.x = cx; it.row = rows - 1; cx += it.w; }
    const m = { l: 54, r: 16, t: 12 + rows * 18, b: 38 }, x0 = R.x + m.l, y0 = R.y + m.t, w = R.w - m.l - m.r, hh = R.h - m.t - m.b;
    if (w < 40 || hh < 40) return;
    const lx0 = c.xlog ? log10(c.xmin) : 0, lx1 = c.xlog ? log10(c.xmax) : 0;
    const X = v => x0 + (c.xlog ? (log10(v) - lx0) / (lx1 - lx0) : (v - c.xmin) / (c.xmax - c.xmin)) * w, Y = v => y0 + hh - (v - c.ymin) / (c.ymax - c.ymin) * hh;
    const invX = px => { const f = (px - x0) / w; return c.xlog ? Math.pow(10, lx0 + f * (lx1 - lx0)) : c.xmin + f * (c.xmax - c.xmin); }, invY = py => c.ymin + (y0 + hh - py) / hh * (c.ymax - c.ymin);
    for (const it of items) { const ix = R.x + 12 + it.x, iy = R.y + 14 + it.row * 18; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (it.title) { ctx.font = `600 13.5px ${cond}`; ctx.fillStyle = ink; ctx.fillText(it.title, ix, iy); }
      else { ctx.strokeStyle = it.s.color; ctx.lineWidth = Math.min(3, it.s.width + 0.5); ctx.setLineDash(it.s.dash || []); ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + 18, iy); ctx.stroke(); ctx.setLineDash([]); ctx.font = `12px ${sans}`; ctx.fillStyle = ink2; ctx.fillText(it.s.label, ix + 23, iy); } }
    if (c.band) { ctx.fillStyle = grid; ctx.fillRect(X(c.band[0]), y0, X(c.band[1]) - X(c.band[0]), hh); }
    // grid and ticks
    ctx.lineWidth = 1; ctx.font = `11px ${mono}`; ctx.fillStyle = ink3;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (c.xlog) { const dec = lx1 - lx0; for (let d = Math.floor(lx0); d <= Math.ceil(lx1); d++) for (let k = 1; k < 10; k++) { const v = k * Math.pow(10, d); if (v < c.xmin * 0.999 || v > c.xmax * 1.001) continue; const px = X(v); ctx.strokeStyle = grid; ctx.globalAlpha = k === 1 ? 1 : 0.55; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + hh); ctx.stroke(); ctx.globalAlpha = 1; if (k === 1 || (dec <= 3.2 && w > 420 && (k === 2 || k === 5))) ctx.fillText(tick(v), px, y0 + hh + 6); } }
    else { const s = c.xstep || niceStep((c.xmax - c.xmin) / Math.max(3, Math.min(9, w / 70))); for (let v = Math.ceil(c.xmin / s - 1e-9) * s; v <= c.xmax + s * 1e-6; v += s) { const px = X(v); ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + hh); ctx.stroke(); ctx.fillText(tick(Math.abs(v) < s * 1e-9 ? 0 : v), px, y0 + hh + 6); } }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    { const s = niceStep((c.ymax - c.ymin) / Math.max(2, Math.min(8, hh / 42))); for (let v = Math.ceil(c.ymin / s - 1e-9) * s; v <= c.ymax + s * 1e-6; v += s) { const py = Y(v); ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + w, py); ctx.stroke(); ctx.fillText(tick(Math.abs(v) < s * 1e-9 ? 0 : v), x0 - 7, py); } }
    ctx.strokeStyle = line; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, hh);
    ctx.font = `12px ${sans}`; ctx.fillStyle = ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(c.xlabel, x0 + w / 2, R.y + R.h - 4);
    ctx.save(); ctx.translate(R.x + 13, y0 + hh / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(c.ylabel, 0, 0); ctx.restore();
    // reference lines
    ctx.font = `11px ${sans}`;
    for (const v of c.vlines || []) { if (!(v.x >= c.xmin && v.x <= c.xmax)) continue; const px = X(v.x); ctx.strokeStyle = ink3; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + hh); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ink3; ctx.textAlign = px > x0 + w - 60 ? 'right' : 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(v.label, px + (px > x0 + w - 60 ? -5 : 5), y0 + hh - 5); }
    for (const v of c.hlines || []) { if (!(v.y >= c.ymin && v.y <= c.ymax)) continue; const py = Y(v.y); ctx.strokeStyle = ink3; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + w, py); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ink3; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(v.label, x0 + 6, py - 3); }
    // series
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, hh); ctx.clip(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const s of c.series) { ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.setLineDash(s.dash || []); ctx.beginPath(); s.pts.forEach((q, i) => { const px = X(q[0]), py = clamp(Y(q[1]), y0 - 2000, y0 + hh + 2000); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); }
    ctx.setLineDash([]); ctx.font = `11px ${mono}`; ctx.textBaseline = 'middle';
    for (const s of c.series) if (s.endLabel) { let k = -1; for (let i = s.pts.length - 1; i >= 0; i--) if (s.pts[i][1] <= c.ymax * 0.985 && s.pts[i][1] > c.ymax * 0.02) { k = i; break; } if (k < 0) continue; const top = k < s.pts.length - 1, px = X(s.pts[k][0]), py = Y(s.pts[k][1]), tw = ctx.measureText(s.endLabel).width;
      const lx = top ? clamp(px - tw / 2, x0 + 2, x0 + w - tw - 2) : x0 + w - tw - 5, ly = top ? y0 + 9 : py - 8; ctx.fillStyle = paper; ctx.globalAlpha = 0.8; ctx.fillRect(lx - 2, ly - 7, tw + 4, 14); ctx.globalAlpha = 1; ctx.fillStyle = ink2; ctx.textAlign = 'left'; ctx.fillText(s.endLabel, lx, ly); }
    ctx.restore();
    for (const mk of c.marks || []) { if (!(mk.x >= c.xmin && mk.x <= c.xmax && mk.y >= c.ymin && mk.y <= c.ymax)) continue; const px = X(mk.x), py = Y(mk.y); ctx.fillStyle = mk.color; ctx.strokeStyle = paper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, mk.big ? 7 : 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.font = `600 12px ${sans}`; ctx.fillStyle = ink; const right = px < x0 + w - 90; ctx.textAlign = right ? 'left' : 'right'; ctx.textBaseline = 'middle'; ctx.fillText(mk.label, px + (right ? 11 : -11), py - 11); }
    panels.push({ x0, y0, w, h: hh, c, X, Y, invX, invY });
  }
  function draw() {
    if (!res) return;
    const r = cv.getBoundingClientRect(); ctx.fillStyle = css('--paper'); ctx.fillRect(0, 0, r.width, r.height); panels = [];
    qh.hidden = true;
    if (!res.ok) { ctx.fillStyle = css('--ink-3'); ctx.font = '14px "IBM Plex Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(res.message, r.width / 2, r.height / 2); $('#stateOut').textContent = ''; return; }
    charts = buildCharts(); let y = 0;
    for (const c of charts) { const hh = r.height * c.frac; plot({ x: 0, y, w: r.width, h: hh }, c); y += hh; }
    if (res.kind === 'tube' && panels[0]) { const P = panels[0]; qh.hidden = false; qh.style.left = P.X(res.q.Vp) + 'px'; qh.style.top = P.Y(res.q.Ip * 1e3) + 'px'; }
    // hover readout
    let text = res.kind === 'tube' ? 'Hover a chart to read values. Drag the idle dot along the load line to re-bias.' : 'Hover a chart to read values.';
    const P = hover && panels.find(q => hover.x >= q.x0 && hover.x <= q.x0 + q.w && hover.y >= q.y0 && hover.y <= q.y0 + q.h);
    if (P && !drag) {
      const c = P.c, xv = P.invX(hover.x), parts = [];
      ctx.strokeStyle = css('--ink-3'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hover.x + 0.5, P.y0); ctx.lineTo(hover.x + 0.5, P.y0 + P.h); ctx.stroke();
      if (c.free) { ctx.beginPath(); ctx.moveTo(P.x0, hover.y + 0.5); ctx.lineTo(P.x0 + P.w, hover.y + 0.5); ctx.stroke(); parts.push(`${num(P.invY(hover.y), 3)} ${c.yunit}`); }
      for (const s of c.series) { if (s.hover === false) continue; const yv = interp(s.pts, xv); if (yv == null) continue; const py = P.Y(yv); if (py >= P.y0 - 1 && py <= P.y0 + P.h + 1) { ctx.fillStyle = s.color; ctx.strokeStyle = css('--paper'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hover.x, py, 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); } parts.push(`${s.label}: ${num(yv, 3)} ${c.yunit}`); }
      text = `${c.xunit === 'Hz' || c.xunit === 'W' ? si(xv, c.xunit) : num(xv, 3) + ' ' + c.xunit} · ${parts.join(' · ')}`;
    }
    if (drag) text = `Idle current ${si(res.q.Ip, 'A')} · ${L().bias === 'cathode' ? 'cathode resistor ' + si(L().Rk, 'Ω') : 'grid ' + si(L().Vg, 'V')}`;
    $('#stateOut').textContent = text;
  }
  cv.addEventListener('pointermove', e => { hover = { x: e.offsetX, y: e.offsetY }; draw(); });
  cv.addEventListener('pointerdown', e => { hover = { x: e.offsetX, y: e.offsetY }; draw(); });
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  // drag the idle point: frozen axes while dragging, bias solved for the current under the pointer
  qh.addEventListener('pointerdown', e => { if (!res.ok || res.kind !== 'tube') return; e.preventDefault(); qh.setPointerCapture(e.pointerId); undoStack.push(JSON.stringify(model)); redoStack.length = 0; drag = { view: { xmax: res.xmax, ymax: res.ymax }, P: panels[0], id: e.pointerId }; });
  qh.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return; const box = cv.getBoundingClientRect(), I = clamp(drag.P.invY(e.clientY - box.top) / 1e3, 0.02 * drag.view.ymax, 0.97 * drag.view.ymax), p = L(), b = Core.tubeBiasFor(p, I);
    if (b.Rk != null) p.Rk = +b.Rk.toPrecision(3); else p.Vg = +b.Vg.toPrecision(3);
    update({ fast: true });
  });
  const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; update(); };
  qh.addEventListener('pointerup', endDrag); qh.addEventListener('pointercancel', endDrag);

  // ---------- math drawer ----------
  function renderMath() { const body = $('#mathBody'), open = new Set([...body.querySelectorAll('details')].map((d, i) => (d.open ? i : -1))); const first = !body.children.length; body.innerHTML = '';
    Explain.explain(model, res).forEach((s, i) => { const d = h('details', { open: first ? i < 2 : open.has(i) }, h('summary', { text: s.title }), h('div', { html: s.html })); body.append(d); });
    $('#mathSub').textContent = LABS.find(l => l[0] === model.lab)[1]; }
  function openMath() { mathOpen = true; $('#mathBody').innerHTML = ''; renderMath(); $('#math').classList.add('open'); $('#math').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; }
  function closeMath() { mathOpen = false; $('#math').classList.remove('open'); $('#math').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }
  $('#mathBtn').addEventListener('click', () => (mathOpen ? closeMath() : openMath())); $('#mathClose').addEventListener('click', closeMath); $('#scrim').addEventListener('click', closeMath);

  // ---------- files ----------
  async function offerFile(filename, data) {
    if (downloads) { try { await downloads.save({ filename, data }); toast(`Saved ${filename}.`); } catch (err) { if (!err || err.code !== 'declined') toast(`Could not save ${filename} here.`); } return; }
    if (window.claude && window.claude.use) { toast('Saving files is not available in this view.'); return; }
    const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function csv() { const rows = ['chart,series,x,y']; const q = s => `"${String(s).replace(/"/g, '""')}"`;
    for (const c of charts) for (const s of c.series) { const name = s.label || (s.endLabel ? 'Grid ' + s.endLabel : ''); if (!name) continue; for (const pt of s.pts) rows.push(`${q(`${c.title} [x: ${c.xlabel}; y: ${c.ylabel}]`)},${q(name)},${pt[0]},${pt[1]}`); }
    return rows.join('\n'); }
  const fileMenu = $('#fileMenu'), fileIn = $('#fileIn');
  $('#fileBtn').addEventListener('click', e => { e.stopPropagation(); fileMenu.hidden = !fileMenu.hidden; });
  addEventListener('click', () => { fileMenu.hidden = true; });
  fileMenu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; fileMenu.hidden = true; const act = b.dataset.act, base = 'amp-bench-' + model.lab;
    if (act === 'open') fileIn.click();
    else if (act === 'save') offerFile(base + '.json', JSON.stringify(model, null, 1));
    else if (act === 'csv') { if (res.ok) offerFile(base + '.csv', csv()); else toast('Nothing to export yet.'); }
    else if (act === 'png') cv.toBlob(bl => { if (bl) offerFile(base + '.png', bl); }, 'image/png');
  });
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (!f) return; f.text().then(t => { const m = JSON.parse(t); if (!m || typeof m !== 'object' || !m.lab) throw new Error('not a design'); edit(() => { model = normalize(m); }); toast(`Opened ${f.name}.`); }).catch(() => toast('That file is not an Amp Bench design.')); });

  const sel = $('#presetSel'), groups = {};
  for (const [k, t] of Object.entries(Presets.titles)) { const lab = Presets.list[k]().lab; if (!groups[lab]) { groups[lab] = h('optgroup', { label: LABS.find(l => l[0] === lab)[1] }); } groups[lab].appendChild(h('option', { value: k, text: t })); }
  for (const [k] of LABS) if (groups[k]) sel.appendChild(groups[k]);
  sel.addEventListener('change', () => { if (sel.value) { const m = Presets.list[sel.value](); edit(() => { model.lab = m.lab; model.name = m.name; model[m.lab] = m[m.lab]; }); sel.value = ''; } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mathOpen) closeMath(); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); (e.shiftKey ? redo : undo)(); } });

  try { const s = localStorage.getItem(STORE_KEY); model = s ? normalize(JSON.parse(s)) : null; } catch (e) { model = null; }
  if (!model) model = Presets.list.ax7();
  new ResizeObserver(resize).observe(cv);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => { downloads = null; });
  window.__tool = { get model() { return model; }, get res() { return res; }, get panels() { return panels; }, labs: LABS.map(l => l[0]) };
  update();
})();
