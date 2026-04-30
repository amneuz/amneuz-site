(function(){'use strict';

var tracks=[];
var albums=[];
var cartStorageKey='amneuz_cart_v2';
var oldCartStorageKey='amneuz_cart';
var cart=readStoredCart();

var ambientOn=false;
var ambientPausedForPreview=false;
var ambientWasOnBeforePreview=false;
var previewSwitching=false;
var previewPausedForVisibility=false;
var ambientTargetVolume=.28;
var chromeTimer=null;
var ambientFade=null;
var previewFade=null;
var currentWaveSurfer=null;
var currentPreviewTrackId=null;
var openAlbumIds=[];

var displayPrices={'001':89,'002':109};

function id(x){return document.getElementById(x)}
function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
function price(t){return Number(t.priceMxn||displayPrices[t.id]||0)}
function money(n){return '$'+Number(n||0).toFixed(0)+' MXN'}
function activeCat(){var a=document.querySelector('.tab.active');return a?a.getAttribute('data-cat'):'remixes'}
function getTrackParam(){return new URLSearchParams(window.location.search).get('track')}
function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}

function cartKey(type,idValue){
  return String(type||'track')+':'+String(idValue||'');
}

function getCartType(item){
  return String(item||'').split(':')[0]||'track';
}

function getCartId(item){
  return String(item||'').split(':').slice(1).join(':');
}

function isTrackInCart(trackId){
  return cart.indexOf(cartKey('track',trackId))>-1;
}

function isAlbumInCart(albumId){
  return cart.indexOf(cartKey('album',albumId))>-1;
}

function getTrackSlugCandidates(track){
  var title=track&&track.title?track.title:'';
  var parts=title.split(/\s[-–—]\s/);
  var candidates=[slugify(title)];

  if(track&&track.slug)candidates.push(slugify(track.slug));
  if(parts.length>1)candidates.push(slugify(parts.slice(1).join(' - ')));

  return candidates.filter(function(x,i,a){return x&&a.indexOf(x)===i})
}

function findTrackByParam(value){
  var raw=String(value||'');
  var slug=slugify(raw);

  return tracks.find(function(t){
    return String(t.id)===raw||
      String(t.catalogCode||'').toLowerCase()===raw.toLowerCase()||
      getTrackSlugCandidates(t).indexOf(slug)>-1
  })
}

function clearDeepLinkHighlight(){
  all('.track-deeplink').forEach(function(row){
    row.classList.remove('track-deeplink');
  })
}

function readStoredCart(){
  try{
    var stored=localStorage.getItem(cartStorageKey);
    var parsed=stored?JSON.parse(stored):null;

    if(Array.isArray(parsed)){
      return parsed.filter(function(x){
        return typeof x==='string'&&x.indexOf(':')>-1;
      }).map(String);
    }

    var oldStored=localStorage.getItem(oldCartStorageKey);
    var oldParsed=oldStored?JSON.parse(oldStored):[];

    if(Array.isArray(oldParsed)){
      return oldParsed
        .filter(function(x){return typeof x==='string'||typeof x==='number'})
        .map(function(x){return cartKey('track',String(x))});
    }

    return [];
  }catch(e){
    return [];
  }
}

function saveStoredCart(){
  try{
    localStorage.setItem(cartStorageKey,JSON.stringify(cart));
  }catch(e){}
}

function normalizeCart(){
  var validTrackIds=tracks.map(function(t){return String(t.id)});
  var validAlbumIds=albums.map(function(a){return String(a.id)});
  var seen=[];

  cart=cart.filter(function(x){
    var type=getCartType(x);
    var itemId=getCartId(x);
    var ok=false;

    if(type==='album'){
      ok=validAlbumIds.indexOf(itemId)>-1;
    }else{
      ok=validTrackIds.indexOf(itemId)>-1;
    }

    if(!ok||seen.indexOf(x)>-1)return false;

    seen.push(x);
    return true;
  });
}

function normalizeTrack(t){
  return {
    id:String(t.id||t.legacy_id||t.catalogCode||''),
    uuid:t.uuid||t.id||null,
    albumId:t.albumId||t.album_id||null,
    trackNumber:t.trackNumber||t.track_number||null,
    catalogCode:t.catalogCode||t.catalog_code||null,
    slug:t.slug||null,
    category:t.category||'remixes',
    title:t.title||'Untitled Track',
    rawTitle:t.rawTitle||t.raw_title||'',
    artist:t.artist||'AMNEUZ',
    collaborators:t.collaborators||'',
    genre:t.genre||t.subgenre||'',
    key:t.key||t.track_key||'',
    bpm:t.bpm||null,
    duration:t.duration||t.duration_label||'',
    release:t.release||t.release_year||'',
    cover:t.cover||t.cover_url||'',
    preview:t.preview||t.preview_url||'',
    storagePath:t.storagePath||t.master_path||'',
    buyUrl:t.buyUrl||'',
    spotify:t.spotify||t.spotify_url||'',
    beatport:t.beatport||t.beatport_url||'',
    soundcloud:t.soundcloud||t.soundcloud_url||'',
    youtube:t.youtube||t.YouTube||t.youtube_url||'',
    appleMusic:t.appleMusic||t.apple_music_url||'',
    tidal:t.tidal||t.tidal_url||'',
    stripePriceId:t.stripePriceId||t.stripe_price_id||'',
    priceMxn:t.priceMxn||t.price_mxn||0,
    isFeatured:!!(t.isFeatured||t.is_featured),
    isLatestRelease:!!(t.isLatestRelease||t.is_latest_release),
    descriptionShort:t.descriptionShort||t.description_short||'',
    descriptionLong:t.descriptionLong||t.description_long||''
  }
}

function normalizeAlbum(a){
  var albumTracks=Array.isArray(a.tracks)?a.tracks.map(normalizeTrack):[];

  return {
    id:String(a.id||''),
    slug:a.slug||'',
    releaseType:a.releaseType||a.release_type||'album',
    title:a.title||'Untitled Album',
    rawTitle:a.rawTitle||a.raw_title||'',
    artist:a.artist||'AMNEUZ',
    collaborators:a.collaborators||'',
    release:a.release||a.release_year||'',
    releaseDate:a.releaseDate||a.release_date||'',
    cover:a.cover||a.cover_url||'',
    spotify:a.spotify||a.spotify_url||'',
    soundcloud:a.soundcloud||a.soundcloud_url||'',
    appleMusic:a.appleMusic||a.apple_music_url||'',
    tidal:a.tidal||a.tidal_url||'',
    youtube:a.youtube||a.youtube_url||'',
    beatport:a.beatport||a.beatport_url||'',
    stripePriceId:a.stripePriceId||a.stripe_price_id||'',
    priceMxn:a.priceMxn||a.price_mxn||0,
    isFeatured:!!(a.isFeatured||a.is_featured),
    isLatestRelease:!!(a.isLatestRelease||a.is_latest_release),
    descriptionShort:a.descriptionShort||a.description_short||'',
    descriptionLong:a.descriptionLong||a.description_long||'',
    tracks:albumTracks
  }
}

function setTracksFromData(data){
  if(Array.isArray(data)){
    tracks=data.map(normalizeTrack).filter(function(t){return t.id&&t.stripePriceId});
    albums=[];
  }else{
    tracks=(Array.isArray(data&&data.tracks)?data.tracks:[])
      .map(normalizeTrack)
      .filter(function(t){return t.id&&t.stripePriceId});

    albums=(Array.isArray(data&&data.albums)?data.albums:[])
      .map(normalizeAlbum)
      .filter(function(a){return a.id&&a.stripePriceId});
  }

  normalizeCart();
  saveStoredCart();
  renderCatalog(activeCat());
  renderCart();
  openTrackDeepLink();
}

function loadTracks(){
  return fetch('/api/tracks')
    .then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.json()
    })
    .then(function(data){
      setTracksFromData(data)
    })
    .catch(function(apiErr){
      return fetch('data/tracks.json')
        .then(function(r){
          if(!r.ok)throw new Error('HTTP '+r.status);
          return r.json()
        })
        .then(function(data){
          setTracksFromData(data)
        })
        .catch(function(err){})
    })
}

