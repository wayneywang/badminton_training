// ============================================================
// 火柴人动画系统
// 参数化骨架 + 关键帧插值,25 个动作共用一套渲染器
// 关节参数（角度,0=站立中性）:
//   bodyTilt   躯干前倾(正=前)
//   headTilt   头部
//   shoulderL/R 肩外展(0=下垂 90=侧平举 180=过头)
//   shoulderRotL/R 肩前后旋转(用于跑步摆臂,正=前)
//   elbowL/R   肘屈(0=直 150=全屈)
//   hipL/R     髋屈(正=前抬)
//   kneeL/R    膝屈(0=直 150=全屈)
//   bodyY      重心上下移动(向下为正,跳跃用)
//   bodyX      重心左右移动
//   dumbbell   是否持哑铃
//   ropeActive 跳绳用,绳子位置
// ============================================================

(function() {
'use strict';

// ---------- 几何辅助 ----------
const DEG = Math.PI / 180;
function deg2rad(d) { return d * DEG; }
function lerp(a, b, t) { return a + (b - a) * t; }
// 角度插值（处理 -180~180 范围的最短路径）
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * t;
}

// 插值两个 pose 对象
function lerpPose(p1, p2, t) {
  const out = {};
  for (const k in p1) {
    if (typeof p1[k] === 'number' && typeof p2[k] === 'number') {
      // 涉及角度的字段走最短路径
      if (k.includes('L') || k.includes('R') || k.includes('Tilt') || k.includes('Rot') || k === 'hipL' || k === 'hipR' || k === 'kneeL' || k === 'kneeR') {
        out[k] = lerpAngle(p1[k], p2[k], t);
      } else {
        out[k] = lerp(p1[k], p2[k], t);
      }
    } else {
      out[k] = p2[k] !== undefined ? p2[k] : p1[k];
    }
  }
  return out;
}

// ---------- 默认中性姿势 ----------
const POSE_NEUTRAL = {
  bodyTilt: 0, headTilt: 0,
  shoulderL: 5, shoulderR: 5, shoulderRotL: 0, shoulderRotR: 0,
  elbowL: 10, elbowR: 10,
  hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
  bodyY: 0, bodyX: 0,
  dumbbell: false, ropeActive: false, ropeAngle: 0
};

// ---------- 骨架参数（基于 viewBox 200x240） ----------
const SKELETON = {
  cx: 100,         // 身体中心 x
  headR: 14,        // 头半径
  neckY: 30,       // 颈部 y（头中心下方）
  shoulderY: 40,   // 肩 y
  shoulderW: 36,   // 肩宽一半
  hipY: 100,       // 髋 y
  hipW: 14,        // 髋宽一半
  upperArm: 32,    // 上臂长
  foreArm: 30,     // 前臂长
  thigh: 44,       // 大腿长
  shank: 42,       // 小腿长
  footLen: 18      // 脚长
};

// ---------- 核心渲染：根据 pose 返回 SVG 字符串 ----------
function renderFigure(pose) {
  const p = Object.assign({}, POSE_NEUTRAL, pose);
  const s = SKELETON;

  // 重心位置
  const cx = s.cx + (p.bodyX || 0);
  const baseY = s.hipY + (p.bodyY || 0);

  // 躯干顶部（颈/肩）位置 — 受 bodyTilt 影响（前倾=向前下移）
  const tiltRad = deg2rad(p.bodyTilt);
  const torsoLen = s.shoulderY < baseY ? baseY - s.shoulderY : 60;
  // 躯干向量（默认竖直向上,前倾时 x 增加）
  const tx = cx + Math.sin(tiltRad) * torsoLen;
  const ty = baseY - Math.cos(tiltRad) * torsoLen;

  // 头中心（在颈之上,受 headTilt 影响）
  const headRad = deg2rad(p.headTilt);
  const headX = tx + Math.sin(headRad) * (s.headR + 4);
  const headY = ty - Math.cos(headRad) * (s.headR + 4);

  // 肩位置
  const shoulderLX = tx - s.shoulderW * Math.cos(tiltRad);
  const shoulderLY = ty + s.shoulderW * Math.sin(tiltRad);
  const shoulderRX = tx + s.shoulderW * Math.cos(tiltRad);
  const shoulderRY = ty - s.shoulderW * Math.sin(tiltRad);

  // 髋位置
  const hipLX = cx - s.hipW;
  const hipLY = baseY;
  const hipRX = cx + s.hipW;
  const hipRY = baseY;

  // 上臂方向: shoulder 角度 = 外展(从下垂0到侧平举90到过头180)
  // shoulderRot 是前后摆动(跑步用,绕身体轴)
  // 简化：外展决定手臂在冠状面内的角度,前后摆动叠加为 x 偏移
  // 左臂：从肩向下为0,外展正=向外(左)打开
  function armEndpoint(shoulderX, shoulderY, shoulder, elbow, isLeft) {
    const sign = isLeft ? -1 : 1;
    // 外展角:0=下垂(沿 +y), 90=侧平举(沿 sign*x), 180=过头(沿 -y)
    const abdRad = deg2rad(shoulder);
    // 前后摆动叠加到 x（前=+,后=-）,这里简化为整体偏移
    let ax = shoulderX + sign * Math.sin(abdRad) * s.upperArm;
    let ay = shoulderY + Math.cos(abdRad) * s.upperArm;
    // 前后摆动 — 用 shoulderRot 近似
    const rot = (isLeft ? p.shoulderRotL : p.shoulderRotR) || 0;
    ax += Math.sin(deg2rad(rot)) * 10;
    ay -= Math.sin(deg2rad(rot)) * 4;
    // 肘屈：前臂相对上臂方向再屈
    const elbowRad = deg2rad(elbow);
    // 前臂方向 = 上臂方向旋转 (180 - elbow)
    // 简化：前臂沿上臂反方向加偏移
    const foreAx = ax + sign * Math.sin(abdRad - elbowRad * 0.5) * s.foreArm;
    const foreAy = ay + Math.cos(abdRad + elbowRad * 0.5) * s.foreArm;
    return { elbowX: ax, elbowY: ay, handX: foreAx, handY: foreAy };
  }

  const armL = armEndpoint(shoulderLX, shoulderLY, p.shoulderL, p.elbowL, true);
  const armR = armEndpoint(shoulderRX, shoulderRY, p.shoulderR, p.elbowR, false);

  // 腿：hip 角度(0=向下,正=前抬), knee 屈(0=直)
  function legEndpoint(hipX, hipY, hip, knee, isLeft) {
    const sign = isLeft ? -1 : 1;
    // 大腿方向：0=向下(+y),正髋屈=向前(+x)
    const hipRad = deg2rad(hip);
    const kneeX = hipX + Math.sin(hipRad) * s.thigh;
    const kneeY = hipY + Math.cos(hipRad) * s.thigh;
    // 小腿：在大腿方向基础上屈膝
    const kneeRad = deg2rad(knee);
    // 小腿方向相对大腿屈 (knee=0 同向,knee 越大越向后弯)
    const shankX = kneeX + Math.sin(hipRad - kneeRad) * s.shank;
    const shankY = kneeY + Math.cos(hipRad - kneeRad) * s.shank;
    // 脚：向前一点
    const footX = shankX + Math.sin(hipRad - kneeRad + 0.4) * s.footLen;
    const footY = shankY + Math.abs(Math.cos(hipRad - kneeRad)) * 4;
    return { kneeX, kneeY, ankleX: shankX, ankleY: shankY, footX, footY };
  }

  const legL = legEndpoint(hipLX, hipLY, p.hipL, p.kneeL, true);
  const legR = legEndpoint(hipRX, hipRY, p.hipR, p.kneeR, false);

  // 路径字符串
  const stroke = '#1a73e8';
  const sw = 5;
  const headStroke = '#1a73e8';
  const dumbbellColor = '#444';

  let svg = `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;

  // 地面（虚线）
  svg += `<line x1="20" y1="220" x2="180" y2="220" stroke="#bbb" stroke-width="1.5" stroke-dasharray="4 4"/>`;

  // 跳绳绳子（如果激活）
  if (p.ropeActive) {
    const ropeAngleRad = deg2rad(p.ropeAngle || 0);
    // 绳子从一只手到另一只手,绕过身体
    const midX = (armL.handX + armR.handX) / 2;
    const midY = (armL.handY + armR.handY) / 2 - Math.abs(Math.sin(ropeAngleRad)) * 50;
    svg += `<path d="M ${armL.handX} ${armL.handY} Q ${midX} ${midY} ${armR.handX} ${armR.handY}" fill="none" stroke="#888" stroke-width="2"/>`;
  }

  // 躯干
  svg += `<line x1="${cx}" y1="${baseY}" x2="${tx}" y2="${ty}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

  // 肩横线
  svg += `<line x1="${shoulderLX}" y1="${shoulderLY}" x2="${shoulderRX}" y2="${shoulderRY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

  // 左臂
  svg += `<line x1="${shoulderLX}" y1="${shoulderLY}" x2="${armL.elbowX}" y2="${armL.elbowY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${armL.elbowX}" y1="${armL.elbowY}" x2="${armL.handX}" y2="${armL.handY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // 右臂
  svg += `<line x1="${shoulderRX}" y1="${shoulderRY}" x2="${armR.elbowX}" y2="${armR.elbowY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${armR.elbowX}" y1="${armR.elbowY}" x2="${armR.handX}" y2="${armR.handY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

  // 髋横线
  svg += `<line x1="${hipLX}" y1="${hipLY}" x2="${hipRX}" y2="${hipRY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

  // 左腿
  svg += `<line x1="${hipLX}" y1="${hipLY}" x2="${legL.kneeX}" y2="${legL.kneeY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${legL.kneeX}" y1="${legL.kneeY}" x2="${legL.ankleX}" y2="${legL.ankleY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${legL.ankleX}" y1="${legL.ankleY}" x2="${legL.footX}" y2="${legL.footY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // 右腿
  svg += `<line x1="${hipRX}" y1="${hipRY}" x2="${legR.kneeX}" y2="${legR.kneeY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${legR.kneeX}" y1="${legR.kneeY}" x2="${legR.ankleX}" y2="${legR.ankleY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += `<line x1="${legR.ankleX}" y1="${legR.ankleY}" x2="${legR.footX}" y2="${legR.footY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

  // 哑铃（如果持哑铃）
  if (p.dumbbell) {
    const drawDB = (x, y) => {
      svg += `<rect x="${x - 4}" y="${y - 6}" width="8" height="12" rx="2" fill="${dumbbellColor}"/>`;
      svg += `<rect x="${x - 7}" y="${y - 4}" width="3" height="8" fill="${dumbbellColor}"/>`;
      svg += `<rect x="${x + 4}" y="${y - 4}" width="3" height="8" fill="${dumbbellColor}"/>`;
    };
    drawDB(armL.handX, armL.handY);
    drawDB(armR.handX, armR.handY);
  } else {
    // 手（小圆点）
    svg += `<circle cx="${armL.handX}" cy="${armL.handY}" r="3" fill="${stroke}"/>`;
    svg += `<circle cx="${armR.handX}" cy="${armR.handY}" r="3" fill="${stroke}"/>`;
  }

  // 头
  svg += `<circle cx="${headX}" cy="${headY}" r="${s.headR}" fill="#fff" stroke="${headStroke}" stroke-width="3"/>`;
  // 简单面部（眼）
  const eyeDX = 4 * Math.cos(headRad);
  const eyeDY = -4 * Math.sin(headRad);
  svg += `<circle cx="${headX - 4}" cy="${headY - 2}" r="1.5" fill="#1a73e8"/>`;
  svg += `<circle cx="${headX + 4}" cy="${headY - 2}" r="1.5" fill="#1a73e8"/>`;

  svg += `</svg>`;
  return svg;
}

// ============================================================
// 动作关键帧定义
// 每个动作 = [{ t: 0~1, pose: {...} }, ...]
// t 是循环内归一化时间
// ============================================================
const ANIMATIONS = {
  // 慢跑
  jog: {
    duration: 800, loops: true,
    frames: [
      { t: 0,    pose: { shoulderRotL: 30, shoulderRotR: -30, elbowL: 80, elbowR: 80, hipL: 25, kneeL: 60, hipR: -15, kneeR: 20, bodyY: 0 } },
      { t: 0.25, pose: { shoulderRotL: -30, shoulderRotR: 30, elbowL: 80, elbowR: 80, hipL: -15, kneeL: 20, hipR: 25, kneeR: 60, bodyY: 4 } },
      { t: 0.5,  pose: { shoulderRotL: 30, shoulderRotR: -30, elbowL: 80, elbowR: 80, hipL: 25, kneeL: 60, hipR: -15, kneeR: 20, bodyY: 0 } },
      { t: 0.75, pose: { shoulderRotL: -30, shoulderRotR: 30, elbowL: 80, elbowR: 80, hipL: -15, kneeL: 20, hipR: 25, kneeR: 60, bodyY: 4 } },
      { t: 1,    pose: { shoulderRotL: 30, shoulderRotR: -30, elbowL: 80, elbowR: 80, hipL: 25, kneeL: 60, hipR: -15, kneeR: 20, bodyY: 0 } }
    ]
  },

  // 冲刺跑
  sprint: {
    duration: 500, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 15, shoulderRotL: 60, shoulderRotR: -60, elbowL: 100, elbowR: 100, hipL: 45, kneeL: 90, hipR: -30, kneeR: 30, bodyY: 0 } },
      { t: 0.5,  pose: { bodyTilt: 15, shoulderRotL: -60, shoulderRotR: 60, elbowL: 100, elbowR: 100, hipL: -30, kneeL: 30, hipR: 45, kneeR: 90, bodyY: 4 } },
      { t: 1,    pose: { bodyTilt: 15, shoulderRotL: 60, shoulderRotR: -60, elbowL: 100, elbowR: 100, hipL: 45, kneeL: 90, hipR: -30, kneeR: 30, bodyY: 0 } }
    ]
  },

  // 折返跑
  shuttle_run: {
    duration: 1600, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 10, shoulderRotL: 50, shoulderRotR: -50, elbowL: 90, elbowR: 90, hipL: 40, kneeL: 80, hipR: -25, kneeR: 25, bodyY: 0 } },
      { t: 0.3,  pose: { bodyTilt: 25, shoulderRotL: 0, shoulderRotR: 0, shoulderL: 60, shoulderR: 60, elbowL: 120, elbowR: 120, hipL: 60, kneeL: 100, hipR: -20, kneeR: 30, bodyX: 20, bodyY: 8 } },
      { t: 0.5,  pose: { bodyTilt: -10, hipL: -30, kneeL: 30, hipR: 50, kneeR: 100, bodyX: 30, bodyY: 0 } },
      { t: 0.8,  pose: { bodyTilt: 10, shoulderRotL: -50, shoulderRotR: 50, elbowL: 90, elbowR: 90, hipL: -25, kneeL: 25, hipR: 40, kneeR: 80, bodyX: 0, bodyY: 0 } },
      { t: 1,    pose: { bodyTilt: 10, shoulderRotL: 50, shoulderRotR: -50, elbowL: 90, elbowR: 90, hipL: 40, kneeL: 80, hipR: -25, kneeR: 25, bodyY: 0 } }
    ]
  },

  // 高抬腿
  high_knees: {
    duration: 600, loops: true,
    frames: [
      { t: 0,    pose: { shoulderRotL: 30, shoulderRotR: -30, elbowL: 90, elbowR: 90, hipL: 80, kneeL: 100, hipR: 0, kneeR: 20, bodyY: 0 } },
      { t: 0.5,  pose: { shoulderRotL: -30, shoulderRotR: 30, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 20, hipR: 80, kneeR: 100, bodyY: 0 } },
      { t: 1,    pose: { shoulderRotL: 30, shoulderRotR: -30, elbowL: 90, elbowR: 90, hipL: 80, kneeL: 100, hipR: 0, kneeR: 20, bodyY: 0 } }
    ]
  },

  // 开合跳
  jumping_jacks: {
    duration: 700, loops: true,
    frames: [
      { t: 0,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.5, pose: { shoulderL: 170, shoulderR: 170, elbowL: 10, elbowR: 10, hipL: -20, kneeL: 20, hipR: 20, kneeR: 20, bodyY: -8 } },
      { t: 1,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 原地小步跑
  small_step_run: {
    duration: 400, loops: true,
    frames: [
      { t: 0,   pose: { shoulderRotL: 20, shoulderRotR: -20, elbowL: 70, elbowR: 70, hipL: 15, kneeL: 40, hipR: -10, kneeR: 15, bodyY: 0 } },
      { t: 0.5, pose: { shoulderRotL: -20, shoulderRotR: 20, elbowL: 70, elbowR: 70, hipL: -10, kneeL: 15, hipR: 15, kneeR: 40, bodyY: 2 } },
      { t: 1,   pose: { shoulderRotL: 20, shoulderRotR: -20, elbowL: 70, elbowR: 70, hipL: 15, kneeL: 40, hipR: -10, kneeR: 15, bodyY: 0 } }
    ]
  },

  // 跳绳
  jump_rope: {
    duration: 600, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 30, shoulderR: 30, elbowL: 70, elbowR: 70, hipL: 0, kneeL: 10, hipR: 0, kneeR: 10, bodyY: 0, ropeActive: true, ropeAngle: 0 } },
      { t: 0.25, pose: { shoulderL: 30, shoulderR: 30, elbowL: 70, elbowR: 70, hipL: 0, kneeL: 30, hipR: 0, kneeR: 30, bodyY: -10, ropeActive: true, ropeAngle: 90 } },
      { t: 0.5,  pose: { shoulderL: 30, shoulderR: 30, elbowL: 70, elbowR: 70, hipL: 0, kneeL: 10, hipR: 0, kneeR: 10, bodyY: 0, ropeActive: true, ropeAngle: 180 } },
      { t: 0.75, pose: { shoulderL: 30, shoulderR: 30, elbowL: 70, elbowR: 70, hipL: 0, kneeL: 30, hipR: 0, kneeR: 30, bodyY: -10, ropeActive: true, ropeAngle: 270 } },
      { t: 1,    pose: { shoulderL: 30, shoulderR: 30, elbowL: 70, elbowR: 70, hipL: 0, kneeL: 10, hipR: 0, kneeR: 10, bodyY: 0, ropeActive: true, ropeAngle: 360 } }
    ]
  },

  // 原地模拟步法
  footwork: {
    duration: 1000, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 5, shoulderL: 40, shoulderR: 40, elbowL: 60, elbowR: 60, hipL: 20, kneeL: 40, hipR: -10, kneeR: 20, bodyX: 0, bodyY: 0 } },
      { t: 0.25, pose: { bodyTilt: 5, shoulderL: 40, shoulderR: 40, elbowL: 60, elbowR: 60, hipL: -10, kneeL: 20, hipR: 20, kneeR: 40, bodyX: 10, bodyY: 2 } },
      { t: 0.5,  pose: { bodyTilt: 5, shoulderL: 40, shoulderR: 40, elbowL: 60, elbowR: 60, hipL: -25, kneeL: 30, hipR: 35, kneeR: 60, bodyX: -15, bodyY: 0 } },
      { t: 0.75, pose: { bodyTilt: 5, shoulderL: 40, shoulderR: 40, elbowL: 60, elbowR: 60, hipL: 35, kneeL: 60, hipR: -25, kneeR: 30, bodyX: 15, bodyY: 0 } },
      { t: 1,    pose: { bodyTilt: 5, shoulderL: 40, shoulderR: 40, elbowL: 60, elbowR: 60, hipL: 20, kneeL: 40, hipR: -10, kneeR: 20, bodyX: 0, bodyY: 0 } }
    ]
  },

  // 原地小跳+挥拍模拟
  small_jump_swing: {
    duration: 900, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 50, shoulderR: 50, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 20, hipR: 0, kneeR: 20, bodyY: 0 } },
      { t: 0.3,  pose: { shoulderL: 170, shoulderR: 170, elbowL: 30, elbowR: 30, hipL: 0, kneeL: 40, hipR: 0, kneeR: 40, bodyY: -12 } },
      { t: 0.5,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 60, elbowR: 60, hipL: 10, kneeL: 30, hipR: 10, kneeR: 30, bodyY: 0 } },
      { t: 0.7,  pose: { shoulderL: 20, shoulderR: 20, elbowL: 100, elbowR: 100, hipL: 0, kneeL: 20, hipR: 0, kneeR: 20, bodyY: 2 } },
      { t: 1,    pose: { shoulderL: 50, shoulderR: 50, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 20, hipR: 0, kneeR: 20, bodyY: 0 } }
    ]
  },

  // 动态拉伸（弓步走示意）
  dynamic_stretch: {
    duration: 2000, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.3,  pose: { shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 40, kneeL: 80, hipR: -20, kneeR: 20, bodyY: 6 } },
      { t: 0.5,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.8,  pose: { shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: -20, kneeL: 20, hipR: 40, kneeR: 80, bodyY: 6 } },
      { t: 1,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 拉伸放松（前屈）
  stretch: {
    duration: 2500, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 0, shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.5, pose: { bodyTilt: 80, shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 10, hipR: 0, kneeR: 10, bodyY: 0 } },
      { t: 1,   pose: { bodyTilt: 0, shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 站姿提膝转体
  knee_twist: {
    duration: 1200, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 0, shoulderL: 30, shoulderR: 30, elbowL: 80, elbowR: 80, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } },
      { t: 0.25, pose: { bodyTilt: -8, shoulderL: 30, shoulderR: 30, elbowL: 80, elbowR: 80, hipL: 70, kneeL: 100, hipR: 0, kneeR: 0, bodyX: -5 } },
      { t: 0.5,  pose: { bodyTilt: 0, shoulderL: 30, shoulderR: 30, elbowL: 80, elbowR: 80, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } },
      { t: 0.75, pose: { bodyTilt: 8, shoulderL: 30, shoulderR: 30, elbowL: 80, elbowR: 80, hipL: 0, kneeL: 0, hipR: 70, kneeR: 100, bodyX: 5 } },
      { t: 1,    pose: { bodyTilt: 0, shoulderL: 30, shoulderR: 30, elbowL: 80, elbowR: 80, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } }
    ]
  },

  // 站姿侧屈
  side_bend: {
    duration: 1500, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 0, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } },
      { t: 0.25, pose: { bodyTilt: -20, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: -10 } },
      { t: 0.5,  pose: { bodyTilt: 0, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } },
      { t: 0.75, pose: { bodyTilt: 20, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 10 } },
      { t: 1,    pose: { bodyTilt: 0, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyX: 0 } }
    ]
  },

  // 单腿站立平衡
  single_leg: {
    duration: 3000, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 0, shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 80, kneeR: 130, bodyY: 0 } },
      { t: 0.5, pose: { bodyTilt: -3, shoulderL: 120, shoulderR: 60, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 90, kneeR: 140, bodyY: -2 } },
      { t: 1,   pose: { bodyTilt: 0, shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 80, kneeR: 130, bodyY: 0 } }
    ]
  },

  // 站姿俄罗斯转体
  russian_twist: {
    duration: 1400, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: 5, shoulderL: 60, shoulderR: 60, elbowL: 80, elbowR: 80, hipL: 20, kneeL: 40, hipR: 20, kneeR: 40, bodyX: 0 } },
      { t: 0.25, pose: { bodyTilt: -15, shoulderL: 60, shoulderR: 60, elbowL: 80, elbowR: 80, hipL: 20, kneeL: 40, hipR: 20, kneeR: 40, bodyX: -10 } },
      { t: 0.5,  pose: { bodyTilt: 5, shoulderL: 60, shoulderR: 60, elbowL: 80, elbowR: 80, hipL: 20, kneeL: 40, hipR: 20, kneeR: 40, bodyX: 0 } },
      { t: 0.75, pose: { bodyTilt: 25, shoulderL: 60, shoulderR: 60, elbowL: 80, elbowR: 80, hipL: 20, kneeL: 40, hipR: 20, kneeR: 40, bodyX: 10 } },
      { t: 1,    pose: { bodyTilt: 5, shoulderL: 60, shoulderR: 60, elbowL: 80, elbowR: 80, hipL: 20, kneeL: 40, hipR: 20, kneeR: 40, bodyX: 0 } }
    ]
  },

  // 平板支撑
  plank: {
    duration: 3000, loops: false,
    frames: [
      { t: 0, pose: { bodyTilt: 90, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 30 } },
      { t: 1, pose: { bodyTilt: 90, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 30 } }
    ]
  },

  // 深蹲
  squat: {
    duration: 2000, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 30, shoulderR: 30, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.4,  pose: { shoulderL: 150, shoulderR: 150, elbowL: 10, elbowR: 10, hipL: 35, kneeL: 110, hipR: 35, kneeR: 110, bodyY: 30 } },
      { t: 0.6,  pose: { shoulderL: 150, shoulderR: 150, elbowL: 10, elbowR: 10, hipL: 35, kneeL: 110, hipR: 35, kneeR: 110, bodyY: 30 } },
      { t: 1,    pose: { shoulderL: 30, shoulderR: 30, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 箭步蹲
  lunge: {
    duration: 2000, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.4,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 50, kneeL: 90, hipR: -30, kneeR: 120, bodyY: 25 } },
      { t: 0.6,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 50, kneeL: 90, hipR: -30, kneeR: 120, bodyY: 25 } },
      { t: 1,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 提踵
  calf_raise: {
    duration: 1200, loops: true,
    frames: [
      { t: 0,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } },
      { t: 0.4, pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: -10 } },
      { t: 0.6, pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: -10 } },
      { t: 1,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0 } }
    ]
  },

  // 哑铃推举
  db_press: {
    duration: 2000, loops: true,
    frames: [
      { t: 0,   pose: { shoulderL: 30, shoulderR: 30, elbowL: 100, elbowR: 100, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 0.4, pose: { shoulderL: 170, shoulderR: 170, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 0.6, pose: { shoulderL: 170, shoulderR: 170, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 1,   pose: { shoulderL: 30, shoulderR: 30, elbowL: 100, elbowR: 100, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } }
    ]
  },

  // 哑铃侧平举
  db_lateral: {
    duration: 1800, loops: true,
    frames: [
      { t: 0,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 0.4, pose: { shoulderL: 90, shoulderR: 90, elbowL: 20, elbowR: 20, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 0.6, pose: { shoulderL: 90, shoulderR: 90, elbowL: 20, elbowR: 20, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } },
      { t: 1,   pose: { shoulderL: 5, shoulderR: 5, elbowL: 10, elbowR: 10, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, dumbbell: true } }
    ]
  },

  // 哑铃划船
  db_row: {
    duration: 1800, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 70, shoulderL: 90, shoulderR: 90, elbowL: 30, elbowR: 30, hipL: 20, kneeL: 30, hipR: 0, kneeR: 10, bodyY: 20, dumbbell: true } },
      { t: 0.4, pose: { bodyTilt: 70, shoulderL: 120, shoulderR: 120, elbowL: 130, elbowR: 130, hipL: 20, kneeL: 30, hipR: 0, kneeR: 10, bodyY: 20, dumbbell: true } },
      { t: 0.6, pose: { bodyTilt: 70, shoulderL: 120, shoulderR: 120, elbowL: 130, elbowR: 130, hipL: 20, kneeL: 30, hipR: 0, kneeR: 10, bodyY: 20, dumbbell: true } },
      { t: 1,   pose: { bodyTilt: 70, shoulderL: 90, shoulderR: 90, elbowL: 30, elbowR: 30, hipL: 20, kneeL: 30, hipR: 0, kneeR: 10, bodyY: 20, dumbbell: true } }
    ]
  },

  // 哑铃腕弯举
  db_wrist_curl: {
    duration: 1500, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 80, shoulderL: 5, shoulderR: 5, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 50, dumbbell: true } },
      { t: 0.4, pose: { bodyTilt: 80, shoulderL: 5, shoulderR: 5, elbowL: 130, elbowR: 130, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 50, dumbbell: true } },
      { t: 0.6, pose: { bodyTilt: 80, shoulderL: 5, shoulderR: 5, elbowL: 130, elbowR: 130, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 50, dumbbell: true } },
      { t: 1,   pose: { bodyTilt: 80, shoulderL: 5, shoulderR: 5, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 50, dumbbell: true } }
    ]
  },

  // 哑铃深蹲
  db_squat: {
    duration: 2200, loops: true,
    frames: [
      { t: 0,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0, dumbbell: true } },
      { t: 0.4,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 35, kneeL: 110, hipR: 35, kneeR: 110, bodyY: 30, dumbbell: true } },
      { t: 0.6,  pose: { shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 35, kneeL: 110, hipR: 35, kneeR: 110, bodyY: 30, dumbbell: true } },
      { t: 1,    pose: { shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 0, dumbbell: true } }
    ]
  },

  // 俄罗斯转体（哑铃）
  db_russian: {
    duration: 1500, loops: true,
    frames: [
      { t: 0,    pose: { bodyTilt: -10, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 20, bodyX: 0, dumbbell: true } },
      { t: 0.25, pose: { bodyTilt: -25, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 20, bodyX: -10, dumbbell: true } },
      { t: 0.5,  pose: { bodyTilt: -10, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 20, bodyX: 0, dumbbell: true } },
      { t: 0.75, pose: { bodyTilt: 5, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 20, bodyX: 10, dumbbell: true } },
      { t: 1,    pose: { bodyTilt: -10, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 20, bodyX: 0, dumbbell: true } }
    ]
  },

  // 俯卧撑
  pushup: {
    duration: 2000, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 90, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 30 } },
      { t: 0.4, pose: { bodyTilt: 90, shoulderL: 170, shoulderR: 170, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 50 } },
      { t: 0.6, pose: { bodyTilt: 90, shoulderL: 170, shoulderR: 170, elbowL: 90, elbowR: 90, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 50 } },
      { t: 1,   pose: { bodyTilt: 90, shoulderL: 170, shoulderR: 170, elbowL: 0, elbowR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, bodyY: 30 } }
    ]
  },

  // 仰卧起坐
  situp: {
    duration: 1800, loops: true,
    frames: [
      { t: 0,   pose: { bodyTilt: 0, shoulderL: 90, shoulderR: 90, elbowL: 100, elbowR: 100, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 70 } },
      { t: 0.3, pose: { bodyTilt: -50, shoulderL: 90, shoulderR: 90, elbowL: 100, elbowR: 100, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 70 } },
      { t: 0.5, pose: { bodyTilt: -50, shoulderL: 90, shoulderR: 90, elbowL: 100, elbowR: 100, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 70 } },
      { t: 1,   pose: { bodyTilt: 0, shoulderL: 90, shoulderR: 90, elbowL: 100, elbowR: 100, hipL: 70, kneeL: 90, hipR: 70, kneeR: 90, bodyY: 70 } }
    ]
  }
};

