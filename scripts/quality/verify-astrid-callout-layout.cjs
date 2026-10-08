// Fresh contexts, live DOM identity/geometry and screenshots through both audience switches.
const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const CALLOUT_VACUUM_RETRACT_START_MS = 80;
const CALLOUT_VACUUM_PHONE_RETRACT_MS = 360;
const CALLOUT_VACUUM_RETRACT_MS = 450;
const CALLOUT_VACUUM_EXTEND_MS = 380;
const CALLOUT_VACUUM_PHONE_EXTEND_MS = 440;
const CALLOUT_VACUUM_RECONNECT_STAGGER_MS = 140;
const CALLOUT_VACUUM_SETTLE_MS = 24;
const CALLOUT_VACUUM_RESIDUAL_RATIO = 0.2;
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
            const stage=document.querySelector('.astrid-editor-stage');
            state.frames.push({t:performance.now(),audience:root.dataset.audience,
              same:root===document.querySelector('.astrid-callouts') && cards.every((c,i)=>c===root.querySelectorAll('article')[i]) && paths.every((p,i)=>p===root.querySelectorAll('path')[i]),
              surface:stage?.querySelector('.astrid-chat-surface') ? box(stage.querySelector('.astrid-chat-surface')) : null,
              cards:cards.map((c,i)=>{
                const start=root.querySelectorAll('.astrid-callout-dot-start')[i];
                const end=root.querySelectorAll('.astrid-callout-dot-end')[i];
                const point=d=>[origin.x+Number(d.getAttribute('cx')),origin.y+Number(d.getAttribute('cy'))];
                return {id:c.dataset.callout,box:box(c),moving:!!c.dataset.layoutMoving,opacity:getComputedStyle(c).opacity,
                  textOpacity:+getComputedStyle(c.querySelector(':scope > .astrid-callout-content')).opacity,
                  outgoingOpacity:c.querySelector(':scope > .astrid-callout-outgoing') ? +getComputedStyle(c.querySelector(':scope > .astrid-callout-outgoing')).opacity : 0,
                  target:paths[i].dataset.connectorTarget,pulse:root.querySelectorAll('.astrid-callout-ping')[i]?.dataset.astridReconnectPulse==='true',start:point(start),end:point(end),endOpacity:+(end.getAttribute('opacity') || '1'),path:paths[i].getAttribute('d')};
              })});
            // Sample after the page's measurement RAF has updated SVG for this frame.
            if(!state.done)requestAnimationFrame(()=>setTimeout(sample,0));
          };requestAnimationFrame(()=>setTimeout(sample,0));
        });
        // DOM click avoids scrolling the toggle and adding pointer parallax during measurements.
        await page.getByRole('button',{name:audience==='agent'?'Agent':'App',exact:true}).evaluate(e=>e.click());
        for(let i=0;i<14;i++) {
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
        const reconnectOrder=audience==='agent'
          ? (width<=640?['tools','community','workflows']:['community','tools','workflows'])
          : (width<=640?['effects','timeline','models']:['timeline','effects','models']);
        const switched=result.frames.filter(f=>f.audience===audience);
        const relative=f=>f.t-switched[0].t;
        const firstPulseAt=new Map(reconnectOrder.map(id=>{
          const cardIndex=newIds.indexOf(id);
          const frame=switched.find(f=>f.cards[cardIndex].pulse);
          assert(frame,`Connector ${id} did not pulse after reattachment`);
          return [id,relative(frame)];
        }));
        for(let orderIndex=1;orderIndex<reconnectOrder.length;orderIndex++) {
          const previous=firstPulseAt.get(reconnectOrder[orderIndex-1]);
          const current=firstPulseAt.get(reconnectOrder[orderIndex]);
          assert(current>=previous+CALLOUT_VACUUM_RECONNECT_STAGGER_MS-90,'Connector pulse order/stagger collapsed');
        }
        for(let i=0;i<3;i++) {
          assert(new Set(moving.map(f=>f.cards[i].box.join(','))).size>8,'Card snapped instead of moving/resizing');
          const retractUntil=width<=640?CALLOUT_VACUUM_PHONE_RETRACT_MS:CALLOUT_VACUUM_RETRACT_MS;
          const destinationBoxes=switched.at(-1).cards.map(card=>card.box);
          const nearDestination=(box,destination)=>box.every((value,index)=>Math.abs(value-destination[index])<=2);
          const geometrySettled=audience==='agent' ? switched.find(frame=>frame.cards.every((card,index)=>nearDestination(card.box,destinationBoxes[index]))) : null;
          assert(audience!=='agent' || geometrySettled,'Agent destination card geometry never settled');
          const extendAt=audience==='agent'?Math.max(retractUntil,relative(geometrySettled)+CALLOUT_VACUUM_SETTLE_MS):retractUntil;
          const baseExtendDuration=width<=640?CALLOUT_VACUUM_PHONE_EXTEND_MS:CALLOUT_VACUUM_EXTEND_MS;
          const extendDuration=baseExtendDuration;
          const expansionEnd=extendAt+extendDuration;
          const lead=switched.filter(f=>relative(f)<CALLOUT_VACUUM_RETRACT_START_MS);
          assert(lead.length>0,'Missing connector lead phase');
          const retracting=switched.filter(f=>relative(f)>=CALLOUT_VACUUM_RETRACT_START_MS && relative(f)<retractUntil);
          assert(new Set(retracting.map(f=>f.cards[i].end.join(','))).size>2,'Connector did not visibly retract');
          const distance=(frame)=>Math.hypot(frame.cards[i].end[0]-frame.cards[i].start[0],frame.cards[i].end[1]-frame.cards[i].start[1]);
          const minimumRetractDistance=Math.min(...retracting.map(distance));
          const leadDistance=distance(switched[0]);
          const finalDistance=distance(switched.at(-1));
          // A slot whose old App endpoint is already closer than the requested
          // fifth-length residual cannot contract farther without overshooting
          // the residual floor; it must still visibly move or already be at that
          // floor rather than grow during retraction.
          assert(minimumRetractDistance<leadDistance*0.9
            || Math.abs(minimumRetractDistance-finalDistance*CALLOUT_VACUUM_RESIDUAL_RATIO)<Math.max(4,finalDistance*0.08),
          'Vacuum retraction did not pull the endpoint inward');
          const expansion=switched.filter(f=>relative(f)>=extendAt && relative(f)<expansionEnd);
          const pulseFrames=switched.filter(f=>f.cards[i].pulse);
          assert(pulseFrames.length>0,'Connector did not pulse after reattachment');
          assert(relative(pulseFrames[0])>=extendAt+extendDuration-100,'Connector pulsed before its extension finished');
          const hold=audience==='agent'
            ? switched.filter(f=>relative(f)>=retractUntil && relative(f)<extendAt)
            : [];
          assert(new Set(expansion.map(f=>f.cards[i].end.join(','))).size>4,'Connector did not re-expand after its extension start');
          if(audience==='agent') {
            assert(expansion.some(f=>f.cards.every((card,index)=>nearDestination(card.box,destinationBoxes[index]))),'Connector waited past destination geometry settle');
            assert(expansion.every(f=>f.cards[i].target==='transition'),'Connector target changed before extension finished');
            assert(hold.length>0,'Missing residual hold before Agent extension');
            const settledDistance=distance(switched.at(-1));
            const residualDistance=distance(hold.at(-1));
            assert(settledDistance>4,'Final connector distance is too small to validate residual hold');
            assert(Math.abs(residualDistance/settledDistance-CALLOUT_VACUUM_RESIDUAL_RATIO)<0.08,'Connector did not hold at 20% residual distance');
          }
          // Desktop capture is sampled every 80ms while the text blend is 360ms;
          // three intermediate samples is the stable lower bound when a compositor
          // frame lands exactly on a fade boundary.
          assert(moving.filter(f=>f.cards[i].textOpacity>0.1 && f.cards[i].textOpacity<0.9 && f.cards[i].outgoingOpacity>0.1 && f.cards[i].outgoingOpacity<0.9).length>=3,'Text popped instead of crossfading');
          assert(moving.every(f=>f.cards[i].opacity==='1'),'Shared layout was replaced with a fade');
          assert(moving.every(f=>{
            const {box:[x,y,w,h],start:[sx,sy]}=f.cards[i];
            return sx>=x-20 && sx<=x+w+20 && sy>=y-20 && sy<=y+h+20;
          }),'Connector detached from moving card');
          assert.equal(result.frames.at(-1).cards[i].target,newIds[i]);
          for(let j=1;j<switched.length;j++) {
            const a=switched[j-1],b=switched[j];
            if(b.t-a.t>80)continue;
            // Desktop cards cross ~830px; account for dropped frames during screenshots.
            // Screenshot/RAF sampling can produce sub-16ms deltas even when the browser
            // has advanced by one compositor frame. Compare against a 60Hz floor so a
            // dropped capture sample cannot turn smooth motion into a false jump.
            assert(Math.max(...b.cards[i].box.map((v,k)=>Math.abs(v-a.cards[i].box[k])))<6*Math.max(16,b.t-a.t)+20,'Abrupt card geometry jump');
          }
        }
        console.log(JSON.stringify({width,audience,frames:result.frames.length,movingFrames:moving.length,identity:true,targets:true}));
      }
      // The shell can land while transcript targets still have no measurable boxes.
      // Keep them unavailable through the entire extension, then verify live retargeting.
      const hiddenTranscript=await page.addStyleTag({content:'.astrid-chat-surface .astrid-scripted-conversation { display: none !important; }'});
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      // Sample before the surface-gated extension on both breakpoints; waiting for the cards to
      // finish would miss the behavior this check is meant to protect.
      await page.waitForTimeout(width<=640 ? 220 : 480);
      const heldEnds=await page.locator('.astrid-callout-dot-end').evaluateAll(es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy')]));
      await page.waitForTimeout(180);
      const extendingEnds=await page.locator('.astrid-callout-dot-end').evaluateAll(es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy')]));
      assert(heldEnds.some((point,i)=>point.join(',')!==extendingEnds[i].join(',')),'Connector waited for transcript content instead of destination geometry');
      await page.waitForFunction(()=>[...document.querySelectorAll('.astrid-callout-connectors path')].every(e=>e.getAttribute('d')?.startsWith('M') && e.dataset.connectorTarget===e.dataset.callout),null,{timeout:3000});
      await page.screenshot({path:`${out}/${width}-agent-delayed-content.png`,fullPage:true});
      await hiddenTranscript.evaluate(e=>e.remove());
      if(width<=640) {
        await page.waitForFunction(()=>{
          const stage=document.querySelector('.astrid-editor-stage');
          const chat=stage.querySelector('.astrid-chat-surface').getBoundingClientRect();
          const target=stage.querySelector('.justify-end > .rounded-2xl').getBoundingClientRect();
          const origin=stage.getBoundingClientRect();
          const end=stage.querySelector('.astrid-callout-dot-end[data-callout="community"]');
          const x=origin.left+stage.clientLeft+Number(end.getAttribute('cx'));
          const y=origin.top+stage.clientTop+Number(end.getAttribute('cy'));
          return target.width>0 && Math.abs(x-target.right)<0.2 && Math.abs(y-Math.max(chat.top+56,Math.min(chat.bottom-16,target.top+target.height*.5)))<0.2;
        });
      }
      console.log(JSON.stringify({width,delayedContent:true,extendedBeforeContent:true,retargeted:true}));

      // Remove the whole Agent surface so its targets are genuinely unavailable.
      // Every slot must still retract from its captured endpoint instead of holding
      // the old source until the surface returns.
      const hiddenSurface=await page.addStyleTag({content:'.astrid-chat-surface { display:none !important; }'});
      await page.getByRole('button',{name:'App',exact:true}).evaluate(e=>e.click());
      await page.waitForTimeout(1100);
      const missingBefore=await page.locator('.astrid-callout-dot-end').evaluateAll(es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy')]));
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      await page.waitForTimeout(width<=640 ? 420 : 500);
      const missingAfter=await page.locator('.astrid-callout-dot-end').evaluateAll(es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy')]));
      assert(missingAfter.every((point,i)=>point.join(',')!==missingBefore[i].join(',')),'A missing target bypassed per-slot retraction');
      assert(await page.locator('.astrid-callout-connectors path').evaluateAll(paths=>paths.every(path=>path.getAttribute('d')?.startsWith('M') && path.dataset.connectorTarget==='transition')),'Missing-target retract did not preserve connector transition state');
      await hiddenSurface.evaluate(e=>e.remove());
      await page.waitForFunction(()=>[...document.querySelectorAll('.astrid-callout-connectors path')].every(path=>path.dataset.connectorTarget===path.dataset.callout),null,{timeout:3000});
      console.log(JSON.stringify({width,missingTargetRetracted:true}));

      // Repeat the switch while connectors are mid-flight. Each slot must keep a
      // live path and finish on the active audience's target instead of reusing a
      // stale/missing curve from the previous direction.
      for (const repeatedAudience of ['app','agent','app','agent']) {
        await page.getByRole('button',{name:repeatedAudience==='agent'?'Agent':'App',exact:true}).evaluate(e=>e.click());
        await page.waitForTimeout(160);
        const mid=await page.locator('.astrid-callout-connectors path').evaluateAll(paths=>paths.map(path=>({d:path.getAttribute('d'),target:path.dataset.connectorTarget})));
        assert(mid.every(path=>path.d?.startsWith('M')),'Repeated switch lost a per-callout curve');
        assert(mid.some(path=>path.target==='transition'),'Repeated switch skipped connector transition state');
      }
      await page.waitForFunction(()=>[...document.querySelectorAll('.astrid-callout-connectors path')].every(path=>path.dataset.connectorTarget===path.dataset.callout && path.getAttribute('d')?.startsWith('M')),null,{timeout:3000});
      await page.getByRole('button',{name:'App',exact:true}).evaluate(e=>e.click());
      await page.waitForTimeout(1100);
      // A rapid reversal must capture the current interpolated box, not an obsolete destination.
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      await page.waitForTimeout(220);
      // Sample and reverse in one browser task. Pausing the old WAAPI animation here
      // changes the View Transition snapshot timing and creates a verifier-only jump.
      const {before,after}=await page.getByRole('button',{name:'App',exact:true}).evaluate(async button=>{
        const root=document.querySelector('.astrid-callouts');
        const boxes=()=>[...document.querySelectorAll('.astrid-callout')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
        const before=boxes();
        return new Promise(resolve=>{
          const observer=new MutationObserver(()=>{
            if(root.dataset.audience!=='app')return;
            observer.disconnect();
            root.getAnimations({subtree:true}).forEach(animation=>animation.pause());
            const after=boxes();
            root.getAnimations({subtree:true}).forEach(animation=>animation.play());
            resolve({before,after});
          });
          observer.observe(root,{attributes:true,attributeFilter:['data-audience']});
          button.click();
        });
      });
      assert.equal(await page.locator('.astrid-callouts').getAttribute('data-audience'),'app');
      // The compositor can advance one frame while the mutation observer samples
      // the newly primed FLIP frame; keep this below the old-layout snap distance.
      assert(before.every((b,i)=>b.every((v,k)=>Math.abs(v-after[i][k])<120)),'Rapid reversal snapped to stale layout');
      await page.waitForTimeout(1100);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.getByRole('button',{name:'Agent',exact:true}).evaluate(e=>e.click());
      assert.equal(await page.locator('[data-layout-moving]').count(),0,'Reduced motion animated shared layout');
      assert.equal(await page.locator('[data-media-state="error"]').count(),0);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
