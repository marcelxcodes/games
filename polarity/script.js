(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const COLORS = {
    blue: '#00f0ff',
    blueDim: '#0a2f3a',
    pink: '#ff2fd1',
    pinkDim: '#3a0a30',
    gold: '#ffcc33',
    green: '#39ff88',
    red: '#ff3b5c',
    white: '#eafcff'
  };

  // ---------- Audio ----------
  let actx = null;
  function unlockAudio(){
    if(!actx){
      try{ actx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
    }
  }
  function tone(freq, dur, type, gainVal, slideTo){
    if(!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, actx.currentTime);
    if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, actx.currentTime + dur);
    gain.gain.setValueAtTime(gainVal || 0.12, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime + dur);
  }
  const sfx = {
    shoot: ()=> tone(620, 0.07, 'square', 0.05, 900),
    hit: ()=> tone(140, 0.25, 'sawtooth', 0.15, 40),
    swap: ()=> tone(300, 0.12, 'triangle', 0.1, 700),
    kill: ()=> tone(500, 0.1, 'square', 0.09, 250),
    power: ()=> tone(300, 0.35, 'sine', 0.12, 1200),
    wrongHit: ()=> tone(90, 0.3, 'sawtooth', 0.14, 30),
    gameover: ()=>{ tone(220,0.4,'sawtooth',0.15,80); setTimeout(()=>tone(160,0.5,'sawtooth',0.15,50),150); }
  };

  // ---------- State ----------
  let state = 'title'; // title | playing | over
  let score = 0, highScore = 0, wave = 1, lives = 3;
  let comboCount = 0, comboTimer = 0;
  let overdriveTimer = 0;
  let shakeTime = 0, shakeMag = 0;
  let spawnTimer = 0, spawnInterval = 1.0;
  let orbTimer = 8;
  let elapsed = 0;
  let invuln = 0;

  // raised-stakes systems
  let sameColorStreak = 0;         // kills in a row without swapping polarity
  let overloadTimer = 0;           // active "surge" punishment window
  let overloadWarn = 0;            // pre-surge warning flash
  const OVERLOAD_THRESHOLD = 6;
  let boss = null;                 // active boss object, or null
  let lastBossWave = 0;
  let enemyBullets = [];

  const player = {
    x: W/2, y: H-90, w: 26, h: 30,
    speed: 300,
    polarity: 'blue',
    cooldown: 0,
    fireRate: 0.16
  };

  let bullets = [];
  let enemies = [];
  let particles = [];
  let orbs = [];
  let stars = [];
  for(let i=0;i<70;i++){
    stars.push({x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.6+0.3, s:Math.random()*40+15, tw:Math.random()*Math.PI*2});
  }

  const keys = {};
  let moveLeft=false, moveRight=false, firing=false;

  // ---------- Input ----------
  window.addEventListener('keydown', (e)=>{
    unlockAudio();
    keys[e.key.toLowerCase()] = true;
    if(e.key === ' '){ firing = true; e.preventDefault(); handleFireTap(); }
    if(e.key.toLowerCase() === 'x'){ swapPolarity(); }
    if(['arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', (e)=>{
    keys[e.key.toLowerCase()] = false;
    if(e.key === ' ') firing = false;
  });

  function bindHold(el, onDown, onUp){
    el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); unlockAudio(); onDown(); });
    el.addEventListener('pointerup', (e)=>{ e.preventDefault(); onUp && onUp(); });
    el.addEventListener('pointerleave', (e)=>{ onUp && onUp(); });
    el.addEventListener('pointercancel', (e)=>{ onUp && onUp(); });
  }
  bindHold(document.getElementById('btnLeft'), ()=>moveLeft=true, ()=>moveLeft=false);
  bindHold(document.getElementById('btnRight'), ()=>moveRight=true, ()=>moveRight=false);
  bindHold(document.getElementById('btnFire'), ()=>{ firing=true; handleFireTap(); }, ()=>firing=false);
  document.getElementById('btnSwap').addEventListener('pointerdown', (e)=>{ e.preventDefault(); unlockAudio(); swapPolarity(); });

  function handleFireTap(){
    if(state === 'title' || state === 'over'){ startGame(); }
  }

  function swapPolarity(){
    if(state !== 'playing') return;
    player.polarity = player.polarity === 'blue' ? 'pink' : 'blue';
    sameColorStreak = 0;
    sfx.swap();
    for(let i=0;i<10;i++) spawnParticle(player.x, player.y, player.polarity === 'blue' ? COLORS.blue : COLORS.pink, 2.4);
  }

  // ---------- Helpers ----------
  function rand(a,b){ return a + Math.random()*(b-a); }
  function dist2(x1,y1,x2,y2){ const dx=x1-x2, dy=y1-y2; return dx*dx+dy*dy; }

  function spawnParticle(x,y,color,speed){
    const ang = Math.random()*Math.PI*2;
    particles.push({
      x,y, vx:Math.cos(ang)*speed*rand(20,70), vy:Math.sin(ang)*speed*rand(20,70),
      life:rand(0.3,0.7), maxLife:0.7, color
    });
  }

  function triggerShake(mag, time){
    shakeMag = Math.max(shakeMag, mag); shakeTime = Math.max(shakeTime, time);
  }

  // ---------- Game flow ----------
  function resetGame(){
    score = 0; wave = 1; lives = 3; comboCount = 0; comboTimer = 0;
    overdriveTimer = 0; spawnTimer = 0; spawnInterval = 1.0; orbTimer = 8; elapsed = 0; invuln = 2.0;
    sameColorStreak = 0; overloadTimer = 0; overloadWarn = 0; boss = null; lastBossWave = 0;
    player.x = W/2; player.y = H-90; player.polarity = 'blue'; player.cooldown = 0;
    bullets = []; enemies = []; particles = []; orbs = []; enemyBullets = [];
    updateHud();
  }
  function startGame(){
    resetGame();
    state = 'playing';
    document.getElementById('titleOverlay').classList.add('hidden');
    document.getElementById('overOverlay').classList.add('hidden');
  }
  function endGame(){
    state = 'over';
    sfx.gameover();
    if(score > highScore) highScore = score;
    document.getElementById('finalScore').textContent = 'SCORE ' + pad(score);
    document.getElementById('highScoreLine').textContent = 'HIGH SCORE ' + pad(highScore);
    document.getElementById('overOverlay').classList.remove('hidden');
    triggerShake(10, 0.4);
  }

  function pad(n){ return String(Math.floor(n)).padStart(6,'0'); }

  function updateHud(){
    document.getElementById('scoreVal').textContent = pad(score);
    document.getElementById('highVal').textContent = pad(Math.max(highScore, score));
    document.getElementById('waveVal').textContent = 'WAVE ' + wave;
    const livesEl = document.getElementById('lives');
    livesEl.innerHTML = '';
    for(let i=0;i<3;i++){
      const d = document.createElement('div');
      d.className = 'life-dot' + (i < lives ? '' : ' dead');
      livesEl.appendChild(d);
    }
    const comboEl = document.getElementById('comboVal');
    if(comboCount >= 2){
      comboEl.textContent = 'COMBO x' + Math.min(comboCount, 99);
      comboEl.classList.add('show');
    } else {
      comboEl.classList.remove('show');
    }
  }

  // ---------- Spawning ----------
  function spawnEnemy(forceColor){
    let color = forceColor || (Math.random() < 0.5 ? 'blue' : 'pink');
    // overload surge floods the screen with the color you AREN'T currently able to hit
    if(!forceColor && overloadTimer > 0 && Math.random() < 0.75){
      color = player.polarity === 'blue' ? 'pink' : 'blue';
    }
    const roll = Math.random();
    let type;
    if(wave < 3)      type = roll<0.8 ? 'straight' : 'sine';
    else if(wave < 5) type = roll<0.5 ? 'straight' : (roll<0.8 ? 'sine' : 'homing');
    else              type = roll<0.35 ? 'straight' : (roll<0.6 ? 'sine' : (roll<0.85 ? 'homing' : 'shooter'));
    const size = rand(18,26);
    enemies.push({
      x: rand(size, W-size), y: -size,
      vy: (rand(70,100) + wave*11) * (type==='shooter' ? 0.6 : 1),
      vx: 0,
      color, type, size,
      phase: Math.random()*Math.PI*2,
      shootTimer: rand(0.6,1.4),
      baseX: 0
    });
  }

  function spawnOrb(){
    orbs.push({ x: rand(40, W-40), y: -20, vy: 90, r: 12, spin:0 });
  }

  // ---------- Update ----------
  function update(dt){
    elapsed += dt;
    if(shakeTime > 0) shakeTime -= dt; else shakeMag = 0;

    // difficulty ramp — waves arrive faster and hit harder as the run goes on
    wave = 1 + Math.floor(elapsed / 16);
    spawnInterval = Math.max(0.22, 1.0 - wave*0.085);

    if(state !== 'playing'){
      updateStarsOnly(dt);
      return;
    }

    if(invuln > 0) invuln -= dt;
    if(overdriveTimer > 0) overdriveTimer -= dt;

    // overload warning -> surge: camping one polarity floods you with the other color
    if(overloadWarn > 0){
      overloadWarn -= dt;
      if(overloadWarn <= 0){
        overloadTimer = 4;
        sameColorStreak = 0;
        triggerShake(4, 0.2);
      }
    }
    if(overloadTimer > 0) overloadTimer -= dt;

    // boss every 5 waves, one at a time
    if(wave % 5 === 0 && wave !== lastBossWave && !boss){
      lastBossWave = wave;
      spawnBoss();
    }

    // player movement
    let dx = 0;
    if(moveLeft || keys['arrowleft'] || keys['a']) dx -= 1;
    if(moveRight || keys['arrowright'] || keys['d']) dx += 1;
    player.x += dx * player.speed * dt;
    player.x = Math.max(20, Math.min(W-20, player.x));

    let dy = 0;
    if(keys['arrowup'] || keys['w']) dy -= 1;
    if(keys['arrowdown'] || keys['s']) dy += 1;
    player.y += dy * player.speed * dt;
    player.y = Math.max(70, Math.min(H-30, player.y));

    // fire
    player.cooldown -= dt;
    if(firing && player.cooldown <= 0){
      player.cooldown = player.fireRate;
      bullets.push({ x:player.x, y:player.y-18, vy:-520, color: player.polarity });
      sfx.shoot();
    }

    // combo decay
    if(comboTimer > 0){
      comboTimer -= dt;
      if(comboTimer <= 0){ comboCount = 0; updateHud(); }
    }

    // spawn (thinner grunt spawns while a boss is up, so it's a real set-piece not a swarm)
    spawnTimer -= dt;
    if(spawnTimer <= 0){
      spawnTimer = boss ? spawnInterval*2.2 : spawnInterval;
      spawnEnemy();
    }
    orbTimer -= dt;
    if(orbTimer <= 0){
      orbTimer = rand(12,18);
      spawnOrb();
    }

    // bullets
    for(let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.y += b.vy*dt;
      if(b.y < -10) bullets.splice(i,1);
    }

    // enemies
    for(let i=enemies.length-1;i>=0;i--){
      const en = enemies[i];
      en.y += en.vy*dt;
      if(en.type === 'sine'){
        en.phase += dt*2.4;
        en.x += Math.sin(en.phase)*1.6;
      } else if(en.type === 'homing'){
        const targetDx = player.x - en.x;
        en.x += Math.sign(targetDx) * Math.min(Math.abs(targetDx), 40*dt);
      } else if(en.type === 'shooter'){
        en.shootTimer -= dt;
        if(en.shootTimer <= 0 && en.y > 0){
          en.shootTimer = rand(1.1, 1.6);
          const ang = Math.atan2(player.y-en.y, player.x-en.x);
          enemyBullets.push({
            x:en.x, y:en.y, vx:Math.cos(ang)*160, vy:Math.sin(ang)*160,
            color: en.color
          });
          sfx.shoot();
        }
      }
      en.x = Math.max(en.size, Math.min(W-en.size, en.x));

      if(en.y - en.size > H){ enemies.splice(i,1); continue; }

      // bullet collisions
      const vulnerable = overdriveTimer > 0 || en.color === player.polarity;
      if(vulnerable){
        for(let j=bullets.length-1;j>=0;j--){
          const b = bullets[j];
          if(overdriveTimer <=0 && b.color !== en.color) continue;
          if(dist2(b.x,b.y,en.x,en.y) < (en.size+6)*(en.size+6)){
            bullets.splice(j,1);
            enemies.splice(i,1);
            killEnemy(en);
            break;
          }
        }
      }
      if(!enemies.includes(en)) continue;

      // player collision
      if(invuln <= 0 && dist2(player.x,player.y,en.x,en.y) < (en.size+13)*(en.size+13)){
        enemies.splice(i,1);
        playerHit();
      }
    }

    // enemy bullets — always dangerous, polarity doesn't protect you from these
    for(let i=enemyBullets.length-1;i>=0;i--){
      const b = enemyBullets[i];
      b.x += b.vx*dt; b.y += b.vy*dt;
      if(b.y > H+20 || b.y < -20 || b.x < -20 || b.x > W+20){ enemyBullets.splice(i,1); continue; }
      if(invuln <= 0 && dist2(b.x,b.y,player.x,player.y) < 12*12){
        enemyBullets.splice(i,1);
        playerHit();
      }
    }

    // boss
    if(boss){
      boss.x += boss.dir * boss.speed * dt;
      if(boss.x < boss.size+10 || boss.x > W-boss.size-10) boss.dir *= -1;
      if(boss.y < boss.targetY) boss.y += 40*dt;

      boss.phaseTimer -= dt;
      if(boss.phaseTimer <= 0){
        boss.phaseTimer = 3.2;
        boss.polarity = boss.polarity === 'blue' ? 'pink' : 'blue';
        for(let k=0;k<14;k++) spawnParticle(boss.x, boss.y, boss.polarity==='blue'?COLORS.blue:COLORS.pink, 3);
      }

      boss.shootTimer -= dt;
      if(boss.shootTimer <= 0 && boss.y >= boss.targetY){
        boss.shootTimer = 1.7;
        for(let s=-1; s<=1; s++){
          const ang = Math.atan2(player.y-boss.y, player.x-boss.x) + s*0.28;
          enemyBullets.push({ x:boss.x, y:boss.y, vx:Math.cos(ang)*180, vy:Math.sin(ang)*180, color: boss.polarity });
        }
        sfx.shoot();
      }

      // bullets hitting boss
      const bossVulnerable = overdriveTimer > 0 || boss.polarity === player.polarity;
      if(bossVulnerable){
        for(let j=bullets.length-1;j>=0;j--){
          const b = bullets[j];
          if(overdriveTimer<=0 && b.color !== boss.polarity) continue;
          if(dist2(b.x,b.y,boss.x,boss.y) < (boss.size+8)*(boss.size+8)){
            bullets.splice(j,1);
            boss.hp--;
            sfx.kill();
            for(let k=0;k<6;k++) spawnParticle(b.x,b.y, boss.polarity==='blue'?COLORS.blue:COLORS.pink, 2);
            triggerShake(2,0.06);
            if(boss.hp <= 0){
              score += 1500;
              overdriveTimer = 4;
              comboCount = 0; comboTimer = 0;
              for(let k=0;k<40;k++) spawnParticle(boss.x, boss.y, COLORS.gold, 4);
              triggerShake(12, 0.5);
              boss = null;
              updateHud();
            }
            break;
          }
        }
      }
      // boss body collision
      if(boss && invuln <= 0 && dist2(player.x,player.y,boss.x,boss.y) < (boss.size+13)*(boss.size+13)){
        playerHit();
      }
    }

    // orbs
    for(let i=orbs.length-1;i>=0;i--){
      const o = orbs[i];
      o.y += o.vy*dt; o.spin += dt*4;
      if(o.y - o.r > H){ orbs.splice(i,1); continue; }
      if(dist2(player.x,player.y,o.x,o.y) < (o.r+16)*(o.r+16)){
        orbs.splice(i,1);
        overdriveTimer = 5;
        score += 250;
        sfx.power();
        for(let k=0;k<18;k++) spawnParticle(o.x,o.y,COLORS.gold,3);
        updateHud();
      }
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.life -= dt;
      if(p.life <= 0){ particles.splice(i,1); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }

    updateStarsOnly(dt);
  }

  function updateStarsOnly(dt){
    for(const s of stars){
      s.y += s.s*dt;
      s.tw += dt*3;
      if(s.y > H){ s.y = -2; s.x = Math.random()*W; }
    }
  }

  function killEnemy(en){
    comboCount++;
    comboTimer = 1.5;
    const mult = Math.min(1 + Math.floor(comboCount/2)*0.5, 8);
    score += Math.round(60 * mult);
    sfx.kill();
    const col = en.color === 'blue' ? COLORS.blue : COLORS.pink;
    for(let k=0;k<10;k++) spawnParticle(en.x, en.y, col, 2.2);
    triggerShake(2, 0.08);

    // camping one polarity too long triggers a warning, then a surge of the opposite color
    if(overloadTimer <= 0 && overloadWarn <= 0){
      sameColorStreak++;
      if(sameColorStreak >= OVERLOAD_THRESHOLD){
        overloadWarn = 0.9;
        sfx.wrongHit();
      }
    }
    updateHud();
  }

  function spawnBoss(){
    boss = {
      x: W/2, y: -60, targetY: 130,
      dir: 1, speed: 70 + wave*4,
      size: 34, hp: 6 + Math.floor(wave/5)*2, maxHp: 6 + Math.floor(wave/5)*2,
      polarity: Math.random()<0.5 ? 'blue' : 'pink',
      phaseTimer: 3.2, shootTimer: 2
    };
    enemies = enemies.filter(en => en.type !== 'shooter' || Math.random()<0.3);
    triggerShake(6, 0.3);
  }

  function playerHit(){
    lives--;
    invuln = Math.max(0.7, 1.6 - wave*0.05);
    comboCount = 0; comboTimer = 0; sameColorStreak = 0;
    sfx.wrongHit();
    triggerShake(8, 0.3);
    for(let k=0;k<16;k++) spawnParticle(player.x, player.y, COLORS.red, 3);
    updateHud();
    if(lives <= 0){
      endGame();
    }
  }

  // ---------- Draw ----------
  function drawStars(){
    for(const s of stars){
      const alpha = 0.4 + Math.sin(s.tw)*0.3;
      ctx.fillStyle = `rgba(180,230,255,${Math.max(0.1,alpha)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawGrid(){
    const horizon = H - 60;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,240,255,0.18)';
    ctx.lineWidth = 1;
    for(let i=0;i<=10;i++){
      const t = i/10;
      const y = horizon + t*60;
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(W,y);
      ctx.stroke();
    }
    const vanishX = W/2;
    for(let i=-6;i<=6;i++){
      ctx.beginPath();
      ctx.moveTo(vanishX + i*70, H);
      ctx.lineTo(vanishX + i*8, horizon);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(){
    if(invuln > 0 && Math.floor(invuln*12)%2===0) return; // flicker
    const col = player.polarity === 'blue' ? COLORS.blue : COLORS.pink;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowColor = col;
    ctx.shadowBlur = overdriveTimer>0 ? 26 : 16;
    if(overdriveTimer > 0 && Math.floor(elapsed*10)%2===0){
      ctx.shadowColor = COLORS.gold;
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0,-18);
    ctx.lineTo(14,16);
    ctx.lineTo(0,9);
    ctx.lineTo(-14,16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#04121a';
    ctx.beginPath();
    ctx.arc(0,-2,4,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawBullets(){
    for(const b of bullets){
      const col = b.color === 'blue' ? COLORS.blue : COLORS.pink;
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.fillRect(b.x-2, b.y-8, 4, 14);
      ctx.restore();
    }
  }

  function drawEnemies(){
    for(const en of enemies){
      const matched = overdriveTimer>0 || en.color === player.polarity;
      const col = en.color === 'blue' ? COLORS.blue : COLORS.pink;
      ctx.save();
      ctx.translate(en.x, en.y);
      ctx.shadowColor = col;
      ctx.shadowBlur = matched ? 14 : 6;
      ctx.globalAlpha = matched ? 1 : 0.55;
      ctx.strokeStyle = col;
      ctx.lineWidth = matched ? 2.5 : 1.5;
      ctx.beginPath();
      const spikes = 6;
      for(let i=0;i<spikes;i++){
        const a = (i/spikes)*Math.PI*2;
        const r = en.size * (i%2===0?1:0.6);
        const px = Math.cos(a)*r, py = Math.sin(a)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      if(matched){ ctx.fillStyle = col+'22'; ctx.fill(); }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawOrbs(){
    for(const o of orbs){
      ctx.save();
      ctx.translate(o.x,o.y);
      ctx.rotate(o.spin);
      ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 16;
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0,0,o.r,0,Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,204,51,0.25)';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(){
    for(const p of particles){
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life/p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.fillRect(p.x-1.5, p.y-1.5, 3, 3);
      ctx.restore();
    }
  }

  function drawEnemyBullets(){
    for(const b of enemyBullets){
      const col = b.color === 'blue' ? COLORS.blue : COLORS.pink;
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0,-5); ctx.lineTo(5,0); ctx.lineTo(0,5); ctx.lineTo(-5,0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawBoss(){
    if(!boss) return;
    const col = boss.polarity === 'blue' ? COLORS.blue : COLORS.pink;
    const flashing = boss.phaseTimer < 0.5;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.shadowColor = flashing ? COLORS.white : col;
    ctx.shadowBlur = flashing ? 22 : 16;
    ctx.strokeStyle = flashing ? COLORS.white : col;
    ctx.fillStyle = col + '22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const spikes = 10;
    for(let i=0;i<spikes;i++){
      const a = (i/spikes)*Math.PI*2;
      const r = boss.size * (i%2===0?1:0.68);
      const px = Math.cos(a)*r, py = Math.sin(a)*r;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // hp bar
    ctx.save();
    const barW = 120, barX = W/2-barW/2, barY = boss.y - boss.size - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.fillRect(barX, barY, barW*Math.max(0,boss.hp/boss.maxHp), 6);
    ctx.restore();
  }

  function drawOverloadBanner(){
    if(overloadWarn > 0 || overloadTimer > 0){
      ctx.save();
      ctx.font = "8px 'Press Start 2P'";
      ctx.fillStyle = COLORS.red;
      ctx.shadowColor = COLORS.red; ctx.shadowBlur = 10;
      ctx.textAlign = 'center';
      const msg = overloadTimer > 0 ? 'SURGE!' : 'OVERLOAD WARNING';
      if(Math.floor(elapsed*8)%2===0) ctx.fillText(msg, W/2, 78);
      ctx.restore();
    }
  }

  function drawOverdriveBanner(){
    if(overdriveTimer > 0){
      ctx.save();
      ctx.font = "8px 'Press Start 2P'";
      ctx.fillStyle = COLORS.gold;
      ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 10;
      ctx.textAlign = 'center';
      ctx.fillText('OVERDRIVE', W/2, 60);
      ctx.restore();
    }
  }

  function render(){
    ctx.save();
    ctx.clearRect(0,0,W,H);

    // background gradient
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#020208');
    grad.addColorStop(1,'#050512');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    // shake
    if(shakeTime > 0){
      const mag = shakeMag * (shakeTime>0?1:0);
      ctx.translate(rand(-mag,mag), rand(-mag,mag));
    }

    drawStars();
    drawGrid();
    drawOrbs();
    drawEnemies();
    drawBoss();
    drawBullets();
    drawEnemyBullets();
    drawParticles();
    if(state === 'playing') drawPlayer();
    drawOverdriveBanner();
    drawOverloadBanner();

    ctx.restore();
  }

  // ---------- Loop ----------
  let lastTime = performance.now();
  function loop(now){
    let dt = (now - lastTime)/1000;
    lastTime = now;
    dt = Math.min(dt, 0.05);
    update(dt);
    render();
    if(state === 'playing') updateHud();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  document.getElementById('titleOverlay').addEventListener('pointerdown', ()=>{ unlockAudio(); startGame(); });
  document.getElementById('overOverlay').addEventListener('pointerdown', ()=>{ unlockAudio(); startGame(); });

  updateHud();
})();
