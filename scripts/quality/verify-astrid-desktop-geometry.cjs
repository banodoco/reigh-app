// First navigation must morph the live editor, including when entering from Agent.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:2245';
const out = process.argv[3] || '/tmp/astrid-desktop-geometry';
fs.mkdirSync(out, { recursive: true });

function measure() {
  const box = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  return Object.fromEntries(['stage', 'surfaces', 'player', 'inspector', 'timeline', 'chat'].map(name => [name,
    box(name === 'stage' || name === 'surfaces' ? `.astrid-editor-${name}` : `.astrid-${name}-surface`)]));
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const entries = {}, destinations = {};
      for (const audience of ['app', 'agent']) {
        await page.goto(`${base}/home?experience=${audience}`);
        await page.waitForSelector('.astrid-editor-stage[data-revealed="true"]');
        await page.waitForTimeout(3600);
        await page.mouse.move(0, 0);
        entries[audience] = await page.evaluate(measure);
        await page.screenshot({ path: `${out}/${width}-${audience}-entry.png`, fullPage: true });
        await page.evaluate(source => {
          const read = (0, eval)(`(${source})`);
          const capture = window.stageCapture = { frames: [], done: false };
          const sample = () => {
            capture.frames.push({ t: performance.now(), ...read() });
            if (!capture.done) requestAnimationFrame(sample);
          };
          sample();
        }, measure.toString());
        const next = audience === 'app' ? 'agent' : 'app';
        await page.getByRole('button', { name: next === 'app' ? 'App' : 'Agent', exact: true }).evaluate(e => e.click());
        for (let frame = 0; frame < 7; frame++) {
          await page.waitForTimeout(100);
          await page.screenshot({ path: `${out}/${width}-${audience}-to-${next}-${frame}.png`, fullPage: true });
        }
        await page.waitForTimeout(1600);
        const frames = await page.evaluate(() => { window.stageCapture.done = true; return window.stageCapture.frames; });
        destinations[next] = await page.evaluate(measure);
        fs.writeFileSync(`${out}/${width}-${audience}-to-${next}.json`, JSON.stringify(frames));
        if (width > 640) {
          for (const surface of ['player', 'inspector', 'chat']) {
            const start = frames[0][surface], finish = destinations[next][surface];
            const distinct = new Set(frames.filter(f =>
              f[surface].some((v, i) => Math.abs(v - start[i]) > 1)
              && f[surface].some((v, i) => Math.abs(v - finish[i]) > 1))
              .map(f => f[surface].map(Math.round).join(','))).size;
            assert(distinct >= 8, `${width}/${audience}: ${surface} snapped (${distinct} intermediate boxes)`);
          }
          // The outer stage is the shared frame for the two intended compositions.
          // Its panels own their footprint; neither grid stretch nor a stale inline size may persist.
          assert(frames.every(f => f.stage.every((v, i) => Math.abs(v - frames[0].stage[i]) < .5)), 'Stage jumped');
        }
      }
      for (const audience of ['app', 'agent']) {
        for (const key of Object.keys(entries[audience])) {
          assert(entries[audience][key].every((v, i) => Math.abs(v - destinations[audience][key][i]) < .5),
            `${width}/${audience}: ${key} differs between direct entry and navigation`);
        }
      }
      const app = entries.app;
      const playerTimelineGap = app.timeline[1] - app.player[1] - app.player[3];
      if (width > 640) assert(playerTimelineGap > 0 && playerTimelineGap < 30, `Unexpected gap below App player: ${playerTimelineGap}`);
      const report = { width, entries, destinations, playerTimelineGap, geometry: true };
      fs.writeFileSync(`${out}/${width}-results.json`, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ width, playerTimelineGap, geometry: true }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
