// ============================================================
// 羽毛球双打体能训练 — 数据层
// 包含：元信息、动作库（含要点/重量/组数）、周安排、周进度调整、赛前周
// 动画函数在 demo.js 中以 ANIMATIONS[id] 形式提供
// ============================================================

const META = {
  startDate: '2026-09-14',   // 周一，第1周开始
  endDate: '2026-10-17',
  tournamentDate: '2026-10-17',
  morningAlarm: '07:00',
  eveningAlarm: '20:00',
  morningDays: [1, 2, 3, 4, 5],     // 周一至周五早闹钟
  eveningDays: [1, 2, 5],            // 周一/二/五晚闹钟
  user: { height: '175cm', weight: '60kg' }
};

// 段落标签
const SECTION = {
  warmup: '热身',
  main: '主课',
  core: '核心',
  cooldown: '放松',
  evening: '回家后'
};

// ============================================================
// 动作库 — 每个动作的元数据（不含动画，动画在 demo.js）
// type: time(倒计时) / reps(次数×组) / count(次数×组,走回) / hold(保持×组)
// ============================================================
const EXERCISES = {
  // ---------- 跑动类 ----------
  jog: {
    id: 'jog', name: '慢跑', category: '跑动', type: 'time',
    cues: { key: '匀速呼吸，脚步轻快落地', errors: '步幅过大、上半身僵硬' },
    badminton: '基础体能、恢复能力'
  },
  sprint: {
    id: 'sprint', name: '20米加速跑', category: '跑动', type: 'count',
    cues: { start: '起跑线准备', move: '全力加速20米', key: '走回恢复，组间40秒', errors: '未热身就冲刺、组间不休息' },
    badminton: '启动速度、跨步上网'
  },
  shuttle_run: {
    id: 'shuttle_run', name: '5-10-15米折返跑', category: '跑动', type: 'count',
    cues: { start: '起点站立', move: '5米→折返→10米→折返→15米→折返', key: '转身降低重心，急停稳定', errors: '转身晃、不降重心' },
    badminton: '变向、急停急起'
  },
  high_knees: {
    id: 'high_knees', name: '高抬腿', category: '间歇', type: 'time',
    cues: { start: '原地站立', move: '交替抬膝至腰高', key: '前脚掌着地，频率快', errors: '膝盖太低、后仰' },
    badminton: '步频、抬腿能力',
    week1Substitute: true   // 第1周用作跳绳替代
  },
  jumping_jacks: {
    id: 'jumping_jacks', name: '开合跳', category: '间歇', type: 'time',
    cues: { start: '原地站立', move: '跳起手脚同时开/合', key: '手脚协调，节奏稳', errors: '手脚不同步' },
    badminton: '协调、横向移动',
    week1Substitute: true
  },
  small_step_run: {
    id: 'small_step_run', name: '原地小步跑', category: '间歇', type: 'time',
    cues: { start: '原地站立', move: '小步快频原地跑', key: '步频快、幅度小', errors: '步幅大、跳太高' },
    badminton: '步频热身',
    week1Substitute: true
  },
  jump_rope: {
    id: 'jump_rope', name: '跳绳', category: '间歇', type: 'time',
    cues: { start: '双手握绳于体侧', move: '前脚掌轻跳，手腕摇绳', key: '选缓冲好的鞋，别在水泥地硬跳', errors: '全脚掌着地、跳太高' },
    badminton: '步频、踝膝弹性、耐力',
    replacesInWeek2: true   // 第2周起替代 high_knees/jumping_jacks
  },
  footwork: {
    id: 'footwork', name: '原地模拟步法', category: '间歇', type: 'time',
    cues: { start: '基本站位', move: '模拟上网/后退/两侧移动步法', key: '重心低、启动快', errors: '重心高、只动手不动脚' },
    badminton: '步法连贯、启动'
  },
  small_jump_swing: {
    id: 'small_jump_swing', name: '原地小跳+挥拍模拟', category: '间歇', type: 'time',
    cues: { start: '持拍姿势', move: '小跳+完整挥拍模拟', key: '小跳轻、挥拍顺', errors: '跳太高、挥拍僵硬' },
    badminton: '杀球起跳、击球节奏'
  },

  // ---------- 拉伸/热身 ----------
  dynamic_stretch: {
    id: 'dynamic_stretch', name: '动态拉伸', category: '跑动', type: 'time',
    cues: { move: '高抬腿走、弓步走、侧弓步、转体、摆腿', key: '动态连贯，不弹压', errors: '静态压、弹震式' },
    badminton: '热身激活、防伤'
  },
  stretch: {
    id: 'stretch', name: '拉伸放松', category: '跑动', type: 'time',
    cues: { move: '大腿前后侧、小腿、肩背、体侧拉伸', key: '静态保持20-30秒，均匀呼吸', errors: '弹震、憋气' },
    badminton: '恢复、防伤'
  },

  // ---------- 核心类 ----------
  knee_twist: {
    id: 'knee_twist', name: '站姿提膝转体', category: '核心', type: 'reps',
    cues: { start: '双脚与肩同宽站立', move: '提膝至腰高，对侧手触膝，转体', key: '转的是躯干，不是只抬腿', errors: '只抬腿不转体、弓背' },
    badminton: '杀球转体、变向稳定'
  },
  side_bend: {
    id: 'side_bend', name: '站姿侧屈', category: '核心', type: 'reps',
    cues: { start: '双脚与肩同宽', move: '一手过头，体侧屈，左右交替', key: '侧腰发力，别前倾', errors: '前倾后仰、甩太快' },
    badminton: '侧向移动稳定'
  },
  single_leg: {
    id: 'single_leg', name: '单腿站立平衡', category: '核心', type: 'hold',
    cues: { start: '单腿站立', move: '保持平衡30秒，闭眼进阶', key: '核心收紧，目光定一点', errors: '膝盖内扣、晃' },
    badminton: '落地稳定、防崴脚'
  },
  russian_twist: {
    id: 'russian_twist', name: '站姿俄罗斯转体（慢速）', category: '核心', type: 'reps',
    cues: { start: '双脚与肩同宽，微屈膝', move: '双手于胸前，躯干左右转', key: '转躯干不是只动手臂', errors: '只动手臂、弓背、甩太快' },
    badminton: '杀球转体、变向稳定'
  },
  plank: {
    id: 'plank', name: '平板支撑', category: '核心', type: 'hold',
    cues: { start: '前臂支撑，身体一线', move: '保持40秒', key: '收腹，别塌腰翘臀', errors: '塌腰、翘臀、憋气' },
    badminton: '核心稳定、击球传导'
  },

  // ---------- 下肢自重 ----------
  squat: {
    id: 'squat', name: '深蹲', category: '自重', type: 'reps',
    cues: { start: '双脚与肩同宽', move: '屈髋屈膝下蹲，像坐椅子', key: '膝盖对准脚尖，背挺直', errors: '膝盖内扣、弓背、脚跟离地' },
    badminton: '启动、跨步、起跳'
  },
  lunge: {
    id: 'lunge', name: '箭步蹲', category: '自重', type: 'reps',
    cues: { start: '站立', move: '一脚前跨下蹲，前后膝90度', key: '前膝对准脚尖，重心垂直', errors: '前膝超脚尖、后腿直' },
    badminton: '弓步上网、跨步'
  },
  calf_raise: {
    id: 'calf_raise', name: '提踵', category: '自重', type: 'reps',
    cues: { start: '站立，可扶墙', move: '前脚掌蹬地抬起脚跟', key: '慢上慢下，顶峰收缩', errors: '弹太快、幅度小' },
    badminton: '起跳、变向蹬地'
  },

  // ---------- 哑铃类 ----------
  db_press: {
    id: 'db_press', name: '哑铃推举', category: '哑铃', type: 'reps',
    weight: '5-7.5kg', sets: 3, reps: 12, rest_between_sec: 45,
    cues: { start: '双手持哑铃于肩两侧，掌心朝前', move: '向上推起，头顶上方接近不碰撞', descent: '缓慢回到肩部高度', key: '别耸肩，腰别后仰', errors: '腰部后仰、耸肩、下放太快' },
    badminton: '杀球、高远球、平抽'
  },
  db_lateral: {
    id: 'db_lateral', name: '哑铃侧平举', category: '哑铃', type: 'reps',
    weight: '3-5kg', sets: 3, reps: 12, rest_between_sec: 45,
    cues: { start: '双手持哑铃垂于体侧，掌心朝内', move: '手肘微屈，向两侧抬到与肩同高', descent: '缓慢下放，别自由落体', key: '用肩发力，不是甩手臂', errors: '抬太高、耸肩、用惯性' },
    badminton: '抬臂封网、举拍防守'
  },
  db_row: {
    id: 'db_row', name: '哑铃划船', category: '哑铃', type: 'reps',
    weight: '7.5-10kg', sets: 3, reps: 12, perSide: true, rest_between_sec: 45,
    cues: { start: '单膝跪椅，同侧手撑住，另手持哑铃', move: '拉向髋部方向，手肘贴近身体', descent: '缓慢下放，肩胛骨后收', key: '背平直，想"手肘往后顶"', errors: '弓背、用手臂硬拉、身体旋转' },
    badminton: '杀球回位、反手发力、稳定肩胛'
  },
  db_wrist_curl: {
    id: 'db_wrist_curl', name: '哑铃腕弯举', category: '哑铃', type: 'reps',
    weight: '3-5kg', sets: 3, reps: 15, rest_between_sec: 40,
    cues: { start: '坐姿，前臂放大腿，手腕悬空，掌心朝上', move: '只用手腕向上弯起，再缓慢下放', variant: '掌心朝下做反向腕弯举', key: '前臂贴紧大腿，别抬起', errors: '整臂发力、速度太快' },
    badminton: '握拍稳定、搓球、平抽控制'
  },
  db_squat: {
    id: 'db_squat', name: '哑铃深蹲', category: '哑铃', type: 'reps',
    weight: '7.5-10kg', sets: 3, reps: 15, rest_between_sec: 50, optional: true,
    cues: { start: '双手持哑铃垂于体侧，或抱一只在胸前', move: '屈髋屈膝下蹲，像坐椅子', descent: '大腿接近平行地面后站起', key: '膝盖对准脚尖，背挺直', errors: '膝盖内扣、弓背、脚跟离地' },
    badminton: '启动、跨步、起跳'
  },
  db_russian: {
    id: 'db_russian', name: '俄罗斯转体（哑铃）', category: '哑铃', type: 'reps',
    weight: '3-5kg', sets: 3, reps: 15, rest_between_sec: 40,
    cues: { start: '坐姿屈膝，双手持哑铃于胸前', move: '身体微后仰，左右转体', key: '转的是躯干，不是只动手臂', errors: '只动手臂、弓背、甩太快' },
    badminton: '杀球转体、变向稳定'
  },

  // ---------- 自重类 ----------
  pushup: {
    id: 'pushup', name: '俯卧撑', category: '自重', type: 'reps',
    cues: { start: '双手与肩同宽，身体一线', move: '下降至胸近地面，推起', key: '身体保持直线，别塌腰', errors: '塌腰翘臀、下降不到位' },
    badminton: '上肢力量、击球稳定'
  },
  situp: {
    id: 'situp', name: '仰卧起坐', category: '自重', type: 'reps',
    cues: { start: '仰卧屈膝，双手轻触耳侧', move: '卷起上身，肩胛离地', key: '腹部发力，别拽头', errors: '拽头、腰部代偿' },
    badminton: '核心、击球传导'
  }
};