function fadeAudioTo(audio,target,duration,done){
  if(!audio)return;

  clearInterval(ambientFade);

  var start=Number.isFinite(audio.volume)?audio.volume:0;
  var started=Date.now();

  ambientFade=setInterval(function(){
    var progress=Math.min(1,(Date.now()-started)/duration);

    audio.volume=start+(target-start)*progress;

    if(progress>=1){
      clearInterval(ambientFade);
      audio.volume=target;
      if(done)done();
    }
  },30)
}

function playAmbientAudio(){
  var a=id('ambientAudio');

  if(!a||document.hidden)return;

  clearInterval(ambientFade);

  a.volume=0;

  var playResult=a.play();

  if(playResult&&playResult.catch)playResult.catch(function(){});

  fadeAudioTo(a,ambientTargetVolume,420)
}

function pauseAmbientAudio(immediate){
  var a=id('ambientAudio');

  if(!a)return;

  clearInterval(ambientFade);

  if(immediate){
    a.pause();
    a.volume=0;
    return;
  }

  fadeAudioTo(a,0,380,function(){a.pause()})
}

function previewIsPlaying(){
  return !!(currentWaveSurfer&&currentWaveSurfer.isPlaying())
}

function setAmbient(on){
  ambientOn=on;

  if(id('ambientText'))id('ambientText').textContent=on?'Ambient mode on':'Ambient mode off';
  if(id('ambientToggle'))id('ambientToggle').classList.toggle('off',!on);

  if(on&&!previewIsPlaying()&&!document.hidden){
    playAmbientAudio();
  }else{
    pauseAmbientAudio(false);
  }
}

