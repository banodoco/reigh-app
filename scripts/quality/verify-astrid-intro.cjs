// Real browser evidence: fresh contexts, decoded media, every-paint geometry and early screenshots.
// Usage: node scripts/quality/verify-astrid-intro.cjs [base URL] [evidence directory]
const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:2245';
const out = process.argv[3] || '/tmp/astrid-ready-intro';
fs.mkdirSync(out, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [390, 1440]) for (const audience of ['app', 'agent']) {
      const context = await browser.newContext({viewport:{width,height:1000}, reducedMotion:'no-preference'});
      // Routing disables HTTP cache; delaying media also exercises the old 900ms/2500ms fallbacks.
      await context.route('**/*', async route => {
        if (route.request().url().endsWith('/first-light.mp4')) await new Promise(r => setTimeout(r, 2800));
        await route.continue();
      });
      const page = await context.newPage();
      const media = [], errors = [];
      page.on('response', r => {if (/\.mp4(?:\?|$)/.test(r.url())) media.push({url:r.url(),status:r.status()});});
      page.on('console', m => {if (m.type()==='error' && /MediaPlayer|MediaError|Failed to recognize|404/.test(m.text())) errors.push(m.text());});
      await page.addInitScript(() => {
        window.arrival = {frames:[],starts:[]};
        document.addEventListener('animationstart', e => window.arrival.starts.push({name:e.animationName,id:e.target.dataset.callout,target:e.target.className,t:performance.now()}));
        const sample = () => {
          const stage=document.querySelector('.astrid-editor-stage');
          if (stage) window.arrival.frames.push({t:performance.now(),revealed:stage.dataset.revealed,
            decoded:!!stage.querySelector('[data-preview-decoded-frame="true"]'),
            failed:!!stage.querySelector('[data-media-state="error"]'),
            cards:[...stage.querySelectorAll('article.astrid-callout')].map(e=>{
              const c=getComputedStyle(e),id=e.dataset.callout;
              const path=stage.querySelector(`path[data-callout="${id}"]`);
              const dot=stage.querySelector(`.astrid-callout-dot-end[data-callout="${id}"]`);
              return {id,opacity:+c.opacity,translate:c.translate,line:parseFloat(getComputedStyle(path).strokeDashoffset),dot:+getComputedStyle(dot).opacity};
            }),
            items:['.astrid-editor-stage','.astrid-player-surface','.astrid-chat-surface','.astrid-callout'].map(s=>{
              const e=stage.querySelector(s) || (stage.matches(s)?stage:null); if(!e)return null;
              const c=getComputedStyle(e),r=e.getBoundingClientRect();
              return {selector:s,y:r.y,x:r.x,height:r.height,opacity:+c.opacity,translate:c.translate,animation:c.animationName};
            })});
          requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      });
      await page.goto(`${base}/home?experience=${audience}`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('.astrid-editor-stage')?.dataset.revealed==='true', {timeout:30000});
      const shots=[];
      for(let i=0;i<32;i++) {
        const sample=await page.evaluate(()=>window.arrival.frames.at(-1));
        const file=`${width}-${audience}-${String(i).padStart(2,'0')}.png`;
        await page.screenshot({path:`${out}/${file}`,fullPage:true});
        shots.push({file,...sample});
        await page.waitForTimeout(120);
      }
      const initial=await page.evaluate(()=>window.arrival);
      fs.writeFileSync(`${out}/${width}-${audience}-initial.json`, JSON.stringify({media,errors,shots,initial},null,2));
      const visible=initial.frames.filter(f=>f.revealed==='true');
      assert(visible.length>20);
      assert(visible.every(f=>f.decoded && !f.failed), 'Revealed before decoded media or with media error');
      assert.equal(errors.length,0,errors.join('\n'));
      const order=audience==='agent'?['community','tools','workflows']:['timeline','effects','models'];
      const calls=initial.starts.filter(e=>['astrid-callout-in','astrid-connector-draw','astrid-dot-land'].includes(e.name));
      assert.deepEqual(calls.map(e=>`${e.id}:${e.name}`),order.flatMap(id=>[
        `${id}:astrid-callout-in`,`${id}:astrid-connector-draw`,`${id}:astrid-dot-land`
      ]),'Card -> connector -> endpoint narrative order');
      for(let i=0;i<3;i++) {
        const [card,line,dot]=calls.slice(i*3,i*3+3);
        assert(line.t-card.t>=730,'Connector began before card settled');
        assert(dot.t-line.t>=390,'Endpoint began before line finished');
        if(i<2) assert(calls[i*3+3].t-dot.t>=220,'Next card began before endpoint landed');
        assert(visible.some(f=>f.cards.length===3 && f.cards[i].opacity>0.2 && f.cards[i].line>0.99 && f.cards.slice(i+1).every(c=>c.opacity===0)), 'Missing isolated card entrance frame');
        assert(visible.some(f=>f.cards.length===3 && f.cards[i].opacity===1 && f.cards[i].line>0.05 && f.cards[i].line<0.95 && f.cards.slice(i+1).every(c=>c.opacity===0)), 'Missing isolated connector draw frame');
      }
      assert(media.some(m=>m.url.endsWith('/astrid/light-study/first-light.mp4') && [200,206].includes(m.status)));
      // App intentionally uses the launcher instead of the hidden chat window.
      for(const idx of audience==='app' ? [1] : [1,2]) {
        const samples=visible.map(f=>f.items[idx]).filter(Boolean);
        assert(samples.some(s=>s.animation==='astrid-surface-in' && s.translate!=='none' && s.opacity>0), 'Missing real depth/slide intro');
        assert(new Set(samples.map(s=>s.translate)).size>8, 'Surface did not move over successive frames');
      }
      const stageY=visible.map(f=>f.items[0].y);
      assert(Math.max(...stageY)-Math.min(...stageY)<1,'Stage layout jumped');
      const count=initial.starts.filter(e=>e.name==='astrid-surface-in').length;
      for(let i=0;i<4;i++) {
        const next=(i%2===0)===(audience==='app')?'Agent':'App';
        await page.getByRole('button',{name:next,exact:true}).click();
        await page.waitForTimeout(1000);
      }
      const result=await page.evaluate(()=>window.arrival);
      assert.equal(result.starts.filter(e=>e.name==='astrid-surface-in').length,count,'Intro replayed on audience switch');
      assert.equal(result.starts.filter(e=>['astrid-callout-in','astrid-connector-draw','astrid-dot-land','astrid-mobile-callout-arrive'].includes(e.name)).length,calls.length,'Callout choreography replayed on switch');
      assert.equal(await page.locator('[data-media-state="error"]').count(),0);
      fs.writeFileSync(`${out}/${width}-${audience}.json`, JSON.stringify({media,errors,shots,initial,result},null,2));
      console.log(JSON.stringify({width,audience,media,revealMs:visible[0].t,shots:shots.map(s=>({file:s.file,ms:Math.round(s.t-visible[0].t),player:s.items[1]?.translate,chat:s.items[2]?.translate})),stageMovement:Math.max(...stageY)-Math.min(...stageY),introCount:count,switches:4}));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