// ============================================================
// 周安排（第1周基准版）
// 每天：{ label, morning: [...], evening: [...]|null, rest: bool }
// 每个 entry: { id, section, duration_sec?, sets?, reps?, perSide?, rest_between_sec?, intervalSec?, intervalPairs? }
// ============================================================
const WEEKLY_SCHEDULE = {
  1: { // 周一
    label: '周一 · 加速跑+折返+站姿核心',
    morning: [
      { id: 'jog', section: 'warmup', duration_sec: 300 },
      { id: 'dynamic_stretch', section: 'warmup', duration_sec: 300 },
      { id: 'sprint', section: 'main', sets: 8, rest_between_sec: 40, note: '走回恢复' },
      { id: 'shuttle_run', section: 'main', sets: 6, rest_between_sec: 60 },
      { id: 'knee_twist', section: 'core', sets: 3, reps: 20, rest_between_sec: 30 },
      { id: 'side_bend', section: 'core', sets: 3, reps: 15, perSide: true, rest_between_sec: 30 },
      { id: 'single_leg', section: 'core', sets: 3, duration_sec: 30, perSide: true, rest_between_sec: 20 },
      { id: 'stretch', section: 'cooldown', duration_sec: 300 }
    ],
    evening: [
      { id: 'situp', sets: 3, reps: 20, rest_between_sec: 30 },
      { id: 'db_press', sets: 3, reps: 12, rest_between_sec: 45 },
      { id: 'db_lateral', sets: 3, reps: 12, rest_between_sec: 45 },
      { id: 'db_row', sets: 3, reps: 12, perSide: true, rest_between_sec: 45 },
      { id: 'db_wrist_curl', sets: 3, reps: 15, rest_between_sec: 40 }
    ]
  },
  2: { // 周二
    label: '周二 · 原地间歇+站姿核心',
    morning: [
      { id: 'jog', section: 'warmup', duration_sec: 300 },
      { id: 'high_knees', section: 'main', duration_sec: 30, intervalSec: 30, intervalPairs: 10, intervalPartner: 'jog', note: '高抬腿30秒+慢跑30秒' },
      { id: 'jumping_jacks', section: 'main', duration_sec: 30, intervalSec: 30, intervalPairs: 10, intervalPartner: 'jog', note: '开合跳30秒+慢跑30秒' },
      { id: 'knee_twist', section: 'core', sets: 3, reps: 20, rest_between_sec: 30 },
      { id: 'russian_twist', section: 'core', sets: 3, reps: 15, rest_between_sec: 30 },
      { id: 'stretch', section: 'cooldown', duration_sec: 300 }
    ],
    evening: [
      { id: 'pushup', sets: 3, reps: 15, rest_between_sec: 40 },
      { id: 'db_wrist_curl', sets: 3, reps: 15, rest_between_sec: 40 }
    ]
  },
  3: { // 周三
    label: '周三 · 慢跑+动态拉伸',
    morning: [
      { id: 'jog', section: 'main', duration_sec: 1200 },
      { id: 'dynamic_stretch', section: 'main', duration_sec: 600 },
      { id: 'plank', section: 'core', sets: 3, duration_sec: 40, rest_between_sec: 30 },
      { id: 'footwork', section: 'main', duration_sec: 600 },
      { id: 'stretch', section: 'cooldown', duration_sec: 300 }
    ],
    evening: [
      { id: 'situp', sets: 3, reps: 20, rest_between_sec: 30, optional: true }
    ]
  },
  4: { // 周四
    label: '周四 · 轻量激活（晚上打球）',
    morning: [
      { id: 'jog', section: 'main', duration_sec: 600 },
      { id: 'dynamic_stretch', section: 'main', duration_sec: 600 },
      { id: 'small_jump_swing', section: 'main', duration_sec: 600 },
      { id: 'stretch', section: 'cooldown', duration_sec: 300 }
    ],
    evening: null,
    note: '晚上中等双打，不补哑铃留力'
  },
  5: { // 周五
    label: '周五 · 下肢间歇+站姿核心',
    morning: [
      { id: 'jog', section: 'warmup', duration_sec: 300 },
      { id: 'jumping_jacks', section: 'main', duration_sec: 30, intervalSec: 30, intervalPairs: 10, intervalPartner: 'jog', note: '开合跳30秒+慢跑30秒' },
      { id: 'squat', section: 'main', sets: 3, reps: 15, rest_between_sec: 45 },
      { id: 'lunge', section: 'main', sets: 3, reps: 10, perSide: true, rest_between_sec: 45 },
      { id: 'calf_raise', section: 'main', sets: 3, reps: 20, rest_between_sec: 30 },
      { id: 'knee_twist', section: 'core', sets: 3, reps: 20, rest_between_sec: 30 },
      { id: 'stretch', section: 'cooldown', duration_sec: 300 }
    ],
    evening: [
      { id: 'pushup', sets: 3, reps: 15, rest_between_sec: 40 },
      { id: 'db_press', sets: 3, reps: 12, rest_between_sec: 45 },
      { id: 'db_wrist_curl', sets: 3, reps: 15, rest_between_sec: 40 }
    ]
  },
  6: { // 周六
    label: '周六 · 休息或轻拉伸',
    morning: [
      { id: 'stretch', section: 'cooldown', duration_sec: 600, optional: true }
    ],
    evening: null,
    rest: true,
    note: '休息或轻拉伸'
  },
  7: { // 周日
    label: '周日 · 休息',
    morning: null,
    evening: null,
    rest: true,
    note: '完全休息'
  }
};