function enter(withSound){
  document.body.classList.add('site-entered');

  if(id('intro'))id('intro').classList.add('hide');
  if(id('site'))id('site').classList.add('show');
  if(id('ambientToggle'))id('ambientToggle').classList.add('show');
  if(id('cartTrigger'))id('cartTrigger').classList.add('show');

  setAmbient(withSound)
}

function skipIntro(){
  var p=new URLSearchParams(window.location.search);

  if(p.get('skipIntro')!=='true'&&!getTrackParam())return;

  document.body.classList.add('site-entered');

  if(id('intro'))id('intro').classList.add('hide');
  if(id('site'))id('site').classList.add('show');
  if(id('ambientToggle'))id('ambientToggle').classList.add('show');
  if(id('cartTrigger'))id('cartTrigger').classList.add('show');

  setAmbient(false);

  if(window.location.hash&&!getTrackParam()){
    window.requestAnimationFrame(function(){
      var target=document.querySelector(window.location.hash);
      if(target)target.scrollIntoView();
    })
  }
}

function openTrackDeepLink(){
  var trackParam=getTrackParam();

  if(!trackParam)return;

  var target=findTrackByParam(trackParam);

  if(!target)return;

  enter(false);

  all('.tab').forEach(function(tab){
    tab.classList.toggle('active',tab.getAttribute('data-cat')===target.category)
  });

  renderCatalog(target.category);

  window.requestAnimationFrame(function(){
    var row=document.querySelector('.track[data-track-id="'+target.id+'"]');

    if(!row)return;

    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.classList.add('track-deeplink');
  })
}

function updateTrackStates(){
  all('.track,.album-track').forEach(function(r){
    var active=r.getAttribute('data-track-id')===currentPreviewTrackId;
    var playing=active&&currentWaveSurfer&&currentWaveSurfer.isPlaying();
    var b=r.querySelector('.track-play');

    r.classList.toggle('active',active);
    r.classList.toggle('playing',!!playing);

    if(b){
      b.classList.toggle('is-playing',!!playing);
      b.setAttribute('aria-label',playing?'Pause preview':'Play preview');
    }
  })
}

function pauseAmbientForPreview(){
  if(!ambientPausedForPreview){
    ambientWasOnBeforePreview=ambientOn;
    ambientPausedForPreview=true;
  }

  pauseAmbientAudio(false)
}

function resumeAmbientAfterPreview(){
  if(previewSwitching||document.hidden)return;

  if(ambientPausedForPreview&&ambientWasOnBeforePreview&&ambientOn)playAmbientAudio();

  ambientPausedForPreview=false;
  ambientWasOnBeforePreview=false;
}

function playCurrent(){
  if(!currentWaveSurfer)return;

  pauseAmbientForPreview();

  currentWaveSurfer.setVolume(0);

  var playResult=currentWaveSurfer.play();

  clearInterval(previewFade);

  previewFade=setInterval(function(){
    if(!currentWaveSurfer){
      clearInterval(previewFade);
      return;
    }

    if(!currentWaveSurfer.isPlaying())return;

    currentWaveSurfer.setVolume(Math.min(.85,currentWaveSurfer.getVolume()+.05));

    if(currentWaveSurfer.getVolume()>=.85)clearInterval(previewFade);
  },60);

  if(playResult&&playResult.catch){
    playResult.catch(function(){
      clearInterval(previewFade);
      resumeAmbientAfterPreview();
    })
  }
}

function closePreview(){
  clearInterval(previewFade);

  previewSwitching=true;

  if(currentWaveSurfer){
    currentWaveSurfer.pause();
    currentWaveSurfer.destroy();
    currentWaveSurfer=null;
  }

  previewSwitching=false;
  currentPreviewTrackId=null;

  all('.track-waveform').forEach(function(w){w.innerHTML=''});

  resumeAmbientAfterPreview();
  updateTrackStates();
}

