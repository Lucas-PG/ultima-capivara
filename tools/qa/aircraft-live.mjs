import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const out=process.argv[2]||'docs/overhaul/evidence/codex-plane';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl']});
const evidence={};
try {
  for(const version of (process.env.VERSIONS||'before,after').split(',')) {
    const context=await browser.newContext({viewport:{width:1470,height:956},deviceScaleFactor:2});
    await context.addInitScript(()=>localStorage.setItem('uc-v2-settings',JSON.stringify({graphics:'medium',frameLimit:60,graphicsChosen:true})));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${process.env.BASE||'http://127.0.0.1:5198'}/?networkQa=1&calm`);
    await page.locator('[data-do="practice"]').waitFor({timeout:120000});
    await page.waitForFunction(()=>window.__networkQA);
    await page.evaluate(async version=>{
      const {GameRenderer}=await import('/src/render/renderer.ts');
      const baseline=await import('/tools/qa/aircraft-baseline.ts');
      const update=GameRenderer.prototype.update;
      GameRenderer.prototype.update=function(...args) {
        if(version==='before'&&!this.__legacyAircraft) {
          this.plane.removeFromParent();this.plane=baseline.makePlane();this.scene.add(this.plane);
          this.propellers=this.plane.children.filter(child=>child.name==='propeller');this.__legacyAircraft=true;
        }
        const result=update.apply(this,args);
        window.__aircraftLiveRenderer=this;
        return result;
      };
      if(version==='before') {
        const {AvatarView}=await import('/src/render/avatars.ts');
        const avatarUpdate=AvatarView.prototype.update;
        AvatarView.prototype.update=function(frame,...rest) {
          const result=avatarUpdate.call(this,frame,...rest);
          for(const actor of frame.snapshot?.actors||[]) {
            const view=this.get(actor.id);if(!view||view.__legacyChute)continue;
            view.chute.removeFromParent();view.chute=baseline.makeParachute(actor.color);view.group.add(view.chute);view.__legacyChute=true;
          }
          return result;
        };
      }
      window.__networkQA.pinPresetDensity();
    },version);
    await page.locator('[data-mode="battle-royale"]').click();
    await page.locator('[data-do="practice"]').click();
    await page.waitForFunction(()=>{const i=window.__capivara?.inspect();return i?.snapshot?.phase==='playing'&&!i.renderState.loading;},null,{timeout:180000});
    await page.evaluate(()=>{window.__networkQA.activate();window.__networkQA.look(.35,-.08);});
    const read=()=>page.evaluate(()=>{const i=window.__capivara.inspect(),me=i.snapshot.actors.find(actor=>!actor.bot);return {stage:me.stage,pos:me.pos,time:i.snapshot.time,camera:i.camera,density:i.renderDensity,stats:i.renderer,otherStages:i.snapshot.actors.reduce((out,a)=>(out[a.stage]=(out[a.stage]||0)+1,out),{})};});
    evidence[`${version}-plane-player`]=await read();
    await page.screenshot({path:`${out}/${version}-plane-player.jpg`,quality:90,scale:'css'});
    await page.evaluate(()=>{window.__networkQA.key('Space',true);window.__networkQA.key('Space',false);});
    await page.waitForFunction(()=>window.__capivara.inspect().snapshot.actors.find(a=>!a.bot)?.stage==='falling',null,{timeout:15000});
    await page.waitForTimeout(1100);
    evidence[`${version}-fall-player`]=await read();
    await page.screenshot({path:`${out}/${version}-fall-player.jpg`,quality:90,scale:'css'});
    await page.evaluate(()=>{window.__networkQA.key('Space',true);window.__networkQA.key('Space',false);});
    await page.waitForFunction(()=>window.__capivara.inspect().snapshot.actors.find(a=>!a.bot)?.stage==='parachute',null,{timeout:15000});
    await page.waitForTimeout(1000);
    evidence[`${version}-chute-player`]=await read();
    await page.screenshot({path:`${out}/${version}-chute-player.jpg`,quality:90,scale:'css'});
    evidence[`${version}-errors`]=errors;
    if(errors.length)process.exitCode=1;
    await context.close();
  }
  await writeFile(`${out}/live-cameras.json`,JSON.stringify(evidence,null,2)+'\n');
} finally {await browser.close();}