// ============================================================
// 周进度调整（第2-4周在第1周基准上调整）
// ============================================================
const WEEK_MODIFIERS = {
  1: { focus: '适应期（无跳绳替代）', adjustment: '组数取下限', useJumpRope: false },
  2: { focus: '加量期（有跳绳）', adjustment: '间歇+2组', useJumpRope: true, intervalAdd: 2 },
  3: { focus: '强化期', adjustment: '冲刺+2次，折返+2组', useJumpRope: true, sprintAdd: 2, shuttleAdd: 2 },
  4: { focus: '减量期', adjustment: '赛前3天只轻量激活', useJumpRope: true, taper: true, setsMultiplier: 0.7 }
};

// ============================================================
// 赛前一周安排（10月14日-10月17日）— 覆盖默认周安排
// 日期 -> 训练内容
// ============================================================
const PRE_TOURNAMENT_SCHEDULE = {
  '2026-10-14': {
    label: '10月14日 · 赛前减量 Day1',
    morning: [
      { id: 'jog', section: 'main', duration_sec: 600 },
      { id: 'stretch', section: 'cooldown', duration_sec: 600 }
    ],
    evening: null
  },
  '2026-10-15': {
    label: '10月15日 · 赛前减量 Day2',
    morning: [
      { id: 'jog', section: 'warmup', duration_sec: 300 },
      { id: 'dynamic_stretch', section: 'main', duration_sec: 300 },
      { id: 'small_jump_swing', section: 'main', duration_sec: 300 }
    ],
    evening: null
  },
  '2026-10-16': {
    label: '10月16日 · 完全休息',
    morning: null,
    evening: null,
    rest: true,
    note: '完全休息，早睡，多碳水'
  },
  '2026-10-17': {
    label: '10月17日 · 比赛日',
    morning: [
      { id: 'jog', section: 'main', duration_sec: 300, note: '赛前1小时热身' },
      { id: 'small_jump_swing', section: 'main', duration_sec: 60 },
      { id: 'dynamic_stretch', section: 'main', duration_sec: 300 },
      { id: 'small_jump_swing', section: 'main', duration_sec: 120, note: '挥拍模拟' }
    ],
    evening: null,
    note: '比赛日！提前1小时热身，别吃太饱'
  }
};

