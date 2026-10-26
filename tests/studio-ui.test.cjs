/* Dependency-free state/interaction checks. These do not substitute for visual browser QA. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function appHarness(){
  const elements=[];
  class Element{
    constructor(tag='div',attrs={}){
      this.tagName=tag.toUpperCase();this.attrs=attrs;this.id=attrs.id||'';this.dataset={};
      for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;
      this.textContent='';this.innerHTML='';this.value=attrs.value||'';this.disabled='disabled'in attrs;this.checked='checked'in attrs;this.children=[];this.events={};
      this.style={setProperty:(k,v)=>this.style[k]=v};this.width=+attrs.width||0;this.height=+attrs.height||0;this.scrollTop=0;this.offsetTop=0;this.clientHeight=240;
      this.classList={contains:x=>(this.attrs.class||'').split(/\s+/).includes(x),add:x=>this.classList.toggle(x,true),remove:x=>this.classList.toggle(x,false),toggle:(x,on)=>{const set=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));on=on??!set.has(x);on?set.add(x):set.delete(x);this.attrs.class=[...set].join(' ');return on;}};
      elements.push(this);
    }
    set className(value){this.attrs.class=value;}get className(){return this.attrs.class||'';}
    addEventListener(name,fn){this.events[name]=fn;}setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}focus(){this.focused=true;}scrollIntoView(){this.scrolled=true;}
    getBoundingClientRect(){return{left:0,width:this.clientWidth||900};}
    getContext(){return new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(obj,k)=>obj[k]||((...args)=>{for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`Canvas ${String(k)} received a non-finite coordinate`);}),set:(obj,k,v)=>(obj[k]=v,true)});}
  }
  const html=fs.readFileSync(path.join(__dirname,'../static/index.html'),'utf8');
  for(const match of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*?)>/g)){
    const attrs={};for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
    if(/\bdisabled\b/.test(match[2]))attrs.disabled='';if(/\bchecked\b/.test(match[2]))attrs.checked='';
    new Element(match[1],attrs);
  }
  const select=selector=>elements.filter(el=>selector[0]==='.'?selector.slice(1).split('.').every(c=>el.classList.contains(c)):selector[0]==='['?(()=>{const m=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return m&&m[1]in el.attrs&&(m[2]===undefined||el.attrs[m[1]]===m[2]);})():false);
  const ids=new Map(elements.filter(e=>e.id).map(e=>[e.id,e]));
  assert.equal(ids.size,elements.filter(e=>e.id).length,'HTML IDs must be unique');
  const body=elements.find(e=>e.tagName==='BODY');
  const document={body,getElementById:id=>ids.get(id),querySelectorAll:select,querySelector:s=>select(s)[0]||null,createElement:tag=>new Element(tag),addEventListener(){}};
  const location={pathname:'/',hash:''},entries=[],events={},saved=new Map();
  class Audio{constructor(){this.paused=true;this.currentTime=0;this.volume=1;this.muted=false;this.ended=false;}pause(){this.paused=true;}async play(){this.paused=false;}}
  const context=vm.createContext({document,location,history:{pushState:(_state,_title,url)=>{entries.push(url);location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}},window:{addEventListener:(k,fn)=>events[k]=fn,scrollTo(){}},Audio,localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},console,Float32Array,DataView,Uint8Array,URL,fetch:async()=>{throw new Error('Unexpected network request in interaction test');},drawActivation(){},drawDescent(){},capturedTaal:null});
  const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8').replace(/init\(\);\s*$/,'');
  vm.runInContext(source,context);
  const run=source=>vm.runInContext(source,context);
  function composition(){run("statusData={ready:true,taals:{dadra:{name:'Dadra',beats:6,khali:4,claps:[1],groups:[3,3]}}}; current={taal:'dadra',beats:6,cycles:2,bpm:120,duration:6,tokens:['Dha','Dhin','Na','Dha','Tin','Na','Dha','Dhin','Na','Dha','Tin','Na']}; $('play').disabled=false;");}
  return{run,ids,body,entries,events,location,saved,composition};
}

test('root enters landing; studio logo returns home; browser history restores studio',()=>{
  const h=appHarness();h.run("openPage('',false)");
  assert.equal(h.body.classList.contains('landing-mode'),true);
  h.run("openPage('studio')");assert.equal(h.location.hash,'#studio');assert.equal(h.ids.get('studio').classList.contains('active'),true);
  h.run("document.querySelectorAll('[data-page]').find(el=>el.classList.contains('brand')).events.click({preventDefault(){}})");
  assert.equal(h.location.hash,'');assert.equal(h.body.classList.contains('landing-mode'),true);
  h.location.hash='#studio';h.events.popstate();assert.equal(h.body.classList.contains('landing-mode'),false);
  assert.deepEqual(h.entries,['/#studio','/']);
});
test('taal selection carries into studio and keyboard moves between rhythmic previews',()=>{
  const h=appHarness();h.run("selectLandingRhythm('dadra');statusData={ready:true};generateRhythm=async()=>{generating=true;capturedTaal=$('taal').value;};$('use-rhythm').onclick()");
  assert.equal(h.run('capturedTaal'),'dadra');assert.equal(h.location.hash,'#studio');
  h.ids.get('rhythm-tab-dadra').onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(h.ids.get('rhythm-tab-teentaal').getAttribute('aria-selected'),'true');
});
test('sidebar collapse is accessible and persists independently of landing navigation',()=>{
  const h=appHarness();h.ids.get('toggle-sidebar').onclick();
  assert.equal(h.body.classList.contains('sidebar-collapsed'),true);
  assert.equal(h.saved.get('taal-sidebar-collapsed'),'true');
  assert.equal(h.ids.get('toggle-sidebar').getAttribute('aria-expanded'),'false');
  h.run("openPage('home');openPage('studio')");assert.equal(h.body.classList.contains('sidebar-collapsed'),true);
  h.ids.get('toggle-sidebar').onclick();assert.equal(h.ids.get('toggle-sidebar').getAttribute('aria-label'),'Collapse sidebar');
});
test('wheel, current stroke and cycle track the audio clock; waveform seeks preserve pause',()=>{
  const h=appHarness();h.composition();h.run('audio.currentTime=3.6;updatePlayback()');
  assert.equal(h.ids.get('live-bol').textContent,'Dhin');assert.equal(h.ids.get('live-cycle').textContent,'CYCLE 02 / 02');
  assert.match(h.ids.get('live-position').textContent,/Beat 2 of 6/);
  h.ids.get('seek').value='500';h.ids.get('seek').oninput();assert.equal(h.run('audio.currentTime'),3);assert.equal(h.run('audio.paused'),true);
  h.run('seekTo(-5)');assert.equal(h.run('audio.currentTime'),0);h.run('seekTo(500)');assert.equal(h.run('audio.currentTime'),6);
});
test('play, pause, looping, focus, volume and mute update real playback state',async()=>{
  const h=appHarness();h.composition();await h.run('togglePlay()');assert.equal(h.run('audio.paused'),false);assert.equal(h.ids.get('performance-status').textContent,'LIVE PERFORMANCE');
  await h.run('togglePlay()');assert.equal(h.run('audio.paused'),true);
  h.ids.get('loop').checked=true;h.run('audio.currentTime=6.25;tick()');assert.equal(h.run('audio.currentTime'),.25);
  h.ids.get('volume').value='25';h.ids.get('volume').oninput();assert.equal(h.run('audio.volume'),.25);
  h.ids.get('mute').onclick();assert.equal(h.run('audio.muted'),true);assert.equal(h.ids.get('mute').getAttribute('aria-pressed'),'true');
  h.ids.get('focus-performance').onclick();assert.equal(h.body.classList.contains('performance-focus'),true);
  h.run("openPage('home')");assert.equal(h.run('audio.paused'),true);assert.equal(h.run('audio.currentTime'),0);assert.equal(h.body.classList.contains('performance-focus'),false);
});
test('architecture tabs switch accessibly and checkpoint metrics reflect the loaded report',()=>{
  const h=appHarness();
  h.ids.get('flow-tab-train').onclick();
  assert.equal(h.ids.get('flow-generate').hidden,true);assert.equal(h.ids.get('flow-train').hidden,false);
  assert.equal(h.ids.get('flow-tab-train').getAttribute('aria-selected'),'true');
  h.ids.get('flow-tab-train').onkeydown({key:'ArrowLeft',preventDefault(){}});
  assert.equal(h.ids.get('flow-train').hidden,true);assert.equal(h.ids.get('flow-tab-generate').focused,true);
  const {report}=JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/bol_rnn.json'),'utf8'));
  h.run(`renderCheckpoint(${JSON.stringify({report,training:false})})`);
  assert.equal(h.ids.get('checkpoint-loss').textContent,report.best_val_loss.toFixed(3));
  assert.equal(h.ids.get('checkpoint-epochs').textContent,`${report.history.length} / ${report.best_epoch}`);
  h.run(`renderCheckpoint(${JSON.stringify({report,training:true})})`);
  assert.match(h.ids.get('checkpoint-status').textContent,/Retraining/);
  h.run('renderCheckpoint({report:null,training:false})');
  assert.equal(h.ids.get('checkpoint-loss').textContent,'—');
  assert.equal(h.ids.get('checkpoint-status').textContent,'No trained checkpoint loaded');
});
test('connected network shows 15 inputs, 16 hidden nodes, 10 outputs and all feedforward connections',()=>{
  const h=appHarness(),svg=h.ids.get('connected-network').innerHTML;
  assert.equal((svg.match(/class="input-neuron /g)||[]).length,15);
  assert.equal((svg.match(/class="hidden-neuron"/g)||[]).length,16);
  assert.equal((svg.match(/class="output-neuron"/g)||[]).length,10);
  assert.equal((svg.match(/class="input-connection"/g)||[]).length,240);
  assert.equal((svg.match(/class="output-connection"/g)||[]).length,160);
  assert.match(svg,/16 × 16 recurrent weights/);
  h.ids.get('network-toggle').onclick();
  assert.equal(h.ids.get('connected-network').classList.contains('animation-paused'),true);
  assert.equal(h.ids.get('network-toggle').getAttribute('aria-pressed'),'true');
  h.ids.get('network-toggle').onclick();assert.equal(h.ids.get('network-toggle').textContent,'Pause animation');
});
test('detailed training plots use real epoch values, mark the best loss, and clear stale metrics for new training',()=>{
  const h=appHarness();
  const {report}=JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/bol_rnn.json'),'utf8'));
  h.run(`renderTrainingResults(${JSON.stringify({report,training:false})})`);
  const best=report.history.find(r=>r.epoch===report.best_epoch);
  assert.equal(h.ids.get('training-best-loss').textContent,best.val_loss.toFixed(3));
  assert.equal(h.ids.get('training-best-accuracy').textContent,(best.val_accuracy*100).toFixed(1)+'%');
  assert.equal(h.ids.get('inspect-epoch-value').textContent,`Epoch ${report.best_epoch} of ${report.history.length}`);
  assert.match(h.ids.get('studio-loss-chart').getAttribute('aria-label'),new RegExp(`epoch ${report.best_epoch}`));
  assert.equal(h.ids.get('studio-loss-chart').width,1800,'Chart backing store renders at 2× resolution');
  h.ids.get('inspect-epoch').value=String(report.history.length);h.ids.get('inspect-epoch').oninput();
  assert.match(h.ids.get('epoch-values').textContent,new RegExp(report.history.at(-1).val_loss.toFixed(3)));
  h.ids.get('studio-loss-chart').clientWidth=320;h.run('redrawTrainingCharts()');
  assert.equal(h.ids.get('studio-loss-chart').width,640);
  h.run(`renderTrainingResults(${JSON.stringify({report,training:true,progress:[]})})`);
  assert.equal(h.ids.get('training-best-loss').textContent,'—');assert.equal(h.ids.get('inspect-epoch').disabled,true);
  h.run(`renderTrainingResults(${JSON.stringify({report,training:true,progress:[report.history[0]]})})`);
  assert.equal(h.ids.get('training-best-label').textContent,'Best epoch so far');assert.equal(h.ids.get('inspect-epoch').disabled,false);
  assert.match(h.ids.get('studio-accuracy-chart').getAttribute('aria-label'),/over 1 epochs/);
});
