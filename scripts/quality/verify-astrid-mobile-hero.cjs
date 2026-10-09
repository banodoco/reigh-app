// Rendered spacing and continuous CTA geometry, including reversals and reduced motion.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:2245';
const out = process.argv[3] || '/tmp/astrid-mobile-hero';
fs.mkdirSync(out, { recursive: true });

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
    };
    const audience = document.querySelector('.astrid-public-site').dataset.audience;
    const title = rect('h1');
    const subtitle = rect('.astrid-mobile-hero-subtitles');
    const cta = rect('.astrid-hero-cta');
    const topCard = rect(`article[data-callout="${audience === 'app' ? 'effects' : 'tools'}"]`);
    return { audience, title, subtitle, cta, topCard,
      titleGap: subtitle.y - title.bottom,
      ctaGap: cta.y - subtitle.bottom,
      cardGap: topCard.y - cta.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
      activePhrases: [...document.querySelectorAll('.astrid-mobile-hero-subtitles button')]
        .filter(e => e.tabIndex >= 0 && !e.closest('[aria-hidden="true"]')).length,
    };
  });
}

async function captureSwitch(page, audience, prefix, screenshots) {
  await page.evaluate(() => {
    const shell = document.querySelector('.astrid-hero-cta');
    const start = performance.now();
    const capture = window.heroCapture = { frames: [], done: false };
    const sample = () => {
      const r = shell.getBoundingClientRect();
      const s = getComputedStyle(shell);
      capture.frames.push({ t: performance.now() - start, x: r.x, y: r.y, w: r.width, h: r.height,
        background: s.backgroundColor, opacity: s.opacity, transform: s.transform,
        contentOpacity: [...shell.children].map(e => +getComputedStyle(e).opacity),
        phraseOpacity: [...document.querySelectorAll('.astrid-subtitle-variant')].map(e => +getComputedStyle(e).opacity),
        titleColor: getComputedStyle(document.querySelector('.astrid-hero-emphasis')).color,
        shared: [...document.querySelectorAll('.astrid-subtitle-shared')].map(e => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, opacity: getComputedStyle(e).opacity };
        }),
        subtitleOpacity: getComputedStyle(document.querySelector('.astrid-mobile-hero-subtitles p')).opacity,
      });
      if (!capture.done) requestAnimationFrame(sample);
    };
    sample();
  });
  await page.locator(`.astrid-audience-switch [data-audience="${audience}"]`).evaluate(e => e.click());
  if (screenshots) {
    for (let i = 0; i < 7; i++) {
      await page.screenshot({ path: `${out}/${prefix}-${i}.png`, fullPage: true });
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(900);
  const frames = await page.evaluate(() => { window.heroCapture.done = true; return window.heroCapture.frames; });
  fs.writeFileSync(`${out}/${prefix}.json`, JSON.stringify(frames, null, 2));
  const first = frames[0];
  for (const frame of frames) {
    for (const key of ['x', 'y', 'w', 'h']) assert(Math.abs(frame[key] - first[key]) < .5, `CTA ${key} moved during ${prefix}`);
    assert.equal(frame.background, first.background, 'CTA background faded');
    assert.equal(frame.opacity, '1', 'CTA frame faded');
    assert.equal(frame.transform, 'none', 'CTA frame transformed');
    assert.equal(frame.titleColor, first.titleColor, 'Main title flashed a different color');
    assert.equal(frame.subtitleOpacity, '1', 'Shared subtitle faded');
    assert.equal(frame.shared.length, first.shared.length, 'Shared subtitle changed structure');
    assert(frame.shared.every(span => span.opacity === '1'), 'Shared subtitle content faded');
  }
  assert(frames.some(f => f.contentOpacity.some(o => o > .05 && o < .95)), 'Missing CTA content animation');
  assert(frames.some(f => f.phraseOpacity.some(o => o > .05 && o < .95)), 'Missing subtitle animation');
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of [360, 390, 430, 640]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: 'no-preference' });
      for (const entry of ['app', 'agent']) {
        await page.goto(`${base}/home?experience=${entry}`);
        await page.waitForSelector('.astrid-editor-stage[data-revealed="true"]');
        await page.waitForTimeout(1600);
        const before = await geometry(page);
        assert.equal(before.cta.height, 52);
        assert(Math.abs(before.cardGap - 25) < .5, `${width}/${entry} CTA-to-card gap ${before.cardGap}`);
        assert.equal(before.ctaGap, 28);
        assert.equal(before.titleGap, 18);
        assert.equal(before.activePhrases, 1);
        assert(!before.overflow);
        await page.screenshot({ path: `${out}/${width}-${entry}-entry.png`, fullPage: true });
        const destination = entry === 'app' ? 'agent' : 'app';
        await captureSwitch(page, destination, `${width}-${entry}-to-${destination}`, width === 390);
        const after = await geometry(page);
        assert.deepEqual(after.cta, before.cta, 'CTA shifted after switching');
        assert(Math.abs(after.cardGap - 25) < .5);
        assert.equal(after.activePhrases, 1);
        // Reverse repeatedly before the short text transitions finish.
        for (const mode of [entry, destination, entry]) {
          await page.locator(`.astrid-audience-switch [data-audience="${mode}"]`).evaluate(e => e.click());
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(1000);
        assert.deepEqual((await geometry(page)).cta, before.cta);
        results.push({ width, entry, before, after });
      }
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(`${base}/home?experience=app`);
    await page.waitForSelector('.astrid-mobile-hero-subtitles');
    await page.locator('.astrid-audience-switch [data-audience="agent"]').click();
    const motion = await page.evaluate(() => [...document.querySelectorAll('.astrid-hero-emphasis, .astrid-mobile-hero-subtitles, .astrid-hero-cta')].flatMap(e => e.getAnimations({ subtree: true })).length);
    assert.equal(motion, 0, 'Reduced-motion hero still animates');
    fs.writeFileSync(`${out}/measurements.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ ok: true, widths: [360, 390, 430, 640], directEntries: 8, bothDirections: true, rapidReversals: true, reducedMotion: true, out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
