/**
 * LUDO Family - Client (robust for Arena preview / proxies)
 */
(function () {
  'use strict';

  // ---- DOM helpers ----
  const $ = (sel) => document.querySelector(sel);
  const on = (node, ev, fn) => node && node.addEventListener(ev, fn);

  const screens = {
    home: $('#screen-home'),
    lobby: $('#screen-lobby'),
    game: $('#screen-game')
  };

  const ui = {
    playerName: $('#player-name'),
    joinCode: $('#join-code'),
    btnSolo: $('#btn-solo'),
    btnCreate: $('#btn-create'),
    btnJoin: $('#btn-join'),
    lobbyCode: $('#lobby-code'),
    lobbyPlayers: $('#lobby-players'),
    lobbyNote: $('#lobby-note'),
    lobbySteps: $('#lobby-steps'),
    btnCopy: $('#btn-copy-code'),
    btnShare: $('#btn-share-code'),
    inviteBox: $('#invite-box'),
    inviteLinkInput: $('#invite-link-input'),
    inviteCodeText: $('#invite-code-text'),
    btnCopyLinkOnly: $('#btn-copy-link-only'),
    btnCopyCodeOnly: $('#btn-copy-code-only'),
    publicPlayBanner: $('#public-play-banner'),
    publicPlayUrl: $('#public-play-url'),
    btnCopyPublicUrl: $('#btn-copy-public-url'),
    btnAddBot: $('#btn-add-bot'),
    btnQuickStart: $('#btn-quick-start'),
    btnStart: $('#btn-start'),
    btnLeaveLobby: $('#btn-leave-lobby'),
    board: $('#board'),
    stations: {
      green: $('#station-green'),
      red: $('#station-red'),
      blue: $('#station-blue'),
      yellow: $('#station-yellow')
    },
    gameMessage: $('#game-message'),
    hintLine: $('#hint-line'),
    soundPanel: $('#sound-panel'),
    sfxDice: $('#sfx-dice'),
    sfxTokens: $('#sfx-tokens'),
    gameCode: $('#game-code'),
    chatPanel: $('#chat-panel'),
    chatMessages: $('#chat-messages'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    btnChatToggle: $('#btn-chat-toggle'),
    btnChatClose: $('#btn-chat-close'),
    menuOverlay: $('#menu-overlay'),
    btnPause: $('#btn-pause-menu'),
    btnResume: $('#btn-resume'),
    btnLeaveGame: $('#btn-leave-game'),
    winnerOverlay: $('#winner-overlay'),
    winnerTitle: $('#winner-title'),
    winnerSub: $('#winner-sub'),
    btnBackHome: $('#btn-back-home'),
    toast: $('#toast'),
    connBanner: null
  };

  // Connection banner
  (function makeBanner() {
    const b = document.createElement('div');
    b.id = 'conn-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px 12px;text-align:center;font-weight:800;font-size:13px;font-family:Nunito,system-ui,sans-serif;display:none;';
    document.body.appendChild(b);
    ui.connBanner = b;
  })();

  function setConnBanner(text, kind) {
    if (!ui.connBanner) return;
    if (!text) {
      ui.connBanner.style.display = 'none';
      return;
    }
    ui.connBanner.style.display = 'block';
    ui.connBanner.textContent = text;
    ui.connBanner.style.background = kind === 'ok' ? '#c8e6c9' : kind === 'err' ? '#ffcdd2' : '#fff9c4';
    ui.connBanner.style.color = kind === 'ok' ? '#1b5e20' : kind === 'err' ? '#b71c1c' : '#f57f17';
  }


  // ---- Dice roll SFX (procedural table tumble via Web Audio) ----
  // Sounds like a plastic/wood die thrown onto a table: rattling contacts that
  // slow down, then a final soft thud when it settles face-up.
  // Sound preferences (persist across sessions)
  const SoundPrefs = {
    dice: localStorage.getItem('ludoSfxDice') !== '0',
    tokens: localStorage.getItem('ludoSfxTokens') !== '0',
    setDice(on) {
      this.dice = !!on;
      try { localStorage.setItem('ludoSfxDice', on ? '1' : '0'); } catch (_) {}
    },
    setTokens(on) {
      this.tokens = !!on;
      try { localStorage.setItem('ludoSfxTokens', on ? '1' : '0'); } catch (_) {}
    }
  };

  const DiceSFX = (function () {
    let ctx = null;
    let master = null;
    let unlocked = false;
    let activeNodes = [];

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // Bright metal/crystal bus: air, presence, light body
      master = ctx.createGain();
      master.gain.value = 0.85;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 2800;
      highShelf.gain.value = 5.5;
      const crystalPeak = ctx.createBiquadFilter();
      crystalPeak.type = 'peaking';
      crystalPeak.frequency.value = 4200;
      crystalPeak.Q.value = 1.4;
      crystalPeak.gain.value = 4.2;
      const metalPeak = ctx.createBiquadFilter();
      metalPeak.type = 'peaking';
      metalPeak.frequency.value = 1650;
      metalPeak.Q.value = 1.1;
      metalPeak.gain.value = 3.0;
      const lowCut = ctx.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.value = 90;
      lowCut.Q.value = 0.7;
      master.connect(lowCut);
      lowCut.connect(metalPeak);
      metalPeak.connect(crystalPeak);
      crystalPeak.connect(highShelf);
      highShelf.connect(ctx.destination);
      return ctx;
    }

    function unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') {
        c.resume().catch(function () {});
      }
      if (!unlocked) {
        try {
          const o = c.createOscillator();
          const g = c.createGain();
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(master);
          o.start();
          o.stop(c.currentTime + 0.02);
          unlocked = true;
        } catch (e) { /* ignore */ }
      }
    }

    function noiseBuffer(duration) {
      const c = ensure();
      if (!c) return null;
      const len = Math.max(1, Math.floor(c.sampleRate * duration));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        // Brighter white-ish noise for metallic scrapes / glass ticks
        data[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.random());
      }
      return buf;
    }

    function stopAll() {
      activeNodes.forEach(function (n) {
        try { n.stop(); } catch (e) { /* ignore */ }
        try { n.disconnect(); } catch (e2) { /* ignore */ }
      });
      activeNodes = [];
    }

    function track(node) {
      activeNodes.push(node);
      return node;
    }

    /**
     * Plastic die click — hard hollow shell, short decay (not metal/glass).
     * power 0..1, brightness 0..1 (mid-high click sheen).
     */
    function impact(when, power, brightness) {
      const c = ensure();
      if (!c || !master) return;

      const p = Math.max(0.05, Math.min(1, power));
      const b = Math.max(0.2, Math.min(1, brightness == null ? 0.7 : brightness));
      const detune = 0.94 + Math.random() * 0.12;

      // Hollow plastic body (square/triangle, quick mute)
      const bodyF = (340 + p * 120 + b * 160) * detune;
      const modes = [
        { mult: 1.0, type: 'square', amp: 0.3, decay: 0.045 + p * 0.03 },
        { mult: 2.1, type: 'triangle', amp: 0.16, decay: 0.035 + p * 0.02 },
        { mult: 3.4, type: 'sine', amp: 0.08, decay: 0.028 + p * 0.015 }
      ];
      modes.forEach(function (m) {
        try {
          const osc = c.createOscillator();
          const g = c.createGain();
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2200 + b * 900;
          osc.type = m.type;
          const f0 = bodyF * m.mult;
          osc.frequency.setValueAtTime(f0 * (1.1 + p * 0.12), when);
          osc.frequency.exponentialRampToValueAtTime(Math.max(90, f0 * 0.55), when + m.decay * 0.9);
          g.gain.setValueAtTime(0.0001, when);
          g.gain.exponentialRampToValueAtTime(m.amp * p, when + 0.0012);
          g.gain.exponentialRampToValueAtTime(0.0001, when + m.decay);
          osc.connect(lp);
          lp.connect(g);
          g.connect(master);
          osc.start(when);
          osc.stop(when + m.decay + 0.03);
          track(osc);
        } catch (e) { /* ignore */ }
      });

      // Short hard plastic tip click
      try {
        const tip = c.createOscillator();
        const tg = c.createGain();
        tip.type = 'square';
        const tf = 900 + b * 700 + p * 200;
        tip.frequency.setValueAtTime(tf, when);
        tip.frequency.exponentialRampToValueAtTime(tf * 0.45, when + 0.028);
        tg.gain.setValueAtTime(0.0001, when);
        tg.gain.exponentialRampToValueAtTime(0.14 * p, when + 0.0008);
        tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
        const tipLp = c.createBiquadFilter();
        tipLp.type = 'lowpass';
        tipLp.frequency.value = 3200;
        tip.connect(tipLp);
        tipLp.connect(tg);
        tg.connect(master);
        tip.start(when);
        tip.stop(when + 0.04);
        track(tip);
      } catch (e2) { /* ignore */ }

      // Plastic edge scrape (mid band noise, not glassy)
      const buf = noiseBuffer(0.045 + p * 0.03);
      if (buf) {
        try {
          const src = c.createBufferSource();
          src.buffer = buf;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1100 + b * 900 + p * 250;
          bp.Q.value = 1.0 + p * 0.35;
          const hp = c.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 450;
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 3800;
          const ng = c.createGain();
          ng.gain.setValueAtTime(0.0001, when);
          ng.gain.exponentialRampToValueAtTime(0.4 * p, when + 0.0009);
          ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.022 + p * 0.02);
          src.connect(hp);
          hp.connect(bp);
          bp.connect(lp);
          lp.connect(ng);
          ng.connect(master);
          src.start(when);
          src.stop(when + 0.08);
          track(src);
        } catch (e3) { /* ignore */ }
      }
    }

    /**
     * Plastic slot-reel roll: hard plastic ticks that slow, soft plastic settle.
     * (Step / capture / finish stay metal-crystal as before.)
     */
    function playRoll(spinMs) {
      if (!SoundPrefs.dice) return function () {};
      const c = ensure();
      if (!c) return function () {};
      unlock();
      stopAll();

      const start = c.currentTime + 0.02;
      const duration = Math.max(0.8, (spinMs || 1700) / 1000);

      // Initial plastic clack
      impact(start, 1.0, 0.78);
      impact(start + 0.05, 0.55, 0.65);

      // Fast plastic ticks (slot reel), spacing grows as it slows
      let t = 0.09;
      let gap = 0.04;
      let n = 0;
      while (t < duration - 0.2 && n < 34) {
        const progress = t / duration;
        const power = 0.58 * (1 - progress * 0.4) * (0.78 + 0.22 * Math.random());
        const bright = 0.72 - progress * 0.25 + Math.random() * 0.1;
        const jitter = (Math.random() - 0.5) * gap * 0.28;
        impact(start + t + jitter, power, bright);
        if (Math.random() > 0.68 && gap > 0.055) {
          impact(start + t + jitter + gap * 0.22, power * 0.32, bright * 0.9);
        }
        gap = gap * (1.075 + Math.random() * 0.05) + 0.007;
        t += gap;
        n++;
      }

      // Final plastic settle (no metal ring)
      const land = start + duration;
      impact(land - 0.035, 0.65, 0.55);
      impact(land + 0.02, 0.95, 0.48);

      // Short hollow plastic body after stop (not ringing metal)
      try {
        const body = c.createOscillator();
        const body2 = c.createOscillator();
        const bg = c.createGain();
        const bg2 = c.createGain();
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        body.type = 'triangle';
        body2.type = 'square';
        body.frequency.setValueAtTime(280, land);
        body.frequency.exponentialRampToValueAtTime(140, land + 0.16);
        body2.frequency.setValueAtTime(520, land);
        body2.frequency.exponentialRampToValueAtTime(220, land + 0.1);
        bg.gain.setValueAtTime(0.0001, land);
        bg.gain.exponentialRampToValueAtTime(0.16, land + 0.008);
        bg.gain.exponentialRampToValueAtTime(0.0001, land + 0.18);
        bg2.gain.setValueAtTime(0.0001, land);
        bg2.gain.exponentialRampToValueAtTime(0.07, land + 0.005);
        bg2.gain.exponentialRampToValueAtTime(0.0001, land + 0.1);
        body.connect(lp);
        lp.connect(bg);
        body2.connect(bg2);
        bg.connect(master);
        bg2.connect(master);
        body.start(land);
        body2.start(land);
        body.stop(land + 0.22);
        body2.stop(land + 0.12);
        track(body);
        track(body2);
      } catch (e) { /* ignore */ }

      return stopAll;
    }

    /**
     * Crystal/metal token hop (subtle, brighter on leave-home).
     */
    function playStep(isLeaveHome) {
      if (!SoundPrefs.tokens) return;
      const c = ensure();
      if (!c || !master) return;
      unlock();
      const when = c.currentTime + 0.001;
      const leave = !!isLeaveHome;
      const p = leave ? 0.7 : 0.52;
      const baseF = leave ? 980 : 760;

      try {
        // Metallic body ping
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseF * 1.12, when);
        osc.frequency.exponentialRampToValueAtTime(baseF * 0.65, when + 0.05);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.26 * p, when + 0.001);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
        osc.connect(g);
        g.connect(master);
        osc.start(when);
        osc.stop(when + 0.07);
        track(osc);

        // Crystal overtone
        const osc2 = c.createOscillator();
        const g2 = c.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseF * 2.85, when);
        osc2.frequency.exponentialRampToValueAtTime(baseF * 1.9, when + 0.04);
        g2.gain.setValueAtTime(0.0001, when);
        g2.gain.exponentialRampToValueAtTime((leave ? 0.16 : 0.11) * p, when + 0.0008);
        g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
        osc2.connect(g2);
        g2.connect(master);
        osc2.start(when);
        osc2.stop(when + 0.055);
        track(osc2);

        // Ultra-short glass tip
        const osc3 = c.createOscillator();
        const g3 = c.createGain();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(leave ? 3200 : 2600, when);
        osc3.frequency.exponentialRampToValueAtTime(1400, when + 0.025);
        g3.gain.setValueAtTime(0.0001, when);
        g3.gain.exponentialRampToValueAtTime(0.1 * p, when + 0.0006);
        g3.gain.exponentialRampToValueAtTime(0.0001, when + 0.028);
        osc3.connect(g3);
        g3.connect(master);
        osc3.start(when);
        osc3.stop(when + 0.04);
        track(osc3);
      } catch (e) { /* ignore */ }

      // Bright metal tip noise
      const buf = noiseBuffer(0.028);
      if (buf) {
        try {
          const src = c.createBufferSource();
          src.buffer = buf;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = leave ? 3600 : 2800;
          bp.Q.value = 1.3;
          const hp = c.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 1200;
          const ng = c.createGain();
          ng.gain.setValueAtTime(0.0001, when);
          ng.gain.exponentialRampToValueAtTime((leave ? 0.32 : 0.22) * p, when + 0.0006);
          ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.018);
          src.connect(hp);
          hp.connect(bp);
          bp.connect(ng);
          ng.connect(master);
          src.start(when);
          src.stop(when + 0.03);
          track(src);
        } catch (e2) { /* ignore */ }
      }
    }

    /**
     * Capture sting — cartoon + crystalline sparkle.
     */
    function playCapture() {
      if (!SoundPrefs.tokens) return;
      const c = ensure();
      if (!c || !master) return;
      unlock();
      const when = c.currentTime + 0.01;

      const notes = [
        { f: 980, t: 0.00, d: 0.08, type: 'sine', amp: 0.28 },
        { f: 720, t: 0.06, d: 0.09, type: 'triangle', amp: 0.24 },
        { f: 540, t: 0.12, d: 0.1, type: 'sine', amp: 0.2 },
        { f: 360, t: 0.2, d: 0.14, type: 'sine', amp: 0.16 }
      ];
      notes.forEach(function (n) {
        try {
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = n.type;
          const t0 = when + n.t;
          osc.frequency.setValueAtTime(n.f * 1.06, t0);
          osc.frequency.exponentialRampToValueAtTime(Math.max(80, n.f * 0.6), t0 + n.d * 0.9);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(n.amp, t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
          osc.connect(g);
          g.connect(master);
          osc.start(t0);
          osc.stop(t0 + n.d + 0.03);
          track(osc);
        } catch (e) { /* ignore */ }
      });

      // Glass shatter-ish burst
      const buf = noiseBuffer(0.07);
      if (buf) {
        try {
          const src = c.createBufferSource();
          src.buffer = buf;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 2800;
          bp.Q.value = 0.9;
          const ng = c.createGain();
          ng.gain.setValueAtTime(0.0001, when);
          ng.gain.exponentialRampToValueAtTime(0.32, when + 0.003);
          ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(master);
          src.start(when);
          src.stop(when + 0.08);
          track(src);
        } catch (e2) { /* ignore */ }
      }

      // Crystal sparkle
      try {
        const tw = c.createOscillator();
        const tw2 = c.createOscillator();
        const tg = c.createGain();
        const tg2 = c.createGain();
        tw.type = 'sine';
        tw2.type = 'sine';
        tw.frequency.setValueAtTime(1800, when + 0.24);
        tw.frequency.exponentialRampToValueAtTime(2800, when + 0.36);
        tw2.frequency.setValueAtTime(3200, when + 0.28);
        tw2.frequency.exponentialRampToValueAtTime(4200, when + 0.4);
        tg.gain.setValueAtTime(0.0001, when + 0.24);
        tg.gain.exponentialRampToValueAtTime(0.14, when + 0.26);
        tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
        tg2.gain.setValueAtTime(0.0001, when + 0.28);
        tg2.gain.exponentialRampToValueAtTime(0.09, when + 0.3);
        tg2.gain.exponentialRampToValueAtTime(0.0001, when + 0.44);
        tw.connect(tg);
        tw2.connect(tg2);
        tg.connect(master);
        tg2.connect(master);
        tw.start(when + 0.24);
        tw2.start(when + 0.28);
        tw.stop(when + 0.46);
        tw2.stop(when + 0.48);
        track(tw);
        track(tw2);
      } catch (e3) { /* ignore */ }
    }

    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    });

    /**
     * Achievement / ovation when a token reaches the finish crown (meta).
     * Fanfare arpeggio + crowd-ish shimmer.
     */
    function playFinish() {
      if (!SoundPrefs.tokens) return;
      const c = ensure();
      if (!c || !master) return;
      unlock();
      const when = c.currentTime + 0.02;

      // Triumphant rising arpeggio (achievement unlock)
      const fanfare = [
        { f: 523.25, t: 0.00, d: 0.18, amp: 0.22 }, // C5
        { f: 659.25, t: 0.10, d: 0.18, amp: 0.24 }, // E5
        { f: 783.99, t: 0.20, d: 0.20, amp: 0.26 }, // G5
        { f: 1046.5, t: 0.32, d: 0.35, amp: 0.3 },  // C6
        { f: 1318.5, t: 0.42, d: 0.28, amp: 0.18 }  // E6 sparkle
      ];
      fanfare.forEach(function (n) {
        try {
          const osc = c.createOscillator();
          const osc2 = c.createOscillator();
          const g = c.createGain();
          const g2 = c.createGain();
          osc.type = 'triangle';
          osc2.type = 'sine';
          const t0 = when + n.t;
          osc.frequency.setValueAtTime(n.f, t0);
          osc2.frequency.setValueAtTime(n.f * 2.002, t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(n.amp, t0 + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
          g2.gain.setValueAtTime(0.0001, t0);
          g2.gain.exponentialRampToValueAtTime(n.amp * 0.35, t0 + 0.01);
          g2.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d * 0.85);
          osc.connect(g);
          osc2.connect(g2);
          g.connect(master);
          g2.connect(master);
          osc.start(t0);
          osc2.start(t0);
          osc.stop(t0 + n.d + 0.04);
          osc2.stop(t0 + n.d + 0.04);
          track(osc);
          track(osc2);
        } catch (e) { /* ignore */ }
      });

      // Soft "ovation" bed: filtered noise bursts like distant applause/cheer
      try {
        for (let i = 0; i < 10; i++) {
          const buf = noiseBuffer(0.12 + Math.random() * 0.08);
          if (!buf) continue;
          const src = c.createBufferSource();
          src.buffer = buf;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1200 + Math.random() * 1800;
          bp.Q.value = 0.55;
          const ng = c.createGain();
          const t0 = when + 0.08 + i * 0.07 + Math.random() * 0.04;
          const amp = 0.07 + Math.random() * 0.06;
          ng.gain.setValueAtTime(0.0001, t0);
          ng.gain.exponentialRampToValueAtTime(amp, t0 + 0.02);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(master);
          src.start(t0);
          src.stop(t0 + 0.2);
          track(src);
        }
      } catch (e2) { /* ignore */ }

      // Shimmering high crystals (sparkle of achievement)
      try {
        [1568, 2093, 2637, 3136].forEach(function (f, i) {
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'sine';
          const t0 = when + 0.35 + i * 0.06;
          osc.frequency.setValueAtTime(f, t0);
          osc.frequency.exponentialRampToValueAtTime(f * 1.06, t0 + 0.12);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.09 - i * 0.012, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
          osc.connect(g);
          g.connect(master);
          osc.start(t0);
          osc.stop(t0 + 0.25);
          track(osc);
        });
      } catch (e3) { /* ignore */ }

      // Warm sustain chord under the cheer
      try {
        [261.63, 329.63, 392.0].forEach(function (f, i) {
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, when + 0.05);
          g.gain.exponentialRampToValueAtTime(0.07 - i * 0.01, when + 0.12);
          g.gain.exponentialRampToValueAtTime(0.0001, when + 0.85);
          osc.connect(g);
          g.connect(master);
          osc.start(when + 0.05);
          osc.stop(when + 0.9);
          track(osc);
        });
      } catch (e4) { /* ignore */ }
    }

    return {
      unlock: unlock,
      playRoll: playRoll,
      playStep: playStep,
      playCapture: playCapture,
      playFinish: playFinish,
      stopAll: stopAll
    };
  })();

  // ---- State ----
  function getOrCreateClientId() {
    try {
      let id = localStorage.getItem('ludoClientId');
      if (id && /^[a-zA-Z0-9_-]{8,64}$/.test(id)) return id;
      id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('ludoClientId', id);
      return id;
    } catch (_) {
      return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  const state = {
    playerId: null,
    clientId: getOrCreateClientId(),
    room: null,
    name: localStorage.getItem('ludoName') || '',
    chatOpen: false,
    rolling: false,
    moving: false,
    lastAnimatedRoll: null,
    lastAnimatedMove: null,
    diceValues: {},
    busy: false
  };

  if (state.name && ui.playerName) ui.playerName.value = state.name;

  // Sync sound toggles with prefs
  if (ui.sfxDice) {
    ui.sfxDice.checked = SoundPrefs.dice;
    on(ui.sfxDice, 'change', () => {
      SoundPrefs.setDice(ui.sfxDice.checked);
      if (ui.sfxDice.checked) DiceSFX.unlock();
      else DiceSFX.stopAll();
    });
  }
  if (ui.sfxTokens) {
    ui.sfxTokens.checked = SoundPrefs.tokens;
    on(ui.sfxTokens, 'change', () => {
      SoundPrefs.setTokens(ui.sfxTokens.checked);
      if (ui.sfxTokens.checked) DiceSFX.unlock();
    });
  }

  function showScreen(name) {
    Object.keys(screens).forEach((k) => {
      if (screens[k]) screens[k].classList.toggle('active', k === name);
    });
  }

  function toast(msg, ms) {
    if (!ui.toast) return alert(msg);
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.add('hidden'), ms || 2800);
  }

  function colorLabel(c) {
    return { green: 'Verde', red: 'Rojo', blue: 'Azul', yellow: 'Amarillo' }[c] || c;
  }
  function colorHex(c) {
    return { green: '#7cb342', red: '#e53935', blue: '#42a5f5', yellow: '#fdd835' }[c] || '#999';
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function myId() {
    return state.playerId || state.clientId || (typeof socket !== 'undefined' && socket && socket.id) || null;
  }

  // Resolved public base for invites (tunnel / deploy). Filled async on boot.
  let publicBaseUrl = null;
  try {
    const saved = localStorage.getItem('ludoPublicBaseUrl');
    if (saved && /^https?:\/\//i.test(saved)) publicBaseUrl = saved.replace(/\/+$/, '');
  } catch (_) {}

  function isPrivateOrPreviewHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
    if (h.endsWith('.local')) return true;
    if (h.endsWith('.arena.site') || h.endsWith('.arena.ai')) return true;
    if (h.endsWith('.e2b.app') || h.endsWith('.e2b.dev')) return true;
    if (/^192\.168\.\d+\.\d+$/.test(h)) return false; // LAN ok if same wifi
    if (/^10\.\d+\.\d+\.\d+$/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return false;
    return false;
  }

  function looksLikePublicHttpUrl(s) {
    try {
      const u = new URL(String(s));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      if (!u.hostname || u.hostname === 'undefined' || u.hostname === 'null') return false;
      if (String(u.pathname || '').includes('undefined')) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function getPageBaseUrl() {
    try {
      const u = new URL(window.location.href);
      if (!u.hostname || u.hostname === 'undefined' || u.hostname === 'null') return null;
      // Broken Arena paths like /undefined
      if (/\bundefined\b/i.test(u.pathname || '')) {
        u.pathname = '/';
      }
      u.hash = '';
      u.search = '';
      // Normalize trailing file
      u.pathname = (u.pathname || '/').replace(/\/index\.html?$/i, '/');
      if (!u.pathname) u.pathname = '/';
      // origin + pathname without trailing junk
      let base = u.origin + (u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname);
      if (base.endsWith('/')) base = base.slice(0, -1);
      // If path is empty origin only
      if (!u.pathname || u.pathname === '/') base = u.origin;
      return base;
    } catch (_) {
      return null;
    }
  }

  function inviteBaseUrl() {
    // 1) Explicit public URL from server/tunnel (best for cross-device)
    if (publicBaseUrl && looksLikePublicHttpUrl(publicBaseUrl)) {
      return String(publicBaseUrl).replace(/\/+$/, '');
    }
    // 2) Current page — only if it is NOT an Arena/e2b preview host
    const page = getPageBaseUrl();
    if (page) {
      try {
        const host = new URL(page).hostname;
        if (!isPrivateOrPreviewHost(host) || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
          // Real deploy or LAN IP — usable for friends on same network / internet
          if (!String(page).includes('undefined')) return page.replace(/\/+$/, '');
        }
      } catch (_) {}
    }
    // 3) Last resort: page origin cleaned (may still be preview — UI will warn)
    if (page && !String(page).includes('undefined')) return page.replace(/\/+$/, '');
    return (window.location && window.location.origin && window.location.origin !== 'null')
      ? window.location.origin
      : '';
  }

  function inviteUrl(code) {
    const c = String(code || '').trim().toUpperCase();
    const base = inviteBaseUrl() || '';
    if (!base || !c) {
      return c ? ('/?room=' + encodeURIComponent(c)) : '';
    }
    try {
      const u = new URL(base.includes('://') ? base : ('https://' + base));
      // ensure no /undefined
      if (/undefined/i.test(u.pathname)) u.pathname = '/';
      u.hash = '';
      // reset search then set room
      u.search = '';
      u.searchParams.set('room', c);
      // Prefer clean root path for invites
      if (!u.pathname || u.pathname === '/' || /undefined/i.test(u.pathname)) {
        u.pathname = '/';
      }
      let out = u.toString();
      // Guard against literal "undefined" leaking in
      out = out.replace(/\/undefined(?=\/|\?|#|$)/gi, '/');
      out = out.replace(/undefined\./gi, '');
      return out;
    } catch (_) {
      const b = String(base).replace(/\/+$/, '').replace(/\/undefined$/i, '');
      return b + '/?room=' + encodeURIComponent(c);
    }
  }

  function inviteIsShareable() {
    try {
      const base = inviteBaseUrl();
      if (!base || /undefined/i.test(base)) return false;
      const host = new URL(base.includes('://') ? base : ('http://' + base)).hostname;
      if (host.endsWith('.arena.site') || host.endsWith('.arena.ai')) return false;
      if (host.endsWith('.e2b.app') || host.endsWith('.e2b.dev')) return false;
      if (host === 'localhost' || host === '127.0.0.1') return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  async function refreshPublicBaseUrl() {
    const apply = (url) => {
      if (!url || !looksLikePublicHttpUrl(url)) return false;
      let clean = String(url).trim().replace(/\/+$/, '');
      clean = clean.replace(/\/undefined$/i, '');
      publicBaseUrl = clean;
      try { localStorage.setItem('ludoPublicBaseUrl', clean); } catch (_) {}
      return true;
    };
    // Server env
    try {
      const r = await fetch('/api/public-url', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (apply(j && j.publicBaseUrl)) return publicBaseUrl;
      }
    } catch (_) {}
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (apply(j && j.publicBaseUrl)) return publicBaseUrl;
      }
    } catch (_) {}
    // Static file written at deploy/tunnel time
    try {
      const r = await fetch('/public-config.json?ts=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (apply(j && j.publicBaseUrl)) return publicBaseUrl;
      }
    } catch (_) {}
    return publicBaseUrl;
  }

  function inviteMessage(code) {
    const c = String(code || '').trim().toUpperCase();
    const link = inviteUrl(c);
    return (
      '¡Juguemos LUDO Family!\n' +
      'Código de sala: ' + c + '\n' +
      'Enlace directo: ' + link + '\n' +
      '(Abrí el enlace o entrá a la app y pegá el código)'
    );
  }

  /** Robust clipboard write — works in many iframes / HTTP / older mobile */
  async function copyText(text) {
    const value = String(text == null ? '' : text);
    if (!value) return false;

    // 1) Async Clipboard API (needs secure context + permission)
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* fall through */ }

    // 2) execCommand on a temporary textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (_) { /* fall through */ }

    // 3) Select the visible invite input if it matches
    try {
      if (ui.inviteLinkInput && ui.inviteLinkInput.value && value.indexOf(ui.inviteLinkInput.value) !== -1) {
        ui.inviteLinkInput.focus();
        ui.inviteLinkInput.select();
        ui.inviteLinkInput.setSelectionRange(0, ui.inviteLinkInput.value.length);
        if (document.execCommand && document.execCommand('copy')) return true;
      }
    } catch (_) { /* fall through */ }

    return false;
  }

  function showShareModal(text) {
    // Remove previous
    const old = document.getElementById('share-modal-backdrop');
    if (old) old.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'share-modal-backdrop';
    backdrop.className = 'share-modal-backdrop';
    backdrop.innerHTML =
      '<div class="share-modal" role="dialog" aria-modal="true" aria-label="Compartir sala">' +
      '<h3>Compartir sala</h3>' +
      '<p>Seleccioná el texto y copiálo (Ctrl+C / ⌘C), o usá <strong>Copiar</strong>.</p>' +
      '<textarea id="share-modal-text" readonly></textarea>' +
      '<div class="share-modal-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="close">Cerrar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-act="copy">📋 Copiar</button>' +
      '</div></div>';
    document.body.appendChild(backdrop);
    const ta = backdrop.querySelector('#share-modal-text');
    ta.value = text;
    setTimeout(() => {
      try {
        ta.focus();
        ta.select();
      } catch (_) {}
    }, 50);

    const close = () => { try { backdrop.remove(); } catch (_) {} };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('[data-act="close"]').addEventListener('click', close);
    backdrop.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      ta.focus();
      ta.select();
      const ok = await copyText(text);
      if (ok) {
        toast('¡Copiado!');
        close();
      } else {
        toast('Seleccioná el texto y copiá manualmente');
      }
    });
  }

  function updateInviteUI(room) {
    if (!room || !room.code) {
      if (ui.inviteBox) ui.inviteBox.hidden = true;
      return;
    }
    const code = String(room.code).toUpperCase();
    const link = inviteUrl(code);
    if (ui.inviteBox) ui.inviteBox.hidden = false;
    if (ui.inviteLinkInput) {
      ui.inviteLinkInput.value = link;
      ui.inviteLinkInput.classList.remove('copied');
    }
    if (ui.inviteCodeText) ui.inviteCodeText.textContent = code;
    if (ui.lobbyCode) {
      ui.lobbyCode.textContent = code;
      ui.lobbyCode.title = 'Tocá para copiar el código ' + code;
    }
    // Warning banner inside invite box
    let warn = document.getElementById('invite-share-warn');
    if (!warn && ui.inviteBox) {
      warn = document.createElement('p');
      warn.id = 'invite-share-warn';
      warn.className = 'invite-share-warn';
      ui.inviteBox.appendChild(warn);
    }
    if (warn) {
      if (inviteIsShareable()) {
        warn.hidden = false;
        warn.className = 'invite-share-warn ok';
        warn.innerHTML = '✅ Enlace <strong>público</strong>: tus amigos pueden abrirlo desde cualquier celular.';
      } else {
        warn.hidden = false;
        warn.className = 'invite-share-warn bad';
        warn.innerHTML = '⚠️ Este enlace es solo del preview de Arena y <strong>no funciona en otro celular</strong>. Usá el enlace público del túnel o desplegá la app. Mientras tanto, compartí el <strong>código</strong> si están en el mismo servidor.';
      }
    }
  }

  async function doCopyInvite(mode) {
    if (!state.room || !state.room.code) {
      toast('Todavía no hay sala');
      return;
    }
    const code = String(state.room.code).toUpperCase();
    const link = inviteUrl(code);
    let text;
    if (mode === 'code') text = code;
    else if (mode === 'link') text = link;
    else text = inviteMessage(code);

    const ok = await copyText(text);
    if (ok) {
      if (ui.inviteLinkInput) {
        ui.inviteLinkInput.classList.add('copied');
        setTimeout(() => ui.inviteLinkInput && ui.inviteLinkInput.classList.remove('copied'), 1200);
      }
      toast(
        mode === 'code' ? 'Código copiado: ' + code :
        mode === 'link' ? 'Enlace copiado' :
        'Invitación copiada (código + enlace)'
      );
      return true;
    }

    // Clipboard blocked (common in iframe / preview): show modal + select field
    if (mode === 'link' || mode === 'full' || !mode) {
      if (ui.inviteLinkInput) {
        try {
          ui.inviteLinkInput.focus();
          ui.inviteLinkInput.select();
          ui.inviteLinkInput.setSelectionRange(0, ui.inviteLinkInput.value.length);
        } catch (_) {}
      }
      showShareModal(text);
      toast('Portapapeles bloqueado — usá la ventana para copiar');
    } else {
      showShareModal(text);
      toast('No se pudo copiar automáticamente');
    }
    return false;
  }

  async function doShareInvite() {
    if (!state.room || !state.room.code) {
      toast('Todavía no hay sala');
      return;
    }
    const code = String(state.room.code).toUpperCase();
    const link = inviteUrl(code);
    const text = inviteMessage(code);

    // Native share sheet (mobile)
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'LUDO Family',
          text: '¡Juguemos LUDO Family! Código: ' + code,
          url: link
        });
        toast('Compartido');
        return;
      }
    } catch (e) {
      // user cancelled share
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
    }

    // Fallback: copy or modal
    await doCopyInvite('full');
  }

  function readRoomFromUrl() {
    try {
      const u = new URL(window.location.href);
      const q = (u.searchParams.get('room') || u.searchParams.get('code') || '').trim().toUpperCase();
      if (q) return q.slice(0, 5);
      if (u.hash && u.hash.length > 1) {
        const h = u.hash.replace(/^#/, '').trim().toUpperCase();
        if (/^[A-Z0-9]{4,5}$/.test(h)) return h;
      }
    } catch (_) {}
    return '';
  }
  function isHost(room) {
    const id = myId();
    return !!(room && id && room.hostId === id);
  }

  // ---- Socket with timeout helpers ----
  setConnBanner('Conectando al servidor…', 'wait');

  if (typeof io !== 'function') {
    setConnBanner('Error: no cargó Socket.IO. Recargá la página.', 'err');
    toast('Error cargando Socket.IO');
    return;
  }

  const socket = io({
    path: '/socket.io',
    // Same host as the page → works on localhost, LAN IP, and any public deploy URL
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    timeout: 20000,
    autoConnect: true,
    withCredentials: false,
    forceNew: false
  });

  function emitAck(event, data, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, error: 'Sin respuesta del servidor (timeout). ¿Está caído?' });
      }, timeoutMs || 8000);

      if (!socket.connected) {
        clearTimeout(t);
        resolve({ ok: false, error: 'No hay conexión con el servidor' });
        return;
      }

      try {
        socket.emit(event, data, (res) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(res || { ok: false, error: 'Respuesta vacía' });
        });
      } catch (e) {
        clearTimeout(t);
        resolve({ ok: false, error: e.message || 'Error de red' });
      }
    });
  }

  function waitConnected(ms) {
    if (socket.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms || 10000);
      socket.once('connect', () => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  function saveSession(room, playerId) {
    try {
      if (room && room.code) {
        localStorage.setItem('ludoLastRoom', room.code);
        localStorage.setItem('ludoLastPlayerId', playerId || state.clientId);
      }
    } catch (_) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem('ludoLastRoom');
      localStorage.removeItem('ludoLastPlayerId');
    } catch (_) {}
  }

  let rejoining = false;
  async function tryRejoinSavedRoom() {
    if (rejoining) return;
    if (state.room) return;
    let code = '';
    try { code = localStorage.getItem('ludoLastRoom') || ''; } catch (_) {}
    if (!code) return;
    rejoining = true;
    try {
      const res = await emitAck('room:rejoin', {
        code: code,
        clientId: state.clientId,
        name: getName()
      }, 8000);
      if (res && res.ok && res.room) {
        state.playerId = res.playerId || state.clientId;
        state.room = res.room;
        saveSession(res.room, state.playerId);
        if (res.room.status === 'playing' || res.room.game) enterGame(res.room, false);
        else {
          showScreen('lobby');
          renderLobby();
        }
        toast('Reconectado a la sala ' + res.room.code);
      } else {
        // Stale room — forget it
        clearSession();
      }
    } catch (_) {
      /* ignore */
    } finally {
      rejoining = false;
    }
  }

  socket.on('connect', () => {
    // Keep stable client id as playerId; socket.id is only transport
    if (!state.playerId) state.playerId = state.clientId;
    setConnBanner('Conectado ✓', 'ok');
    setTimeout(() => setConnBanner('', 'ok'), 1200);
    tryRejoinSavedRoom();
  });

  socket.on('connected', (payload) => {
    // Server may echo socket id; we still prefer our durable clientId once in a room
    if (!state.playerId) state.playerId = state.clientId || (payload && payload.playerId) || socket.id;
  });

  socket.on('disconnect', (reason) => {
    setConnBanner('Desconectado (' + reason + '). Reconectando…', 'err');
  });

  socket.on('connect_error', (err) => {
    setConnBanner('Error de conexión: ' + (err && err.message ? err.message : 'desconocido'), 'err');
  });

  socket.on('room:update', (room) => {
    if (!room) return;
    state.room = room;
    if (room.status === 'lobby') {
      showScreen('lobby');
      // Don't rebuild lobby UI while the player is typing their name
      const active = document.activeElement;
      if (active && active.classList && active.classList.contains('lobby-name-input')) {
        // Still refresh color selection / other players lightly
        const me = (room.players || []).find((p) => p.id === myId());
        if (me) {
          const dot = document.querySelector('.lobby-player.me .color-dot');
          if (dot) dot.style.background = colorHex(me.color);
          document.querySelectorAll('.lobby-player.me .color-swatch').forEach((btn) => {
            const c = btn.getAttribute('data-color');
            const taken = (room.players || []).some((p) => p.id !== me.id && p.color === c);
            btn.classList.toggle('selected', me.color === c);
            btn.disabled = taken;
            btn.classList.toggle('disabled', taken);
          });
        }
        return;
      }
      renderLobby();
      return;
    }
    if (room.status === 'playing' || room.game) {
      enterGame(room, false);
    }
  });

  socket.on('game:started', (room) => {
    enterGame(room, true);
  });

  socket.on('game:event', (ev) => {
    if (!ev) return;
    if (ev.type === 'roll' && ev.value) {
      maybeAnimateIncomingRoll(state.room, ev);
    } else if (ev.type === 'move') {
      // room:update usually arrives first with lastMove; this is a backup kick
      if (state.room && state.room.game) maybeAnimateIncomingMove(state.room, ev);
    }
  });

  socket.on('room:kicked', () => {
    toast('Te echaron de la sala');
    state.room = null;
    showScreen('home');
  });

  socket.on('chat:message', appendChat);

  function enterGame(room, announce) {
    if (!room) return;
    state.room = room;
    state.diceValues = state.diceValues || {};
    if (announce) {
      state.lastAnimatedRoll = null;
      state.lastAnimatedMove = null;
      state.rolling = false;
      state.moving = false;
    }
    showScreen('game');
    if (ui.winnerOverlay) ui.winnerOverlay.classList.add('hidden');
    try {
      if (state.rolling || state.moving) {
        if (ui.gameMessage && room.game) ui.gameMessage.textContent = room.game.message || '';
      } else if (room.game && maybeAnimateIncomingMove(room, null)) {
        // move animation started
      } else if (!state.rolling) {
        renderGame();
      }
      if (announce) toast('¡La partida comenzó!');
    } catch (e) {
      console.error('renderGame error', e);
      toast('Error al mostrar el tablero: ' + e.message);
    }
  }

  // ---- Home actions ----
  function getName() {
    const name = ((ui.playerName && ui.playerName.value) || '').trim() || 'Jugador';
    state.name = name;
    try { localStorage.setItem('ludoName', name); } catch (_) {}
    return name;
  }

  async function ensureOnline() {
    if (socket.connected) return true;
    setConnBanner('Conectando…', 'wait');
    const ok = await waitConnected(10000);
    if (!ok) {
      toast('No se pudo conectar al servidor. Recargá la página.');
      setConnBanner('Sin conexión', 'err');
    }
    return ok;
  }

  async function doCreateRoom() {
    const name = getName();
    const res = await emitAck('room:create', { name, maxPlayers: 4, clientId: state.clientId }, 8000);
    if (!res.ok) {
      toast(res.error || 'Error al crear sala');
      return null;
    }
    state.playerId = res.playerId || state.clientId || socket.id;
    if (res.room) saveSession(res.room, state.playerId);
    state.room = res.room;
    // Ensure we have the public tunnel URL for invites
    refreshPublicBaseUrl().then(() => {
      updatePublicPlayBanner();
      if (state.room) updateInviteUI(state.room);
    });
    return res.room;
  }

  // SOLO vs bots — one click
  on(ui.btnSolo, 'click', async () => {
    if (state.busy) return;
    state.busy = true;
    const btn = ui.btnSolo;
    const prev = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Conectando…';
    }
    try {
      if (!(await ensureOnline())) return;
      if (btn) btn.textContent = 'Creando sala…';
      const room = await doCreateRoom();
      if (!room) return;
      showScreen('lobby');
      renderLobby();
      if (btn) btn.textContent = 'Sumando bots…';
      // Single server call: fill bots + start
      const res = await emitAck('room:quickStart', { fillTo: 4, start: true }, 10000);
      if (!res.ok) {
        toast(res.error || 'No se pudo iniciar');
        renderLobby();
        return;
      }
      enterGame(res.room || state.room, true);
    } catch (e) {
      console.error(e);
      toast('Error: ' + (e.message || e));
    } finally {
      state.busy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || '⚡ Jugar solo vs bots';
      }
    }
  });

  // Create lobby only
  on(ui.btnCreate, 'click', async () => {
    if (state.busy) return;
    state.busy = true;
    if (ui.btnCreate) ui.btnCreate.disabled = true;
    try {
      if (!(await ensureOnline())) return;
      const room = await doCreateRoom();
      if (!room) return;
      showScreen('lobby');
      renderLobby();
      toast('Sala creada. Sumá un bot o compartí el código.');
    } finally {
      state.busy = false;
      if (ui.btnCreate) ui.btnCreate.disabled = false;
    }
  });

  async function joinRoom() {
    const name = getName();
    const code = ((ui.joinCode && ui.joinCode.value) || '').trim().toUpperCase();
    if (!code) return toast('Ingresá el código de sala');
    if (!(await ensureOnline())) return;
    if (ui.btnJoin) ui.btnJoin.disabled = true;
    try {
      const res = await emitAck('room:join', { code, name, clientId: state.clientId }, 8000);
      if (!res.ok) return toast(res.error || 'No se pudo unir');
      state.playerId = res.playerId || state.clientId || socket.id;
      if (res.room) saveSession(res.room, state.playerId);
      state.room = res.room;
      showScreen('lobby');
      renderLobby();
    } finally {
      if (ui.btnJoin) ui.btnJoin.disabled = false;
    }
  }
  on(ui.btnJoin, 'click', joinRoom);
  on(ui.joinCode, 'keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  // ---- Lobby ----
  function renderLobby() {
    const room = state.room;
    if (!room) return;
    if (ui.lobbyCode) ui.lobbyCode.textContent = room.code;
    updateInviteUI(room);

    const id = myId();
    const host = isHost(room);

    if (ui.lobbyPlayers) {
      const takenColors = new Set((room.players || []).map((p) => p.color));
      ui.lobbyPlayers.innerHTML = (room.players || []).map((p) => {
        const isMe = p.id === id;
        const canKick = host && !isMe && !p.isBot ? true : (host && !isMe);
        const canKickBot = host && p.isBot;
        const kick = (canKick || canKickBot)
          ? '<button type="button" class="kick" data-id="' + p.id + '" title="Quitar">✕</button>'
          : '';

        if (isMe) {
          const colors = ['green', 'red', 'blue', 'yellow'];
          const swatches = colors.map((c) => {
            const taken = takenColors.has(c) && p.color !== c;
            const sel = p.color === c ? ' selected' : '';
            const dis = taken ? ' disabled' : '';
            return (
              '<button type="button" class="color-swatch color-' + c + sel + dis + '"' +
              ' data-color="' + c + '"' + (taken ? ' disabled title="Ocupado"' : ' title="' + colorLabel(c) + '"') +
              ' aria-label="' + colorLabel(c) + '"></button>'
            );
          }).join('');
          return (
            '<div class="lobby-player me" data-player-id="' + p.id + '">' +
            '<div class="color-dot" style="background:' + colorHex(p.color) + '"></div>' +
            '<div class="info">' +
            '<div class="name-row">' +
            '<input type="text" class="lobby-name-input" maxlength="12" value="' + escapeHtml(p.name) + '" ' +
            'placeholder="Tu nombre" aria-label="Tu nombre" />' +
            '<span class="you-tag">vos</span>' +
            '</div>' +
            '<div class="meta">' +
            (p.id === room.hostId ? 'Anfitrión · ' : '') +
            'Elegí tu casa</div>' +
            '<div class="color-picker" role="group" aria-label="Color de casa">' + swatches + '</div>' +
            '</div>' +
            kick +
            '</div>'
          );
        }

        const offline = !p.isBot && p.connected === false;
        return (
          '<div class="lobby-player' + (offline ? ' offline' : '') + '">' +
          '<div class="color-dot" style="background:' + colorHex(p.color) + '"></div>' +
          '<div class="info"><div class="name">' + escapeHtml(p.name) + '</div>' +
          '<div class="meta">' + colorLabel(p.color) + (p.isBot ? ' · Bot' : '') +
          (p.id === room.hostId ? ' · Anfitrión' : '') +
          (offline ? ' · reconectando…' : '') + '</div></div>' +
          kick +
          '</div>'
        );
      }).join('');

      ui.lobbyPlayers.querySelectorAll('.kick').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await emitAck('room:removePlayer', { targetId: btn.dataset.id }, 5000);
        });
      });

      // Name edit (me)
      const nameInput = ui.lobbyPlayers.querySelector('.lobby-name-input');
      if (nameInput) {
        let nameTimer = null;
        const commitName = async () => {
          const n = (nameInput.value || '').trim().slice(0, 12);
          if (!n) {
            nameInput.value = state.name || 'Jugador';
            return;
          }
          if (n === state.name) return;
          state.name = n;
          try { localStorage.setItem('ludoName', n); } catch (_) {}
          if (ui.playerName) ui.playerName.value = n;
          const res = await emitAck('room:setProfile', { name: n }, 5000);
          if (res && !res.ok) toast(res.error || 'No se pudo cambiar el nombre');
        };
        nameInput.addEventListener('change', commitName);
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.blur();
          }
        });
        nameInput.addEventListener('input', () => {
          clearTimeout(nameTimer);
          nameTimer = setTimeout(commitName, 700);
        });
      }

      // Color pick (me)
      ui.lobbyPlayers.querySelectorAll('.color-swatch:not(:disabled)').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const color = btn.getAttribute('data-color');
          if (!color) return;
          const res = await emitAck('room:setProfile', { color }, 5000);
          if (res && !res.ok) toast(res.error || 'Color no disponible');
          // room:update refreshes UI
        });
      });
    }

    const n = (room.players || []).length;
    const canStart = n >= 2;

    if (ui.lobbySteps) {
      const s1 = ui.lobbySteps.querySelector('[data-step="1"]');
      const s2 = ui.lobbySteps.querySelector('[data-step="2"]');
      const s3 = ui.lobbySteps.querySelector('[data-step="3"]');
      if (s1) s1.className = 'step done';
      if (s2) s2.className = n < 2 ? 'step current' : 'step done';
      if (s3) s3.className = n < 2 ? 'step' : 'step current';
    }

    // Host controls: stable clientId / playerId match
    let showControls = host;
    if (!showControls && room.players) {
      const me = myId();
      const humans = room.players.filter((p) => !p.isBot);
      if (humans.length === 1 && (humans[0].id === me || humans[0].id === state.clientId)) showControls = true;
      if (room.hostId === me || room.hostId === state.clientId) showControls = true;
    }

    const display = showControls ? '' : 'none';
    if (ui.btnQuickStart) {
      ui.btnQuickStart.style.display = display;
      ui.btnQuickStart.disabled = false;
      ui.btnQuickStart.textContent =
        n >= 4 ? '⚡ Iniciar partida ya' :
        n === 1 ? '⚡ Jugar ahora (con 3 bots)' :
        '⚡ Completar con bots e iniciar (' + n + '/4)';
    }
    if (ui.btnAddBot) {
      ui.btnAddBot.style.display = display;
      ui.btnAddBot.disabled = n >= 4;
    }
    if (ui.btnStart) {
      ui.btnStart.style.display = display;
      ui.btnStart.disabled = !canStart;
    }

    if (ui.lobbyNote) {
      ui.lobbyNote.classList.remove('warn', 'ready');
      if (!showControls) {
        ui.lobbyNote.textContent = 'Esperando a que el anfitrión inicie la partida…';
      } else if (n < 2) {
        ui.lobbyNote.classList.add('warn');
        ui.lobbyNote.innerHTML = '⚠️ Hace falta al menos 2 jugadores.<br>Tocá <strong>Jugar ahora</strong> o <strong>+ Agregar 1 bot</strong>.';
      } else {
        ui.lobbyNote.classList.add('ready');
        ui.lobbyNote.innerHTML = '✅ ' + n + ' jugadores. Tocá “Iniciar partida”.<br><span class="invite-hint">Compartí el <strong>enlace</strong> o el código de arriba con tus amigos.</span>';
      }
    }
  }

  on(ui.btnCopy, 'click', async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    await doCopyInvite('full');
  });
  on(ui.btnShare, 'click', async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    await doShareInvite();
  });
  on(ui.btnCopyLinkOnly, 'click', async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    await doCopyInvite('link');
  });
  on(ui.btnCopyCodeOnly, 'click', async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    await doCopyInvite('code');
  });
  on(ui.lobbyCode, 'click', async () => {
    await doCopyInvite('code');
  });
  // Tap invite field → select all (easy long-press copy on mobile)
  on(ui.inviteLinkInput, 'focus', () => {
    try {
      ui.inviteLinkInput.select();
      ui.inviteLinkInput.setSelectionRange(0, ui.inviteLinkInput.value.length);
    } catch (_) {}
  });
  on(ui.inviteLinkInput, 'click', () => {
    try {
      ui.inviteLinkInput.select();
      ui.inviteLinkInput.setSelectionRange(0, ui.inviteLinkInput.value.length);
    } catch (_) {}
  });

  on(ui.btnAddBot, 'click', async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      if (!(await ensureOnline())) return;
      const res = await emitAck('room:addBot', {}, 5000);
      if (!res.ok) toast(res.error || 'No se pudo agregar bot');
      // room:update will refresh list
      if (res.ok && state.room) {
        // optimistic if update delayed
        setTimeout(() => { if (state.room && state.room.status === 'lobby') renderLobby(); }, 200);
      }
    } finally {
      state.busy = false;
    }
  });

  on(ui.btnStart, 'click', async () => {
    if (state.busy) return;
    state.busy = true;
    if (ui.btnStart) ui.btnStart.disabled = true;
    try {
      if (!(await ensureOnline())) return;
      const res = await emitAck('room:start', {}, 8000);
      if (!res.ok) {
        toast(res.error || 'No se pudo iniciar');
        if (ui.btnStart) ui.btnStart.disabled = false;
        return;
      }
      enterGame(res.room || state.room, true);
    } finally {
      state.busy = false;
    }
  });

  on(ui.btnQuickStart, 'click', async () => {
    if (state.busy) return;
    state.busy = true;
    if (ui.btnQuickStart) {
      ui.btnQuickStart.disabled = true;
      ui.btnQuickStart.textContent = 'Preparando…';
    }
    try {
      if (!(await ensureOnline())) return;
      const res = await emitAck('room:quickStart', { fillTo: 4, start: true }, 10000);
      if (!res.ok) {
        toast(res.error || 'No se pudo iniciar');
        renderLobby();
        return;
      }
      enterGame(res.room || state.room, true);
    } finally {
      state.busy = false;
      if (ui.btnQuickStart && state.room && state.room.status === 'lobby') {
        ui.btnQuickStart.disabled = false;
        renderLobby();
      }
    }
  });

  on(ui.btnLeaveLobby, 'click', () => {
    socket.emit('room:leave');
    clearSession();
    state.room = null;
    showScreen('home');
  });

  // ---- Game render ----
  const TOKEN_STEP_MS = 200;

  function moveAnimKey(lm) {
    if (!lm) return '';
    return String(lm.playerId) + ':' + lm.tokenIndex + ':' + lm.from + '>' + lm.to + ':d' + lm.dice;
  }

  function buildDisplayGameForMove(g, lm) {
    // Snapshot with mover still at origin; restore captured pieces until arrival
    const g2 = JSON.parse(JSON.stringify(g));
    const mover = g2.players.find((p) => p.id === lm.playerId);
    if (!mover) return g2;
    mover.tokens[lm.tokenIndex] = lm.from;
    if (lm.captured && lm.captured.length && lm.to >= 0 && lm.to < 51) {
      const startAbs = (window.LudoBoard && window.LudoBoard.START_ABS) || { green: 0, red: 13, blue: 26, yellow: 39 };
      const abs = (startAbs[mover.color] + lm.to) % 52;
      lm.captured.forEach((cap) => {
        const vic = g2.players.find((p) => p.id === cap.playerId);
        if (!vic) return;
        if (vic.tokens[cap.tokenIndex] === -1) {
          const vs = startAbs[vic.color] != null ? startAbs[vic.color] : 0;
          vic.tokens[cap.tokenIndex] = (abs - vs + 52) % 52;
        }
      });
    }
    return g2;
  }

  function easeInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function animateSvgTranslate(el, x0, y0, x1, y1, ms) {
    return new Promise((resolve) => {
      if (!el) return resolve();
      const t0 = performance.now();
      const dur = Math.max(80, ms || TOKEN_STEP_MS);
      function frame(now) {
        const u = Math.min(1, (now - t0) / dur);
        const e = easeInOut(u);
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        el.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
        if (u < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderBoardSnapshot(g, options) {
    if (!window.LudoBoard || !ui.board) return;
    window.LudoBoard.renderBoard(ui.board, g, options || {});
  }

  /**
   * Step the token one cell at a time with a subtle sound each hop
   * (including leaving "casa" → start).
   * @returns {boolean} true if animation started
   */
  function maybeAnimateIncomingMove(room, ev) {
    if (!room || !room.game || state.rolling || state.moving) return false;
    const g = room.game;
    const lm = g.lastMove;
    if (!lm || lm.type !== 'move') return false;
    if (lm.from == null || lm.to == null) return false;

    const key = moveAnimKey(lm);
    if (state.lastAnimatedMove === key) return false;

    const player = g.players.find((p) => p.id === lm.playerId);
    if (!player) return false;

    const steps = (window.LudoBoard && window.LudoBoard.buildMoveSteps)
      ? window.LudoBoard.buildMoveSteps(lm.from, lm.to)
      : (lm.from === -1 ? [0] : (function () {
          const s = [];
          for (let p = lm.from + 1; p <= lm.to; p++) s.push(p);
          return s;
        })());

    if (!steps.length) {
      state.lastAnimatedMove = key;
      return false;
    }

    state.lastAnimatedMove = key;
    state.moving = true;
    DiceSFX.unlock();

    // Draw board with token still at origin (and victims still on cell)
    const snap = buildDisplayGameForMove(g, lm);
    if (ui.gameMessage) ui.gameMessage.textContent = g.message || '';
    if (ui.hintLine) ui.hintLine.textContent = 'Moviendo ficha…';

    // Keep stations/dice in sync but no selectable hearts during move
    const byColor = {};
    g.players.forEach((p) => { byColor[p.color] = p; });
    ['green', 'red', 'blue', 'yellow'].forEach((color) => {
      renderStation(color, byColor[color], g);
    });

    renderBoardSnapshot(snap, {
      selectableTokens: [],
      currentColor: player.color,
      myColor: (g.players.find((p) => p.id === myId()) || {}).color
    });

    const el = ui.board && ui.board.querySelector(
      '.token[data-player="' + lm.playerId + '"][data-token="' + lm.tokenIndex + '"]'
    );

    const cs = (window.LudoBoard && window.LudoBoard.cellSizeView) || (600 / 15);
    const posToXY = window.LudoBoard && window.LudoBoard.posToXY;

    const run = async () => {
      try {
        let prevPos = lm.from;
        let x0;
        let y0;
        if (posToXY) {
          const startXY = posToXY(player.color, prevPos, lm.tokenIndex, cs);
          x0 = startXY.x;
          y0 = startXY.y;
          if (el) el.setAttribute('transform', 'translate(' + x0 + ', ' + y0 + ')');
        }

        for (let i = 0; i < steps.length; i++) {
          const pos = steps[i];
          const leaveHome = prevPos === -1;
          if (posToXY && el) {
            const xy = posToXY(player.color, pos, lm.tokenIndex, cs);
            await animateSvgTranslate(el, x0, y0, xy.x, xy.y, TOKEN_STEP_MS);
            x0 = xy.x;
            y0 = xy.y;
          } else {
            // Fallback: re-render each step
            const mid = buildDisplayGameForMove(g, lm);
            const mp = mid.players.find((p) => p.id === lm.playerId);
            if (mp) mp.tokens[lm.tokenIndex] = pos;
            renderBoardSnapshot(mid, { selectableTokens: [], currentColor: player.color });
            await new Promise((r) => setTimeout(r, TOKEN_STEP_MS));
          }
          DiceSFX.playStep(leaveHome);
          prevPos = pos;
        }

        // Capture sting when landing ate another token
        // (server only sets captured off star / start safe cells)
        if (lm.captured && lm.captured.length) {
          DiceSFX.playCapture();
          try {
            lm.captured.forEach(function (cap) {
              const victimEl = ui.board && ui.board.querySelector(
                '.token[data-player="' + cap.playerId + '"][data-token="' + cap.tokenIndex + '"]'
              );
              if (!victimEl || !posToXY) return;
              const fromXY = posToXY(player.color, lm.to, lm.tokenIndex, cs);
              const vicPlayer = g.players.find(function (p) { return p.id === cap.playerId; });
              if (!vicPlayer) return;
              const homeXY = posToXY(vicPlayer.color, -1, cap.tokenIndex, cs);
              animateSvgTranslate(victimEl, fromXY.x, fromXY.y, homeXY.x, homeXY.y, 320);
            });
            await new Promise(function (r) { setTimeout(r, 380); });
          } catch (capErr) {
            await new Promise(function (r) { setTimeout(r, 200); });
          }
        }

        // Token reached the finish crown (meta) → achievement / ovation
        const reachedFinish = lm.finishedToken || lm.to === 56;
        if (reachedFinish) {
          DiceSFX.playFinish();
          await new Promise(function (r) { setTimeout(r, 700); });
        } else if (!(lm.captured && lm.captured.length)) {
          // Brief pause on final cell before next turn UI
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch (err) {
        console.error('move anim error', err);
      } finally {
        state.moving = false;
        if (state.room) renderGame();
      }
    };

    run();
    return true;
  }

  function maybeAnimateIncomingRoll(room, ev) {
    if (!room || !room.game) return;
    const g = room.game;
    let playerId = null;
    let value = null;
    if (ev && ev.type === 'roll') {
      playerId = ev.playerId;
      value = ev.value;
    } else if (g.lastMove && g.lastMove.type === 'roll') {
      playerId = g.lastMove.playerId;
      value = g.lastMove.value;
    }
    if (!playerId || !value) return;
    if (g.lastMove && g.lastMove.type === 'move' && !ev) return;

    const rollKey = playerId + '-roll-' + value + '-d' + g.diceRolled + '-i' + g.currentPlayerIndex +
      '-t' + g.players.map((p) => p.tokens.join('.')).join('|');
    if (state.lastAnimatedRoll === rollKey || state.rolling) return;
    state.lastAnimatedRoll = rollKey;

    animateDiceRoll(playerId, value).then(() => {
      if (!state.room) return;
      if (!maybeAnimateIncomingMove(state.room, null)) renderGame();
    });
  }

  function renderGame() {
    const room = state.room;
    if (!room || !room.game) return;
    const g = room.game;
    const id = myId();

    if (ui.gameCode) ui.gameCode.textContent = room.code || '';
    if (ui.gameMessage) ui.gameMessage.textContent = g.message || '';

    const current = g.players[g.currentPlayerIndex];
    const isMyTurn = current && current.id === id && !current.isBot;
    const canRoll = isMyTurn && !g.diceRolled && g.status === 'playing' && !state.rolling && !state.moving;
    const needsChoice = isMyTurn && g.diceRolled && g.selectableTokens && g.selectableTokens.length > 0 && !state.moving;

    if (ui.hintLine) {
      if (state.rolling) ui.hintLine.textContent = 'Tirando el dado…';
      else if (state.moving) ui.hintLine.textContent = 'Moviendo ficha…';
      else if (canRoll) ui.hintLine.textContent = '👆 Tocá el DADO junto a tu color para tirar';
      else if (needsChoice) {
        const me = g.players.find((p) => p.id === id);
        const dice = g.diceValue;
        const yardSel = me && g.selectableTokens && g.selectableTokens.some((ti) => me.tokens[ti] === -1);
        if (dice === 6 && yardSel) {
          ui.hintLine.textContent = '🏠 Con el 6 podés sacar ficha de la casa — tocá la que late';
        } else {
          ui.hintLine.textContent = '💓 Tocá la ficha que late para moverla';
        }
      }
      else if (current) {
        ui.hintLine.textContent = current.isBot
          ? (current.name + ' está jugando…')
          : ('Turno de ' + current.name);
      } else ui.hintLine.textContent = '';
    }

    const byColor = {};
    g.players.forEach((p) => { byColor[p.color] = p; });
    ['green', 'red', 'blue', 'yellow'].forEach((color) => {
      renderStation(color, byColor[color], g);
    });

    let selectForBoard = [];
    if (!state.rolling && !state.moving && g.diceRolled && g.selectableTokens && g.selectableTokens.length) {
      selectForBoard = g.selectableTokens;
    }

    if (window.LudoBoard && ui.board) {
      window.LudoBoard.renderBoard(ui.board, g, {
        selectableTokens: selectForBoard,
        currentColor: current ? current.color : null,
        myColor: (g.players.find((p) => p.id === id) || {}).color,
        onTokenClick: (playerId, tokenIndex) => {
          if (playerId !== id || state.rolling || state.moving) return;
          DiceSFX.unlock();
          socket.emit('game:move', { tokenIndex }, (res) => {
            if (res && !res.ok) toast(res.error || 'Movimiento inválido');
          });
        }
      });
    }

    if (g.status === 'finished') showWinner(g);
  }

  function renderStation(color, player, g) {
    const container = ui.stations[color];
    if (!container) return;
    const id = myId();

    if (!player) {
      container.innerHTML = '<div class="dice-station empty color-' + color + '"><div class="sname">—</div></div>';
      return;
    }

    const current = g.players[g.currentPlayerIndex];
    const isActive = current && current.id === player.id && g.status === 'playing';
    const isMe = player.id === id;
    const canRollHere = isActive && isMe && !player.isBot && !g.diceRolled && !state.rolling && !state.moving && g.status === 'playing';
    const hasChoice = isActive && isMe && g.diceRolled && g.selectableTokens && g.selectableTokens.length > 0 && !state.moving;

    let face = state.diceValues[player.id] || null;
    if (isActive && g.diceValue && !state.rolling) face = g.diceValue;
    if (g.lastMove && g.lastMove.type === 'roll' && g.lastMove.playerId === player.id && !state.rolling) face = g.lastMove.value;
    if (g.lastMove && g.lastMove.type === 'move' && g.lastMove.playerId === player.id) face = g.lastMove.dice;

    const stars = '⭐'.repeat(player.finished || 0);
    let hint = '';
    if (canRollHere) hint = 'TOCÁ PARA TIRAR';
    else if (hasChoice) {
      const yardSel = g.selectableTokens && g.selectableTokens.some((ti) => player.tokens[ti] === -1);
      hint = (g.diceValue === 6 && yardSel) ? 'SALÍ CON EL 6' : 'ELEGÍ UNA FICHA';
    } else if (isActive && player.isBot) hint = 'PENSANDO…';
    else if (isActive && state.rolling) hint = 'GIRANDO…';

    const existingBtn = container.querySelector('[data-player-id="' + player.id + '"]');
    if (state.rolling && existingBtn && existingBtn.classList.contains('rolling')) {
      const st = container.querySelector('.dice-station');
      if (st) {
        st.classList.toggle('active-turn', isActive);
        st.classList.toggle('has-choice', hasChoice);
        const h = st.querySelector('.tap-hint');
        if (h) h.textContent = hint;
      }
      return;
    }

    /* Face-on when idle/settled; vertical slot reel while spinning */
    const showVal = face || null;
    container.innerHTML =
      '<div class="dice-station color-' + color + (isActive ? ' active-turn' : '') + (hasChoice ? ' has-choice' : '') + '">' +
      '<div class="sname">' + escapeHtml(player.name) + '</div>' +
      '<button type="button" class="dice-btn' + (canRollHere ? ' can-roll' : '') + '" id="dice-btn-' + player.id + '" data-player-id="' + player.id + '" aria-label="Dado">' +
      buildDiceHTML(showVal, player.id) +
      '</button>' +
      '<div class="turn-badge">TU TURNO</div>' +
      '<div class="tap-hint' + ((canRollHere || hasChoice) ? ' show' : '') + '">' + hint + '</div>' +
      '<div class="finished-stars">' + stars + '</div></div>';

    const btn = container.querySelector('.dice-btn.can-roll');
    if (btn) btn.addEventListener('click', onDiceClick);
  }

  /** Classic pip layouts (3×3 grid cells, 1-indexed) — matches reference sheet */
  const DICE_PIPS = {
    1: [5],
    2: [3, 7],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  function pipsHTML(n) {
    const cells = DICE_PIPS[n] || [];
    let h = '<div class="pips">';
    for (let i = 1; i <= 9; i++) {
      h += cells.indexOf(i) >= 0 ? '<span class="pip on"></span>' : '<span class="pip"></span>';
    }
    return h + '</div>';
  }

  /**
   * Die UI:
   * - At rest / after roll: single face-on face (clear pips)
   * - While spinning: vertical slot-machine reel (faces scroll up, motion blur)
   */
  function facePlateHTML(n, extraClass) {
    const v = n >= 1 && n <= 6 ? n : 1;
    return (
      '<div class="dice-face-plate' + (extraClass ? ' ' + extraClass : '') + '" data-v="' + v + '">' +
      pipsHTML(v) +
      '</div>'
    );
  }

  /** Build a long vertical reel strip: many cycles of 1..6 for slot spin */
  function buildReelStripHTML(cycles) {
    const cyc = Math.max(4, cycles || 8);
    let h = '<div class="dice-reel" id="dice-reel-temp">';
    // Start with a lead face so first visible is seamless
    for (let c = 0; c < cyc; c++) {
      for (let n = 1; n <= 6; n++) {
        h += facePlateHTML(n, 'reel-cell');
      }
    }
    // Extra tail so final settle always has room
    for (let n = 1; n <= 6; n++) {
      h += facePlateHTML(n, 'reel-cell');
    }
    h += '</div>';
    return h;
  }

  function buildDiceHTML(value, playerId) {
    const v = value >= 1 && value <= 6 ? value : 0;
    let html = '<div class="dice-stage settled" id="dice-stage-' + playerId + '">';
    html += '<div class="dice-window" id="dice-window-' + playerId + '">';
    html += '<div class="dice-cube settled" id="dice-cube-' + playerId + '" data-value="' + (v || '') + '">';
    if (v) {
      html += facePlateHTML(v, 'result-face');
    } else {
      html += facePlateHTML(1, 'result-face idle');
    }
    html += '</div></div>';
    html += '<div class="dice-glass" aria-hidden="true"></div>';
    html += '</div>';
    return html;
  }

  function setDiceValue(playerId, value) {
    const v = Math.min(6, Math.max(1, value || 1));
    const cube = document.getElementById('dice-cube-' + playerId);
    const stage = document.getElementById('dice-stage-' + playerId);
    if (!cube) return;
    cube.className = 'dice-cube settled';
    cube.setAttribute('data-value', String(v));
    cube.style.transform = '';
    cube.style.filter = '';
    cube.style.transition = '';
    cube.innerHTML = facePlateHTML(v, 'result-face');
    if (stage) {
      stage.classList.remove('spinning', 'slot-mode');
      stage.classList.add('settled');
    }
  }

  function onDiceClick(e) {
    e.preventDefault();
    e.stopPropagation();
    DiceSFX.unlock();
    if (state.rolling) return;
    const room = state.room;
    if (!room || !room.game) return;
    const g = room.game;
    const current = g.players[g.currentPlayerIndex];
    if (!current || current.id !== myId() || g.diceRolled) return;

    const btn = e.currentTarget;
    btn.classList.remove('can-roll');
    btn.style.pointerEvents = 'none';

    socket.emit('game:roll', (res) => {
      if (res && !res.ok) {
        toast(res.error || 'No se pudo tirar');
        state.rolling = false;
        renderGame();
      }
    });
  }

  function animateDiceRoll(playerId, finalValue) {
    return new Promise((resolve) => {
      const value = Math.min(6, Math.max(1, finalValue || 1));
      state.rolling = true;
      state.diceValues[playerId] = value;

      const room = state.room;
      if (room && room.game) {
        const player = room.game.players.find((p) => p.id === playerId);
        if (player) {
          const container = ui.stations[player.color];
          if (container && !container.querySelector('#dice-btn-' + playerId)) {
            renderStation(player.color, player, room.game);
          }
        }
      }

      const btn = document.getElementById('dice-btn-' + playerId);
      const cube = document.getElementById('dice-cube-' + playerId);
      const stage = document.getElementById('dice-stage-' + playerId);
      if (!btn || !cube) {
        state.rolling = false;
        resolve();
        return;
      }

      btn.classList.remove('can-roll', 'landed', 'revealed');
      btn.classList.add('rolling');
      btn.style.pointerEvents = 'none';

      // Vertical slot-machine reel: strip of faces scrolls up with motion blur
      const SPIN_MS = 1700;
      const SETTLE_MS = 380;
      const FACE = 50; // matches --dice-size px (updated if measured)
      const cycles = 8; // full 1..6 loops before landing zone

      if (stage) {
        stage.classList.add('spinning', 'slot-mode');
        stage.classList.remove('settled');
      }

      cube.className = 'dice-cube spinning';
      cube.style.transition = 'none';
      cube.style.transform = 'translate3d(0,0,0)';
      cube.style.filter = 'blur(0px)';
      cube.innerHTML = buildReelStripHTML(cycles).replace('id="dice-reel-temp"', 'id="dice-reel-' + playerId + '"');
      // unwrap: buildReelStripHTML returns a wrapper; we want cells directly in cube OR keep reel
      // Actually put reel as child - OK
      const reel = cube.querySelector('.dice-reel') || cube;

      // Measure cell size from CSS variable / rendered face
      let facePx = FACE;
      const firstCell = cube.querySelector('.reel-cell, .dice-face-plate');
      if (firstCell) {
        const h = firstCell.getBoundingClientRect().height;
        if (h > 8) facePx = h;
      } else if (stage) {
        const sh = stage.getBoundingClientRect().height;
        if (sh > 8) facePx = sh;
      }

      // Reel layout: cycles of 1..6, then another 1..6 tail.
      // Index of final value in the LAST full cycle before tail:
      // cells: [1..6] * cycles + [1..6]
      // Final stop on cell at index: cycles * 6 + (value - 1)
      const stopIndex = cycles * 6 + (value - 1);
      const stopY = -(stopIndex * facePx);

      void cube.offsetWidth;

      DiceSFX.unlock();
      const stopDiceSound = DiceSFX.playRoll(SPIN_MS);

      // Fast spin with heavy blur, then ease out to final face
      // Use two-phase: blur+fast, then decelerate
      requestAnimationFrame(() => {
        cube.style.transition = 'none';
        cube.style.filter = 'blur(5px) saturate(0.85)';
        // Kick off CSS animation class for continuous feel, then JS transition to stop
        cube.classList.add('reel-blur');

        // Animate translateY with JS for precise stop on final number
        const t0 = performance.now();
        const startY = 0;
        // Overshoot a bit past stop then settle — slot feel
        const midY = stopY - facePx * 0.35;
        const duration = SPIN_MS;

        function easeOutCubic(u) {
          return 1 - Math.pow(1 - u, 3);
        }
        function easeOutQuint(u) {
          return 1 - Math.pow(1 - u, 5);
        }

        function frame(now) {
          const u = Math.min(1, (now - t0) / duration);
          // Fast early motion (many revolutions feel): map u through high-speed then slow
          // Use exponential distance: mostly travel early
          const travel = easeOutQuint(u);
          // Blur peaks mid-early, clears near end
          const blur = u < 0.75 ? (5.5 * (1 - u * 0.55)) : (5.5 * (1 - u) * 2.2);
          const y = startY + (stopY - startY) * travel;
          cube.style.transform = 'translate3d(0, ' + y.toFixed(2) + 'px, 0)';
          cube.style.filter = 'blur(' + Math.max(0, blur).toFixed(2) + 'px)';

          if (u < 1) {
            requestAnimationFrame(frame);
          } else {
            // Snap + clear blur → face-on result
            cube.style.transition = 'filter 0.12s ease-out';
            cube.style.transform = 'translate3d(0, ' + stopY.toFixed(2) + 'px, 0)';
            cube.style.filter = 'blur(0px)';
            cube.classList.remove('reel-blur');

            setTimeout(() => {
              btn.classList.remove('rolling');
              setDiceValue(playerId, value);
              btn.classList.add('landed', 'revealed');

              setTimeout(() => {
                btn.classList.remove('landed');
                setDiceValue(playerId, value);
                state.rolling = false;
                if (typeof stopDiceSound === 'function') stopDiceSound();
                resolve();
              }, SETTLE_MS);
            }, 80);
          }
        }
        requestAnimationFrame(frame);
      });
    });
  }

  function showWinner(g) {
    const winnerId = g.winner || (g.winners && g.winners[0]);
    const winner = g.players.find((p) => p.id === winnerId) || g.players.find((p) => p.finished >= 4);
    if (!winner || !ui.winnerOverlay) return;
    if (ui.winnerTitle) ui.winnerTitle.textContent = '¡' + winner.name + ' gana!';
    if (ui.winnerSub) ui.winnerSub.textContent = 'Todas las fichas llegaron a la meta';
    ui.winnerOverlay.classList.remove('hidden');
  }

  // Menu / chat
  on(ui.btnPause, 'click', () => ui.menuOverlay && ui.menuOverlay.classList.remove('hidden'));
  on(ui.btnResume, 'click', () => ui.menuOverlay && ui.menuOverlay.classList.add('hidden'));
  on(ui.btnLeaveGame, 'click', () => {
    if (ui.menuOverlay) ui.menuOverlay.classList.add('hidden');
    socket.emit('room:leave');
    clearSession();
    state.room = null;
    showScreen('home');
  });
  on(ui.btnBackHome, 'click', () => {
    if (ui.winnerOverlay) ui.winnerOverlay.classList.add('hidden');
    socket.emit('room:leave');
    clearSession();
    state.room = null;
    showScreen('home');
  });
  on(ui.btnChatToggle, 'click', () => {
    state.chatOpen = !state.chatOpen;
    if (ui.chatPanel) ui.chatPanel.classList.toggle('open', state.chatOpen);
  });
  on(ui.btnChatClose, 'click', () => {
    state.chatOpen = false;
    if (ui.chatPanel) ui.chatPanel.classList.remove('open');
  });
  on(ui.chatForm, 'submit', (e) => {
    e.preventDefault();
    const text = (ui.chatInput && ui.chatInput.value || '').trim();
    if (!text) return;
    socket.emit('chat:message', { text });
    if (ui.chatInput) ui.chatInput.value = '';
  });

  function appendChat(msg) {
    if (!ui.chatMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = '<div class="who" style="color:' + colorHex(msg.color) + '">' +
      escapeHtml(msg.name) + '</div><div>' + escapeHtml(msg.text) + '</div>';
    ui.chatMessages.appendChild(div);
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
  }

  // Initial board paint
  try {
    if (window.LudoBoard && ui.board) window.LudoBoard.renderBoard(ui.board, null, {});
  } catch (e) {
    console.warn('board init', e);
  }

  // Expose for debug in console
  function updatePublicPlayBanner() {
    const base = (publicBaseUrl && looksLikePublicHttpUrl(publicBaseUrl))
      ? String(publicBaseUrl).replace(/\/+$/, '')
      : (inviteIsShareable() ? inviteBaseUrl() : '');
    if (!base || !ui.publicPlayBanner) {
      if (ui.publicPlayBanner) ui.publicPlayBanner.hidden = true;
      return;
    }
    ui.publicPlayBanner.hidden = false;
    if (ui.publicPlayUrl) ui.publicPlayUrl.value = base;
  }

  on(ui.btnCopyPublicUrl, 'click', async () => {
    const v = (ui.publicPlayUrl && ui.publicPlayUrl.value) || publicBaseUrl || '';
    if (!v) return toast('Todavía no hay enlace público');
    const ok = await copyText(v);
    if (ok) toast('Enlace base copiado — abrilo en el celular');
    else {
      try {
        ui.publicPlayUrl.focus();
        ui.publicPlayUrl.select();
      } catch (_) {}
      showShareModal(v);
    }
  });
  on(ui.publicPlayUrl, 'click', () => {
    try { ui.publicPlayUrl.select(); } catch (_) {}
  });

  // Resolve public invite URL (tunnel / PUBLIC_BASE_URL) before sharing
  (async function bootPublicUrl() {
    await refreshPublicBaseUrl();
    updatePublicPlayBanner();
    if (state.room) updateInviteUI(state.room);
  })();

  // Deep link: /?room=ABCDE opens join flow automatically
  (async function bootFromUrl() {
    await refreshPublicBaseUrl();
    const code = readRoomFromUrl();
    if (!code) return;
    if (ui.joinCode) ui.joinCode.value = code;
    // Wait a tick for socket
    await waitConnected(12000);
    if (state.room) return;
    // If we already have a saved seat in that room, rejoin; else just fill code for user
    try {
      const last = localStorage.getItem('ludoLastRoom') || '';
      if (last.toUpperCase() === code) {
        await tryRejoinSavedRoom();
        return;
      }
    } catch (_) {}
    toast('Código ' + code + ' listo — poné tu nombre y tocá Unirse');
  })();

  window.LudoApp = { state, socket, showScreen, renderLobby, renderGame, inviteUrl };
})();