function togglePreview(t){
  previewPausedForVisibility=false;

  if(currentPreviewTrackId===t.id&&currentWaveSurfer){
    if(currentWaveSurfer.isPlaying()){
      closePreview();
    }else{
      playCurrent();
    }

    updateTrackStates();
    return;
  }

  openPreview(t);
}

function openPreview(t){
  var row=document.querySelector('.track[data-track-id="'+t.id+'"],.album-track[data-track-id="'+t.id+'"]');
  var w=row?row.querySelector('.track-waveform'):null;
  var src=t.preview||('assets/audio/'+t.id+'-preview.wav');
  var isMobile=window.matchMedia&&window.matchMedia('(max-width:560px)').matches;
  var waveHeight=isMobile?44:64;

  all('.track,.album-track').forEach(function(x){x.classList.remove('active','playing','loading')});
  all('.track-waveform').forEach(function(x){x.innerHTML=''});

  if(row)row.classList.add('active','loading');

  if(!w||!window.WaveSurfer){
    if(row)row.classList.remove('loading');
    return;
  }

  clearInterval(previewFade);

  previewSwitching=true;

  if(currentWaveSurfer){
    currentWaveSurfer.pause();
    currentWaveSurfer.destroy();
    currentWaveSurfer=null;
  }

  previewSwitching=false;
  currentPreviewTrackId=t.id;

  currentWaveSurfer=WaveSurfer.create({
    container:w,
    waveColor:'rgba(255,255,255,.2)',
    progressColor:'#55ff8c',
    cursorColor:'transparent',
    cursorWidth:0,
    height:waveHeight,
    normalize:true,
    dragToSeek:true,
    hideScrollbar:true,
    barWidth:1,
    barGap:isMobile?3:4,
    barRadius:999
  });

  currentWaveSurfer.once('ready',function(){
    if(!currentWaveSurfer)return;

    if(row)row.classList.remove('loading');

    currentWaveSurfer.setVolume(.85);
    playCurrent();
    updateTrackStates();
  });

  currentWaveSurfer.on('play',function(){
    pauseAmbientForPreview();
    updateTrackStates();
  });

  currentWaveSurfer.on('pause',function(){
    if(previewSwitching)return;
    closePreview();
  });

  currentWaveSurfer.on('finish',function(){
    closePreview();
  });

  currentWaveSurfer.on('error',function(){
    clearInterval(previewFade);

    if(row)row.classList.remove('loading');

    closePreview();
  });

  currentWaveSurfer.load(src);
}

function getCartItemData(cartItem){
  var type=getCartType(cartItem);
  var itemId=getCartId(cartItem);

  if(type==='album'){
    var album=albums.find(function(x){return String(x.id)===String(itemId)});

    if(!album)return null;

    return {
      type:'album',
      id:album.id,
      title:album.title,
      meta:(album.releaseType||'album').toUpperCase()+' · '+money(price(album)),
      cover:album.cover||(album.tracks[0]&&album.tracks[0].cover)||'',
      price:price(album),
      stripePriceId:album.stripePriceId
    };
  }

  var track=tracks.find(function(x){return String(x.id)===String(itemId)});

  if(!track)return null;

  return {
    type:'track',
    id:track.id,
    title:track.title,
    meta:(track.genre||'Track')+' · '+money(price(track)),
    cover:track.cover||('assets/images/'+track.id+'-cover.jpg'),
    price:price(track),
    stripePriceId:track.stripePriceId
  };
}

function renderCart(){
  var total=cart.reduce(function(sum,c){
    var item=getCartItemData(c);
    return sum+(item?item.price:0);
  },0);

  var box=id('cartItems');

  if(id('cartTotal'))id('cartTotal').textContent=money(total);
  if(id('cartSubtotal'))id('cartSubtotal').textContent=money(total);

  if(id('cartCount')){
    id('cartCount').textContent=cart.length;
    id('cartCount').classList.toggle('has-items',cart.length>0);
  }

  if(!box)return;

  if(!cart.length){
    box.innerHTML='<p class="cart-empty">No tracks selected yet.</p>';
    return;
  }

  if(id('cart'))id('cart').classList.add('show');

  document.body.classList.add('cart-open');

  box.innerHTML='';

  cart.forEach(function(c){
    var itemData=getCartItemData(c);

    if(!itemData)return;

    var item=document.createElement('div');

    item.className='cart-item';
    item.innerHTML='<img class="cart-item-cover" alt=""><div><p class="cart-item-title"></p><p class="cart-item-meta"></p></div><button class="cart-remove" type="button">Remove</button>';

    item.querySelector('.cart-item-cover').src=itemData.cover||'';
    item.querySelector('.cart-item-cover').alt=itemData.title;
    item.querySelector('.cart-item-title').textContent=itemData.title;
    item.querySelector('.cart-item-meta').textContent=itemData.meta;

    item.querySelector('button').onclick=function(){
      cart=cart.filter(function(x){return x!==c});
      saveStoredCart();
      renderCart();
      renderCatalog(activeCat());
    };

    box.appendChild(item);
  })
}

