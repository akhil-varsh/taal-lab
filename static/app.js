'use strict';
const $ = id => document.getElementById(id);
let current = null, audio = new Audio(), audioUrl = null, frame = 0, statusData = null;
let waveData = null, generating = false, lastBeat = -1, wasTraining = false, noticeTimer;
let waveSampleRate = 22050;
let trainingRows = [], selectedEpochIndex = null, trainingBestIndex = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
audio.volume = .85;
const names = {home:'Taal Lab', studio:'Rhythm Studio', model:'Model Lab', learn:'Inside the AI', data:'Dataset'};
function notify(message, error=false) {
  $('notice').textContent = message; $('notice').className = error ? 'error' : '';
  $('notice').hidden = false; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').hidden = true, 6500);
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data;
}
function openPage(page, navigate=true) {
  if (!names[page]) page = 'home';
  const changed = !$(page).classList.contains('active');
  document.body.classList.toggle('landing-mode', page === 'home');
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === page));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('breadcrumb').textContent = `Workspace / ${names[page]}`;
  const targetHash = page === 'home' ? '' : '#'+page;
  if (navigate && location.hash !== targetHash) history.pushState(null, '', location.pathname + targetHash);
  document.title = page === 'home' ? 'Taal Lab — Old soul. New rhythm.' : `${names[page]} — Taal Lab`;
  if (changed) window.scrollTo({top:0,behavior:'instant'});
  if (page === 'home') stopAudio();
  if (page !== 'studio') setPerformanceFocus(false);
  if (page === 'studio' && statusData?.ready && !current && !generating) generateRhythm();
  if (page === 'learn') { drawActivation(); drawDescent(); }
  if ((page === 'model' || page === 'studio') && statusData) requestAnimationFrame(redrawTrainingCharts);
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', event => {event.preventDefault();openPage(button.dataset.page);}));
window.addEventListener('popstate', () => openPage(location.hash.slice(1),false));
window.addEventListener('hashchange', () => openPage(location.hash.slice(1),false));
document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.scroll).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})));
const landingRhythms = {
  teentaal:{name:'Teentaal',group:'4 + 4 + 4 + 4',title:'Room to explore.',description:'Sixteen beats, four equal divisions. A spacious foundation for discovering the conversation between repetition and variation.',bols:'Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha',khali:8},
  keherwa:{name:'Keherwa',group:'4 + 4',title:'Find your forward motion.',description:'An eight-beat cycle in two equal halves. A direct, flowing pulse with plenty of room to play with the spaces between strokes.',bols:'Dha Ge Na Ti Na Ka Dhin Na',khali:4},
  dadra:{name:'Dadra',group:'3 + 3',title:'A little room to sway.',description:'Six beats in two groups of three. Explore a compact, lilting cycle and let a simple phrase take on a different character.',bols:'Dha Dhin Na Dha Tin Na',khali:3}
};
let landingTaal='teentaal';
function selectLandingRhythm(taal){
  landingTaal=taal;const rhythm=landingRhythms[taal];
  document.querySelectorAll('[data-rhythm]').forEach(button=>{const selected=button.dataset.rhythm===taal;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  $('rhythm-detail').setAttribute('aria-labelledby','rhythm-tab-'+taal);
  $('landing-rhythm-group').textContent=rhythm.group;$('landing-rhythm-title').textContent=rhythm.title;$('landing-rhythm-description').textContent=rhythm.description;
  $('landing-bols').replaceChildren();
  rhythm.bols.split(' ').forEach((bol,index)=>{const chip=document.createElement('span');chip.className=index===0?'landing-sam':index===rhythm.khali?'landing-khali':'';const beat=document.createElement('small');beat.textContent=String(index+1).padStart(2,'0');const label=document.createElement('b');label.textContent=bol;chip.append(beat,label);$('landing-bols').append(chip);});
  $('use-rhythm').textContent=`Create with ${rhythm.name} ↗`;
}
document.querySelectorAll('[data-rhythm]').forEach(button=>{button.onclick=()=>selectLandingRhythm(button.dataset.rhythm);button.onkeydown=event=>{const keys=Object.keys(landingRhythms),i=keys.indexOf(button.dataset.rhythm);let next;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%keys.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i+keys.length-1)%keys.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=keys.length-1;else return;event.preventDefault();selectLandingRhythm(keys[next]);$('rhythm-tab-'+keys[next]).focus();};});
$('use-rhythm').onclick=()=>{$('taal').value=landingTaal;openPage('studio');if(statusData&&!generating)generateRhythm();};
selectLandingRhythm('teentaal');
function buildNetworkDiagram(){
  const inputs=['Previous Dha','Previous Dhin','Previous Tin','Previous Ta','Previous Na','Previous Ge','Previous Ka','Previous Ti','Previous Te','Previous Rest','Taal: Teentaal','Taal: Keherwa','Taal: Dadra','Beat phase: sin','Beat phase: cos'];
  const outputs=['Dha','Dhin','Tin','Ta','Na','Ge','Ka','Ti','Te','Rest'];
  const inputY=inputs.map((_,i)=>144+i*30),hiddenY=Array.from({length:16},(_,i)=>129+i*30),outputY=outputs.map((_,i)=>144+i*46.6667);
  const inputX=210,hiddenX=550,outputX=930;
  const parts=['<defs><marker id="recurrent-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#e2bd83" stroke-width="1.4"/></marker></defs>'];
  parts.push('<text class="layer-title" x="210" y="36" text-anchor="middle">INPUT LAYER</text><text class="layer-subtitle" x="210" y="65" text-anchor="middle">15 features</text><text class="layer-title" x="550" y="36" text-anchor="middle">HIDDEN LAYER</text><text class="layer-subtitle" x="550" y="65" text-anchor="middle">16 neurons · tanh</text><text class="layer-title" x="930" y="36" text-anchor="middle">OUTPUT LAYER</text><text class="layer-subtitle" x="930" y="65" text-anchor="middle">10 bol scores</text>');
  parts.push('<g class="network-connections" aria-hidden="true">');
  inputY.forEach(y=>hiddenY.forEach(h=>parts.push(`<line class="input-connection" x1="${inputX+11}" y1="${y}" x2="${hiddenX-13}" y2="${h}"/>`)));
  hiddenY.forEach(y=>outputY.forEach(o=>parts.push(`<line class="output-connection" x1="${hiddenX+13}" y1="${y}" x2="${outputX-12}" y2="${o}"/>`)));
  parts.push('</g><g class="network-signals" aria-hidden="true">');
  [0,3,7,10,13,14].forEach((i,k)=>{const h=(k*3)%16,o=(k*2)%10;parts.push(`<path class="signal-path input-signal" style="--signal-delay:${k*.12}s" pathLength="100" d="M${inputX+11},${inputY[i]} L${hiddenX-13},${hiddenY[h]}"/><path class="signal-path output-signal" style="--signal-delay:${k*.12}s" pathLength="100" d="M${hiddenX+13},${hiddenY[h]} L${outputX-12},${outputY[o]}"/>`);});
  parts.push('</g><g class="network-neurons">');
  inputs.forEach((label,i)=>{const type=i<10?'bol-input':i<13?'taal-input':'phase-input';parts.push(`<g class="input-neuron ${type}"><circle cx="${inputX}" cy="${inputY[i]}" r="11"/><text x="${inputX-25}" y="${inputY[i]+5}" text-anchor="end">${label}</text></g>`);});
  hiddenY.forEach((y,i)=>parts.push(`<g class="hidden-neuron"><circle cx="${hiddenX}" cy="${y}" r="13"/><text class="hidden-index" x="${hiddenX}" y="${y+4}" text-anchor="middle">${i+1}</text></g>`));
  outputs.forEach((label,i)=>parts.push(`<g class="output-neuron"><circle cx="${outputX}" cy="${outputY[i]}" r="12"/><text x="${outputX+27}" y="${outputY[i]+5}">${label}</text></g>`));
  parts.push('</g><path class="recurrent-loop" d="M564 592 C720 674 380 674 536 592" marker-end="url(#recurrent-arrow)"/><text class="recurrent-label" x="550" y="688" text-anchor="middle">hₜ → hₜ₊₁ · 16 × 16 recurrent weights</text><text class="connection-count" x="369" y="102" text-anchor="middle">240 connections</text><text class="connection-count" x="745" y="102" text-anchor="middle">160 connections</text><text class="softmax-label" x="930" y="620" text-anchor="middle">Dense → softmax</text>');
  $('connected-network').innerHTML='<title id="network-svg-title">Bol-RNN: a connected 15–16–10 recurrent neural network</title><desc id="network-svg-description">15 input features feed 16 tanh neurons, then 10 outputs. All 240 input-to-hidden and 160 hidden-to-output connections are shown. The loop denotes 256 recurrent weights across time. Animation is illustrative.</desc>'+parts.join('');
}
function setNetworkPaused(paused){
  $('connected-network').classList.toggle('animation-paused',paused);
  $('network-toggle').setAttribute('aria-pressed',String(paused));
  $('network-toggle').textContent=paused?'Play animation':'Pause animation';
}
$('network-toggle').onclick=()=>setNetworkPaused(!$('connected-network').classList.contains('animation-paused'));
buildNetworkDiagram();setNetworkPaused(reducedMotion.matches);
function selectFlow(flow){
  if(!['generate','train'].includes(flow))return;
  document.querySelectorAll('[data-flow]').forEach(button=>{const selected=button.dataset.flow===flow;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  $('flow-generate').hidden=flow!=='generate';$('flow-train').hidden=flow!=='train';
}
document.querySelectorAll('[data-flow]').forEach(button=>{button.onclick=()=>selectFlow(button.dataset.flow);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const flow=event.key==='Home'?'generate':event.key==='End'?'train':button.dataset.flow==='generate'?'train':'generate';selectFlow(flow);$('flow-tab-'+flow).focus();};});
function renderCheckpoint(data){
  const report=data.report;
  $('checkpoint-status').textContent=data.training?(report?'Retraining · showing loaded checkpoint':'Training the first checkpoint'):report?'Loaded model · live report':'No trained checkpoint loaded';
  const optimizerNames={adam:'Adam',sgd:'SGD',momentum:'SGD + momentum',rmsprop:'RMSprop'};
  const values={optimizer:report?(optimizerNames[report.optimizer]||report.optimizer):'—',rate:report?String(report.learning_rate):'—',epochs:report?`${report.history.length} / ${report.best_epoch}`:'—',loss:report?report.best_val_loss.toFixed(3):'—',perplexity:report?report.perplexity.toFixed(2):'—',split:report?`${report.train_phrases} / ${report.validation_phrases}`:'—'};
  Object.entries(values).forEach(([key,value])=>$('checkpoint-'+key).textContent=value);
}
function setSidebarCollapsed(collapsed, persist=true){
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  $('toggle-sidebar').setAttribute('aria-expanded',String(!collapsed));
  $('toggle-sidebar').setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');
  $('toggle-sidebar').title=collapsed?'Expand sidebar':'Collapse sidebar';
  if(persist){try{localStorage.setItem('taal-sidebar-collapsed',String(collapsed));}catch{}}
}
try{setSidebarCollapsed(localStorage.getItem('taal-sidebar-collapsed')==='true',false);}catch{}
$('toggle-sidebar').onclick=()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
document.querySelectorAll('.nav-item').forEach(button=>{button.setAttribute('aria-label',names[button.dataset.page]);button.title=names[button.dataset.page];});
function setPerformanceFocus(focused){
  document.body.classList.toggle('performance-focus',focused);
  $('focus-performance').setAttribute('aria-pressed',String(focused));
  $('focus-performance').innerHTML=focused?'⛶ <span>Exit focus</span>':'⛶ <span>Focus</span>';
}
$('focus-performance').onclick=()=>setPerformanceFocus(!document.body.classList.contains('performance-focus'));
$('tempo').oninput = () => $('tempo-value').innerHTML = `${$('tempo').value} <small>BPM</small>`;
$('temperature').oninput = () => $('temperature-value').textContent = Number($('temperature').value).toFixed(2);
$('engine').onchange = () => {
  const reference = $('engine').value === 'theka';
  ['temperature','seed','prefix','anchor'].forEach(id => $(id).disabled = reference);
};
function config() {
  return {taal:$('taal').value, engine:$('engine').value, cycles:Number($('cycles').value), bpm:Number($('tempo').value),
    temperature:Number($('temperature').value), seed:Number($('seed').value), prefix:$('prefix').value.trim(), anchor:$('anchor').checked};
}
function formatTime(seconds) { return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`; }
function stopAudio() { audio.pause(); audio.currentTime=0; cancelAnimationFrame(frame); $('play').textContent='▶'; $('play').setAttribute('aria-label','Play rhythm'); highlight(-1); updatePlayback(); }
function highlight(index) {
  if (index === lastBeat) return;
  document.querySelector('.bol.playing')?.classList.remove('playing');
  const bol = document.querySelector(`[data-beat="${index}"]`);
  if (bol) {
    bol.classList.add('playing');
    const container=$('sequence');
    const top=bol.offsetTop-container.offsetTop;
    if (top<container.scrollTop || top>container.scrollTop+container.clientHeight-50) container.scrollTop=Math.max(0,top-45);
  }
  lastBeat=index;
}
function updatePlayback() {
  drawPerformance();
  if (!current) return;
  $('time').textContent=formatTime(Math.min(audio.currentTime,current.duration));
  const percent=Math.min(100,audio.currentTime/current.duration*100);
  $('wave-playhead').style.left=percent+'%';
  $('seek').value=String(Math.round(percent*10));
  $('seek').setAttribute('aria-valuetext',`${formatTime(Math.min(audio.currentTime,current.duration))} of ${formatTime(current.duration)}`);
  highlight(audio.currentTime < current.duration ? Math.floor(audio.currentTime*current.bpm/60) : -1);
}
function tick() {
  if(current&&audio.currentTime>=current.duration&&$('loop').checked)audio.currentTime=audio.currentTime%current.duration;
  updatePlayback();
  if (!audio.paused) frame=requestAnimationFrame(tick);
}
audio.onended = () => {if($('loop').checked&&current){audio.currentTime=0;togglePlay();return;}$('play').textContent='▶'; $('play').setAttribute('aria-label','Play rhythm'); highlight(-1);updatePlayback();};
audio.ontimeupdate=()=>{if(current&&$('loop').checked&&audio.currentTime>=current.duration)audio.currentTime%=current.duration;if(audio.paused)updatePlayback();};
audio.onseeked=()=>updatePlayback();
async function togglePlay() {
  if (!current || $('play').disabled) return;
  if (audio.paused) {
    if (audio.ended) audio.currentTime=0;
    try { await audio.play(); $('play').textContent='Ⅱ'; $('play').setAttribute('aria-label','Pause rhythm'); cancelAnimationFrame(frame); tick(); }
    catch { notify('Playback could not start. Try the play button again.',true); }
  } else { audio.pause(); cancelAnimationFrame(frame); $('play').textContent='▶'; $('play').setAttribute('aria-label','Play rhythm');updatePlayback(); }
}
$('play').onclick=togglePlay;
function seekTo(seconds){if(!current||$('play').disabled)return;audio.currentTime=Math.max(0,Math.min(current.duration,seconds));updatePlayback();}
$('seek').oninput=()=>seekTo(Number($('seek').value)/1000*current.duration);
$('restart').onclick=()=>seekTo(0);
function updateVolume(){const muted=audio.muted||audio.volume===0;$('mute').setAttribute('aria-pressed',String(muted));$('mute').setAttribute('aria-label',muted?'Unmute audio':'Mute audio');$('mute').textContent=muted?'⊘':'♪';$('mute').title=muted?'Unmute audio':'Mute audio';}
$('volume').oninput=()=>{audio.volume=Number($('volume').value)/100;audio.muted=false;updateVolume();};
$('mute').onclick=()=>{if(audio.volume===0){audio.volume=.85;$('volume').value='85';audio.muted=false;}else audio.muted=!audio.muted;updateVolume();};
document.addEventListener('keydown', event => {
  if(event.key==='Escape')setPerformanceFocus(false);
  if (event.code==='Space' && !['INPUT','SELECT','TEXTAREA','BUTTON','SUMMARY','A'].includes(event.target.tagName) && $('studio').classList.contains('active')) { event.preventDefault(); togglePlay(); }
});
function drawWave() {
  const canvas=$('waveform'), ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h); if (!waveData) return;
  ctx.fillStyle='#99b8a1'; const bars=180, stride=Math.max(1,Math.floor(Math.min(waveData.length,current.duration*waveSampleRate)/bars));
  for(let i=0;i<bars;i++) {
    let peak=0; for(let j=0;j<stride;j+=Math.max(1,Math.floor(stride/40))) peak=Math.max(peak,Math.abs(waveData[i*stride+j]||0));
    const height=Math.max(2,peak*h*.9); ctx.fillRect(i*w/bars,(h-height)/2,2.5,height);
  }
}
function drawPerformance(){
  const canvas=$('taal-wheel'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const beats=current?.beats||16,position=current?Math.min(audio.currentTime*current.bpm/60,current.tokens.length):0;
  const finished=!!current&&position>=current.tokens.length;
  const index=current?Math.min(Math.floor(position),current.tokens.length-1):0;
  const beat=index%beats,cycle=Math.floor(index/beats),phase=position-Math.floor(position);
  const playing=!!current&&!audio.paused&&!finished;
  const pulse=playing?(reducedMotion.matches ? .35 : Math.exp(-phase*7)):0;
  const bol=current?.tokens[index]||'—',taal=current?statusData?.taals[current.taal]:null;
  const khali=(taal?.khali||9)-1,cx=w/2,cy=h/2,radius=130;
  const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  $('performance-stage').classList.toggle('is-playing',playing);
  text('performance-status',playing?'LIVE PERFORMANCE':finished?'PERFORMANCE COMPLETE':current&&audio.currentTime>0?'PAUSED':'READY TO PLAY');
  text('performance-tempo',current?`${current.bpm} BPM`:'— BPM');
  text('live-bol',bol==='Rest'?'Silence':bol);
  text('live-position',current?`Beat ${beat+1} of ${beats} · ${beat===0?'Sam':beat===khali?'Khali':taal?.name||'Tabla'}`:'Press play to find your pulse');
  text('live-cycle',current?`CYCLE ${String(cycle+1).padStart(2,'0')} / ${String(current.cycles).padStart(2,'0')}`:'CYCLE —');
  const next=current?.tokens[index+1]||($('loop').checked?current?.tokens[0]:null);
  text('next-bol',next||'End');
  $('bayan-hit').style.setProperty('--strike',String(['Dha','Dhin','Ge','Ka'].includes(bol)?pulse:0));
  $('dayan-hit').style.setProperty('--strike',String(!['Ge','Ka','Rest','—'].includes(bol)?pulse:0));
  ctx.clearRect(0,0,w,h);
  const glow=ctx.createRadialGradient(cx,cy,20,cx,cy,190);
  glow.addColorStop(0,`rgba(130,170,126,${.06+pulse*.05})`);glow.addColorStop(1,'rgba(130,170,126,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  const ring=(r,color,width=1,start=0,end=Math.PI*2)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(cx,cy,r,start,end);ctx.stroke();};
  ring(173,'#c8d9b00a');ring(radius,'#9bad8a25');ring(101,'#9bad8a12');
  ctx.setLineDash([2,7]);ring(184,'#9bad8a18');ctx.setLineDash([]);
  if(current){ring(radius,'#dc9862',2,-Math.PI/2,-Math.PI/2+Math.PI*2*((position%beats)/beats));}
  const sampleEnd=Math.floor(audio.currentTime*waveSampleRate);
  for(let bar=0;bar<64;bar++){
    const angle=bar/64*Math.PI*2-Math.PI/2;let energy=0;
    if(playing&&waveData&&!audio.muted){for(let j=0;j<24;j++){const sample=waveData[sampleEnd-1536+bar*24+j]||0;energy+=sample*sample;}energy=Math.sqrt(energy/24)*audio.volume;}
    const length=2+Math.min(22,energy*100),inner=153;
    ctx.strokeStyle=energy>.07?'#cfa774':'#80937940';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);ctx.lineTo(cx+Math.cos(angle)*(inner+length),cy+Math.sin(angle)*(inner+length));ctx.stroke();
  }
  for(let i=0;i<beats;i++){
    const angle=i/beats*Math.PI*2-Math.PI/2,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius,active=!!current&&i===beat;
    const color=i===0?'#e5a46f':i===khali?'#b7d09c':'#72856c';
    if(active){ctx.fillStyle=`rgba(225,167,107,${.10+pulse*.18})`;ctx.beginPath();ctx.arc(x,y,15+pulse*5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=active?'#f1ba83':'#1d2924';ctx.strokeStyle=active?'#ffd5aa':color;ctx.lineWidth=active?2:1.2;ctx.beginPath();ctx.arc(x,y,active?9:5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=active?'#f2d7b7':color;ctx.font=`${active?'600':'400'} 11px Segoe UI`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(i+1).padStart(2,'0'),cx+Math.cos(angle)*109,cy+Math.sin(angle)*109);
  }
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#81957a';ctx.font='10px Segoe UI';ctx.fillText('THE RHYTHM CYCLE',cx,cy-32);
  ctx.fillStyle='#e4e6ce';ctx.font='48px Georgia';ctx.fillText(current?String(beat+1).padStart(2,'0'):'—',cx,cy+7);
  ctx.fillStyle='#9bad8d';ctx.font='11px Segoe UI';ctx.fillText(current?`${taal?.name||'Tabla'} · ${beats} beats`:'Your next rhythm awaits',cx,cy+47);
}
function drawSequence() {
  const taal=statusData.taals[current.taal], container=$('sequence'); container.replaceChildren();
  container.style.position='relative';
  const starts=new Set([0]); let offset=0; for(const group of taal.groups) {offset+=group;starts.add(offset);}
  for(let cycle=0;cycle<current.cycles;cycle++) {
    const label=document.createElement('div');label.className='cycle-label';label.textContent=`CYCLE ${String(cycle+1).padStart(2,'0')}`;container.append(label);
    const row=document.createElement('div'); row.className='cycle-row'+(taal.beats===6?' six':'');
    for(let beat=0;beat<taal.beats;beat++) {
      const cell=document.createElement('button'), index=cycle*taal.beats+beat;
      cell.className='bol'+(beat===0?' sam':'')+(beat+1===taal.khali?' khali':'')+(starts.has(beat)?' group-start':'');
      cell.dataset.beat=index; cell.title=`Beat ${beat+1}${beat===0?' · Sam':beat+1===taal.khali?' · Khali':taal.claps.includes(beat+1)?' · Clap':''}`;
      cell.type='button';cell.setAttribute('aria-label',`Seek to cycle ${cycle+1}, beat ${beat+1}: ${current.tokens[index]}`);cell.onclick=()=>seekTo(index*60/current.bpm);
      const number=document.createElement('small');number.textContent=(beat===0?'● ':beat+1===taal.khali?'○ ':'')+(beat+1);
      const token=document.createElement('b');token.textContent=current.tokens[index]==='Rest'?'—':current.tokens[index];
      cell.append(number,token);row.append(cell);
    }
    container.append(row);
  }
}
async function generateRhythm() {
  if(generating) return; generating=true;
  const button=$('generate');button.disabled=true;button.textContent='Finding the next beat…';stopAudio();$('play').disabled=true;$('seek').disabled=true;$('restart').disabled=true;
  try {
    const result=await api('/api/generate',config());
    current=result; waveData=null;drawWave();drawSequence();drawPerformance();
    $('composition-title').textContent=`${statusData.taals[current.taal].name} exploration`;
    $('composition-meta').textContent=`${current.cycles} cycles · ${current.bpm} BPM${current.engine==='rnn'?` · Seed ${current.seed}`:' · Reference pattern'}`;
    $('engine-tag').textContent=current.engine==='rnn'?'BOL-RNN':'THEKA';
    $('stat-beats').textContent=current.tokens.length;$('stat-bols').textContent=current.unique_bols;
    $('stat-entropy').textContent=current.entropy===null?'—':current.entropy.toFixed(2);
    $('stat-entropy').title='Average pre-constraint sampling entropy, in nats. Not a musical quality score.';
    $('duration').textContent=' / '+formatTime(current.duration);$('time').textContent='0:00';
    ['wav','midi','abc','json'].forEach(fmt=>{const link=$('export-'+fmt);link.href=`/api/export?id=${current.id}&format=${fmt}`;link.setAttribute('aria-disabled','false');link.download='';});
    $('wave-empty').textContent='Rendering percussion…';$('wave-empty').style.display='flex';$('play').disabled=true;
    const response=await fetch(`/api/export?id=${current.id}&format=wav`);if(!response.ok)throw new Error('Could not render audio. Generate again.');
    const blob=await response.blob();if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);audio.src=audioUrl;
    // Our renderer produces PCM16 mono WAV; parse its data chunk for an exact waveform without audio permissions.
    const buffer=await blob.arrayBuffer(), view=new DataView(buffer);waveSampleRate=view.getUint32(24,true);let pcmOffset=12, pcmLength=0;
    while(pcmOffset+8<=buffer.byteLength){const tag=String.fromCharCode(...new Uint8Array(buffer,pcmOffset,4)),size=view.getUint32(pcmOffset+4,true);if(tag==='data'){pcmLength=size;pcmOffset+=8;break;}pcmOffset+=8+size+(size%2);}
    waveData=new Float32Array(pcmLength/2);for(let i=0;i<waveData.length;i++)waveData[i]=view.getInt16(pcmOffset+i*2,true)/32768;
    drawWave();$('wave-empty').style.display='none';$('wave-playhead').style.display='block';$('wave-playhead').style.left='0';$('play').disabled=false;$('seek').disabled=false;$('restart').disabled=false;updatePlayback();
  } catch(error) {notify(error.message,true);$('wave-empty').textContent='Generate a rhythm to prepare audio.';}
  finally {generating=false;button.disabled=false;button.innerHTML='✧ &nbsp; Generate rhythm <span>→</span>';}
}
$('generate').onclick=generateRhythm;
function drawTrainingChart(id,metric,rows=trainingRows){
  const canvas=$(id),ctx=canvas.getContext('2d');
  // Draw in CSS pixels with a high-resolution backing store, rather than shrinking labels.
  const w=Math.max(280,Math.round(canvas.clientWidth||900));
  const h=metric==='gradient'?380:(w<500?420:450),ratio=Math.max(2,Math.min(3,window.devicePixelRatio||1));
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.height=h+'px';
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#fffef9';ctx.fillRect(0,0,w,h);
  const compact=w<500,pad={left:compact?54:70,right:22,top:110,bottom:64},plotW=w-pad.left-pad.right,plotH=h-pad.top-pad.bottom;
  const title=metric==='accuracy'?'Next-bol accuracy':metric==='gradient'?'Gradient norm before clipping':'Cross-entropy loss';
  const series=metric==='gradient'?[['gradient_norm','#5d65a5','Mean norm']]:metric==='accuracy'?[['accuracy','#b64e26','Training'],['val_accuracy','#286b80','Validation']]:[['loss','#b64e26','Training'],['val_loss','#286b80','Validation']];
  ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=`600 ${compact?18:22}px Segoe UI`;ctx.fillStyle='#29352a';ctx.fillText(title,18,30);
  ctx.font='14px Segoe UI';let legendX=18;
  series.forEach(([key,color,label],index)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(index===1?[7,4]:[]);ctx.beginPath();ctx.moveTo(legendX,54);ctx.lineTo(legendX+25,54);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#465448';ctx.fillText(label,legendX+33,59);legendX+=metric==='gradient'?170:130;});
  if(!rows.length){ctx.font='16px Segoe UI';ctx.fillStyle='#616d60';ctx.fillText('No training history yet.',pad.left,h/2);canvas.setAttribute('aria-label',`${title}: no training history available.`);return;}
  const bestIndex=rows.reduce((best,row,i)=>row.val_loss<rows[best].val_loss?i:best,0),best=rows[bestIndex];
  const scale=metric==='accuracy'?100:1;
  const maximum=metric==='accuracy'?100:Math.ceil(Math.max(metric==='gradient'?1:0,...rows.flatMap(row=>series.map(([key])=>row[key])))*1.15*10)/10||1;
  const X=index=>pad.left+(rows.length===1?plotW/2:index/(rows.length-1)*plotW),Y=value=>pad.top+plotH-value*scale/maximum*plotH;
  ctx.font='13px Segoe UI';ctx.fillStyle='#616d60';ctx.fillText(metric==='gradient'?'Dashed line: clipping threshold 1.0':`Best validation loss: epoch ${best.epoch}`,18,85);
  for(let tick=0;tick<=4;tick++){
    const y=pad.top+tick/4*plotH,value=maximum*(1-tick/4);
    ctx.strokeStyle='#dce2d6';ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();
    ctx.textAlign='right';ctx.font='14px Segoe UI';ctx.fillStyle='#586653';ctx.fillText(metric==='accuracy'?`${Math.round(value)}%`:value.toFixed(2),pad.left-10,y+5);
  }
  const ticks=Math.min(compact?4:7,rows.length),tickIndices=new Set(Array.from({length:ticks},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,ticks-1))));
  ctx.textAlign='center';for(const index of tickIndices){ctx.fillText(String(rows[index].epoch),X(index),h-pad.bottom+23);}
  ctx.font='15px Segoe UI';ctx.fillStyle='#455440';ctx.fillText('Epoch',pad.left+plotW/2,h-16);
  if(metric==='gradient'){
    ctx.strokeStyle='#a26628';ctx.setLineDash([6,5]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(pad.left,Y(1));ctx.lineTo(w-pad.right,Y(1));ctx.stroke();ctx.setLineDash([]);
  }else{
    ctx.strokeStyle='#667d4c';ctx.setLineDash([4,5]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(X(bestIndex),pad.top);ctx.lineTo(X(bestIndex),pad.top+plotH);ctx.stroke();ctx.setLineDash([]);
  }
  for(const [key,color,label]of series){
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(label==='Validation'?[8,4]:[]);ctx.beginPath();rows.forEach((row,i)=>i?ctx.lineTo(X(i),Y(row[key])):ctx.moveTo(X(i),Y(row[key])));ctx.stroke();ctx.setLineDash([]);
    if(rows.length<=50)rows.forEach((row,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(X(i),Y(row[key]),2.6,0,Math.PI*2);ctx.fill();});
  }
  const inspected=Math.min(selectedEpochIndex??bestIndex,rows.length-1);
  ctx.strokeStyle='#56664d55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X(inspected),pad.top);ctx.lineTo(X(inspected),pad.top+plotH);ctx.stroke();
  series.forEach(([key,color])=>{ctx.fillStyle=color;ctx.strokeStyle='#fffef9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(inspected),Y(rows[inspected][key]),5.5,0,Math.PI*2);ctx.fill();ctx.stroke();});
  canvas.setAttribute('aria-label',`${title} over ${rows.length} epochs. Best validation loss at epoch ${best.epoch}: ${best.val_loss.toFixed(3)}. Inspect values using the epoch slider below.`);
  canvas._plot={left:pad.left,width:plotW,cssWidth:w};
}
function redrawTrainingCharts(){
  drawTrainingChart('loss-chart','loss');
  drawTrainingChart('studio-loss-chart','loss');
  drawTrainingChart('studio-accuracy-chart','accuracy');
  drawTrainingChart('studio-gradient-chart','gradient');
}
function updateEpochInspector(){
  if(!trainingRows.length)return;
  const row=trainingRows[selectedEpochIndex];
  $('inspect-epoch').value=String(selectedEpochIndex+1);$('inspect-epoch-value').textContent=`Epoch ${row.epoch} of ${trainingRows.length}`;
  $('epoch-values').textContent=`Training loss ${row.loss.toFixed(3)} · Validation loss ${row.val_loss.toFixed(3)} · Training accuracy ${(row.accuracy*100).toFixed(1)}% · Validation accuracy ${(row.val_accuracy*100).toFixed(1)}% · Mean gradient norm ${row.gradient_norm.toFixed(3)}`;
}
function renderTrainingResults(data){
  const rows=data.training?data.progress:(data.report?.history||[]),previousCount=trainingRows.length;
  trainingRows=rows;
  $('studio-training-status').textContent=data.training?`Training in progress · ${rows.length} completed epochs. The plots show the current run.`:data.error?`Training error: ${data.error}. Showing the loaded checkpoint’s history.`:data.report?`${data.report.optimizer.toUpperCase()} · learning rate ${data.report.learning_rate} · seed ${data.report.seed} · ${data.report.train_phrases} training / ${data.report.validation_phrases} validation phrases`:'No training run available. Open Model Lab to train your first network.';
  $('inspect-epoch').disabled=!rows.length;
  document.querySelectorAll('[data-chart-export]').forEach(button=>button.disabled=!rows.length);
  $('training-best-label').textContent=data.training?'Best epoch so far':'Retained checkpoint';
  if(rows.length){
    trainingBestIndex=rows.reduce((best,row,i)=>row.val_loss<rows[best].val_loss?i:best,0);
    if(selectedEpochIndex===null||rows.length<previousCount)selectedEpochIndex=trainingBestIndex;
    selectedEpochIndex=Math.max(0,Math.min(selectedEpochIndex,rows.length-1));
    const best=rows[trainingBestIndex],last=rows.at(-1);
    $('training-best-epoch').textContent=`Epoch ${best.epoch}`;$('training-best-loss').textContent=best.val_loss.toFixed(3);
    $('training-best-accuracy').textContent=(best.val_accuracy*100).toFixed(1)+'%';$('training-best-perplexity').textContent=Math.exp(best.val_loss).toFixed(2);
    $('inspect-epoch').max=String(rows.length);updateEpochInspector();
    const overfit=last.val_loss>best.val_loss*1.05&&last.loss<best.loss;
    $('training-interpretation').textContent=`${data.training?'Best so far':'Retained checkpoint'}: epoch ${best.epoch}, with validation loss ${best.val_loss.toFixed(3)}. At epoch ${last.epoch}, training loss is ${last.loss.toFixed(3)} and validation loss is ${last.val_loss.toFixed(3)}. ${overfit?'Training loss fell while validation loss rose after the best epoch, a sign of overfitting.':'Compare both curves: improvement on training phrases alone does not establish generalization.'} Validation phrases share motifs with the training set, so these results are specific to this small corpus.`;
  }else{
    selectedEpochIndex=null;['training-best-epoch','training-best-loss','training-best-accuracy','training-best-perplexity','inspect-epoch-value'].forEach(id=>$(id).textContent='—');
    $('epoch-values').textContent='Waiting for the first completed epoch.';$('training-interpretation').textContent='Training and validation results will appear after a completed epoch.';
  }
  redrawTrainingCharts();
}
$('inspect-epoch').oninput=()=>{if(!trainingRows.length)return;selectedEpochIndex=Number($('inspect-epoch').value)-1;updateEpochInspector();redrawTrainingCharts();};
['studio-loss-chart','studio-accuracy-chart','studio-gradient-chart'].forEach(id=>{
  $(id).onpointermove=event=>{if(!trainingRows.length||!$(id)._plot)return;const rect=$(id).getBoundingClientRect(),plot=$(id)._plot,x=(event.clientX-rect.left)*plot.cssWidth/rect.width;
    const next=Math.max(0,Math.min(trainingRows.length-1,Math.round((x-plot.left)/plot.width*(trainingRows.length-1))));
    if(next!==selectedEpochIndex){selectedEpochIndex=next;updateEpochInspector();redrawTrainingCharts();}
  };
});
document.querySelectorAll('[data-chart-export]').forEach(button=>button.onclick=()=>{
  if(!trainingRows.length)return;
  const canvas=$(button.dataset.chartExport);
  canvas.toBlob(blob=>{if(!blob)return notify('The chart could not be exported.',true);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`taal-lab-${button.dataset.chartExport}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
});
document.querySelector('.training-gradient-details').addEventListener('toggle',redrawTrainingCharts);
$('show-studio-training').onclick=()=>{openPage('studio');requestAnimationFrame(()=>$('studio-training-results').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'}));};
window.addEventListener('resize',()=>requestAnimationFrame(redrawTrainingCharts));
function renderStatus(data) {
  renderCheckpoint(data);
  statusData=data;$('model-status').textContent=data.training?'Model is training':data.ready?'Neural model ready':'Train your first model';
  $('train').disabled=data.training;$('train').textContent=data.training?'Training…':'Train a fresh model →';
  const rows=data.training?data.progress:data.report?.history||[];renderTrainingResults(data);
  if(data.training && rows.length){const last=rows.at(-1);$('training-message').textContent=`Epoch ${last.epoch} · validation loss ${last.val_loss.toFixed(3)}`;}
  else if(data.error){$('training-message').textContent=data.error;}
  else if(data.report){$('training-message').textContent=`Ready. Retained epoch ${data.report.best_epoch}; ${data.report.parameters.toLocaleString()} trainable parameters.`;}
  const report=data.report;
  if(report){$('metrics').innerHTML=`<div><strong>${report.best_val_loss.toFixed(3)}</strong><span>BEST VALIDATION LOSS</span></div><div><strong>${report.perplexity.toFixed(2)}</strong><span>VALIDATION PERPLEXITY</span></div><div><strong>${report.train_phrases} / ${report.validation_phrases}</strong><span>TRAIN / VALIDATION PHRASES</span></div>`;}
  if(wasTraining&&!data.training)notify(data.error?'Training failed: '+data.error:'Training complete. The best checkpoint is ready in the studio.',!!data.error);
  wasTraining=data.training;
}
$('train').onclick=async()=>{
  $('train').disabled=true;
  try{await api('/api/train',{epochs:Number($('epochs').value),rate:Number($('rate').value),optimizer:$('optimizer').value,seed:Number($('train-seed').value)});wasTraining=true;renderStatus(await api('/api/status'));}
  catch(error){notify(error.message,true);$('train').disabled=false;}
};
async function poll(){try{renderStatus(await api('/api/status'));}catch(error){$('model-status').textContent='Server disconnected';$('checkpoint-status').textContent='Server disconnected · values may be out of date';}finally{setTimeout(poll,statusData?.training?700:5000);}}
async function loadCorpus(){
  const data=await api('/api/corpus');
  for(const [taal,phrases] of Object.entries(data.corpus)){
    const section=document.createElement('details');section.className='card corpus-card';section.open=taal==='teentaal';
    const summary=document.createElement('summary');summary.textContent=`${statusData.taals[taal].name} · ${statusData.taals[taal].beats} beats · ${phrases.length} phrases`;
    const list=document.createElement('ol');phrases.forEach((phrase,index)=>{const li=document.createElement('li');li.textContent=phrase;if(index>=phrases.length-Math.floor(phrases.length/4)){li.className='validation';const badge=document.createElement('span');badge.textContent='VALIDATION';li.append(badge);}list.append(li);});section.append(summary,list);$('corpus-view').append(section);
  }
}
async function init(){openPage(location.hash.slice(1),false);try{renderStatus(await api('/api/status'));await loadCorpus();if(statusData.ready&&$('studio').classList.contains('active')&&!generating&&!current)await generateRhythm();}catch(error){notify(error.message,true);}poll();}
init();