// 兜底：未定义动画的动作用中性静止姿势
const FALLBACK_ANIM = {
  duration: 2000, loops: false,
  frames: [{ t: 0, pose: {} }, { t: 1, pose: {} }]
};

// ---------- 动画实例 ----------
class FigureAnimation {
  constructor(container, exerciseId, opts = {}) {
    this.container = container;
    this.exerciseId = exerciseId;
    this.anim = ANIMATIONS[exerciseId] || FALLBACK_ANIM;
    this.speed = opts.speed || 1;     // 1=正常,0.5=慢放
    this.playing = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.rafId = null;
    this.onFrame = opts.onFrame || null;
    this.render();
    if (opts.autoplay !== false) this.play();
  }
  render(poseOverride) {
    let pose;
    if (poseOverride) {
      pose = poseOverride;
    } else {
      pose = this.anim.frames[0].pose;
    }
    this.container.innerHTML = renderFigure(pose);
  }
  play() {
    if (this.playing) return;
    this.playing = true;
    this.startTime = performance.now() - this.pausedAt / this.speed;
    this._tick();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.rafId);
    const elapsed = (performance.now() - this.startTime) * this.speed;
    this.pausedAt = elapsed % this.anim.duration;
  }
  setSpeed(s) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.speed = s;
    if (wasPlaying) this.play();
  }
  restart() {
    this.pausedAt = 0;
    if (this.playing) {
      this.playing = false;
      this.play();
    } else {
      this.render();
    }
  }
  _tick() {
    if (!this.playing) return;
    const now = performance.now();
    const elapsed = (now - this.startTime) * this.speed;
    let t = (elapsed % this.anim.duration) / this.anim.duration;
    // 找到关键帧区间
    const frames = this.anim.frames;
    let i = 0;
    for (; i < frames.length - 1; i++) {
      if (t >= frames[i].t && t <= frames[i + 1].t) break;
    }
    const f1 = frames[i];
    const f2 = frames[Math.min(i + 1, frames.length - 1)];
    const localT = (t - f1.t) / (f2.t - f1.t || 1);
    const pose = lerpPose(f1.pose, f2.pose, Math.max(0, Math.min(1, localT)));
    this.container.innerHTML = renderFigure(pose);
    if (this.onFrame) this.onFrame(t);
    this.rafId = requestAnimationFrame(() => this._tick());
  }
  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.rafId);
  }
}

// ---------- 静态预览(演示库缩略图,不动画) ----------
function renderStatic(container, exerciseId) {
  const anim = ANIMATIONS[exerciseId] || FALLBACK_ANIM;
  const pose = Object.assign({}, POSE_NEUTRAL, anim.frames[0].pose);
  container.innerHTML = renderFigure(pose);
}

// 暴露到全局
window.STICK_FIGURE = {
  renderFigure,
  renderStatic,
  FigureAnimation,
  ANIMATIONS,
  POSE_NEUTRAL
};

})();
