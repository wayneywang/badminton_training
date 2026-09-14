// ============================================================
// 训练计时器 + 音频提示
// - Date.now() 差值计时,后台不漂移
// - Web Audio API 合成蜂鸣(零资源,离线可用)
// - Web Speech API 中文播报,无 zh-CN 语音时降级为 beep
// ============================================================

(function() {
'use strict';

// ---------- 音频管理 ----------
const Audio = {
  ctx: null,
  enabled: true,

  // 初始化 AudioContext(必须在用户手势内调用)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      console.warn('AudioContext 初始化失败', e);
    }
  },

  // 合成蜂鸣音
  // type: 'short'(短beep) / 'long'(长beep) / 'double'(双音) / 'triple'(三连音) / 'alarm'(闹钟)
  beep(type = 'short') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const playTone = (freq, start, duration, volume = 0.25, wave = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(volume, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    };

    switch (type) {
      case 'short':
        playTone(880, 0, 0.15);
        break;
      case 'long':
        playTone(660, 0, 0.5);
        break;
      case 'double':       // 休息开始
        playTone(523, 0, 0.15);
        playTone(523, 0.2, 0.15);
        break;
      case 'triple':       // 休息结束/动作完成
        playTone(880, 0, 0.15);
        playTone(880, 0.2, 0.15);
        playTone(1175, 0.4, 0.25);
        break;
      case 'alarm':        // 闹钟(连续蜂鸣)
        for (let i = 0; i < 6; i++) {
          playTone(880, i * 0.4, 0.3, 0.3, 'square');
          playTone(660, i * 0.4 + 0.05, 0.25, 0.2, 'square');
        }
        break;
      case 'countdown':    // 倒计时最后3秒
        playTone(440, 0, 0.1, 0.2);
        break;
      case 'go':           // 开始
        playTone(880, 0, 0.3);
        break;
    }
  }
};

// ---------- 语音管理 ----------
const Voice = {
  enabled: true,
  synth: null,
  zhVoice: null,
  available: false,

  init() {
    if (!window.speechSynthesis) return;
    this.synth = window.speechSynthesis;
    // 异步加载语音列表
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      this.zhVoice = voices.find(v => v.lang.startsWith('zh')) || null;
      this.available = !!this.zhVoice;
    };
    loadVoices();
    this.synth.onvoiceschanged = loadVoices;
  },

  speak(text) {
    if (!this.enabled) return;
    if (!this.synth) this.init();
    if (!this.synth) {
      // 无 TTS,降级为 beep
      Audio.beep('short');
      return;
    }
    try {
      this.synth.cancel();  // 清掉队列
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.1;
      u.pitch = 1;
      if (this.zhVoice) u.voice = this.zhVoice;
      this.synth.speak(u);
    } catch (e) {
      console.warn('语音播报失败', e);
      Audio.beep('short');
    }
  }
};

// 初始化语音(可早做,不依赖用户手势)
Voice.init();

// ---------- 训练计时器 ----------
// 倒计时模式,基于 Date.now() 差值
class CountdownTimer {
  constructor(opts = {}) {
    this.duration = opts.duration || 0;    // 秒
    this.onTick = opts.onTick || null;       // (remainingSec, totalSec) => void
    this.onComplete = opts.onComplete || null;
    this.onWarning = opts.onWarning || null; // 最后3秒
    this.warningSec = opts.warningSec || 3;
    this.startDelay = opts.startDelay || 0;  // 前置延迟(秒)
    this.onStart = opts.onStart || null;

    this.startTime = 0;
    this.pausedAt = 0;
    this.running = false;
    this.paused = false;
    this.rafId = null;
    this.warnedAt = -1;
  }

  start() {
    if (this.running) return;
    // 前置倒计时(3-2-1-GO)
    if (this.startDelay > 0) {
      this._runStartDelay(this.startDelay);
      return;
    }
    this._beginCountdown();
  }

  _runStartDelay(sec) {
    let remaining = sec;
    if (this.onStart) this.onStart(`准备 ${remaining}`);
    Audio.beep('countdown');
    const tick = () => {
      remaining--;
      if (remaining > 0) {
        if (this.onStart) this.onStart(`准备 ${remaining}`);
        Audio.beep('countdown');
        setTimeout(tick, 1000);
      } else {
        if (this.onStart) this.onStart('GO!');
        Audio.beep('go');
        Voice.speak('开始');
        setTimeout(() => this._beginCountdown(), 500);
      }
    };
    setTimeout(tick, 1000);
  }

  _beginCountdown() {
    this.running = true;
    this.paused = false;
    this.startTime = Date.now();
    this.warnedAt = -1;
    if (this.onStart) this.onStart('');
    this._tick();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = Date.now() - this.startTime;
    cancelAnimationFrame(this.rafId);
  }

  resume() {
    if (!this.paused) return;
    this.startTime = Date.now() - this.pausedAt;
    this.paused = false;
    this._tick();
  }

  stop() {
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.rafId);
  }

  _tick() {
    if (!this.running || this.paused) return;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const remaining = Math.max(0, this.duration - elapsed);
    const remainingInt = Math.ceil(remaining);

    if (this.onTick) this.onTick(remainingInt, this.duration, remaining);

    // 最后 3 秒提示
    if (remaining <= this.warningSec && remaining > 0) {
      const warnIdx = Math.ceil(remaining);
      if (warnIdx !== this.warnedAt) {
        this.warnedAt = warnIdx;
        Audio.beep('countdown');
        if (this.onWarning) this.onWarning(warnIdx);
      }
    }

    if (remaining <= 0) {
      this.running = false;
      if (this.onComplete) this.onComplete();
      return;
    }
    this.rafId = requestAnimationFrame(() => this._tick());
  }
}

// ---------- 休息计时器 ----------
class RestTimer extends CountdownTimer {
  constructor(opts = {}) {
    super({
      duration: opts.duration || 30,
      onTick: opts.onTick,
      onComplete: opts.onComplete,
      onWarning: opts.onWarning,
      startDelay: 0
    });
    this._startedFromRest = false;
  }

  start() {
    // 休息开始蜂鸣
    Audio.beep('double');
    Voice.speak('休息开始');
    this._startedFromRest = true;
    super.start();
  }

  // 重写完成,加休息结束音
  _tick() {
    if (!this.running || this.paused) return;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const remaining = Math.max(0, this.duration - elapsed);
    const remainingInt = Math.ceil(remaining);

    if (this.onTick) this.onTick(remainingInt, this.duration, remaining);

    if (remaining <= this.warningSec && remaining > 0) {
      const warnIdx = Math.ceil(remaining);
      if (warnIdx !== this.warnedAt) {
        this.warnedAt = warnIdx;
        Audio.beep('countdown');
        if (this.onWarning) this.onWarning(warnIdx);
      }
    }

    if (remaining <= 0) {
      this.running = false;
      Audio.beep('triple');
      Voice.speak('休息结束');
      if (this.onComplete) this.onComplete();
      return;
    }
    this.rafId = requestAnimationFrame(() => this._tick());
  }
}

// ---------- 工具:秒数格式化为 mm:ss ----------
function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 暴露到全局
window.TRAINING_TIMER = {
  Audio,
  Voice,
  CountdownTimer,
  RestTimer,
  formatTime
};

})();
