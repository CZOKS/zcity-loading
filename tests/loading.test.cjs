const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base,'index.html'),'utf8');
const app = fs.readFileSync(path.join(base,'app.js'),'utf8');
const config = fs.readFileSync(path.join(base,'config.js'),'utf8');
const playlist = fs.readFileSync(path.join(base,'playlist.js'),'utf8');
const themes = fs.readFileSync(path.join(base,'themes.js'),'utf8');
const tests = [];
function test(name,fn){tests.push({name,fn});}
function harness(options={}) {
  const nodes={}, timers=new Map(), data=Object.assign({}, options.storage), players=[];
  let nextTimer=0, copied='', policy=options.policy || 'allow';
  class Element {
    constructor(tag='div') {this.tagName=tag.toUpperCase();this.textContent='';this.attrs={};this.style={};this.hidden=false;this.volume=1;this.muted=false;this.paused=true;this.value='';this.parentNode=null;this.classes=new Set();
      this.classList={add:(s)=>this.classes.add(s),remove:(s)=>this.classes.delete(s),toggle:(s,on)=>on?this.classes.add(s):this.classes.delete(s),contains:(s)=>this.classes.has(s)};}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k] ?? null;}
    removeAttribute(k){delete this.attrs[k];}
    set src(v){this.attrs.src=v;}
    get src(){return this.attrs.src||'';}
    load(){}
    pause(){this.paused=true;}
    play(){
      if(policy==='denyAll'||(policy==='denySound'&&!this.muted)){this.paused=true;return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));}
      this.paused=false;const fn=this.onplaying;if(fn)queueMicrotask(()=>fn());return Promise.resolve();
    }
    appendChild(el){el.parentNode=this;return el;}
    removeChild(el){el.parentNode=null;}
    replaceChild(next,old){next.parentNode=this;old.parentNode=null;if(next.id)nodes[next.id]=next;}
    focus(){}
    select(){copied=this.value;}
  }
  for(const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const el = new Element(m[1]);el.id=m[2];el.hidden=/\shidden\b/.test(m[0]);nodes[m[2]]=el;
  }
  nodes.video.parentNode=nodes.screen;
  const document={getElementById:(id)=>nodes[id],createElement:(tag)=>{const e=new Element(tag);if(tag==='video')players.push(e);return e;},body:new Element('body'),title:'',execCommand:()=>true};
  const location=new URL(options.url||'https://owner.example/zcity-loading/?map=gm_construct');
  const math=Object.create(Math);math.random=()=>.43;
  const sandbox={window:{matchMedia:()=>({matches:!!options.reducedMotion,addEventListener(){}})},document,location,URL,URLSearchParams,Math:math,navigator:options.navigator||{},localStorage:{getItem(k){if(options.storageBlocked)throw Error('blocked');return data[k]??null;},setItem(k,v){if(options.storageBlocked)throw Error('blocked');data[k]=v;}},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},console};
  vm.createContext(sandbox);vm.runInContext(config,sandbox);vm.runInContext(playlist,sandbox);
  if(options.config)Object.assign(sandbox.window.MORPH_CONFIG, options.config);
  if(Object.hasOwn(options,'playlist'))sandbox.window.MORPH_PLAYLIST=options.playlist;
  vm.runInContext(app,sandbox);
  vm.runInContext(themes,sandbox);
  function run(ms){const found=[...timers.entries()].find(([,t])=>t.ms===ms);if(!found)return false;timers.delete(found[0]);found[1].fn();return true;}
  return {nodes,players,body:document.body,window:sandbox.window,data,timers,run,get copied(){return copied;},setPolicy(p){policy=p;}};
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
test('Brand, IP, query map and no fabricated progress',async()=>{
 const h=harness();await flush();assert.equal(h.nodes.brand.textContent,'MORPH');assert.equal(h.nodes.address.textContent,'46.174.49.58:27015');assert.equal(h.nodes.map.textContent,'gm_construct');assert.equal(h.nodes.percent.textContent,'—');assert.equal(h.nodes.bar.style.width,'');assert(h.nodes.progress.classList.contains('is-indeterminate'));assert.equal(h.nodes.discord.href,'https://discord.gg/4hvWMkArX8');assert(!h.nodes.discord.hidden);assert(h.nodes.video.src.startsWith('videos/'));assert(h.nodes.screen.classList.contains('playing'));
});
test('GMod callbacks: order, progress, zero and invalid counts',()=>{
 const h=harness();h.window.SetFilesNeeded(80);h.window.SetFilesTotal(100);assert.equal(h.nodes.percent.textContent,'20%');h.window.SetFilesNeeded(0);assert.equal(h.nodes.percent.textContent,'100%');assert.equal(h.nodes.fileCount.textContent,'100 / 100');h.window.SetFilesTotal(0);assert.equal(h.nodes.percent.textContent,'—');assert(!h.nodes.progress.classList.contains('is-indeterminate'));h.window.SetFilesTotal(20);h.window.SetFilesNeeded(30);assert.equal(h.nodes.percent.textContent,'—');for(const n of [NaN,Infinity,null,'',-1,{}]){h.window.SetFilesTotal(n);assert.equal(h.nodes.percent.textContent,'—');}
});
test('Server fields use literal text, real capacity and keep newer status',()=>{
 const h=harness();h.window.SetStatusChanged('Starting Lua...');h.window.GameDetails('<img src=x onerror=alert(1)>','', 'gm_boreas',32,'123','zcity',.1);assert.equal(h.nodes.server.textContent,'<img src=x onerror=alert(1)>');assert.equal(h.nodes.status.textContent,'Starting Lua...');assert.equal(h.nodes.map.textContent,'gm_boreas');assert.equal(h.nodes.slots.textContent,'32');assert(!h.nodes.slotsRow.hidden);assert.equal(h.nodes.video.volume,.1);
});
test('Saved volume/mute survives reload and game settings',()=>{
 const saved=JSON.stringify({volume:.42,muted:true});const h=harness({storage:{'morph-loading-audio-v1':saved}});h.window.GameDetails('','','',10,'','zcity',1);assert.equal(h.nodes.video.volume,.42);assert(h.nodes.video.muted);assert.equal(h.nodes.volumeValue.textContent,'0%');h.nodes.mute.onclick();assert.equal(JSON.parse(h.data['morph-loading-audio-v1']).muted,false);
});
test('Volume control persists and does not skip already playing video after timeout',async()=>{
 const h=harness();await flush();const video=h.nodes.video;h.nodes.volume.value='67';h.nodes.volume.oninput.call(h.nodes.volume);await flush();assert.equal(video.volume,.67);assert.equal(JSON.parse(h.data['morph-loading-audio-v1']).volume,.67);assert.equal([...h.timers.values()].filter(t=>t.ms===30000).length,0);h.window.GameDetails('','','',10,'','zcity',.1);assert.equal(video.volume,.67);
});
test('Missing or broken local storage never prevents page startup',async()=>{
 for(const opts of [{storageBlocked:true},{storage:{'morph-loading-audio-v1':'broken'}},{storage:{'morph-loading-audio-v1':'null'}},{storage:{'madness-volume':'.31'}}]){const h=harness(opts);await flush();assert(h.nodes.video.src);assert(h.nodes.screen.classList.contains('playing'));}
});
test('Sound autoplay denial retries muted and provides an explicit enable button',async()=>{
 const h=harness({policy:'denySound'});await flush();assert(h.nodes.video.muted);assert(h.nodes.screen.classList.contains('playing'));assert(!h.nodes.enable.hidden);assert.equal(h.nodes.enable.textContent,'Включить звук');assert.equal(h.players.length,1);h.setPolicy('allow');h.nodes.enable.onclick();await flush();assert(!h.nodes.video.muted);assert(h.nodes.enable.hidden);
});
test('Complete autoplay denial waits for a gesture instead of exhausting videos',async()=>{
 const h=harness({policy:'denyAll'});await flush();assert.equal(h.nodes.enable.textContent,'Запустить видео');assert(!h.nodes.enable.hidden);assert.equal(h.timers.size,0);h.window.GameDetails('','','',10,'','zcity',0);assert(!h.nodes.enable.hidden);h.setPolicy('allow');h.nodes.enable.onclick();await flush();assert(h.nodes.video.muted);assert(h.nodes.screen.classList.contains('playing'));assert.equal(h.players.length,1);
});
test('Repeated and stale video errors cannot advance the new video',async()=>{
 const h=harness();await flush();const old=h.nodes.video;const error=old.onerror;error();error();assert(h.run(0));await flush();assert.equal(h.players.length,2);const current=h.nodes.video;error();assert(!h.run(0));assert.equal(h.nodes.video,current);
});
test('Broken files exhaust once, retain loading callbacks, and stop retrying',async()=>{
 const h=harness();await flush();for(let i=0;i<10;i++){assert(h.nodes.video.onerror);h.nodes.video.onerror();assert(h.run(0));await flush();}assert.match(h.nodes.mediaStatus.textContent,/Видео недоступны/);assert.equal(h.players.length,10);assert.equal(h.timers.size,0);h.window.SetFilesTotal(10);h.window.SetFilesNeeded(4);assert.equal(h.nodes.percent.textContent,'60%');
});
test('Playlist cycles without repeats within a cycle or across its boundary',async()=>{
 const h=harness();await flush();const seen=[];for(let i=0;i<10;i++){seen.push(h.nodes.video.src);h.nodes.video.onended();await flush();}assert.equal(new Set(seen).size,10);assert.notEqual(h.nodes.video.src,seen[9]);
});
test('Invalid playlists and external/traversal sources are rejected',async()=>{
 for(const list of [null,'bad',{},[null,{}, {sources:'bad'}], [{sources:['https://evil.example/a.webm','videos/../secret.webm','videos/%2e%2e/secret.webm','videos/evil.mp4']}]] ){
  const h=harness({playlist:list});await flush();assert.equal(h.players.length,0);assert.match(h.nodes.mediaStatus.textContent,/Видео пока не добавлены/);
 }
 const h=harness({playlist:[{title:'Local',sources:['videos/a.webm','videos/b.webm']}]});await flush();h.nodes.video.onerror();h.run(0);await flush();assert.equal(h.nodes.video.src,'videos/b.webm');
});
test('Local file preview and valid optional Discord configuration',async()=>{
 const h=harness({url:'file:///tmp/site/index.html',config:{discordUrl:'https://discord.gg/example'}});await flush();assert(h.nodes.video.src);assert(!h.nodes.discord.hidden);assert.equal(h.nodes.discord.href,'https://discord.gg/example');
 for(const url of ['javascript:alert(1)','http://discord.gg/example','https://evil.example/'])assert(harness({config:{discordUrl:url}}).nodes.discord.hidden);
});
test('IP copy works with denied clipboard API through fallback',async()=>{
 const h=harness({navigator:{clipboard:{writeText(){return Promise.reject(Error('blocked'));}}}});h.nodes.copyIp.onclick();await flush();assert.equal(h.copied,'46.174.49.58:27015');assert.equal(h.nodes.copyStatus.textContent,'IP скопирован');
});
test('All themes persist without restarting video or resetting download progress',async()=>{
 const h=harness();await flush();const player=h.nodes.video;h.window.SetFilesTotal(10);h.window.SetFilesNeeded(4);
 for(const [button,key] of [['themeForest','forest'],['themeVoid','void'],['themeBoykisser','boykisser'],['themeAbyss','abyss']]){
  h.nodes[button].onclick();assert.equal(h.body.getAttribute('data-theme'),key);assert.equal(h.data['morph-loading-theme-v1'],key);assert.equal(h.nodes[button].getAttribute('aria-pressed'),'true');assert.equal(h.nodes.video,player);assert.equal(h.nodes.percent.textContent,'60%');
 }
 assert.equal(harness({storage:{'morph-loading-theme-v1':'forest'}}).body.getAttribute('data-theme'),'forest');
});
test('Invalid stored themes and denied storage fall back safely',()=>{
 for(const value of ['../../bad','<img>','inferno'])assert.equal(harness({storage:{'morph-loading-theme-v1':value}}).body.getAttribute('data-theme'),'abyss');
 const h=harness({storageBlocked:true});h.nodes.themeVoid.onclick();assert.equal(h.body.getAttribute('data-theme'),'void');
 assert(harness({config:{discordUrl:''}}).nodes.discord.hidden);
});
test('Decorative motion can be paused and respects reduced-motion',()=>{
 const h=harness();h.nodes.motion.onclick();assert.equal(h.body.getAttribute('data-motion'),'paused');assert.equal(h.data['morph-loading-motion-v1'],'paused');h.nodes.motion.onclick();assert.equal(h.body.getAttribute('data-motion'),'running');
 const r=harness({reducedMotion:true,storage:{'morph-loading-motion-v1':'running'}});assert.equal(r.body.getAttribute('data-motion'),'paused');assert(r.nodes.motion.disabled);
});
(async()=>{let passed=0;for(const t of tests){try{await t.fn();console.log('PASS',t.name);passed++;}catch(e){console.error('FAIL',t.name,e);process.exitCode=1;}}console.log(JSON.stringify({passed,total:tests.length,environment:'Node VM with DOM/media mocks; not a browser or GMod'}));})();
