(function(){'use strict';
      var tracks=[];
      var cartStorageKey='amneuz_cart';
      var cart=readStoredCart(),ambientOn=false,ambientPausedForPreview=false,ambientWasOnBeforePreview=false,previewSwitching=false,previewPausedForVisibility=false,ambientTargetVolume=.28,chromeTimer=null,ambientFade=null,previewFade=null,currentWaveSurfer=null,currentPreviewTrackId=null;
      var displayPrices={'001':89,'002':109};

      function id(x){return document.getElementById(x)}
      function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
      function price(t){return Number(t.priceMxn||displayPrices[t.id]||0)}
      function money(n){return '$'+Number(n||0).toFixed(0)+' MXN'}
      function activeCat(){var a=document.querySelector('.tab.active');return a?a.getAttribute('data-cat'):'remixes'}
      function getTrackParam(){return new URLSearchParams(window.location.search).get('track')}
      function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}

      function getTrackSlugCandidates(track){
        var title=track&&track.title?track.title:'';
        var parts=title.split(/\s[-–—]\s/);
        var candidates=[slugify(title)];

        if(track&&track.slug)candidates.push(slugify(track.slug));
        if(parts.length>1)candidates.push(slugify(parts.slice(1).join(' - ')));

        return candidates.filter(function(x,i,a){return x&&a.indexOf(x)===i})
      }

      function findTrackByParam(value){
        var raw=String(value||''),slug=slugify(raw);
        return tracks.find(function(t){
          return String(t.id)===raw||
            String(t.catalogCode||'').toLowerCase()===raw.toLowerCase()||
            getTrackSlugCandidates(t).indexOf(slug)>-1
        })
      }

      function clearDeepLinkHighlight(){
        all('.track-deeplink').forEach(function(row){row.classList.remove('track-deeplink')})
      }

      function readStoredCart(){
        try{
          var stored=localStorage.getItem(cartStorageKey),parsed=stored?JSON.parse(stored):[];
          return Array.isArray(parsed)?parsed.filter(function(x){return typeof x==='string'||typeof x==='number'}).map(function(x){return String(x)}):[]
        }catch(e){return[]}
      }

      function saveStoredCart(){
        try{localStorage.setItem(cartStorageKey,JSON.stringify(cart))}catch(e){}
      }

      function normalizeCart(){
        var valid=tracks.map(function(t){return String(t.id)}),seen=[];
        cart=cart.filter(function(x){
          var id=String(x);
          if(valid.indexOf(id)===-1||seen.indexOf(id)>-1)return false;
          seen.push(id);
          return true
        })
      }

      function normalizeTrack(t){
        return {
          id:String(t.id||t.legacy_id||t.catalogCode||''),
          uuid:t.uuid||t.id||null,
          catalogCode:t.catalogCode||t.catalog_code||null,
          slug:t.slug||null,
          category:t.category||'remixes',
          title:t.title||'Untitled Track',
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
          isLatestRelease:!!(t.isLatestRelease||t.is_latest_release)
        }
      }

      function setTracksFromData(data){
        tracks=(Array.isArray(data)?data:[])
          .map(normalizeTrack)
          .filter(function(t){return t.id&&t.stripePriceId});

        normalizeCart();
        saveStoredCart();
        renderCatalog(activeCat());
        renderCart();
        openTrackDeepLink()
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
            console.warn('Failed to load /api/tracks, falling back to data/tracks.json',apiErr);
            return fetch('data/tracks.json')
              .then(function(r){
                if(!r.ok)throw new Error('HTTP '+r.status);
                return r.json()
              })
              .then(function(data){
                setTracksFromData(data)
              })
              .catch(function(err){
                console.warn('Failed to load data/tracks.json',err)
              })
          })
      }

      function fadeAudioTo(audio,target,duration,done){
        if(!audio)return;
        clearInterval(ambientFade);
        var start=Number.isFinite(audio.volume)?audio.volume:0,started=Date.now();
        ambientFade=setInterval(function(){
          var progress=Math.min(1,(Date.now()-started)/duration);
          audio.volume=start+(target-start)*progress;
          if(progress>=1){
            clearInterval(ambientFade);
            audio.volume=target;
            if(done)done()
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
          return
        }
        fadeAudioTo(a,0,380,function(){a.pause()})
      }

      function previewIsPlaying(){return !!(currentWaveSurfer&&currentWaveSurfer.isPlaying())}

      function setAmbient(on){
        ambientOn=on;
        if(id('ambientText'))id('ambientText').textContent=on?'Ambient mode on':'Ambient mode off';
        if(id('ambientToggle'))id('ambientToggle').classList.toggle('off',!on);
        if(on&&!previewIsPlaying()&&!document.hidden){
          playAmbientAudio()
        }else{
          pauseAmbientAudio(false)
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
            if(target)target.scrollIntoView()
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
          row.classList.add('track-deeplink')
        })
      }

      function updateTrackStates(){
        all('.track').forEach(function(r){
          var active=r.getAttribute('data-track-id')===currentPreviewTrackId,playing=active&&currentWaveSurfer&&currentWaveSurfer.isPlaying();
          r.classList.toggle('active',active);
          r.classList.toggle('playing',!!playing);
          var b=r.querySelector('.track-play');
          if(b){
            b.classList.toggle('is-playing',!!playing);
            b.setAttribute('aria-label',playing?'Pause preview':'Play preview')
          }
        })
      }

      function pauseAmbientForPreview(){
        if(!ambientPausedForPreview){
          ambientWasOnBeforePreview=ambientOn;
          ambientPausedForPreview=true
        }
        pauseAmbientAudio(false)
      }

      function resumeAmbientAfterPreview(){
        if(previewSwitching||document.hidden)return;
        if(ambientPausedForPreview&&ambientWasOnBeforePreview&&ambientOn)playAmbientAudio();
        ambientPausedForPreview=false;
        ambientWasOnBeforePreview=false
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
            return
          }
          if(!currentWaveSurfer.isPlaying())return;
          currentWaveSurfer.setVolume(Math.min(.85,currentWaveSurfer.getVolume()+.05));
          if(currentWaveSurfer.getVolume()>=.85)clearInterval(previewFade)
        },60);
        if(playResult&&playResult.catch)playResult.catch(function(){
          clearInterval(previewFade);
          resumeAmbientAfterPreview()
        })
      }

      function closePreview(){
        clearInterval(previewFade);
        previewSwitching=true;
        if(currentWaveSurfer){
          currentWaveSurfer.pause();
          currentWaveSurfer.destroy();
          currentWaveSurfer=null
        }
        previewSwitching=false;
        currentPreviewTrackId=null;
        all('.track-waveform').forEach(function(w){w.innerHTML=''});
        resumeAmbientAfterPreview();
        updateTrackStates()
      }

      function togglePreview(t){
        previewPausedForVisibility=false;
        if(currentPreviewTrackId===t.id&&currentWaveSurfer){
          if(currentWaveSurfer.isPlaying()){
            closePreview()
          }else{
            playCurrent()
          }
          updateTrackStates();
          return
        }
        openPreview(t)
      }

      function openPreview(t){
        var row=document.querySelector('.track[data-track-id="'+t.id+'"]'),w=row?row.querySelector('.track-waveform'):null,src=t.preview||('assets/audio/'+t.id+'-preview.wav'),isMobile=window.matchMedia&&window.matchMedia('(max-width:560px)').matches,waveHeight=isMobile?44:64;
        all('.track').forEach(function(x){x.classList.remove('active','playing','loading')});
        all('.track-waveform').forEach(function(x){x.innerHTML=''});
        if(row)row.classList.add('active','loading');
        if(!w||!window.WaveSurfer){
          if(row)row.classList.remove('loading');
          return
        }
        clearInterval(previewFade);
        previewSwitching=true;
        if(currentWaveSurfer){
          currentWaveSurfer.pause();
          currentWaveSurfer.destroy();
          currentWaveSurfer=null
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
          updateTrackStates()
        });
        currentWaveSurfer.on('play',function(){
          pauseAmbientForPreview();
          updateTrackStates()
        });
        currentWaveSurfer.on('pause',function(){
          if(previewSwitching)return;
          closePreview()
        });
        currentWaveSurfer.on('finish',function(){closePreview()});
        currentWaveSurfer.on('error',function(){
          clearInterval(previewFade);
          if(row)row.classList.remove('loading');
          closePreview()
        });
        currentWaveSurfer.load(src)
      }

      function renderCart(){
        var total=cart.reduce(function(sum,c){
          var t=tracks.find(function(x){return x.id===c});
          return sum+(t?price(t):0)
        },0),box=id('cartItems');

        if(id('cartTotal'))id('cartTotal').textContent=money(total);
        if(id('cartSubtotal'))id('cartSubtotal').textContent=money(total);
        if(id('cartCount')){
          id('cartCount').textContent=cart.length;
          id('cartCount').classList.toggle('has-items',cart.length>0)
        }
        if(!box)return;
        if(!cart.length){
          box.innerHTML='<p class="cart-empty">No tracks selected yet.</p>';
          return
        }
        if(id('cart'))id('cart').classList.add('show');
        document.body.classList.add('cart-open');
        box.innerHTML='';
        cart.forEach(function(c){
          var t=tracks.find(function(x){return x.id===c});
          if(!t)return;
          var item=document.createElement('div');
          item.className='cart-item';
          item.innerHTML='<img class="cart-item-cover" alt=""><div><p class="cart-item-title"></p><p class="cart-item-meta"></p></div><button class="cart-remove" type="button">Remove</button>';
          item.querySelector('.cart-item-cover').src=t.cover||('assets/images/'+t.id+'-cover.jpg');
          item.querySelector('.cart-item-cover').alt=t.title;
          item.querySelector('.cart-item-title').textContent=t.title;
          item.querySelector('.cart-item-meta').textContent=t.genre+' · '+money(price(t));
          item.querySelector('button').onclick=function(){
            cart=cart.filter(function(x){return x!==c});
            saveStoredCart();
            renderCart();
            renderCatalog(activeCat())
          };
          box.appendChild(item)
        })
      }

      function meta(text){
        var s=document.createElement('span');
        s.className='tmeta';
        s.textContent=text;
        return s
      }

      function platformLink(name,url){
        if(!url)return null;
        var el=document.createElement('a');
        el.href=url;
        el.target='_blank';
        el.rel='noopener noreferrer';
        el.textContent=name;
        el.onclick=function(e){e.stopPropagation()};
        el.className='track-platform';
        return el
      }

      function appendPlatform(links,name,url){
        var el=platformLink(name,url);
        if(el)links.appendChild(el)
      }

      function row(t){
        var r=document.createElement('article'),media=document.createElement('div'),cover=document.createElement('img'),play=document.createElement('button'),body=document.createElement('div'),top=document.createElement('div'),titleWrap=document.createElement('div'),titleRow=document.createElement('div'),label=document.createElement('p'),title=document.createElement('h3'),metaLine=document.createElement('p'),wave=document.createElement('div'),waveform=document.createElement('div'),listen=document.createElement('p'),links=document.createElement('div'),buy=document.createElement('div'),priceEl=document.createElement('p'),quality=document.createElement('p'),add=document.createElement('button'),added=cart.indexOf(t.id)>-1;

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
          metaLine.appendChild(meta(x))
        });

        wave.className='track-wave';
        waveform.className='track-waveform';
        wave.onclick=function(e){
          e.stopPropagation();
          if(currentPreviewTrackId===t.id&&currentWaveSurfer&&!currentWaveSurfer.isPlaying())playCurrent()
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
          togglePreview(t)
        };

        play.onclick=function(e){
          e.stopPropagation();
          clearDeepLinkHighlight();
          togglePreview(t)
        };

        add.onclick=function(e){
          e.stopPropagation();
          clearDeepLinkHighlight();
          if(cart.indexOf(t.id)===-1){
            cart.push(t.id);
            saveStoredCart()
          }
          renderCart();
          add.textContent='Added';
          add.classList.add('added')
        };

        return r
      }

      function renderCatalog(cat){
        var c=id('catalog');
        if(!c)return;
        if(currentWaveSurfer)closePreview();
        c.innerHTML='';
        tracks.filter(function(t){return t.category===cat}).forEach(function(t){c.appendChild(row(t))});
        updateTrackStates()
      }

      function reveal(){
        document.body.classList.remove('chrome-hidden');
        clearTimeout(chromeTimer);
        if(id('site')&&id('site').classList.contains('show'))chromeTimer=setTimeout(function(){
          if(!id('cart')||!id('cart').classList.contains('show'))document.body.classList.add('chrome-hidden')
        },2600)
      }

      function pauseAudioForExit(){
        clearInterval(previewFade);
        previewPausedForVisibility=previewIsPlaying();
        previewSwitching=true;
        if(currentWaveSurfer)currentWaveSurfer.pause();
        previewSwitching=false;
        pauseAmbientAudio(true);
        updateTrackStates()
      }

      function handleVisibility(){
        if(document.hidden){
          pauseAudioForExit();
          return
        }
        if(ambientOn&&!previewPausedForVisibility&&!previewIsPlaying())playAmbientAudio();
        previewPausedForVisibility=false
      }

      function submitBooking(e){
        e.preventDefault();
        var form=e.currentTarget,fields=['Name','Email','Phone','Promoter Instagram','Event Type','Proposed Fee','City / Venue','Venue Location','Event Date','Event Time','Lineup / Other Artists','Additional Notes'],body=fields.map(function(name){
          var el=form.elements[name],value=el?el.value.trim():'';
          return name+': '+(value||'')
        }).join('\n');
        window.location.href='mailto:booking@amneuz.com?subject='+encodeURIComponent('Booking Request — AMNEUZ')+'&body='+encodeURIComponent(body)
      }

      function bind(){
        if(id('enterSound'))id('enterSound').onclick=function(){enter(true)};
        if(id('enterSilent'))id('enterSilent').onclick=function(){enter(false)};
        if(id('ambientToggle'))id('ambientToggle').onclick=function(){setAmbient(!ambientOn)};

        if(id('streamButton'))id('streamButton').onclick=function(e){
          e.stopPropagation();
          if(id('streamPanel'))id('streamPanel').classList.toggle('open')
        };

        var bookingForm=document.querySelector('.booking-form');
        if(bookingForm)bookingForm.addEventListener('submit',submitBooking);

        document.addEventListener('click',function(e){
          var p=id('streamPanel'),b=id('streamButton');
          if(p&&b&&!p.contains(e.target)&&e.target!==b)p.classList.remove('open')
        });

        all('.tab').forEach(function(t){
          t.onclick=function(){
            all('.tab').forEach(function(x){x.classList.toggle('active',x===t)});
            renderCatalog(t.getAttribute('data-cat')||'remixes')
          }
        });

        if(id('cartTrigger'))id('cartTrigger').onclick=function(){
          if(id('cart'))id('cart').classList.toggle('show');
          document.body.classList.toggle('cart-open',!!(id('cart')&&id('cart').classList.contains('show')))
        };

        if(id('cartClose'))id('cartClose').onclick=function(){
          if(id('cart'))id('cart').classList.remove('show');
          document.body.classList.remove('cart-open')
        };

        if(id('checkoutBtn'))id('checkoutBtn').onclick=function(){
          if(!cart.length){
            console.warn('Checkout skipped: cart is empty');
            return
          }

          var selectedTracks=cart.map(function(trackId){
            var t=tracks.find(function(x){return String(x.id)===String(trackId)});
            return t?{id:t.id,stripePriceId:t.stripePriceId}:null
          });

          var items=selectedTracks.filter(function(track){
            return track&&track.stripePriceId
          }).map(function(track){
            return{priceId:track.stripePriceId}
          });

          console.log('cart:',cart);
          console.log('selectedTracks:',selectedTracks);
          console.log('checkout items:',items);

          if(!items.length){
            console.warn('Checkout skipped: no selected tracks have stripePriceId');
            return
          }

          fetch('/api/create-checkout-session',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({items:items})
          })
          .then(function(r){
            if(!r.ok)throw new Error('HTTP '+r.status);
            return r.json()
          })
          .then(function(data){
            if(data&&data.url)window.location.href=data.url;
            else console.error('Checkout failed: missing url in response',data)
          })
          .catch(function(err){console.error('Checkout failed',err)})
        };

        if(id('closePreview'))id('closePreview').onclick=closePreview;

        document.addEventListener('mousemove',reveal);
        document.addEventListener('touchstart',reveal,{passive:true});
        document.addEventListener('visibilitychange',handleVisibility);
        window.addEventListener('pagehide',pauseAudioForExit);
        window.addEventListener('blur',pauseAudioForExit);
        window.addEventListener('beforeunload',pauseAudioForExit);
        if(document.addEventListener)document.addEventListener('freeze',pauseAudioForExit)
      }

      setAmbient(false);
      bind();
      skipIntro();
      loadTracks();

      console.assert(!!id('intro'),'intro exists');
      console.assert(!!id('catalog'),'catalog exists');
      console.assert(typeof renderCatalog==='function','catalog renderer exists');
    })();