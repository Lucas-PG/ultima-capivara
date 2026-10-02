import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.argv[2]||'docs/overhaul/evidence/codex-plane';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl']});
const data={};
try {
  const page=await browser.newPage({viewport:{width:1470,height:956},deviceScaleFactor:2});
  page.on('pageerror',error=>{console.error(error.message);process.exitCode=1;});
  for(const version of (process.env.VERSIONS||'before,after').split(',')) {
    await page.goto(`${process.env.BASE||'http://127.0.0.1:5198'}/tools/blender/aircraft-review.html?version=${version}`);
    await page.waitForFunction(()=>window.aircraftReview?.ready,null,{timeout:120000});
    const names=process.env.SHOTS?.split(',')||await page.evaluate(()=>window.aircraftReview.names);
    for(const name of names){
      data[`${version}-${name}`]=await page.evaluate(name=>window.aircraftReview.shot(name),name);
      await page.screenshot({path:`${out}/${version}-${name}.jpg`,quality:90,scale:'css'});
      console.log(version,name,JSON.stringify(data[`${version}-${name}`]));
    }
  }
  await writeFile(`${out}/capture-costs.json`,JSON.stringify(data,null,2)+'\n');
} finally {await browser.close();}