const PROGRESSION = [
  { week: 1, focus: '适应，无跳绳替代', adjustment: '组数取下限' },
  { week: 2, focus: '加量，有跳绳', adjustment: '间歇+2组' },
  { week: 3, focus: '强化', adjustment: '冲刺+2次，折返+2组' },
  { week: 4, focus: '减量', adjustment: '赛前3天只轻量激活' }
];

// 通用注意事项
const GENERAL_TIPS = [
  '跳绳选缓冲好的鞋，别在水泥地硬跳',
  '冲刺跑前一定热身，否则易拉伤',
  '每周至少1天完全休息',
  '如果某天很累，只做核心+拉伸，别硬撑',
  '双打更看重反应和连贯，平时可对墙模拟挥拍、练启动步',
  '赛前一周：减量、早睡、多碳水',
  '比赛当天：提前1小时热身，别吃太饱'
];

// 哑铃通用要求
const DUMBBELL_TIPS = [
  '先热身：肩腕绕环、空手模拟各10次',
  '发力呼气，还原吸气',
  '宁轻勿重，动作变形就减重量',
  '下放比推起更重要，控制住',
  '赛前一周减重量，只做轻量激活'
];

// ============================================================
// 工具函数：根据日期获取当天安排
// ============================================================
function getWeekNumber(date) {
  const start = new Date(META.startDate + 'T00:00:00');
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((d - start) / 86400000);
  const week = Math.floor(diffDays / 7) + 1; // 1-5
  // 10月12-13日(第5周)不在赛前期覆盖范围,clamp 到第4周减量
  return Math.min(week, 4);
}

