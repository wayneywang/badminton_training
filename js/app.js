// ============================================================
// 主应用逻辑
// - 视图路由(今日/课表/演示/进度/设置)
// - localStorage 持久化(完成记录、设置)
// - 训练会话引导(逐步推进、计时、休息)
// - PWA 安装提示
// ============================================================

(function() {
'use strict';

const { META, SECTION, EXERCISES, WEEKLY_SCHEDULE, WEEK_MODIFIERS,
        PRE_TOURNAMENT_SCHEDULE, PROGRESSION, GENERAL_TIPS, DUMBBELL_TIPS,
        getScheduleForDate, getWeekNumber, isPreTournament, formatDateYMD, isTrainingDay } = window.TRAINING_DATA;
const SF = window.STICK_FIGURE;
const { Audio, Voice, CountdownTimer, RestTimer, formatTime } = window.TRAINING_TIMER;
const Alarm = window.TRAINING_ALARM;

const App = {
  currentView: 'today',
  currentWeekTab: 1,
  currentLibraryFilter: 'all',
  demoAnimation: null,        // 演示模态层中的动画实例
  sessionState: null,         // 当前训练会话状态
  progress: {},               // { 'YYYY-MM-DD': true }
  settings: {
    voice: true,
    beep: true,
    theme: 'auto'
  },
  deferredInstallPrompt: null,

  // ========== 初始化 ==========
  init() {
    this.loadProgress();
    this.loadSettings();
    this.applyTheme();

    this.bindNav();
    this.bindToday();
    this.bindSchedule();
    this.bindLibrary();
    this.bindProgress();
    this.bindSettings();
    this.bindSession();
    this.bindDemoModal();
    this.bindPWAInstall();

    this.renderToday();
    this.renderSchedule();
    this.renderLibrary();
    this.renderProgress();

    // 同步闹钟设置到 UI
    this.syncAlarmUI();

    // 启动闹钟轮询
    Alarm.start();
    this.updateAlarmStatus();

    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
      });
    }

    // 监听系统主题变化
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) {
      mq.addEventListener('change', () => { if (this.settings.theme === 'auto') this.applyTheme(); });
    }
  },

  // ========== 持久化 ==========
  loadProgress() {
    try {
      this.progress = JSON.parse(localStorage.getItem('progress') || '{}');
    } catch (e) { this.progress = {}; }
  },
  saveProgress() {
    localStorage.setItem('progress', JSON.stringify(this.progress));
  },
  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('settings') || '{}');
      this.settings = Object.assign({}, this.settings, saved);
    } catch (e) {}
    // 同步闹钟开关到全局
    Audio.enabled = this.settings.beep;
    Voice.enabled = this.settings.voice;
  },
  saveSettings() {
    localStorage.setItem('settings', JSON.stringify(this.settings));
  },
  applyTheme() {
    let theme = this.settings.theme;
    if (theme === 'auto') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    // 更新 theme-color meta
    const color = theme === 'dark' ? '#0d1117' : '#1a73e8';
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
  },

  // ========== 导航 ==========
  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });
    document.getElementById('theme-toggle').addEventListener('click', () => {
      // 手动切换：light <-> dark
      const current = document.documentElement.getAttribute('data-theme');
      this.settings.theme = current === 'dark' ? 'light' : 'dark';
      this.saveSettings();
      this.applyTheme();
      const select = document.getElementById('theme-select');
      if (select) select.value = this.settings.theme;
    });
  },
  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-view="${viewName}"]`)?.classList.add('active');
    // 更新标题
    const titles = { today: '今日训练', schedule: '课表', library: '动作演示', progress: '进度', settings: '设置' };
    document.getElementById('view-title').textContent = titles[viewName] || '';
  },

  // ========== 今日视图 ==========
  bindToday() {
    document.getElementById('start-session-btn').addEventListener('click', () => {
      this.startSession();
    });
  },
  renderToday() {
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const weekdayStr = `周${weekdayNames[now.getDay()]}`;
    document.getElementById('today-date').textContent = dateStr;
    document.getElementById('today-weekday').textContent = weekdayStr;

    const schedule = getScheduleForDate(now);
    const planEl = document.getElementById('today-plan');
    const checklistEl = document.getElementById('today-checklist');
    const startBtn = document.getElementById('start-session-btn');

    if (!schedule) {
      planEl.innerHTML = '<div class="plan-label">无训练安排</div><div class="day-note">已超过训练周期或今日休息</div>';
      startBtn.disabled = true;
      checklistEl.innerHTML = '';
      return;
    }

    // 计划卡
    let html = `<div class="plan-label">${schedule.label}</div>`;
    if (schedule.rest) {
      html += `<div class="day-note">${schedule.note || '今日休息'}</div>`;
      startBtn.disabled = true;
      startBtn.textContent = '休息日';
    } else {
      if (schedule.morning) {
        html += this._renderSectionHtml(schedule.morning, SECTION);
      }
      if (schedule.evening) {
        html += `<div class="plan-section"><div class="plan-section-title">${SECTION.evening}</div>`;
        schedule.evening.forEach(ex => {
          html += this._renderPlanItemHtml(ex);
        });
        html += '</div>';
      }
      startBtn.disabled = false;
      startBtn.textContent = schedule.isPreTournament ? '开始赛前热身' : '开始训练';
      if (schedule.note) {
        html += `<div class="day-note">${schedule.note}</div>`;
      }
    }
    planEl.innerHTML = html;

    // 完成清单
    if (!schedule.rest && (schedule.morning || schedule.evening)) {
      const ymd = formatDateYMD(now);
      const doneList = this.progress[ymd] || {};
      let chk = '<div class="checklist-title">今日打卡</div>';
      const allEx = [...(schedule.morning || []), ...(schedule.evening || [])];
      allEx.forEach((ex, idx) => {
        const def = EXERCISES[ex.id];
        if (!def) return;
        const isDone = doneList[idx];
        chk += `<div class="checklist-item ${isDone ? 'done' : ''}">
          <input type="checkbox" id="chk-${idx}" ${isDone ? 'checked' : ''} data-idx="${idx}">
          <label for="chk-${idx}">${def.name}</label>
        </div>`;
      });
      checklistEl.innerHTML = chk;
      // 绑定
      checklistEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', e => {
          const idx = parseInt(e.target.dataset.idx);
          const ymd = formatDateYMD(new Date());
          if (!this.progress[ymd]) this.progress[ymd] = {};
          this.progress[ymd][idx] = e.target.checked;
          this.saveProgress();
          e.target.closest('.checklist-item').classList.toggle('done', e.target.checked);
        });
      });
    } else {
      checklistEl.innerHTML = '';
    }
  },
  _renderSectionHtml(morningList, sectionMap) {
    const sections = {};
    morningList.forEach(ex => {
      const sec = ex.section || 'main';
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push(ex);
    });
    let html = '';
    for (const sec in sections) {
      html += `<div class="plan-section"><div class="plan-section-title">${sectionMap[sec] || sec}</div>`;
      sections[sec].forEach(ex => {
        html += this._renderPlanItemHtml(ex);
      });
      html += '</div>';
    }
    return html;
  },
  _renderPlanItemHtml(ex) {
    const def = EXERCISES[ex.id];
    if (!def) return '';
    let spec = '';
    if (ex.duration_sec) spec = formatTime(ex.duration_sec);
    else if (ex.sets && ex.reps) spec = `${ex.reps}×${ex.sets}${ex.perSide ? '/侧' : ''}`;
    else if (ex.sets && def.type === 'count') spec = `${ex.sets} 次`;
    else if (ex.sets && ex.duration_sec) spec = `${formatTime(ex.duration_sec)}×${ex.sets}${ex.perSide ? '/侧' : ''}`;
    if (ex.intervalPairs) spec = `${ex.intervalPairs} 组`;
    let weightHtml = def.weight ? `<span class="plan-item-weight">${def.weight}</span>` : '';
    let noteHtml = ex.note ? ` <span style="font-size:12px;color:var(--text-muted)">(${ex.note})</span>` : '';
    return `<div class="plan-item">
      <span class="plan-item-name">${def.name}${noteHtml}</span>
      <span class="plan-item-spec">${spec}</span>
      ${weightHtml}
    </div>`;
  },
  updateAlarmStatus() {
    const el = document.getElementById('alarm-status');
    if (el) el.innerHTML = Alarm.getStatusText();
  },

  // ========== 课表视图 ==========
  bindSchedule() {
    document.querySelectorAll('.week-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.week-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentWeekTab = btn.dataset.week;
        this.renderSchedule();
      });
    });
    document.querySelector('.week-tab[data-week="1"]').classList.add('active');
  },
  renderSchedule() {
    const el = document.getElementById('schedule-content');
    const weekKey = this.currentWeekTab;
    let html = '';

    if (weekKey === 'pre') {
      // 赛前周
      html += `<div class="day-block" style="background:var(--warning-soft)">
        <div class="day-label">🎬 赛前一周安排</div>
        <div class="day-note">10月14日 – 10月17日,减量 + 备赛</div>
      </div>`;
      for (const ymd in PRE_TOURNAMENT_SCHEDULE) {
        const day = PRE_TOURNAMENT_SCHEDULE[ymd];
        html += this._renderDayBlockHtml(day, ymd);
      }
    } else {
      const weekNum = parseInt(weekKey);
      const mod = WEEK_MODIFIERS[weekNum];
      html += `<div class="day-block">
        <div class="day-label">第${weekNum}周 · ${mod.focus}</div>
        <div class="day-note">调整: ${mod.adjustment}${mod.useJumpRope ? ' · 有跳绳' : ' · 无跳绳'}</div>
      </div>`;
      for (let day = 1; day <= 7; day++) {
        const base = WEEKLY_SCHEDULE[day];
        if (!base) continue;
        // 应用周调整
        const mockDate = new Date(META.startDate + 'T00:00:00');
        mockDate.setDate(mockDate.getDate() + (weekNum - 1) * 7 + (day - 1));
        const adjusted = getScheduleForDate(mockDate);
        html += this._renderDayBlockHtml(adjusted, formatDateYMD(mockDate));
      }
    }
    el.innerHTML = html;
  },
  _renderDayBlockHtml(day, ymd) {
    if (!day) return '';
    const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    let cls = 'day-block';
    if (day.rest) cls += ' rest';
    let html = `<div class="${cls}"><div class="day-label">${day.label || dayNames[day.weekday]}</div>`;
    if (day.note) html += `<div class="day-note">${day.note}</div>`;
    if (day.morning) {
      html += '<div class="day-section"><div class="day-section-title">早上</div>';
      day.morning.forEach(ex => {
        html += this._renderDayExerciseHtml(ex);
      });
      html += '</div>';
    }
    if (day.evening) {
      html += '<div class="day-section"><div class="day-section-title">回家后</div>';
      day.evening.forEach(ex => {
        html += this._renderDayExerciseHtml(ex);
      });
      html += '</div>';
    } else if (!day.rest) {
      html += '<div class="day-section"><div class="day-section-title">回家后</div><div class="day-exercise"><span class="day-ex-name">无</span></div></div>';
    }
    html += '</div>';
    return html;
  },
  _renderDayExerciseHtml(ex) {
    const def = EXERCISES[ex.id];
    if (!def) return '';
    let spec = '';
    if (ex.duration_sec) spec = formatTime(ex.duration_sec);
    else if (ex.sets && ex.reps) spec = `${ex.reps}×${ex.sets}${ex.perSide ? '/侧' : ''}`;
    else if (ex.sets) spec = `${ex.sets} 次`;
    if (ex.intervalPairs) spec = `${ex.intervalPairs} 组`;
    if (def.weight) spec += ` · ${def.weight}`;
    let note = ex.note ? ` (${ex.note})` : '';
    return `<div class="day-exercise"><span class="day-ex-name">${def.name}${note}</span><span class="day-ex-spec">${spec}</span></div>`;
  },

  // ========== 演示库视图 ==========
  bindLibrary() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentLibraryFilter = btn.dataset.cat;
        this.renderLibrary();
      });
    });
  },
  renderLibrary() {
    const el = document.getElementById('library-content');
    let html = '';
    for (const id in EXERCISES) {
      const ex = EXERCISES[id];
      if (this.currentLibraryFilter !== 'all' && ex.category !== this.currentLibraryFilter) continue;
      // 静态预览
      const previewDiv = document.createElement('div');
      SF.renderStatic(previewDiv, id);
      const svgHtml = previewDiv.innerHTML;
      html += `<div class="library-card" data-id="${id}">
        <div class="library-card-svg">${svgHtml}</div>
        <div class="library-card-name">${ex.name}</div>
        <span class="library-card-cat">${ex.category}${ex.weight ? ' · ' + ex.weight : ''}</span>
      </div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.library-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openDemoModal(card.dataset.id);
      });
    });
  },

  // ========== 进度视图 ==========
  bindProgress() {
    // 无交互绑定,渲染时给 cell 加 click
  },
  renderProgress() {
    const summaryEl = document.getElementById('progress-summary');
    const gridEl = document.getElementById('progress-grid');
    const start = new Date(META.startDate + 'T00:00:00');
    const end = new Date(META.endDate + 'T23:59:59');
    const totalDays = Math.floor((end - start) / 86400000) + 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let doneCount = 0;
    for (const ymd in this.progress) {
      const dayProgress = this.progress[ymd];
      if (typeof dayProgress === 'object') {
        const total = Object.keys(dayProgress).length;
        if (total > 0) doneCount++;
      } else if (dayProgress === true) {
        doneCount++;
      }
    }
    const pct = Math.round((doneCount / totalDays) * 100);
    summaryEl.innerHTML = `
      <div class="progress-count">${doneCount} / ${totalDays}</div>
      <div class="progress-label">已完成训练日 · ${pct}%</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    `;

    // 网格：按周分组
    let html = '';
    for (let w = 1; w <= 5; w++) {
      if (w > 5) break;
      let weekLabel = `第${w}周`;
      if (w === 5) weekLabel = '赛前周';
      html += `<div class="progress-week-label">${weekLabel}</div>`;
      for (let d = 1; d <= 7; d++) {
        const date = new Date(start);
        date.setDate(date.getDate() + (w - 1) * 7 + (d - 1));
        if (date > end) {
          html += '<div class="progress-cell"></div>';
          continue;
        }
        const ymd = formatDateYMD(date);
        const isToday = formatDateYMD(today) === ymd;
        const isTournament = ymd === META.tournamentDate;
        const dayProgress = this.progress[ymd];
        const isDone = dayProgress && Object.keys(dayProgress).length > 0 &&
          Object.values(dayProgress).filter(v => v).length >= 3;
        const cls = ['progress-cell'];
        if (isDone) cls.push('done');
        if (isToday) cls.push('today');
        if (isTournament) cls.push('tournament');
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const dayName = dayNames[date.getDay()];
        const dateNum = date.getDate();
        html += `<div class="${cls.join(' ')}" data-ymd="${ymd}">
          <div class="pc-day">${dayName}</div>
          <div class="pc-date">${dateNum}</div>
        </div>`;
      }
    }
    gridEl.innerHTML = html;
    gridEl.querySelectorAll('.progress-cell[data-ymd]').forEach(cell => {
      cell.addEventListener('click', () => {
        const ymd = cell.dataset.ymd;
        const d = new Date(ymd + 'T00:00:00');
        const schedule = getScheduleForDate(d);
        if (schedule && schedule.label) {
          this.toast(`${ymd}: ${schedule.label}`);
        }
      });
    });
  },

  // ========== 设置视图 ==========
  bindSettings() {
    // 闹钟开关
    const bindToggle = (id, settingKey, defaultVal) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = Alarm.settings[settingKey];
        el.addEventListener('change', e => {
          Alarm.settings[settingKey] = e.target.checked;
          Alarm.save();
          this.updateAlarmStatus();
          if (e.target.checked) {
            // 请求权限
            Alarm.requestPermission().then(r => {
              if (r !== 'granted') {
                this.toast('请允许通知权限');
              }
            });
          }
        });
      }
    };
    bindToggle('alarm-morning-toggle', 'morningEnabled');
    bindToggle('alarm-evening-toggle', 'eveningEnabled');

    // 时间
    const bindTime = (id, settingKey) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = Alarm.settings[settingKey];
        el.addEventListener('change', e => {
          Alarm.settings[settingKey] = e.target.value;
          Alarm.save();
          this.updateAlarmStatus();
        });
      }
    };
    bindTime('alarm-morning-time', 'morningTime');
    bindTime('alarm-evening-time', 'eveningTime');

    // 测试闹钟
    document.getElementById('test-alarm-btn').addEventListener('click', async () => {
      const result = await Alarm.testAlarm();
      if (result.ok) {
        this.toast('闹钟已触发,检查通知与声音');
      } else {
        this.toast('请先允许通知权限');
      }
    });

    // 语音/蜂鸣
    document.getElementById('voice-toggle').checked = this.settings.voice;
    document.getElementById('voice-toggle').addEventListener('change', e => {
      this.settings.voice = e.target.checked;
      Voice.enabled = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('beep-toggle').checked = this.settings.beep;
    document.getElementById('beep-toggle').addEventListener('change', e => {
      this.settings.beep = e.target.checked;
      Audio.enabled = e.target.checked;
      this.saveSettings();
    });

    // 测试蜂鸣
    document.getElementById('test-beep-btn').addEventListener('click', () => {
      Audio.init();
      Audio.beep('triple');
      Voice.speak('这是测试语音');
    });

    // 主题
    document.getElementById('theme-select').value = this.settings.theme;
    document.getElementById('theme-select').addEventListener('change', e => {
      this.settings.theme = e.target.value;
      this.saveSettings();
      this.applyTheme();
    });

    // 数据
    document.getElementById('export-btn').addEventListener('click', () => this.exportProgress());
    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', e => this.importProgress(e));
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('确定清空所有训练进度?此操作不可撤销')) {
        this.progress = {};
        this.saveProgress();
        this.renderProgress();
        this.renderToday();
        this.toast('已清空进度');
      }
    });
  },
  syncAlarmUI() {
    const mToggle = document.getElementById('alarm-morning-toggle');
    const eToggle = document.getElementById('alarm-evening-toggle');
    if (mToggle) mToggle.checked = Alarm.settings.morningEnabled;
    if (eToggle) eToggle.checked = Alarm.settings.eveningEnabled;
    document.getElementById('alarm-morning-time').value = Alarm.settings.morningTime;
    document.getElementById('alarm-evening-time').value = Alarm.settings.eveningTime;
  },

  exportProgress() {
    const data = {
      progress: this.progress,
      settings: this.settings,
      alarmSettings: Alarm.settings,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-progress-${formatDateYMD(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('已导出');
  },
  importProgress(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.progress) {
          this.progress = data.progress;
          this.saveProgress();
        }
        if (data.settings) {
          this.settings = Object.assign({}, this.settings, data.settings);
          this.saveSettings();
          Audio.enabled = this.settings.beep;
          Voice.enabled = this.settings.voice;
          this.applyTheme();
        }
        if (data.alarmSettings) {
          Alarm.settings = Object.assign({}, Alarm.settings, data.alarmSettings);
          Alarm.save();
        }
        this.renderToday();
        this.renderProgress();
        this.syncAlarmUI();
        this.toast('已导入');
      } catch (err) {
        this.toast('导入失败: 文件格式错误');
      }
    };
    reader.readAsText(file);
  },

  // ========== 训练会话 ==========
  bindSession() {
    document.getElementById('session-exit-btn').addEventListener('click', () => {
      if (confirm('退出训练?进度不会保存')) {
        this.endSession();
      }
    });
  },

  startSession() {
    const now = new Date();
    const schedule = getScheduleForDate(now);
    if (!schedule || schedule.rest) {
      this.toast('今日无训练安排');
      return;
    }
    // 合并早上 + 晚上
    const all = [
      ...(schedule.morning || []).map(ex => ({ ...ex, _part: 'morning' })),
      ...(schedule.evening || []).map(ex => ({ ...ex, _part: 'evening' }))
    ];
    if (all.length === 0) {
      this.toast('今日无训练项目');
      return;
    }
    this.sessionState = {
      schedule: schedule,
      exercises: all,
      currentIndex: 0,
      currentSet: 1,
      timer: null,
      phase: 'intro'   // intro / exercise / rest / done
    };
    // 解锁音频
    Audio.init();
    document.getElementById('session-overlay').classList.remove('hidden');
    document.getElementById('session-title').textContent = schedule.label;
    this._renderSessionStep();
  },

  endSession() {
    if (this.sessionState && this.sessionState.timer) {
      this.sessionState.timer.stop();
    }
    this.sessionState = null;
    document.getElementById('session-overlay').classList.add('hidden');
  },

  _renderSessionStep() {
    const state = this.sessionState;
    if (!state) return;
    const ex = state.exercises[state.currentIndex];
    if (!ex) {
      // 全部完成
      this._renderSessionDone();
      return;
    }
    const def = EXERCISES[ex.id];
    const body = document.getElementById('session-body');
    const controls = document.getElementById('session-controls');
    document.getElementById('session-progress').textContent = `${state.currentIndex + 1} / ${state.exercises.length}`;

    // 渲染动作卡片
    let specHtml = '';
    if (ex.duration_sec) {
      specHtml = `<span class="badge">${formatTime(ex.duration_sec)}</span>`;
    }
    if (ex.sets && ex.reps) {
      specHtml += `<span class="badge">${ex.reps} × ${ex.sets}${ex.perSide ? ' /侧' : ''}</span>`;
    } else if (ex.sets) {
      specHtml += `<span class="badge">${ex.sets} 次</span>`;
    }
    if (ex.intervalPairs) {
      specHtml += `<span class="badge">${ex.intervalPairs} 组</span>`;
    }
    let weightHtml = def.weight ? `<span class="session-ex-weight">${def.weight}</span>` : '';

    let cuesHtml = '';
    if (def.cues) {
      const c = def.cues;
      cuesHtml = '<div class="session-cues">';
      if (c.start) cuesHtml += `<div class="cue-row"><span class="cue-label">起始</span><span class="cue-text">${c.start}</span></div>`;
      if (c.move) cuesHtml += `<div class="cue-row"><span class="cue-label">动作</span><span class="cue-text">${c.move}</span></div>`;
      if (c.descent) cuesHtml += `<div class="cue-row"><span class="cue-label">下放</span><span class="cue-text">${c.descent}</span></div>`;
      if (c.variant) cuesHtml += `<div class="cue-row"><span class="cue-label">变式</span><span class="cue-text">${c.variant}</span></div>`;
      if (c.key) cuesHtml += `<div class="cue-row"><span class="cue-label">关键</span><span class="cue-text">${c.key}</span></div>`;
      if (c.errors) cuesHtml += `<div class="cue-row"><span class="cue-label">错误</span><span class="cue-text cue-errors">${c.errors}</span></div>`;
      cuesHtml += '</div>';
    }

    body.innerHTML = `
      <div class="session-ex-name">${def.name}</div>
      <div class="session-ex-spec">${specHtml}${weightHtml}</div>
      <div class="session-svg-wrap" id="session-svg"></div>
      ${cuesHtml}
      <div id="session-action-area"></div>
    `;

    // 渲染动画
    SF.renderStatic(document.getElementById('session-svg'), ex.id);

    // 根据类型渲染控制区
    this._renderExerciseControls(ex, def);
  },

  _renderExerciseControls(ex, def) {
    const state = this.sessionState;
    const actionArea = document.getElementById('session-action-area');
    const controls = document.getElementById('session-controls');

    if (def.type === 'time') {
      // 时间型：倒计时
      // 间歇型动作(intervalPairs)展开为多次计时
      if (ex.intervalPairs) {
        this._renderIntervalTimer(ex, def, actionArea, controls);
      } else {
        this._renderTimeTimer(ex, def, actionArea, controls);
      }
    } else if (def.type === 'hold') {
      // 保持型：每组倒计时,组间休息
      this._renderHoldTimer(ex, def, actionArea, controls);
    } else if (def.type === 'reps') {
      // 次数型：手动计数,组间休息
      this._renderRepsCounter(ex, def, actionArea, controls);
    } else if (def.type === 'count') {
      // 计数型(冲刺/折返)：完成次数后手动确认,组间休息
      this._renderCountType(ex, def, actionArea, controls);
    }
  },

  // 时间型计时器
  _renderTimeTimer(ex, def, actionArea, controls) {
    actionArea.innerHTML = `
      <div class="session-timer">
        <div class="timer-display" id="timer-display">${formatTime(ex.duration_sec)}</div>
        <div class="timer-label" id="timer-label">准备开始</div>
      </div>
    `;
    controls.innerHTML = `
      <button class="ctrl-btn ctrl-primary" id="ctrl-start">开始</button>
      <button class="ctrl-btn ctrl-skip" id="ctrl-skip">跳过</button>
    `;
    document.getElementById('ctrl-start').addEventListener('click', () => {
      // 替换为暂停
      document.getElementById('ctrl-start').textContent = '暂停';
      const timer = new CountdownTimer({
        duration: ex.duration_sec,
        startDelay: 3,
        onTick: (remaining, total) => {
          document.getElementById('timer-display').textContent = formatTime(remaining);
          const el = document.getElementById('timer-display');
          el.classList.toggle('warning', remaining <= 3);
        },
        onWarning: (n) => {
          if (n <= 3 && n > 0) Voice.speak(String(n));
        },
        onComplete: () => {
          document.getElementById('timer-display').textContent = '00:00';
          document.getElementById('timer-display').classList.add('done');
          document.getElementById('timer-label').textContent = '完成!';
          Audio.beep('triple');
          Voice.speak('动作完成');
          setTimeout(() => this._nextExercise(), 1500);
        },
        onStart: (msg) => {
          document.getElementById('timer-label').textContent = msg || '进行中';
        }
      });
      timer.start();
      this.sessionState.timer = timer;
      document.getElementById('ctrl-start').onclick = () => {
        if (timer.paused) { timer.resume(); document.getElementById('ctrl-start').textContent = '暂停'; }
        else { timer.pause(); document.getElementById('ctrl-start').textContent = '继续'; }
      };
    });
    document.getElementById('ctrl-skip').addEventListener('click', () => this._nextExercise());
  },

  // 间歇型计时器(高抬腿30秒+慢跑30秒,N组)
  _renderIntervalTimer(ex, def, actionArea, controls) {
    const pairs = ex.intervalPairs;
    const workSec = ex.duration_sec;
    const restSec = ex.intervalSec;
    const partnerDef = EXERCISES[ex.intervalPartner];
    let currentPair = 0;
    let phase = 'work';  // work / rest

    const renderState = () => {
      const isWork = phase === 'work';
      const sec = isWork ? workSec : restSec;
      const label = isWork ? `${def.name} (${currentPair + 1}/${pairs})` : `${partnerDef ? partnerDef.name : '慢跑'} (${currentPair + 1}/${pairs})`;
      actionArea.innerHTML = `
        <div class="session-timer">
          <div class="timer-display ${isWork ? '' : 'rest'}" id="timer-display">${formatTime(sec)}</div>
          <div class="timer-label" id="timer-label">${label}</div>
        </div>
        <div class="session-set-progress" id="set-progress">${this._renderSetDots(currentPair, pairs)}</div>
      `;
    };
    renderState();

    controls.innerHTML = `
      <button class="ctrl-btn ctrl-primary" id="ctrl-start">开始</button>
      <button class="ctrl-btn ctrl-skip" id="ctrl-skip">跳过</button>
    `;

    let running = false;
    const runPhase = () => {
      const isWork = phase === 'work';
      const sec = isWork ? workSec : restSec;
      const timer = new CountdownTimer({
        duration: sec,
        startDelay: 0,
        onTick: (remaining) => {
          const el = document.getElementById('timer-display');
          if (el) {
            el.textContent = formatTime(remaining);
            el.classList.toggle('warning', remaining <= 3 && isWork);
          }
        },
        onWarning: (n) => {
          if (n <= 3 && n > 0) Voice.speak(String(n));
        },
        onComplete: () => {
          if (isWork) {
            Audio.beep('short');
            phase = 'rest';
            renderState();
            setTimeout(runPhase, 500);
          } else {
            currentPair++;
            if (currentPair >= pairs) {
              Audio.beep('triple');
              Voice.speak('本动作完成');
              setTimeout(() => this._nextExercise(), 1500);
            } else {
              Audio.beep('short');
              phase = 'work';
              renderState();
              setTimeout(runPhase, 500);
            }
          }
        }
      });
      timer.start();
      this.sessionState.timer = timer;
    };

    document.getElementById('ctrl-start').addEventListener('click', () => {
      if (!running) {
        running = true;
        document.getElementById('ctrl-start').textContent = '进行中';
        document.getElementById('ctrl-start').disabled = true;
        runPhase();
      }
    });
    document.getElementById('ctrl-skip').addEventListener('click', () => this._nextExercise());
  },

  // 保持型(平板支撑/单腿站立)
  _renderHoldTimer(ex, def, actionArea, controls) {
    let currentSet = 1;
    const totalSets = ex.sets;
    const renderState = () => {
      actionArea.innerHTML = `
        <div class="session-timer">
          <div class="timer-display" id="timer-display">${formatTime(ex.duration_sec)}</div>
          <div class="timer-label" id="timer-label">第 ${currentSet}/${totalSets} 组${ex.perSide ? ' (左右各一次)' : ''}</div>
        </div>
        <div class="session-set-progress">${this._renderSetDots(currentSet - 1, totalSets)}</div>
      `;
    };
    renderState();
    controls.innerHTML = `
      <button class="ctrl-btn ctrl-primary" id="ctrl-start">开始第${currentSet}组</button>
      <button class="ctrl-btn ctrl-skip" id="ctrl-skip">跳过</button>
    `;
    document.getElementById('ctrl-start').addEventListener('click', () => {
      const timer = new CountdownTimer({
        duration: ex.duration_sec,
        startDelay: 3,
        onTick: (remaining) => {
          const el = document.getElementById('timer-display');
          if (el) {
            el.textContent = formatTime(remaining);
            el.classList.toggle('warning', remaining <= 3);
          }
        },
        onWarning: (n) => { if (n <= 3 && n > 0) Voice.speak(String(n)); },
        onComplete: () => {
          document.getElementById('timer-display').textContent = '00:00';
          document.getElementById('timer-display').classList.add('done');
          if (currentSet < totalSets) {
            // 组间休息
            this._startRest(ex.rest_between_sec || 30, () => {
              currentSet++;
              renderState();
              document.getElementById('ctrl-start').textContent = `开始第${currentSet}组`;
              document.getElementById('ctrl-start').onclick = null;
              // 重新绑定
              this._bindHoldStart(ex, def, () => currentSet, (v) => { currentSet = v; }, totalSets);
            });
          } else {
            Audio.beep('triple');
            Voice.speak('本动作完成');
            setTimeout(() => this._nextExercise(), 1500);
          }
        }
      });
      timer.start();
      this.sessionState.timer = timer;
    });
    document.getElementById('ctrl-skip').addEventListener('click', () => this._nextExercise());
  },

  _bindHoldStart(ex, def, getCur, setCur, totalSets) {
    // 简化：直接重新渲染该步
    this._renderSessionStep();
  },

  // 次数型(哑铃动作 12×3)
  _renderRepsCounter(ex, def, actionArea, controls) {
    let currentSet = 1;
    const totalSets = ex.sets || 3;
    const targetReps = ex.reps || 12;
    let currentReps = 0;

    const renderState = () => {
      actionArea.innerHTML = `
        <div class="session-rep-counter">
          <div class="rep-display" id="rep-display">${currentReps} / ${targetReps}</div>
          <div class="timer-label">第 ${currentSet}/${totalSets} 组${ex.perSide ? ' (左右各一次)' : ''}</div>
          <div class="rep-controls">
            <button class="rep-btn minus" id="rep-minus">−</button>
            <button class="rep-btn" id="rep-plus">+</button>
          </div>
        </div>
        <div class="session-set-progress">${this._renderSetDots(currentSet - 1, totalSets)}</div>
      `;
      document.getElementById('rep-plus').addEventListener('click', () => {
        if (currentReps < targetReps) {
          currentReps++;
          document.getElementById('rep-display').textContent = `${currentReps} / ${targetReps}`;
          Audio.beep('short');
          if (currentReps >= targetReps) {
            Audio.beep('triple');
            Voice.speak(`${currentSet}组完成`);
            setTimeout(() => {
              if (currentSet < totalSets) {
                this._startRest(ex.rest_between_sec || 45, () => {
                  currentSet++;
                  currentReps = 0;
                  renderState();
                });
              } else {
                Voice.speak('本动作完成');
                setTimeout(() => this._nextExercise(), 1000);
              }
            }, 800);
          }
        }
      });
      document.getElementById('rep-minus').addEventListener('click', () => {
        if (currentReps > 0) {
          currentReps--;
          document.getElementById('rep-display').textContent = `${currentReps} / ${targetReps}`;
        }
      });
    };
    renderState();
    controls.innerHTML = `
      <button class="ctrl-btn ctrl-skip" id="ctrl-skip">跳过本动作</button>
    `;
    document.getElementById('ctrl-skip').addEventListener('click', () => this._nextExercise());
  },

  // 计数型(冲刺 8 次, 走回)
  _renderCountType(ex, def, actionArea, controls) {
    let currentCount = 0;
    const total = ex.sets || 8;
    actionArea.innerHTML = `
      <div class="session-rep-counter">
        <div class="rep-display" id="rep-display">0 / ${total}</div>
        <div class="timer-label">${ex.note || '完成每次后点+'}</div>
        <div class="rep-controls">
          <button class="rep-btn minus" id="rep-minus">−</button>
          <button class="rep-btn" id="rep-plus">完成</button>
        </div>
      </div>
      <div class="session-set-progress">${this._renderSetDots(currentCount, total)}</div>
    `;
    document.getElementById('rep-plus').addEventListener('click', () => {
      if (currentCount < total) {
        currentCount++;
        document.getElementById('rep-display').textContent = `${currentCount} / ${total}`;
        Audio.beep('short');
        if (currentCount >= total) {
          Audio.beep('triple');
          Voice.speak('本动作完成');
          setTimeout(() => this._nextExercise(), 1500);
        } else {
          // 组间休息
          this._startRest(ex.rest_between_sec || 40, () => {
            Voice.speak(`第${currentCount + 1}次`);
          });
        }
      }
    });
    document.getElementById('rep-minus').addEventListener('click', () => {
      if (currentCount > 0) {
        currentCount--;
        document.getElementById('rep-display').textContent = `${currentCount} / ${total}`;
      }
    });
    controls.innerHTML = `
      <button class="ctrl-btn ctrl-skip" id="ctrl-skip">跳过</button>
    `;
    document.getElementById('ctrl-skip').addEventListener('click', () => this._nextExercise());
  },

  // 启动休息计时器
  _startRest(duration, onDone) {
    const state = this.sessionState;
    const actionArea = document.getElementById('session-action-area');
    actionArea.innerHTML = `
      <div class="rest-banner">
        <div class="rest-icon">😴</div>
        <div class="rest-text">休息 ${formatTime(duration)}</div>
      </div>
      <div class="session-timer">
        <div class="timer-display rest" id="timer-display">${formatTime(duration)}</div>
        <div class="timer-label" id="timer-label">休息中</div>
      </div>
    `;
    const restTimer = new RestTimer({
      duration: duration,
      onTick: (remaining) => {
        const el = document.getElementById('timer-display');
        if (el) el.textContent = formatTime(remaining);
      },
      onComplete: () => {
        if (onDone) onDone();
      }
    });
    restTimer.start();
    state.timer = restTimer;
  },

  _renderSetDots(current, total) {
    let html = '';
    for (let i = 0; i < total; i++) {
      let cls = 'set-dot';
      if (i < current) cls += ' done';
      if (i === current) cls += ' current';
      html += `<div class="${cls}"></div>`;
    }
    return html;
  },

  _nextExercise() {
    const state = this.sessionState;
    if (!state) return;
    if (state.timer) {
      state.timer.stop();
      state.timer = null;
    }
    state.currentIndex++;
    if (state.currentIndex >= state.exercises.length) {
      this._renderSessionDone();
    } else {
      // 语音播报下一个动作
      const nextEx = state.exercises[state.currentIndex];
      const nextDef = EXERCISES[nextEx.id];
      if (nextDef) {
        Voice.speak(`下一个动作: ${nextDef.name}`);
      }
      this._renderSessionStep();
    }
  },

  _renderSessionDone() {
    const body = document.getElementById('session-body');
    const controls = document.getElementById('session-controls');
    document.getElementById('session-progress').textContent = `${this.sessionState.exercises.length} / ${this.sessionState.exercises.length}`;
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:64px;">🎉</div>
        <h2 style="margin:16px 0 8px;">训练完成!</h2>
        <p style="color:var(--text-secondary);">今日全部动作已完成</p>
      </div>
    `;
    controls.innerHTML = `
      <button class="ctrl-btn ctrl-primary" id="ctrl-done">完成并打卡</button>
    `;
    document.getElementById('ctrl-done').addEventListener('click', () => {
      // 标记完成
      const ymd = formatDateYMD(new Date());
      if (!this.progress[ymd]) this.progress[ymd] = {};
      this.sessionState.exercises.forEach((_, idx) => {
        this.progress[ymd][idx] = true;
      });
      this.saveProgress();
      this.renderToday();
      this.renderProgress();
      this.endSession();
      this.toast('已打卡,继续保持!');
    });
  },

  // ========== 演示模态层 ==========
  bindDemoModal() {
    document.getElementById('demo-modal-close').addEventListener('click', () => this.closeDemoModal());
    document.getElementById('demo-modal').addEventListener('click', e => {
      if (e.target.id === 'demo-modal') this.closeDemoModal();
    });
    document.getElementById('demo-play-btn').addEventListener('click', () => {
      if (this.demoAnimation) this.demoAnimation.play();
    });
    document.getElementById('demo-slow-btn').addEventListener('click', () => {
      if (this.demoAnimation) this.demoAnimation.setSpeed(0.4);
    });
    document.getElementById('demo-pause-btn').addEventListener('click', () => {
      if (this.demoAnimation) this.demoAnimation.pause();
    });
  },
  openDemoModal(exerciseId) {
    const def = EXERCISES[exerciseId];
    if (!def) return;
    document.getElementById('demo-modal-title').textContent = def.name;
    const svgEl = document.getElementById('demo-modal-svg');
    const infoEl = document.getElementById('demo-modal-info');

    // 创建动画
    if (this.demoAnimation) this.demoAnimation.destroy();
    this.demoAnimation = new SF.FigureAnimation(svgEl, exerciseId, { autoplay: true });

    // 信息区
    let html = '';
    if (def.weight) html += `<div class="info-section"><div class="info-label">重量</div><div class="info-text">${def.weight}</div></div>`;
    if (def.cues) {
      const c = def.cues;
      if (c.start) html += `<div class="info-section"><div class="info-label">起始</div><div class="info-text">${c.start}</div></div>`;
      if (c.move) html += `<div class="info-section"><div class="info-label">动作</div><div class="info-text">${c.move}</div></div>`;
      if (c.descent) html += `<div class="info-section"><div class="info-label">下放</div><div class="info-text">${c.descent}</div></div>`;
      if (c.variant) html += `<div class="info-section"><div class="info-label">变式</div><div class="info-text">${c.variant}</div></div>`;
      if (c.key) html += `<div class="info-section"><div class="info-label">关键</div><div class="info-text">${c.key}</div></div>`;
      if (c.errors) html += `<div class="info-section"><div class="info-label">常见错误</div><div class="info-text err">${c.errors}</div></div>`;
    }
    if (def.badminton) html += `<div class="info-section"><div class="info-label">羽毛球用途</div><div class="info-text">${def.badminton}</div></div>`;
    infoEl.innerHTML = html;

    document.getElementById('demo-modal').classList.remove('hidden');
  },
  closeDemoModal() {
    if (this.demoAnimation) {
      this.demoAnimation.destroy();
      this.demoAnimation = null;
    }
    document.getElementById('demo-modal').classList.add('hidden');
  },

  // ========== PWA 安装 ==========
  bindPWAInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      document.getElementById('pwa-install-banner').classList.remove('hidden');
    });
    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!this.deferredInstallPrompt) {
        this.toast('请用浏览器菜单"添加到主屏幕"');
        return;
      }
      this.deferredInstallPrompt.prompt();
      const { outcome } = await this.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        this.toast('已安装,可在主屏幕启动');
      }
      this.deferredInstallPrompt = null;
      document.getElementById('pwa-install-banner').classList.add('hidden');
    });
    document.getElementById('dismiss-install-btn').addEventListener('click', () => {
      document.getElementById('pwa-install-banner').classList.add('hidden');
    });
  },

  // ========== 工具 ==========
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
  }
};

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

window.TRAINING_APP = App;

})();
