# UI test: every example in desktop light, plus dark / iPad / phone passes, console errors, no horizontal
# scroll, the idle-point drag, the math drawer and a download.
# Run: ~/.venvs/mcmaster_torx/bin/python tests/browser_test.py <out_dir>
import os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tool_shots'
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(here, '..', 'docs', 'index.html')
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    for name, w, h, scheme in [('desk_light', 1440, 900, 'light'), ('desk_dark', 1440, 900, 'dark'), ('ipad', 1180, 820, 'light'), ('phone', 390, 844, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=2, has_touch=name in ('ipad', 'phone'), accept_downloads=True)
        pg = ctx.new_page()
        pg.on('console', lambda m, n=name: m.type == 'error' and errs.append(f'{n}: {m.text}'))
        pg.on('pageerror', lambda e, n=name: errs.append(f'{n}: {e}'))
        pg.goto(url); pg.wait_for_timeout(700)
        keys = pg.evaluate('Object.keys(Presets.list)')
        for k in (keys if name == 'desk_light' else ['se300b', 'dhalf', 'bplus']):
            pg.select_option('#presetSel', k); pg.wait_for_timeout(250)
            ok = pg.evaluate('window.__tool.res.ok')
            pg.screenshot(path=f'{out}/{name}_{k}.png', full_page=name == 'phone')
            sw = pg.evaluate('document.documentElement.scrollWidth')
            print(name, k, '|', pg.inner_text('#status'), '|' if ok and sw <= w else '| PROBLEM', 'scrollWidth', sw)
            if not ok or sw > w: errs.append(f'{name} {k}: ok={ok} scrollWidth={sw}')
        if name == 'desk_light':
            pg.select_option('#presetSel', 'se300b'); pg.wait_for_timeout(200)
            i0 = pg.evaluate('window.__tool.res.q.Ip'); box = pg.locator('#qh').bounding_box(); cx, cy = box['x'] + 20, box['y'] + 20
            pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx, cy + 40, steps=5); pg.mouse.move(cx, cy + 70, steps=5); pg.screenshot(path=f'{out}/drag.png'); pg.mouse.up(); pg.wait_for_timeout(200)
            i1 = pg.evaluate('window.__tool.res.q.Ip'); box2 = pg.locator('#qh').bounding_box()
            print(f'  drag idle point: {i0*1e3:.1f} mA -> {i1*1e3:.1f} mA, Rk {pg.evaluate("window.__tool.model.tube.Rk")} ohm')
            if not i1 < i0 * 0.9: errs.append('drag did not lower the idle current')
            pg.keyboard.press('Meta+z'); pg.wait_for_timeout(150)
            if abs(pg.evaluate('window.__tool.res.q.Ip') - i0) > 1e-9: errs.append('undo after drag did not restore')
            pg.mouse.move(500, 300); pg.wait_for_timeout(100); print('  hover:', pg.inner_text('#stateOut'))
            pg.click('#mathBtn'); pg.wait_for_timeout(400); pg.screenshot(path=f'{out}/math.png'); print('  math sections:', pg.locator('#mathBody details').count()); pg.click('#mathClose')
            for lab in pg.evaluate('window.__tool.labs'):
                pg.locator('.labs button').nth(pg.evaluate(f'window.__tool.labs.indexOf("{lab}")')).click(); pg.wait_for_timeout(120)
                pg.click('#mathBtn'); pg.wait_for_timeout(120); txt = pg.inner_text('#mathBody'); pg.click('#mathClose')
                if 'undefined' in txt or 'NaN' in txt: errs.append(f'math drawer {lab} has undefined/NaN')
            pg.click('#fileBtn')
            with pg.expect_download() as d: pg.click('[data-act=csv]')
            print('  download:', d.value.suggested_filename)
            pg.click('#fileBtn')
            with pg.expect_download() as d: pg.click('[data-act=png]')
            print('  download:', d.value.suggested_filename)
            # a bad input is refused, and an edit reaches the result
            pg.locator('.labs button').nth(2).click(); pg.fill('[data-key=Vcc]', '50'); pg.keyboard.press('Tab'); pg.wait_for_timeout(150)
            print('  edit Vcc=50 ->', pg.inner_text('#status'))
        ctx.close()
    b.close()
print('\n'.join(errs) or 'no problems')
sys.exit(1 if errs else 0)