function meta(text){
  var s=document.createElement('span');

  s.className='tmeta';
  s.textContent=text;

  return s;
}

function platformLink(name,url){
  var cleanUrl=String(url||'').trim();

  if(!cleanUrl)return null;
  if(cleanUrl.toLowerCase()==='null')return null;
  if(cleanUrl.toLowerCase()==='undefined')return null;
  if(cleanUrl==='-')return null;
  if(cleanUrl==='#')return null;

  var el=document.createElement('a');

  el.href=cleanUrl;
  el.target='_blank';
  el.rel='noopener noreferrer';
  el.textContent=name;
  el.onclick=function(e){e.stopPropagation()};
  el.className='track-platform';

  return el;
}

function appendPlatform(links,name,url){
  var el=platformLink(name,url);

  if(el)links.appendChild(el);
}

function row(t){
  var r=document.createElement('article');
  var media=document.createElement('div');
  var cover=document.createElement('img');
  var play=document.createElement('button');
  var body=document.createElement('div');
  var top=document.createElement('div');
  var titleWrap=document.createElement('div');
  var titleRow=document.createElement('div');
  var label=document.createElement('p');
  var title=document.createElement('h3');
  var metaLine=document.createElement('p');
  var wave=document.createElement('div');
  var waveform=document.createElement('div');
  var listen=document.createElement('p');
  var links=document.createElement('div');
  var buy=document.createElement('div');
  var priceEl=document.createElement('p');
  var quality=document.createElement('p');
  var add=document.createElement('button');
  var added=isTrackInCart(t.id);

  r.className='track';
  r.setAttribute('data-track-id',t.id);

  media.className='track-media';

  cover.className='track-cover';
  cover.src=t.cover||('assets/images/'+t.id+'-cover.jpg');
  cover.alt=t.title;

  play.className='track-play';
  play.type='button';
  play.setAttribute('aria-label','Play preview');

  body.className='track-body';
  top.className='track-top';
  titleWrap.className='track-title-wrap';
  titleRow.className='track-title-row';

  label.className='track-label';
  label.textContent='Protected preview';

  title.className='ttitle';
  title.textContent=t.title;

  metaLine.className='track-meta';

  [
    t.genre,
    t.key||'Key TBA',
    t.bpm?String(t.bpm)+' BPM':'',
    t.duration||'',
    t.release||'Release TBA'
  ].filter(Boolean).forEach(function(x){
    metaLine.appendChild(meta(x));
  });

  wave.className='track-wave';
  waveform.className='track-waveform';

  wave.onclick=function(e){
    e.stopPropagation();

    if(currentPreviewTrackId===t.id&&currentWaveSurfer&&!currentWaveSurfer.isPlaying()){
      playCurrent();
    }
  };

  listen.className='track-listen';
  listen.textContent='Choose your platform';

  links.className='track-platforms';

  appendPlatform(links,'SoundCloud',t.soundcloud);
  appendPlatform(links,'Spotify',t.spotify);
  appendPlatform(links,'Apple Music',t.appleMusic);
  appendPlatform(links,'Tidal',t.tidal);
  appendPlatform(links,'YouTube',t.youtube);
  appendPlatform(links,'Beatport',t.beatport);

  buy.className='track-buy';

  priceEl.className='track-price';
  priceEl.textContent=money(price(t));

  quality.className='track-quality';
  quality.textContent='High-quality WAV';

  add.className='tbtn addBtn';
  add.type='button';
  add.textContent=added?'Added':'Add to Cart';
  add.classList.toggle('added',added);

  titleRow.appendChild(title);
  titleWrap.appendChild(label);
  titleWrap.appendChild(titleRow);
  titleWrap.appendChild(metaLine);
  top.appendChild(titleWrap);
  wave.appendChild(waveform);
  body.appendChild(top);
  body.appendChild(wave);
  body.appendChild(listen);
  body.appendChild(links);
  buy.appendChild(priceEl);
  buy.appendChild(quality);
  buy.appendChild(add);
  media.appendChild(cover);
  media.appendChild(play);
  r.appendChild(media);
  r.appendChild(body);
  r.appendChild(buy);

  r.onclick=function(){
    clearDeepLinkHighlight();
    togglePreview(t);
  };

  play.onclick=function(e){
    e.stopPropagation();
    clearDeepLinkHighlight();
    togglePreview(t);
  };

  add.onclick=function(e){
    e.stopPropagation();
    clearDeepLinkHighlight();

    var key=cartKey('track',t.id);

    if(cart.indexOf(key)===-1){
      cart.push(key);
      saveStoredCart();
    }

    renderCart();
    add.textContent='Added';
    add.classList.add('added');
  };

  return r;
}