function isPreTournament(date) {
  const ymd = formatDateYMD(date);
  return PRE_TOURNAMENT_SCHEDULE.hasOwnProperty(ymd);
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 获取某天的完整安排（应用周调整 + 跳绳替代）
function getScheduleForDate(date) {
  // 赛前周优先
  const ymd = formatDateYMD(date);
  if (PRE_TOURNAMENT_SCHEDULE[ymd]) {
    return { ...PRE_TOURNAMENT_SCHEDULE[ymd], isPreTournament: true };
  }

  const weekday = date.getDay() === 0 ? 7 : date.getDay(); // 周日=7
  const base = WEEKLY_SCHEDULE[weekday];
  if (!base) return null;

  const weekNum = getWeekNumber(date);
  const mod = WEEK_MODIFIERS[weekNum] || WEEK_MODIFIERS[1];

  // 深拷贝并应用调整
  const result = {
    label: base.label,
    morning: base.morning ? base.morning.map(applyModifier.bind(null, mod, weekNum)) : null,
    evening: base.evening ? base.evening.map(applyModifier.bind(null, mod, weekNum)) : null,
    rest: base.rest,
    note: base.note,
    week: weekNum,
    weekday
  };
  return result;
}

// 应用周调整到单个动作
function applyModifier(mod, weekNum, ex) {
  const copy = { ...ex };
  const def = EXERCISES[ex.id];

  // 第2周起：跳绳替代高抬腿/开合跳/小步跑
  if (mod.useJumpRope && def && def.week1Substitute) {
    copy.id = 'jump_rope';
    // 同步更新 note,把原动作名替换为"跳绳",避免文案误导
    const origName = def.name;
    if (copy.note) {
      copy.note = copy.note.replace(origName, '跳绳') + '（跳绳替代）';
    } else {
      copy.note = '跳绳替代';
    }
    // intervalPartner 改为 null(跳绳不需要慢跑间歇)
    if (copy.intervalPartner) {
      copy.intervalPartner = null;
      copy.intervalSec = 0;
      copy.intervalPairs = 1;
      copy.duration_sec = 600; // 跳绳10分钟
    }
  }

  // 第2周：间歇+2组
  if (mod.intervalAdd && copy.intervalPairs) {
    copy.intervalPairs += mod.intervalAdd;
  }

  // 第3周：冲刺+2次
  if (mod.sprintAdd && ex.id === 'sprint') {
    copy.sets = (copy.sets || 0) + mod.sprintAdd;
  }
  // 第3周：折返+2组
  if (mod.shuttleAdd && ex.id === 'shuttle_run') {
    copy.sets = (copy.sets || 0) + mod.shuttleAdd;
  }

  // 第4周减量：组数×0.7 取整
  if (mod.setsMultiplier && copy.sets) {
    copy.sets = Math.max(1, Math.round(copy.sets * mod.setsMultiplier));
  }
  if (mod.setsMultiplier && copy.reps) {
    copy.reps = Math.max(5, Math.round(copy.reps * mod.setsMultiplier));
  }

  return copy;
}

// 训练日期范围
function isTrainingDay(date) {
  const ymd = formatDateYMD(date);
  const start = new Date(META.startDate + 'T00:00:00');
  const end = new Date(META.endDate + 'T23:59:59');
  return date >= start && date <= end;
}

// 暴露到全局
window.TRAINING_DATA = {
  META, SECTION, EXERCISES, WEEKLY_SCHEDULE, WEEK_MODIFIERS,
  PRE_TOURNAMENT_SCHEDULE, PROGRESSION, GENERAL_TIPS, DUMBBELL_TIPS,
  getScheduleForDate, getWeekNumber, isPreTournament, formatDateYMD, isTrainingDay
};
