// ============================================================
// 闹钟管理
// - 早 7:00(周一至周五) + 晚 20:00(周一/二/五)
// - Notification API + Wake Lock + 时间戳轮询(基于 Date.now)
// - 安卓 Chrome 已添加到主屏幕后,后台/熄屏可弹通知
// - 仍建议用手机原生时钟做主闹钟,本 app 做二次提醒
// ============================================================

(function() {
'use strict';

const { META, getScheduleForDate } = window.TRAINING_DATA;

const Alarm = {
  settings: {
    morningEnabled: true,
    morningTime: '07:00',
    eveningEnabled: true,
    eveningTime: '20:00'
  },

  permission: 'default',
  wakeLock: null,
  wakeLockAcquiredAt: 0,
  lastMorningTriggeredYMD: '',
  lastEveningTriggeredYMD: '',
  pollIntervalId: null,

  // 加载持久化设置
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('alarmSettings') || '{}');
      this.settings = Object.assign({}, this.settings, saved);
    } catch (e) {}
    try {
      this.lastMorningTriggeredYMD = localStorage.getItem('lastMorningTriggered') || '';
      this.lastEveningTriggeredYMD = localStorage.getItem('lastEveningTriggered') || '';
    } catch (e) {}
  },

  save() {
    localStorage.setItem('alarmSettings', JSON.stringify(this.settings));
  },

  saveTriggered() {
    localStorage.setItem('lastMorningTriggered', this.lastMorningTriggeredYMD);
    localStorage.setItem('lastEveningTriggered', this.lastEveningTriggeredYMD);
  },

  // 检查/请求通知权限(用户手势触发)
  async requestPermission() {
    if (!('Notification' in window)) {
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      this.permission = 'denied';
      return 'denied';
    }
    const result = await Notification.requestPermission();
    this.permission = result;
    return result;
  },

  // 请求 Wake Lock(只在临近闹钟时调用,避免整夜占用)
  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    // 已持有且未过期(<5分钟)
    if (this.wakeLock && Date.now() - this.wakeLockAcquiredAt < 5 * 60 * 1000) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLockAcquiredAt = Date.now();
      // 监听释放
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch (e) {
      // 安卓 Chrome 在 PWA 后台时可能拒绝,属正常
    }
  },

  async releaseWakeLock() {
    if (this.wakeLock) {
      try { await this.wakeLock.release(); } catch (e) {}
      this.wakeLock = null;
    }
  },

  // 解析 HH:MM 为今日的触发时刻(Date)
  getTodayTrigger(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  },

  // 距离下一个目标时刻的毫秒数
  msUntil(timeStr) {
    const trigger = this.getTodayTrigger(timeStr);
    let diff = trigger.getTime() - Date.now();
    if (diff < 0) diff += 24 * 3600 * 1000;  // 已过则算明天
    return diff;
  },

  // 启动轮询
  start() {
    if (this.pollIntervalId) return;
    // 每 15 秒检查一次
    this.pollIntervalId = setInterval(() => this._check(), 15000);
    // 立即检查一次
    this._check();

    // 监听页面可见性变化,可见时立即检查
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._check();
    });

    // 在临近闹钟前 5 分钟申请 Wake Lock
    this._scheduleWakeLock();
  },

  // 临近闹钟前申请 Wake Lock
  async _scheduleWakeLock() {
    const checkAndAcquire = async () => {
      const msToMorning = this.settings.morningEnabled ? this.msUntil(this.settings.morningTime) : Infinity;
      const msToEvening = this.settings.eveningEnabled ? this.msUntil(this.settings.eveningTime) : Infinity;
      const nearest = Math.min(msToMorning, msToEvening);
      // 5 分钟内即将触发,申请 Wake Lock
      if (nearest <= 5 * 60 * 1000 && nearest > 0) {
        await this.acquireWakeLock();
      } else if (nearest > 10 * 60 * 1000) {
        // 远离闹钟,释放
        await this.releaseWakeLock();
      }
    };
    checkAndAcquire();
    setInterval(checkAndAcquire, 60 * 1000);  // 每分钟检查
  },

  // 核心检查逻辑
  _check() {
    const now = new Date();
    const weekday = now.getDay();  // 0=周日
    const ymd = this._formatYMD(now);
    const h = now.getHours();
    const m = now.getMinutes();
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // 早上闹钟:周一至周五(1-5)
    if (this.settings.morningEnabled && META.morningDays.includes(weekday)) {
      const targetTime = this.settings.morningTime;
      if (hhmm === targetTime && this.lastMorningTriggeredYMD !== ymd) {
        this.lastMorningTriggeredYMD = ymd;
        this.saveTriggered();
        this._fireAlarm('morning');
      }
    }

    // 晚间闹钟:周一/二/五(1, 2, 5)
    if (this.settings.eveningEnabled && META.eveningDays.includes(weekday)) {
      const targetTime = this.settings.eveningTime;
      if (hhmm === targetTime && this.lastEveningTriggeredYMD !== ymd) {
        this.lastEveningTriggeredYMD = ymd;
        this.saveTriggered();
        this._fireAlarm('evening');
      }
    }
  },

  _formatYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // 触发闹钟
  async _fireAlarm(type) {
    // 先确保权限
    if (this.permission !== 'granted') {
      await this.requestPermission();
    }

    // 唤醒 AudioContext(注:若页面在后台,AudioContext 可能被挂起)
    if (window.TRAINING_TIMER) {
      window.TRAINING_TIMER.Audio.init();
      window.TRAINING_TIMER.Audio.beep('alarm');
    }

    // 弹通知
    const today = new Date();
    const schedule = getScheduleForDate(today);
    let title, body;
    if (type === 'morning') {
      title = '🌅 该起床训练了';
      body = schedule ? `今日: ${schedule.label}` : '今日: 早上1小时训练';
      if (schedule && schedule.note) body += `（${schedule.note}）`;
    } else {
      title = '🏋️ 该做哑铃训练了';
      body = '回家后10分钟: 哑铃 + 仰卧起坐';
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body: body,
          icon: 'icon.svg',
          badge: 'icon.svg',
          tag: `alarm-${type}`,
          vibrate: [200, 100, 200, 100, 200, 100, 400],
          requireInteraction: true  // 用户需手动关闭
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        // Service Worker 通知作为后备
        console.warn('Notification 失败', e);
      }
    }

    // 页面后台时尝试用 Service Worker 通知
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        await navigator.serviceWorker.ready;
        navigator.serviceWorker.controller.postMessage({
          type: 'showNotification',
          title: title,
          body: body
        });
      } catch (e) {}
    }
  },

  // 测试闹钟(1 分钟后触发)
  async testAlarm() {
    const result = await this.requestPermission();
    if (result !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }
    // 解锁 AudioContext
    if (window.TRAINING_TIMER) {
      window.TRAINING_TIMER.Audio.init();
    }
    // 立即触发一次(测试)
    this._fireAlarm('morning');
    return { ok: true };
  },

  // 状态文案(供 UI 显示)
  getStatusText() {
    if (!this.settings.morningEnabled && !this.settings.eveningEnabled) {
      return '<span class="alarm-off">闹钟未开启</span>';
    }
    const parts = [];
    if (this.settings.morningEnabled) {
      parts.push(`<span class="alarm-on">早 ${this.settings.morningTime}</span>`);
    }
    if (this.settings.eveningEnabled) {
      parts.push(`<span class="alarm-on">晚 ${this.settings.eveningTime}</span>`);
    }
    return `已设: ${parts.join(' · ')}`;
  }
};

// 加载持久化设置
Alarm.load();

// 暴露到全局
window.TRAINING_ALARM = Alarm;

})();