function albumTrackRow(t){
  var item=document.createElement('div');
  var main=document.createElement('div');
  var info=document.createElement('div');
  var title=document.createElement('p');
  var metaLine=document.createElement('p');
  var priceEl=document.createElement('p');
  var add=document.createElement('button');
  var expanded=document.createElement('div');
  var wave=document.createElement('div');
  var waveform=document.createElement('div');
  var listen=document.createElement('p');
  var links=document.createElement('div');
  var releaseYear=String(t.release||'').match(/\d{4}/);
  var added=isTrackInCart(t.id);

  item.className='album-track';
  item.setAttribute('data-track-id',t.id);

  main.className='album-track-main';

  title.className='album-track-title';
  title.textContent=(t.trackNumber?String(t.trackNumber).padStart(2,'0')+'. ':'')+t.title;

  metaLine.className='album-track-meta';
  metaLine.textContent=[
    t.genre,
    t.bpm?String(t.bpm)+' BPM':'',
    t.duration,
    releaseYear?releaseYear[0]:''
  ].filter(Boolean).join(' · ');

  priceEl.className='album-track-price';
  priceEl.textContent=money(price(t));

  add.className='tbtn albumTrackAdd';
  add.type='button';
  add.textContent=added?'Added':'Add to Cart';
  add.classList.toggle('added',added);

  expanded.className='album-track-expanded';

  wave.className='track-wave';
  waveform.className='track-waveform';

  listen.className='track-listen';
  listen.textContent='Choose your platform';

  links.className='track-platforms';

  appendPlatform(links,'SoundCloud',t.soundcloud);
  appendPlatform(links,'Spotify',t.spotify);
  appendPlatform(links,'Apple Music',t.appleMusic);
  appendPlatform(links,'Tidal',t.tidal);
  appendPlatform(links,'YouTube',t.youtube);
  appendPlatform(links,'Beatport',t.beatport);

  info.appendChild(title);
  info.appendChild(metaLine);
  main.appendChild(info);
  main.appendChild(priceEl);
  main.appendChild(add);
  wave.appendChild(waveform);
  expanded.appendChild(wave);
  expanded.appendChild(listen);
  expanded.appendChild(links);
  item.appendChild(main);
  item.appendChild(expanded);

  item.onclick=function(e){
    var isButton=e.target.closest('button');

    if(isButton)return;

    var isExpanded=item.classList.contains('active')&&currentPreviewTrackId===t.id;

    clearDeepLinkHighlight();

    all('.album-track').forEach(function(trackRow){
      if(trackRow!==item)trackRow.classList.remove('active','playing','loading');
    });

    if(isExpanded){
      closePreview();
      return;
    }

    item.classList.add('active');

    setTimeout(function(){
      openPreview(t);
    },60);
  };

  wave.onclick=function(e){
    e.stopPropagation();

    if(currentPreviewTrackId===t.id&&currentWaveSurfer&&!currentWaveSurfer.isPlaying()){
      playCurrent();
    }
  };

  add.onclick=function(e){
    e.stopPropagation();
    clearDeepLinkHighlight();

    var key=cartKey('track',t.id);

    if(cart.indexOf(key)===-1){
      cart.push(key);
      saveStoredCart();
    }

    renderCart();
    add.textContent='Added';
    add.classList.add('added');
  };

  return item;
}

