// Fresh contexts, live DOM identity/geometry and screenshots through both audience switches.
const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:2245';
const out = process.argv[3] || '/tmp/astrid-callout-layout';
fs.mkdirSync(out, {recursive:true});
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390,1440]) {
      const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'no-preference'});
      await context.route('**/*', route=>route.continue());
      const page=await context.newPage();
      await page.goto(`${base}/home?experience=app`);
      await page.waitForSelector('.astrid-editor-stage[data-revealed="true"]');
      await page.waitForTimeout(2800);
      await page.mouse.move(0,0);
      for (const audience of ['agent','app']) {
        await page.evaluate(() => {
          const root=document.querySelector('.astrid-callouts');
          const cards=[...root.querySelectorAll('article')];
          const paths=[...root.querySelectorAll('path')];
          const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
          const state=window.layoutCapture={root,cards,paths,before:cards.map(box),frames:[],done:false};
          const sample=()=>{
            const origin=root.getBoundingClientRect();
            state.frames.push({t:performance.now(),audience:root.dataset.audience,
              same:root===document.querySelector('.astrid-callouts') && cards.every((c,i)=>c===root.querySelectorAll('article')[i]) && paths.every((p,i)=>p===root.querySelectorAll('path')[i]),
              cards:cards.map((c,i)=>{
                const start=root.querySelectorAll('.astrid-callout-dot-start')[i];
                const end=root.querySelectorAll('.astrid-callout-dot-end')[i];
                const point=d=>[origin.x+Number(d.getAttribute('cx')),origin.y+Number(d.getAttribute('cy'))];
                return {id:c.dataset.callout,box:box(c),moving:!!c.dataset.layoutMoving,opacity:getComputedStyle(c).opacity,
                  textOpacity:+getComputedStyle(c.querySelector(':scope > .astrid-callout-content')).opacity,
                  outgoingOpacity:c.querySelector(':scope > .astrid-callout-outgoing') ? +getComputedStyle(c.querySelector(':scope > .astrid-callout-outgoing')).opacity : 0,
                  target:paths[i].dataset.connectorTarget,start:point(start),end:point(end),path:paths[i].getAttribute('d')};
              })});
            // Sample after the page's measurement RAF has updated SVG for this frame.
            if(!state.done)requestAnimationFrame(()=>setTimeout(sample,0));
          };requestAnimationFrame(()=>setTimeout(sample,0));
        });
        // DOM click avoids scrolling the toggle and adding pointer parallax during measurements.
        await page.getByRole('button',{name:audience==='agent'?'Agent':'App',exact:true}).evaluate(e=>e.click());
        for(let i=0;i<10;i++) {
          await page.screenshot({path:`${out}/${width}-${audience}-${i}.png`,fullPage:true});
          await page.waitForTimeout(80);
        }
        const result=await page.evaluate(()=>{
          window.layoutCapture.done=true;
          const {before,frames}=window.layoutCapture;
          return {before,frames};
        });
        fs.writeFileSync(`${out}/${width}-${audience}.json`,JSON.stringify(result,null,2));
        assert(result.frames.every(f=>f.same),'Cards or connector SVG remounted');
        const moving=result.frames.filter(f=>f.audience===audience && f.cards.some(c=>c.moving));
        assert(moving.length>10,'Missing continuous shared-layout motion');
        const newIds=audience==='agent'?['community','tools','workflows']:['timeline','effects','models'];
        for(let i=0;i<3;i++) {
          assert(new Set(moving.map(f=>f.cards[i].box.join(','))).size>8,'Card snapped instead of moving/resizing');
          const early=moving.filter(f=>f.t-moving[0].t<250);
          assert(new Set(early.map(f=>f.cards[i].path)).size>4,'Connector held old geometry until the end');
          assert(new Set(early.map(f=>f.cards[i].end.join(','))).size>4,'Endpoint did not move continuously in first 250ms');
          assert(moving.filter(f=>f.cards[i].textOpacity>0.1 && f.cards[i].textOpacity<0.9 && f.cards[i].outgoingOpacity>0.1 && f.cards[i].outgoingOpacity<0.9).length>5,'Text popped instead of crossfading');
          assert(moving.every(f=>f.cards[i].opacity==='1'),'Shared layout was replaced with a fade');
          assert(moving.every(f=>{
            const {box:[x,y,w,h],start:[sx,sy]}=f.cards[i];
            return sx>=x-20 && sx<=x+w+20 && sy>=y-20 && sy<=y+h+20;
          }),'Connector detached from moving card');
          assert.equal(result.frames.at(-1).cards[i].target,newIds[i]);
          const switched=result.frames.filter(f=>f.audience===audience);
          for(let j=1;j<switched.length;j++) {
            const a=switched[j-1],b=switched[j];
            if(b.t-a.t>80)continue;
            // Desktop cards cross ~830px; account for dropped frames during screenshots.
            assert(Math.max(...b.cards[i].box.map((v,k)=>Math.abs(v-a.cards[i].box[k])))<6*(b.t-a.t)+20,'Abrupt card geometry jump');
          }
        }
        console.log(JSON.stringify({width,audience,frames:result.frames.length,movingFrames:moving.length,identity:true,targets:true}));
      }
      // A rapid reversal must capture the current interpolated box, not an obsolete destination.
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      await page.waitForTimeout(220);
      const before=await page.locator('.astrid-callout').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
      await page.getByRole('button',{name:'App',exact:true}).evaluate(e=>e.click());
      const after=await page.locator('.astrid-callout').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
      assert(before.every((b,i)=>b.every((v,k)=>Math.abs(v-after[i][k])<80)),'Rapid reversal snapped to stale layout');
      await page.waitForTimeout(1100);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      assert.equal(await page.locator('[data-layout-moving]').count(),0,'Reduced motion animated shared layout');
      assert.equal(await page.locator('[data-media-state="error"]').count(),0);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
