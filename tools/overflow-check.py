# Overflow check: loads each page at 320/375/390/430/768px (calendar with every event
# opened) and lists anything that runs past the screen or clips its text.
# Usage: python3 tools/overflow-check.py 8790 ",calendar,fx,engine,positioning,banks,news,learn,story"
# Needs playwright + chromium; set CHROME=/path/to/chrome if not on the default path.
import asyncio, subprocess, time, sys, json
PORT=int(sys.argv[1]); pages=sys.argv[2].split(',')
srv=subprocess.Popen(['python3','-m','http.server',str(PORT)],cwd=__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
from playwright.async_api import async_playwright
JS="""() => {
  const W = document.documentElement.clientWidth, out = [];
  document.querySelectorAll('main *').forEach(e => {
    if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
    const r = e.getBoundingClientRect();
    if (r.width === 0) return;
    // ignore things inside intentional horizontal scrollers
    let p = e.parentElement, inScroller = false;
    while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { inScroller = true; break; } p = p.parentElement; }
    if (inScroller) return;
    const over = r.right > W + 1 || r.left < -1;
    const clip = e.scrollWidth > e.clientWidth + 2 && ['visible'].indexOf(getComputedStyle(e).overflowX) >= 0 && e.children.length === 0;
    if (over || clip) out.push((e.className || e.tagName) + ' | ' + (e.textContent || '').trim().slice(0, 50) + ' | right=' + Math.round(r.right) + ' W=' + W);
  });
  return { pageScroll: document.documentElement.scrollWidth > W + 1, items: [...new Set(out)].slice(0, 25) };
}"""
async def m():
    async with async_playwright() as p:
        b=await p.chromium.launch(**({'executable_path': __import__('os').environ['CHROME']} if __import__('os').environ.get('CHROME') else {}))
        for w in [320,375,390,430,768]:
            c=await b.new_context(viewport={'width':w,'height':800},is_mobile=True,has_touch=True); pg=await c.new_page()
            for h in pages:
                await pg.goto(f'http://localhost:{PORT}/#'+h); await pg.wait_for_timeout(2600)
                if h=='calendar':
                    await pg.evaluate("document.querySelector('#cal-range [data-range=all]') && document.querySelector('#cal-range [data-range=all]').click()"); await pg.wait_for_timeout(300)
                    await pg.evaluate("document.querySelectorAll('.ev-row').forEach(r=>r.click())"); await pg.wait_for_timeout(400)
                res=await pg.evaluate(JS)
                if res['pageScroll'] or res['items']: print(w,h,json.dumps(res,indent=0)[:1500])
                else: print(w,h,'ok')
            await c.close()
        await b.close()
asyncio.run(m()); srv.terminate()