function albumRow(album){
  var wrap=document.createElement('article');
  var isOpen=openAlbumIds.indexOf(album.id)>-1;
  var added=isAlbumInCart(album.id);
  var tracksCount=album.tracks.length;
  var metaText=[
    (album.releaseType||'album').toUpperCase(),
    album.release||'Release TBA',
    tracksCount?tracksCount+' tracks':'No tracks linked'
  ].filter(Boolean).join(' · ');

  wrap.className='track album-release';
  wrap.setAttribute('data-album-id',album.id);

  wrap.innerHTML=
    '<div class="track-media">'+
      '<img class="track-cover album-cover" alt="">'+
    '</div>'+
    '<div class="track-body">'+
      '<div class="track-top">'+
        '<div class="track-title-wrap">'+
          '<p class="track-label">Complete release</p>'+
          '<div class="track-title-row"><h3 class="ttitle"></h3></div>'+
          '<p class="track-meta album-meta"></p>'+
          '<p class="album-description"></p>'+
        '</div>'+
      '</div>'+
      '<p class="track-listen album-listen">Choose your platform</p>'+
      '<div class="track-platforms album-platforms"></div>'+
      '<div class="album-track-list"></div>'+
    '</div>'+
    '<div class="track-buy album-buy">'+
      '<p class="track-price album-price"></p>'+
      '<p class="track-quality">Complete album WAV</p>'+
      '<button class="tbtn addAlbumBtn" type="button"></button>'+
      '<button class="tbtn albumToggleBtn" type="button"></button>'+
    '</div>';

  wrap.querySelector('.album-cover').src=album.cover||(album.tracks[0]&&album.tracks[0].cover)||'';
  wrap.querySelector('.album-cover').alt=album.title;
  wrap.querySelector('.ttitle').textContent=album.title;
  wrap.querySelector('.album-meta').textContent=metaText;
  wrap.querySelector('.album-description').textContent=album.descriptionShort||'Buy the complete release or open it to choose individual tracks.';
  wrap.querySelector('.album-price').textContent=money(price(album));

  var platformBox=wrap.querySelector('.album-platforms');

  appendPlatform(platformBox,'SoundCloud',album.soundcloud);
  appendPlatform(platformBox,'Spotify',album.spotify);
  appendPlatform(platformBox,'Apple Music',album.appleMusic);
  appendPlatform(platformBox,'Tidal',album.tidal);
  appendPlatform(platformBox,'YouTube',album.youtube);
  appendPlatform(platformBox,'Beatport',album.beatport);

  if(!platformBox.children.length){
    var emptyPlatform=document.createElement('span');

    emptyPlatform.className='track-platform album-platform-empty';
    emptyPlatform.textContent='Platforms coming soon';

    platformBox.appendChild(emptyPlatform);
  }

  var addBtn=wrap.querySelector('.addAlbumBtn');
  var toggleBtn=wrap.querySelector('.albumToggleBtn');
  var list=wrap.querySelector('.album-track-list');

  addBtn.textContent=added?'Album Added':'Add Album';
  addBtn.classList.toggle('added',added);

  toggleBtn.textContent=isOpen?'Hide Tracks':'View Tracks';

  list.style.display=isOpen?'grid':'none';

  if(isOpen){
    album.tracks.map(function(t){return albumTrackRow(t)}).forEach(function(trackRow){
      list.appendChild(trackRow);
    });
  }

  addBtn.onclick=function(e){
    e.stopPropagation();

    var key=cartKey('album',album.id);

    if(cart.indexOf(key)===-1){
      cart.push(key);
      saveStoredCart();
    }

    renderCart();
    renderCatalog(activeCat());
  };

  toggleBtn.onclick=function(e){
    e.stopPropagation();

    if(openAlbumIds.indexOf(album.id)>-1){
      openAlbumIds=openAlbumIds.filter(function(x){return x!==album.id});
    }else{
      openAlbumIds.push(album.id);
    }

    renderCatalog(activeCat());
  };

  wrap.onclick=function(e){
    if(e.target.closest('button')||e.target.closest('a')||e.target.closest('.album-track-list')){
      return;
    }

    if(openAlbumIds.indexOf(album.id)>-1){
      openAlbumIds=openAlbumIds.filter(function(x){return x!==album.id});
    }else{
      openAlbumIds.push(album.id);
    }

    renderCatalog(activeCat());
  };

  return wrap;
}

function renderCatalog(cat){
  var c=id('catalog');

  if(!c)return;

  if(currentWaveSurfer)closePreview();

  c.innerHTML='';

  if(cat==='album'){
    if(!albums.length){
      c.innerHTML='<p class="cart-empty">No albums available yet.</p>';
      updateTrackStates();
      return;
    }

    albums.forEach(function(album){
      c.appendChild(albumRow(album));
    });

    updateTrackStates();
    return;
  }

  tracks
    .filter(function(t){return t.category===cat})
    .forEach(function(t){
      c.appendChild(row(t));
    });

  updateTrackStates();
}

