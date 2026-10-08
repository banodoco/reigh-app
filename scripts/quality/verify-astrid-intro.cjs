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
              return {id,opacity:+c.opacity,translate:c.translate,scale:c.scale,delay:parseFloat(c.animationDelay)*1000,line:parseFloat(getComputedStyle(path).strokeDashoffset),dot:+getComputedStyle(dot).opacity};
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
        await page.waitForTimeout(40);
      }
      const initial=await page.evaluate(()=>window.arrival);
      fs.writeFileSync(`${out}/${width}-${audience}-initial.json`, JSON.stringify({media,errors,shots,initial},null,2));
      const visible=initial.frames.filter(f=>f.revealed==='true');
      assert(visible.length>20);
      assert(visible.every(f=>f.decoded && !f.failed), 'Revealed before decoded media or with media error');
      assert.equal(errors.length,0,errors.join('\n'));
      const calls=initial.starts.filter(e=>['astrid-callout-in','astrid-connector-draw','astrid-dot-land'].includes(e.name));
      const mobile=width<=640;
      const order=audience==='agent'
        ? (mobile?['tools','community','workflows']:['community','tools','workflows'])
        : (mobile?['effects','timeline','models']:['timeline','effects','models']);
      if (mobile) {
        assert.deepEqual(calls.filter(e=>e.name==='astrid-callout-in').map(e=>e.id),order,'Mobile card narrative order');
      } else {
        assert.deepEqual(calls.map(e=>`${e.id}:${e.name}`),order.flatMap(id=>[
          `${id}:astrid-callout-in`,`${id}:astrid-connector-draw`,`${id}:astrid-dot-land`
        ]),'Card -> connector -> endpoint narrative order');
      }
      const frameCard=(frame,id)=>frame.cards.find(card=>card.id===id);
      for(let i=0;i<3;i++) {
        const card=calls.find(e=>e.id===order[i] && e.name==='astrid-callout-in');
        const line=calls.find(e=>e.id===order[i] && e.name==='astrid-connector-draw');
        const dot=calls.find(e=>e.id===order[i] && e.name==='astrid-dot-land');
        assert(card && line && dot,'Missing card/connector/endpoint entrance event');
        assert(mobile ? Math.abs(line.t-card.t)<50 : line.t-card.t>=220,'Connector began at the wrong time');
        assert(dot.t-line.t>=170,'Endpoint began before line finished');
        if(i<2) {
          const nextCard=calls.find(e=>e.id===order[i+1] && e.name==='astrid-callout-in');
          assert(nextCard.t-card.t>=(mobile?40:680)-60,'Callout cadence started too early');
          if (!mobile) assert(nextCard.t-card.t-680<60,'Callout cadence drifted from 680ms');
        }
        if (mobile) {
          // Mobile deliberately starts the connector on the same clock as its card;
          // the three 60ms slots overlap instead of creating desktop-style isolated beats.
          assert(visible.some(f=>f.cards.length===3 && frameCard(f,order[i]).opacity>0.2 && frameCard(f,order[i]).opacity<1 && frameCard(f,order[i]).line>0.05 && frameCard(f,order[i]).line<0.99), 'Missing synchronized card/connector entrance frame');
        } else {
          assert(visible.some(f=>f.cards.length===3 && frameCard(f,order[i]).opacity>0.2 && frameCard(f,order[i]).line>0.99 && order.slice(i+1).every(id=>frameCard(f,id).opacity===0)), 'Missing isolated card entrance frame');
          assert(visible.some(f=>f.cards.length===3 && frameCard(f,order[i]).opacity===1 && frameCard(f,order[i]).line>0.05 && frameCard(f,order[i]).line<0.95 && order.slice(i+1).every(id=>frameCard(f,id).opacity===0)), 'Missing isolated connector draw frame');
        }
        const settling=visible.filter(f=>f.t-card.t>=100 && f.t-card.t<=250 && f.cards.length===3).map(f=>frameCard(f,order[i]));
        assert(settling.filter(c=>c.opacity>0.1 && c.opacity<0.98 && (mobile || parseFloat(c.scale)<1) && c.translate!=='none').length>=(mobile?1:3), mobile ? 'Card did not visibly translate while its connector drew' : 'Card popped in instead of visibly fading, translating and scaling');
        assert(new Set(settling.map(c=>c.translate)).size>=3,'Missing progressive card movement');
      }
      const firstVisible=visible.find(f=>f.cards.length);
      assert.equal(frameCard(firstVisible,order[0]).delay,mobile?80:450,'First card CSS delay changed');
      // Animation events can arrive a few frames late during cold-load/screenshot work.
      const firstCard=calls.find(e=>e.id===order[0] && e.name==='astrid-callout-in');
      assert(Math.abs(firstCard.t-visible[0].t-(mobile?80:450))<100,'First card missed its arrival');
      assert(calls.at(-1).t+100-visible[0].t<2460,'Callout sequence exceeded its 2.36-second arrival budget');
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
