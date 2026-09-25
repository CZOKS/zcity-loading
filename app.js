(function(){
'use strict';
var $=function(id){return document.getElementById(id);},v=$('video'),list=[],order=[],failed={},current=-1,sourceIndex=0,timer=null,localURLs=[],total=null,needed=null,volumeTouched=false;
function say(s){$('mediaStatus').textContent=s;}
function safeSource(s){try{var u=new URL(s,location.href);return u.protocol==='https:'||u.protocol==='http:'||u.protocol==='blob:';}catch(e){return false;}}
function clearTimer(){if(timer){clearTimeout(timer);timer=null;}}
function shuffle(){order=[];for(var i=0;i<list.length;i++){if(!failed[i])order.push(i);}for(var j=order.length-1;j>0;j--){var k=Math.floor(Math.random()*(j+1)),t=order[j];order[j]=order[k];order[k]=t;}if(order.length>1&&order[order.length-1]===current){var a=order[0];order[0]=order[order.length-1];order[order.length-1]=a;}}
function noVideo(message){clearTimer();v.pause();$('screen').classList.remove('playing');$('enable').hidden=true;say(message);}
function tryPlay(){var p=v.play();if(p&&p.catch){p.catch(function(e){if(e.name==='NotAllowedError'){v.muted=true;updateVolume();$('enable').hidden=false;var m=v.play();if(m&&m.catch)m.catch(function(){say('Нажми «Включить звук и видео» для запуска.');});}else if(e.name!=='AbortError'){sourceFailed();}});}}
function loadSource(){clearTimer();var item=list[current];if(!item||sourceIndex>=item.sources.length){failed[current]=true;next();return;}v.src=item.sources[sourceIndex];v.load();timer=setTimeout(sourceFailed,15000);tryPlay();}
function sourceFailed(){clearTimer();sourceIndex++;loadSource();}
function next(){if(!list.length){noVideo('Видео ещё не добавлены в плейлист.');return;}if(!order.length)shuffle();if(!order.length){noVideo('Не удалось открыть видео. Попробуй переподключиться позже.');return;}current=order.pop();sourceIndex=0;$('counter').textContent=(current+1)+' / '+list.length;say(list[current].title||'MADNESS TV');loadSource();}
function setList(items){clearTimer();v.pause();v.removeAttribute('src');v.load();list=[];for(var i=0;i<items.length;i++){var item=items[i],sources=item.sources||[];sources=sources.filter(safeSource);if(sources.length)list.push({title:item.title||'Видео '+(i+1),sources:sources});}order=[];failed={};current=-1;next();}
function updateVolume(){$('volume').value=Math.round(v.volume*100);$('volumeValue').textContent=(v.muted?'0':Math.round(v.volume*100))+'%';$('mute').textContent=v.muted?'Без звука':'Звук';$('mute').setAttribute('aria-label',v.muted?'Включить звук':'Выключить звук');}
v.volume=.35;try{var old=localStorage.getItem('madness-volume');if(old!==null&&isFinite(Number(old)))v.volume=Math.max(0,Math.min(1,Number(old)));}catch(e){}updateVolume();
$('volume').oninput=function(){volumeTouched=true;v.volume=Number(this.value)/100;v.muted=v.volume===0;updateVolume();try{localStorage.setItem('madness-volume',v.volume);}catch(e){}};
$('mute').onclick=function(){volumeTouched=true;v.muted=!v.muted;updateVolume();if(list.length)tryPlay();};
$('enable').onclick=function(){clearTimer();v.muted=false;updateVolume();this.hidden=true;tryPlay();};
v.onended=next;v.onerror=function(){if(v.getAttribute('src'))sourceFailed();};v.onplaying=function(){clearTimer();$('screen').classList.add('playing');say(list[current]?list[current].title:'');};v.onwaiting=function(){clearTimer();timer=setTimeout(sourceFailed,15000);};
function progress(){if(total===null||needed===null||total<=0){$('percent').textContent='—';$('progress').removeAttribute('aria-valuenow');$('bar').style.width='0%';return;}var n=Math.round(Math.max(0,Math.min(1,(total-needed)/total))*100);$('percent').textContent=n+'%';$('bar').style.width=n+'%';$('progress').setAttribute('aria-valuenow',n);}
window.GameDetails=function(name,url,map,max,steam,mode,volume){$('server').textContent=name||'ZCity Madness';$('map').textContent=map||'—';$('status').textContent='Подключение к серверу';if(!volumeTouched&&volume!==undefined&&volume!==null&&isFinite(Number(volume))){v.volume=Math.max(0,Math.min(1,Number(volume)));updateVolume();}};
window.SetFilesTotal=function(n){n=Number(n);total=isFinite(n)?Math.max(0,n):null;progress();};window.SetFilesNeeded=function(n){n=Number(n);needed=isFinite(n)?Math.max(0,n):null;progress();};window.DownloadingFile=function(name){$('file').textContent=String(name);};window.SetStatusChanged=function(s){$('status').textContent=String(s);};
setList(window.MADNESS_PLAYLIST || []);
v.disablePictureInPicture=true;v.setAttribute('controlslist','nodownload noremoteplayback');v.oncontextmenu=function(e){e.preventDefault();};
})();