function reveal(){
  document.body.classList.remove('chrome-hidden');

  clearTimeout(chromeTimer);

  if(id('site')&&id('site').classList.contains('show')){
    chromeTimer=setTimeout(function(){
      if(!id('cart')||!id('cart').classList.contains('show')){
        document.body.classList.add('chrome-hidden');
      }
    },2600);
  }
}

function pauseAudioForExit(){
  clearInterval(previewFade);

  previewPausedForVisibility=previewIsPlaying();
  previewSwitching=true;

  if(currentWaveSurfer)currentWaveSurfer.pause();

  previewSwitching=false;

  pauseAmbientAudio(true);
  updateTrackStates();
}

function handleVisibility(){
  if(document.hidden){
    pauseAudioForExit();
    return;
  }

  if(ambientOn&&!previewPausedForVisibility&&!previewIsPlaying()){
    playAmbientAudio();
  }

  previewPausedForVisibility=false;
}

function submitBooking(e){
  e.preventDefault();

  var form=e.currentTarget;
  var fields=['Name','Email','Phone','Promoter Instagram','Event Type','Proposed Fee','City / Venue','Venue Location','Event Date','Event Time','Lineup / Other Artists','Additional Notes'];

  var body=fields.map(function(name){
    var el=form.elements[name];
    var value=el?el.value.trim():'';

    return name+': '+(value||'');
  }).join('\n');

  window.location.href='mailto:booking@amneuz.com?subject='+encodeURIComponent('Booking Request — AMNEUZ')+'&body='+encodeURIComponent(body);
}

function bind(){
  if(id('enterSound'))id('enterSound').onclick=function(){enter(true)};
  if(id('enterSilent'))id('enterSilent').onclick=function(){enter(false)};
  if(id('ambientToggle'))id('ambientToggle').onclick=function(){setAmbient(!ambientOn)};

  if(id('streamButton')){
    id('streamButton').onclick=function(e){
      e.stopPropagation();

      if(id('streamPanel'))id('streamPanel').classList.toggle('open');
    };
  }

  var bookingForm=document.querySelector('.booking-form');

  if(bookingForm)bookingForm.addEventListener('submit',submitBooking);

  document.addEventListener('click',function(e){
    var p=id('streamPanel');
    var b=id('streamButton');

    if(p&&b&&!p.contains(e.target)&&e.target!==b)p.classList.remove('open');
  });

  all('.tab').forEach(function(t){
    t.onclick=function(){
      all('.tab').forEach(function(x){x.classList.toggle('active',x===t)});
      renderCatalog(t.getAttribute('data-cat')||'remixes');
    }
  });

  if(id('cartTrigger')){
    id('cartTrigger').onclick=function(){
      if(id('cart'))id('cart').classList.toggle('show');

      document.body.classList.toggle('cart-open',!!(id('cart')&&id('cart').classList.contains('show')));
    };
  }

  if(id('cartClose')){
    id('cartClose').onclick=function(){
      if(id('cart'))id('cart').classList.remove('show');

      document.body.classList.remove('cart-open');
    };
  }

  if(id('checkoutBtn')){
    id('checkoutBtn').onclick=function(){
      if(!cart.length){
        return;
      }

      var items=cart.map(function(cartItem){
        var itemData=getCartItemData(cartItem);

        if(!itemData||!itemData.stripePriceId)return null;

        return {
          type:itemData.type,
          priceId:itemData.stripePriceId
        };
      }).filter(Boolean);

      if(!items.length){
        return;
      }

      fetch('/api/create-checkout-session',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({items:items})
      })
      .then(function(r){
        if(!r.ok)throw new Error('HTTP '+r.status);
        return r.json();
      })
      .then(function(data){
        if(data&&data.url){
          window.location.href=data.url;
        }
      })
      .catch(function(err){})
    };
  }

  if(id('closePreview'))id('closePreview').onclick=closePreview;

  document.addEventListener('mousemove',reveal);
  document.addEventListener('touchstart',reveal,{passive:true});
  document.addEventListener('visibilitychange',handleVisibility);

  window.addEventListener('pagehide',pauseAudioForExit);
  window.addEventListener('blur',pauseAudioForExit);
  window.addEventListener('beforeunload',pauseAudioForExit);

  if(document.addEventListener)document.addEventListener('freeze',pauseAudioForExit);
}

setAmbient(false);
bind();
skipIntro();
loadTracks();

console.assert(!!id('intro'),'intro exists');
console.assert(!!id('catalog'),'catalog exists');
console.assert(typeof renderCatalog==='function','catalog renderer exists');

})();
