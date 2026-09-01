(function(){

  /* ---------------- Default decks ---------------- */
  var DEFAULT_DECKS = [
    {id:'d-animals', emoji:'🐆', name:'Animals', cards:['Elephant','Octopus','Kangaroo','Penguin','Cheetah','Giraffe','Dolphin','Owl','Shark','Chameleon','Peacock','Sloth']},
    {id:'d-movies', emoji:'🎬', name:'Movies', cards:['Titanic','Inception','Jaws','Avatar','Interstellar','Jurassic Park','The Matrix','Gladiator','Frozen','Coco','Up','Toy Story']},
    {id:'d-food', emoji:'🍕', name:'Food', cards:['Pizza','Sushi','Tacos','Pancakes','Ramen','Burger','Dumplings','Croissant','Curry','Waffles','Falafel','Paella']},
    {id:'d-random', emoji:'🎲', name:'Random Words', cards:['Umbrella','Volcano','Library','Astronaut','Compass','Lighthouse','Marathon','Glacier','Carnival','Telescope','Blueprint','Meadow']}
  ];

  var STORAGE_KEY = 'imposter:decks';
  var BACKUP_STORAGE_KEY = 'imposter:decks:backup';
  var storageAvailable = true;
  var pendingSave = null;
  var saveInProgress = false;

  /* ---------------- State ---------------- */
  var state = {
    screen: 'home',
    players: [],
    decks: [],
    selectedDeckId: null,
    round: null,
    roundsPlayed: 0,
    modal: null,
    _animatedIds: {}
  };

  function uid(){ return Math.random().toString(36).slice(2,10); }

  /* ---------------- Storage ---------------- */
  function readLocalDecks(){
    try{
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){ /* localStorage may be unavailable */ }
    return null;
  }

  function writeLocalDecks(){
    try{
      var serialized = JSON.stringify(state.decks);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      window.localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
    }catch(e){ /* localStorage may be unavailable */ }
  }

  async function loadDecks(){
    var localDecks = readLocalDecks();
    if(localDecks && Array.isArray(localDecks)){
      state.decks = localDecks;
      return;
    }
    if(window.storage && typeof window.storage.get === 'function'){
      try{
        var res = await window.storage.get(STORAGE_KEY, false);
        if(res && res.value){
          var remoteDecks = JSON.parse(res.value);
          if(Array.isArray(remoteDecks)) state.decks = remoteDecks;
          else throw new Error('Invalid deck data');
          writeLocalDecks();
          return;
        }
      }catch(e){ /* fall back to defaults */ }
    }
    state.decks = JSON.parse(JSON.stringify(DEFAULT_DECKS));
    await persistDecks();
  }

  async function persistDecks(){
    // Save synchronously first, so cards survive navigation or an immediate close.
    writeLocalDecks();
    if(!storageAvailable || !window.storage || typeof window.storage.set !== 'function') return;
    pendingSave = JSON.stringify(state.decks);
    if(saveInProgress) return;
    saveInProgress = true;
    try{
      while(pendingSave){
        var payload = pendingSave;
        pendingSave = null;
        await window.storage.set(STORAGE_KEY, payload, false);
      }
    }catch(e){
      // The localStorage copy remains available if remote storage is unsupported.
      storageAvailable = false;
      pendingSave = null;
    }finally{
      saveInProgress = false;
    }
  }

  window.addEventListener('beforeunload', writeLocalDecks);
  window.addEventListener('pagehide', writeLocalDecks);

  /* ---------------- Helpers ---------------- */
  function go(screen){ state.screen = screen; render(); window.scrollTo(0,0); }

  function shuffle(arr){
    var a = arr.slice();
    for(var i=a.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var tmp=a[i]; a[i]=a[j]; a[j]=tmp;
    }
    return a;
  }

  function getSelectedDeck(){
    return state.decks.find(function(d){ return d.id === state.selectedDeckId; });
  }

  function startGame(){
    var deck = getSelectedDeck();
    if(!deck || deck.cards.length===0) return;
    var word = deck.cards[Math.floor(Math.random()*deck.cards.length)];
    var allIds = state.players.map(function(p){ return p.id; });
    var imposterId = allIds[Math.floor(Math.random()*allIds.length)];
    var maxRounds = state.roundsChoice || Math.max(1, Math.min(3, allIds.length-1));
    state.round = {
      word: word,
      imposterId: imposterId,
      maxRounds: maxRounds,
      roundNum: 1,
      alive: allIds.slice(),
      eliminatedLog: [],
      // one-time role reveal
      revealOrder: shuffle(allIds),
      revealIndex: 0,
      revealed: false,
      // per-round clue/vote (set by initRoundPhase)
      clueOrder: [],
      clueIndex: 0,
      voteOrder: [],
      voteIndex: 0,
      votes: {},
      currentPick: null,
      tie: false,
      eliminatedId: null,
      eliminatedWasImposter: false,
      gameOver: false,
      winner: null,
      reason: ''
    };
    state.roundsPlayed += 1;
    go('roleReveal');
  }

  function initRoundPhase(){
    var r = state.round;
    r.clueOrder = shuffle(r.alive);
    r.clueIndex = 0;
    r.voteOrder = shuffle(r.alive);
    r.voteIndex = 0;
    r.votes = {};
    r.currentPick = null;
    r.tie = false;
    r.eliminatedId = null;
    r.eliminatedWasImposter = false;
  }

  function computeRoundResult(){
    var r = state.round;
    var tally = {};
    r.alive.forEach(function(pid){ tally[pid]=0; });
    Object.keys(r.votes).forEach(function(voter){ tally[r.votes[voter]] += 1; });
    var maxVotes = -1, top = [];
    Object.keys(tally).forEach(function(pid){
      if(tally[pid] > maxVotes){ maxVotes = tally[pid]; top = [pid]; }
      else if(tally[pid] === maxVotes){ top.push(pid); }
    });
    r._tally = tally;
    if(top.length !== 1){
      r.tie = true;
      r.eliminatedId = null;
    } else {
      r.tie = false;
      var elim = top[0];
      r.eliminatedId = elim;
      r.eliminatedWasImposter = (elim === r.imposterId);
      r.alive = r.alive.filter(function(id){ return id!==elim; });
      r.eliminatedLog.push({id: elim, wasImposter: r.eliminatedWasImposter});
    }
  }

  function advanceAfterRound(){
    var r = state.round;
    if(r.eliminatedId && r.eliminatedWasImposter){
      r.gameOver = true;
      r.winner = 'normal';
      r.reason = 'caught';
      go('results');
      return;
    }
    if(r.alive.length === 1){
      // Only the imposter can be left — treat as caught
      r.eliminatedId = r.alive[0];
      r.eliminatedWasImposter = true;
      r.gameOver = true;
      r.winner = 'normal';
      r.reason = 'caught';
      go('results');
      return;
    }
    if(r.roundNum >= r.maxRounds){
      r.gameOver = true;
      r.winner = 'imposter';
      r.reason = 'rounds-exhausted';
      go('results');
      return;
    }
    r.roundNum += 1;
    initRoundPhase();
    go('clue');
  }

  function playerName(id){
    var p = state.players.find(function(p){ return p.id===id; });
    return p ? p.name : '???';
  }

  /* ---------------- Rendering ---------------- */
  var root = document.getElementById('root');

  function render(){
    root.innerHTML = '';
    var el;
    switch(state.screen){
      case 'home': el = screenHome(); break;
      case 'setup': el = screenSetup(); break;
      case 'deckSelect': el = screenDeckSelect(); break;
      case 'deckManager': el = screenDeckManager(); break;
      case 'roleReveal': el = screenRoleReveal(); break;
      case 'clue': el = screenClue(); break;
      case 'voting': el = screenVoting(); break;
      case 'roundResult': el = screenRoundResult(); break;
      case 'results': el = screenResults(); break;
      default: el = screenHome();
    }
    root.appendChild(el);
    el.classList.add('screen-enter');
    if(state.modal) root.appendChild(renderModal());
  }

  function h(tag, attrs, children){
    var e = document.createElement(tag);
    attrs = attrs || {};
    for(var k in attrs){
      if(attrs[k]===null || attrs[k]===undefined) continue;
      if(k==='class') e.className = attrs[k];
      else if(k==='html') e.innerHTML = attrs[k];
      else if(k.indexOf('on')===0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (children||[]).forEach(function(c){
      if(c==null) return;
      if(typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function topbar(label, onBack){
    return h('div',{class:'topbar'},[
      onBack ? h('button',{class:'back-btn', onclick:onBack},['←  BACK']) : h('div'),
      label ? h('div',{class:'step-label'},[label]) : h('div')
    ]);
  }

  /* ---------- Memphis decoration helpers ---------- */
  function squiggle(color, w, hh){
    w = w || 70; hh = hh || 22;
    var mid = hh/2;
    var d = 'M2,'+mid+' Q'+(w*0.25)+',2 '+(w*0.5)+','+mid+' T'+(w-2)+','+mid;
    return h('div',{html:'<svg class="squiggle" viewBox="0 0 '+w+' '+hh+'" width="'+w+'" height="'+hh+'"><path d="'+d+'" stroke="'+color+'"/></svg>'});
  }

  var CONFETTI_COLORS = ['var(--red)','var(--blue)','var(--yellow)'];
  function confettiCluster(spots){
    var wrap = h('div',{class:'confetti-cluster'});
    spots.forEach(function(s, i){
      wrap.appendChild(h('div',{class:'confetti-dot', style:
        'top:'+s.top+';left:'+s.left+';width:'+s.size+'px;height:'+s.size+'px;'+
        'background:'+CONFETTI_COLORS[i%3]+';animation-delay:'+(i*90)+'ms, '+(i*220)+'ms;'
      }));
    });
    return wrap;
  }

  /* ---------- Home ---------- */
  function screenHome(){
    var wrap = h('div',{style:'display:flex;flex-direction:column;min-height:calc(100vh - 40px);'});
    var hero = h('div',{class:'home-hero'},[
      h('div',{class:'logo-trio'},[
        h('div',{class:'lt-circle'}), h('div',{class:'lt-square'}), h('div',{class:'lt-tri'})
      ]),
      h('h1',{class:'home-title'},['IMPOSTER',h('span',{class:'dot'},['.'])]),
      squiggle('var(--blue)', 90, 22),
      h('p',{class:'home-sub'},['One word goes around the table. One player never sees it. Find the liar before they find the word.']),
      h('div',{class:'home-kicker'},['A COSMIC MAFIA DEDUCTION GAME'])
    ]);
    hero.appendChild(h('div',{style:'position:absolute;top:36%;right:8%;width:60px;height:60px;'},[
      confettiCluster([
        {top:'0px', left:'0px', size:10},
        {top:'22px', left:'26px', size:7},
        {top:'8px', left:'40px', size:12}
      ])
    ]));
    hero.appendChild(h('div',{style:'position:absolute;bottom:22%;left:6%;'},[h('div',{class:'semi-circle'})]));
    wrap.appendChild(hero);
    wrap.appendChild(h('div',{class:'home-actions'},[
      h('button',{class:'btn btn-primary', onclick:function(){ go('setup'); }},['Start Game']),
      h('button',{class:'btn btn-ghost', onclick:function(){ go('deckManager'); }},['Manage Decks'])
    ]));
    return wrap;
  }

  /* ---------- Player setup ---------- */
  function screenSetup(){
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('SETUP · 1 OF 3', function(){ go('home'); }));
    wrap.appendChild(h('h2',{class:'section-title'},['Who\u2019s playing?']));
    wrap.appendChild(h('div',{class:'zigzag zz-blue', style:'width:60px;margin-bottom:12px;'}));
    wrap.appendChild(h('p',{class:'section-desc'},['Add everyone at the table. You\u2019ll need at least 3 players — one of them won\u2019t get the word.']));

    var nameInput = h('input',{class:'text-input', placeholder:'Enter player name', type:'text', maxlength:'20'});
    function addPlayer(){
      var val = nameInput.value.trim();
      if(!val) return;
      state.players.push({id:uid(), name:val});
      nameInput.value='';
      render();
      var again = document.querySelector('.text-input');
      if(again) again.focus();
    }
    nameInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addPlayer(); }});
    wrap.appendChild(h('div',{class:'input-row'},[
      nameInput,
      h('button',{class:'icon-btn', onclick:addPlayer},['+'])
    ]));

    if(state.players.length===0){
      wrap.appendChild(h('div',{class:'empty-hint'},['No players yet. Add names above to build tonight\u2019s lineup.']));
    } else {
      var list = h('div',{class:'player-list'});
      state.players.forEach(function(p, i){
        var isNew = !state._animatedIds['p:'+p.id];
        state._animatedIds['p:'+p.id] = true;
        list.appendChild(h('div',{class:'player-row' + (isNew ? ' pop-in' : '')},[
          h('div',{class:'player-name'},[
            h('span',{class:'player-num'},[String(i+1)]),
            p.name
          ]),
          h('button',{class:'remove-btn', onclick:function(){
            state.players = state.players.filter(function(x){ return x.id!==p.id; });
            render();
          }},['✕'])
        ]));
      });
      wrap.appendChild(list);
    }

    if(state.players.length>0 && state.players.length<3){
      wrap.appendChild(h('div',{class:'count-warning'},['Need at least 3 players to start']));
    }

    wrap.appendChild(h('div',{class:'spacer'}));
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      h('button',{class:'btn btn-primary', disabled: state.players.length<3 ? 'disabled':null,
        onclick:function(){ if(state.players.length>=3) go('deckSelect'); }},['Everyone Ready →'])
    ]));
    return wrap;
  }

  /* ---------- Deck select ---------- */
  function screenDeckSelect(){
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('SETUP · 2 OF 3', function(){ go('setup'); }));
    wrap.appendChild(h('h2',{class:'section-title'},['Pick tonight\u2019s deck']));
    wrap.appendChild(h('div',{class:'zigzag', style:'width:60px;margin-bottom:12px;'}));
    wrap.appendChild(h('p',{class:'section-desc'},['The secret word will be drawn at random from this deck.']));

    if(state.decks.length===0){
      wrap.appendChild(h('div',{class:'empty-hint'},['No decks yet. Head to Deck Manager from the home screen to create one.']));
      wrap.appendChild(h('div',{class:'spacer'}));
      wrap.appendChild(h('div',{class:'bottom-actions'},[
        h('button',{class:'btn btn-ghost', onclick:function(){ go('deckManager'); }},['Go to Deck Manager'])
      ]));
      return wrap;
    }

    // Clamp / init carousel index, keep selectedDeckId in sync with the visible slide
    if(state.deckCarouselIndex == null) state.deckCarouselIndex = 0;
    if(state.deckCarouselIndex > state.decks.length-1) state.deckCarouselIndex = state.decks.length-1;
    if(state.deckCarouselIndex < 0) state.deckCarouselIndex = 0;
    var d = state.decks[state.deckCarouselIndex];
    state.selectedDeckId = d.id;

    function nav(dir){
      state._carouselDir = dir;
      var len = state.decks.length;
      state.deckCarouselIndex = (state.deckCarouselIndex + dir + len) % len;
      render();
    }

    var slideAnimClass = state._carouselDir === -1 ? 'slide-from-left' : 'slide-from-right';
    var slide = h('div',{class:'deck-slide ' + slideAnimClass, key: d.id},[
      h('div',{class:'deck-slide-emoji'},[d.emoji||'🎴']),
      h('h3',{class:'deck-slide-name'},[d.name]),
      h('div',{class:'deck-count'},[d.cards.length + ' CARDS'])
    ]);

    var carousel = h('div',{class:'deck-carousel'},[
      h('button',{class:'carousel-arrow', 'aria-label':'Previous deck', onclick:function(){ nav(-1); }},['‹']),
      slide,
      h('button',{class:'carousel-arrow', 'aria-label':'Next deck', onclick:function(){ nav(1); }},['›'])
    ]);
    wrap.appendChild(carousel);

    var dots = h('div',{class:'carousel-dots'});
    state.decks.forEach(function(dd, di){
      dots.appendChild(h('span',{class:'carousel-dot' + (di===state.deckCarouselIndex?' active':''), onclick:function(){
        state._carouselDir = di > state.deckCarouselIndex ? 1 : -1;
        state.deckCarouselIndex = di; render();
      }}));
    });
    wrap.appendChild(dots);

    // Rounds stepper — how many elimination rounds before the imposter escapes
    var maxAllowed = Math.max(1, state.players.length - 1);
    if(state.roundsChoice == null){ state.roundsChoice = Math.min(3, maxAllowed); }
    if(state.roundsChoice > maxAllowed) state.roundsChoice = maxAllowed;
    if(state.roundsChoice < 1) state.roundsChoice = 1;

    wrap.appendChild(h('h3',{style:'font-size:20px;margin-top:26px;margin-bottom:4px;'},['Rounds until the imposter escapes']));
    wrap.appendChild(h('p',{class:'section-desc', style:'margin-bottom:12px;'},['Each round, the table eliminates one player. Catch the imposter before rounds run out.']));
    var stepperRow = h('div',{style:'display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:8px;'},[
      h('button',{class:'icon-btn', onclick:function(){ if(state.roundsChoice>1){ state.roundsChoice -= 1; render(); } }},['−']),
      h('div',{class:'mono', style:'font-size:34px;font-weight:800;min-width:52px;text-align:center;'},[String(state.roundsChoice)]),
      h('button',{class:'icon-btn', onclick:function(){ if(state.roundsChoice<maxAllowed){ state.roundsChoice += 1; render(); } }},['+'])
    ]);
    wrap.appendChild(stepperRow);
    wrap.appendChild(h('div',{class:'reveal-progress', style:'display:block;text-align:center;margin:0 auto 6px;width:fit-content;'},['MAX ' + maxAllowed + ' FOR ' + state.players.length + ' PLAYERS']));

    wrap.appendChild(h('div',{class:'spacer'}));
    var canStart = d && d.cards.length>0;
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      canStart ? null : h('div',{class:'count-warning'},['This deck has no cards yet']),
      h('button',{class:'btn btn-primary', disabled: canStart ? null : 'disabled',
        onclick:function(){ if(canStart) startGame(); }},['Deal Cards →'])
    ]));
    return wrap;
  }

  /* ---------- Deck manager (full CRUD) ---------- */
  function screenDeckManager(){
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    var cameFromSelect = state.screen==='deckManager' && state._prevWasSelect;
    wrap.appendChild(topbar('DECK MANAGER', function(){ go('home'); }));
    wrap.appendChild(h('h2',{class:'section-title'},['Your decks']));
    wrap.appendChild(h('p',{class:'section-desc'},['Create, edit, or delete word decks. Changes save automatically.']));

    var grid = h('div',{class:'deck-grid'});
    state.decks.forEach(function(d, di){
      grid.appendChild(h('div',{class:'deck-card stagger-in', style:'animation-delay:'+(di*50)+'ms;', onclick:function(){ openDeckEditor(d.id); }},[
        h('div',{class:'deck-card-inner'},[
          h('span',{class:'deck-emoji'},[d.emoji||'🎴']),
          h('div',{class:'deck-info'},[
            h('h3',null,[d.name]),
            h('div',{class:'deck-count'},[d.cards.length + ' CARDS'])
          ])
        ]),
        h('button',{class:'deck-manage-btn', onclick:function(e){ e.stopPropagation(); openDeckEditor(d.id); }},['✎'])
      ]));
    });
    wrap.appendChild(grid);
    wrap.appendChild(h('button',{class:'btn btn-ghost', onclick:function(){ openDeckEditor(null); }},['+ Create New Deck']));
    return wrap;
  }

  /* ---------- Deck editor modal ---------- */
  function openDeckEditor(deckId){
    state.modal = {
      type:'deckEditor',
      deckId: deckId,
      name: deckId ? state.decks.find(function(d){return d.id===deckId;}).name : '',
      newCard: '',
      confirmDelete:false
    };
    render();
  }
  function closeModal(){ state.modal = null; render(); }

  function renderModal(){
    var m = state.modal;
    var overlay = h('div',{class:'modal-overlay', onclick:function(e){ if(e.target===overlay) closeModal(); }});
    var sheet;
    if(m.type==='deckEditor') sheet = deckEditorSheet(m);
    overlay.appendChild(sheet);
    return overlay;
  }

  function deckEditorSheet(m){
    var isNew = !m.deckId;
    var deck = m.deckId ? state.decks.find(function(d){return d.id===m.deckId;}) : null;

    var sheet = h('div',{class:'modal-sheet'});
    sheet.appendChild(h('h3',null,[isNew ? 'New deck' : 'Edit deck']));

    var nameInput = h('input',{class:'text-input', placeholder:'Deck name', value:m.name, style:'margin-bottom:14px;'});
    nameInput.addEventListener('input', function(){ m.name = nameInput.value; });
    sheet.appendChild(nameInput);

    if(!isNew){
      var chipList = h('div',{class:'chip-list'});
      deck.cards.forEach(function(word, idx){
        chipList.appendChild(h('div',{class:'word-chip'},[
          word,
          h('button',{onclick:function(){
            deck.cards.splice(idx,1);
            persistDecks();
            renderModalOnly(m);
          }},['✕'])
        ]));
      });
      sheet.appendChild(chipList);

      var cardInput = h('input',{class:'text-input', placeholder:'Add a card / word', style:'margin-bottom:10px;'});
      function addCard(){
        var val = cardInput.value.trim();
        if(!val) return;
        deck.cards.push(val);
        cardInput.value='';
        persistDecks();
        renderModalOnly(m);
      }
      cardInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addCard(); }});
      sheet.appendChild(h('div',{class:'input-row'},[
        cardInput,
        h('button',{class:'icon-btn', onclick:addCard},['+'])
      ]));
    } else {
      sheet.appendChild(h('p',{class:'section-desc', style:'margin-top:-6px;'},['Give it a name — you can add cards right after creating it.']));
    }

    if(m.confirmDelete){
      sheet.appendChild(h('div',{class:'guess-result wrong'},['Delete "' + deck.name + '" permanently? This can\u2019t be undone.']));
      sheet.appendChild(h('div',{class:'modal-actions'},[
        h('button',{class:'btn btn-ghost', onclick:function(){ m.confirmDelete=false; renderModalOnly(m); }},['Cancel']),
        h('button',{class:'btn btn-danger', onclick:function(){
          state.decks = state.decks.filter(function(d){ return d.id!==deck.id; });
          if(state.selectedDeckId===deck.id) state.selectedDeckId=null;
          persistDecks();
          closeModal();
        }},['Delete Deck'])
      ]));
    } else {
      var actions = h('div',{class:'modal-actions'});
      if(!isNew){
        actions.appendChild(h('button',{class:'btn btn-outline-red', onclick:function(){ m.confirmDelete=true; renderModalOnly(m); }},['Delete']));
      }
      actions.appendChild(h('button',{class:'btn btn-primary', onclick:function(){
        var trimmed = m.name.trim();
        if(!trimmed) return;
        if(isNew){
          var nd = {id:'d-'+uid(), emoji:'🎴', name:trimmed, cards:[]};
          state.decks.push(nd);
          persistDecks();
          m.deckId = nd.id;
          m.type='deckEditor';
          renderModalOnly(m);
        } else {
          deck.name = trimmed;
          persistDecks();
          closeModal();
        }
      }},[isNew ? 'Create Deck' : 'Done'])); 
      sheet.appendChild(actions);
    }

    return sheet;
  }

  function renderModalOnly(m){
    state.modal = m;
    var existing = root.querySelector('.modal-overlay');
    if(existing) existing.remove();
    root.appendChild(renderModal());
  }

  /* ---------- Role reveal (one-time, whole game) ---------- */
  function screenRoleReveal(){
    var r = state.round;
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('SETUP · 3 OF 3', null));

    var pid = r.revealOrder[r.revealIndex];
    var isImposter = pid === r.imposterId;
    var name = playerName(pid);

    var revealBox = h('div',{class:'reveal-wrap'});
    revealBox.appendChild(h('div',{class:'pass-label'},[
      h('div',{class:'eyebrow'},['PASS THE PHONE TO']),
      h('h2',null,[name])
    ]));

    var card = h('div',{class:'case-card' + (r.revealed?' flipped':'')});
    var inner = h('div',{class:'case-inner'});
    var front = h('div',{class:'case-face case-front'},[
      h('div',{class:'case-id'},['CASE №' + String(r.revealIndex+1).padStart(2,'0')]),
      h('div',{class:'stamp'},[h('div',{html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/></svg>'})]),
      h('div',{class:'mono tap-hint'},['Tap to view your card'])
    ]);
    var back = h('div',{class:'case-face case-back ' + (isImposter?'role-imposter':'role-normal')},[
      h('div',{class:'eyebrow2'},[isImposter ? 'YOUR ASSIGNMENT' : 'THE SECRET WORD']),
      h('div',{class:'word-reveal'},[isImposter ? 'YOU ARE THE IMPOSTER' : r.word]),
      h('div',{class:'sub-note'},[isImposter ? 'Blend in. Listen closely and bluff your way through each round.' : 'Give a clue about this word without saying it outright.'])
    ]);
    inner.appendChild(front); inner.appendChild(back);
    card.appendChild(inner);
    card.addEventListener('click', function(){
      if(!r.revealed){ r.revealed = true; render(); }
    });
    revealBox.appendChild(card);
    revealBox.appendChild(h('div',{class:'reveal-progress'},['PLAYER ' + (r.revealIndex+1) + ' OF ' + r.revealOrder.length]));
    wrap.appendChild(revealBox);

    wrap.appendChild(h('div',{class:'bottom-actions'},[
      r.revealed ? h('button',{class:'btn btn-primary', onclick:function(){
        if(r.revealIndex < r.revealOrder.length-1){
          r.revealIndex += 1;
          r.revealed = false;
          render();
        } else {
          initRoundPhase();
          go('clue');
        }
      }},[r.revealIndex < r.revealOrder.length-1 ? 'Hide & Pass to Next →' : 'Everyone\u2019s Seen It → Start Round 1'])
        : h('div',{class:'section-desc', style:'text-align:center;margin-bottom:0;'},[name + ', make sure no one else is looking.'])
    ]));
    return wrap;
  }

  /* ---------- Clue phase ---------- */
  function screenClue(){
    var r = state.round;
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('ROUND ' + r.roundNum + ' OF ' + r.maxRounds, null));

    var currentId = r.clueOrder[r.clueIndex];
    wrap.appendChild(h('div',{class:'turn-banner'},[
      h('div',{class:'eyebrow'},['CURRENTLY SPEAKING']),
      h('h2',null,[playerName(currentId)]),
      h('div',{style:'display:flex;justify-content:center;margin-top:4px;'},[squiggle('var(--yellow)', 64, 18)])
    ]));

    var list = h('div',{class:'clue-order'});
    r.clueOrder.forEach(function(pid, i){
      var cls = 'clue-row stagger-in';
      if(i===r.clueIndex) cls+=' active';
      else if(i<r.clueIndex) cls+=' done';
      var row = h('div',{class:cls, style:'animation-delay:'+(i*40)+'ms;'},[
        h('div',{class:'num'},[String(i+1)]),
        h('div',{class:'name'},[playerName(pid)]),
        i===r.clueIndex ? h('span',{class:'now-badge'},['NOW']) : (i<r.clueIndex ? h('span',{class:'check'},['✓']) : null)
      ]);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    wrap.appendChild(h('p',{class:'section-desc', style:'text-align:center;'},['Say one clue about the word out loud, then hand off to the next player.']));

    wrap.appendChild(h('div',{class:'spacer'}));
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      h('button',{class:'btn btn-primary', onclick:function(){
        if(r.clueIndex < r.clueOrder.length-1){
          r.clueIndex += 1; render();
        } else {
          go('voting');
        }
      }},[r.clueIndex < r.clueOrder.length-1 ? 'Next Player →' : 'All Clues Given → Start Voting'])
    ]));
    return wrap;
  }

  /* ---------- Voting ---------- */
  function screenVoting(){
    var r = state.round;
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('ROUND ' + r.roundNum + ' OF ' + r.maxRounds, null));

    if(r.voteIndex >= r.voteOrder.length){
      computeRoundResult();
      go('roundResult');
      return h('div');
    }

    var voterId = r.voteOrder[r.voteIndex];
    wrap.appendChild(h('div',{class:'turn-banner'},[
      h('div',{class:'eyebrow'},['PASS THE PHONE TO']),
      h('h2',null,[playerName(voterId)])
    ]));
    wrap.appendChild(h('p',{class:'section-desc', style:'text-align:center;'},['Who do you think is the imposter?']));

    var opts = h('div',{class:'vote-options'});
    r.alive.filter(function(pid){ return pid!==voterId; }).forEach(function(pid, vi){
      var picked = r.currentPick === pid;
      opts.appendChild(h('div',{class:'vote-option stagger-in' + (picked?' picked':''), style:'animation-delay:'+(vi*45)+'ms;', onclick:function(){
        r.currentPick = pid; render();
      }},[playerName(pid), h('div',{class:'radio'})]));
    });
    wrap.appendChild(opts);

    wrap.appendChild(h('div',{class:'spacer'}));
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      h('button',{class:'btn btn-primary', disabled: r.currentPick ? null : 'disabled', onclick:function(){
        if(!r.currentPick) return;
        r.votes[voterId] = r.currentPick;
        r.currentPick = null;
        r.voteIndex += 1;
        render();
      }},['Submit Vote →'])
    ]));
    return wrap;
  }

  /* ---------- Round result (elimination reveal — NOT full game outcome) ---------- */
  function screenRoundResult(){
    var r = state.round;
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('ROUND ' + r.roundNum + ' OF ' + r.maxRounds, null));

    var tally = r._tally || {};
    var voterCount = r.voteOrder.length;

    if(r.tie){
      wrap.appendChild(h('div',{class:'result-banner escaped'},[
        h('div',{class:'eyebrow'},['SPLIT VOTE']),
        h('h2',null,['No one was eliminated'])
      ]));
    } else {
      var wasImp = r.eliminatedWasImposter;
      wrap.appendChild(h('div',{class:'result-banner ' + (wasImp?'caught':'escaped')},[
        h('div',{class:'eyebrow'},[wasImp ? 'CASE CLOSED' : 'WRONG SUSPECT']),
        h('h2',null,[playerName(r.eliminatedId) + (wasImp ? ' was the Imposter!' : ' was NOT the imposter')])
      ]));
      if(!wasImp){
        wrap.appendChild(h('div',{class:'reveal-line'},[
          h('span',{class:'label'},['The imposter']),
          h('span',{class:'value amber'},['still unknown \u2014 game continues'])
        ]));
      }
    }

    var tallyWrap = h('div',{class:'vote-tally'});
    Object.keys(tally).sort(function(a,b){ return tally[b]-tally[a]; }).forEach(function(pid){
      var pct = voterCount>0 ? Math.round((tally[pid] / voterCount) * 100) : 0;
      var isElim = pid===r.eliminatedId;
      tallyWrap.appendChild(h('div',{class:'vote-tally-row'},[
        h('div',{class:'vote-tally-head'},[
          h('span',null,[playerName(pid) + (isElim?' ❌':'')]),
          h('span',{class:'n mono'},[tally[pid] + ' vote' + (tally[pid]===1?'':'s')])
        ]),
        h('div',{class:'tally-bar-bg'},[h('div',{class:'tally-bar-fill' + (isElim?' is-imposter':''), style:'width:'+pct+'%'})])
      ]));
    });
    wrap.appendChild(tallyWrap);

    var roundsLeft = Math.max(0, r.maxRounds - r.roundNum);
    if(!(r.eliminatedId && r.eliminatedWasImposter) && r.alive.length>1){
      wrap.appendChild(h('div',{class:'reveal-progress', style:'display:block;text-align:center;width:fit-content;margin:6px auto 0;'},[roundsLeft + ' ROUND' + (roundsLeft===1?'':'S') + ' LEFT']));
    }

    wrap.appendChild(h('div',{class:'spacer'}));
    var isFinalReveal = r.eliminatedId && r.eliminatedWasImposter;
    var willEnd = !isFinalReveal && (r.roundNum >= r.maxRounds || r.alive.length<=1);
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      h('button',{class:'btn btn-primary', onclick:function(){ advanceAfterRound(); }},
        [isFinalReveal ? 'See Final Result →' : (willEnd ? 'See Final Result →' : 'Continue to Next Round →')])
    ]));
    return wrap;
  }

  /* ---------- Results (final game outcome) ---------- */
  function screenResults(){
    var r = state.round;
    var wrap = h('div',{style:'display:flex;flex-direction:column;flex:1;'});
    wrap.appendChild(topbar('GAME OVER', null));

    var normalWin = r.winner==='normal';
    var bannerText, eyebrowText;
    if(r.reason==='rounds-exhausted'){ eyebrowText='CASE UNSOLVED'; bannerText='The Imposter got away!'; }
    else { eyebrowText='CASE CLOSED'; bannerText='The Imposter was caught \u2014 Players win!'; }

    var banner = h('div',{class:'result-banner ' + (normalWin?'caught':'escaped')},[
      h('div',{class:'eyebrow'},[eyebrowText]),
      h('h2',null,[bannerText])
    ]);
    if(normalWin){
      var bursts = [
        {cls:'bs-circle', top:'-14px', left:'6%', rot:'20deg', ty:'-4px', delay:'0ms'},
        {cls:'bs-square', top:'-10px', left:'82%', rot:'-25deg', ty:'-6px', delay:'80ms'},
        {cls:'bs-tri', top:'86%', left:'-4%', rot:'15deg', ty:'6px', delay:'140ms'},
        {cls:'bs-circle', top:'90%', left:'88%', rot:'-15deg', ty:'8px', delay:'200ms'}
      ];
      bursts.forEach(function(b){
        banner.appendChild(h('div',{class:'burst-shape ' + b.cls,
          style:'top:'+b.top+';left:'+b.left+';--rot:'+b.rot+';--ty:'+b.ty+';animation-delay:'+b.delay+';'}));
      });
    }
    wrap.appendChild(banner);

    wrap.appendChild(h('div',{class:'reveal-line'},[
      h('span',{class:'label'},['The imposter was']),
      h('span',{class:'value red'},[playerName(r.imposterId)])
    ]));
    wrap.appendChild(h('div',{class:'reveal-line'},[
      h('span',{class:'label'},['The secret word was']),
      h('span',{class:'value amber'},[r.word])
    ]));

    if(r.eliminatedLog.length>0){
      wrap.appendChild(h('h3',{style:'font-size:18px;margin:20px 0 10px;'},['Elimination order']));
      var log = h('div',{class:'clue-order'});
      r.eliminatedLog.forEach(function(entry, i){
        log.appendChild(h('div',{class:'clue-row'},[
          h('div',{class:'num'},[String(i+1)]),
          h('div',{class:'name'},[playerName(entry.id)]),
          h('span',{class: entry.wasImposter ? 'now-badge' : 'check'}, [entry.wasImposter ? 'IMPOSTER' : '✓ innocent'])
        ]));
      });
      wrap.appendChild(log);
    }

    wrap.appendChild(h('div',{class:'spacer'}));
    wrap.appendChild(h('div',{class:'bottom-actions'},[
      h('button',{class:'btn btn-primary', onclick:function(){ startGame(); }},['Play Again — New Round']),
      h('button',{class:'btn btn-ghost', onclick:function(){ state.round=null; go('home'); }},['End Game'])
    ]));
    return wrap;
  }

  /* ---------------- Boot ---------------- */
  var bootStart = Date.now();
  loadDecks().then(function(){
    render();
    var elapsed = Date.now() - bootStart;
    var minShow = 900;
    var wait = Math.max(0, minShow - elapsed);
    setTimeout(function(){
      var ls = document.getElementById('loading-screen');
      if(ls) ls.classList.add('hide');
    }, wait);
  });

})();
