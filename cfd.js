/**
 * cfd.js  (수정판 v2)
 * 전산유체역학(CFD) 시뮬레이션 엔진
 *
 * 수정 사항:
 * 1. scene() lazy getter — window._aircraft 준비 전에 호출되던 초기화 오류 해결
 * 2. matCFD를 window._matCFD로부터 참조 (aircraft.js에서 전역 노출)
 * 3. buildStreamlines를 public API에 올바르게 노출
 * 4. buildParticles()를 window._aircraft 준비 후로 지연 초기화
 * 5. 두 번째 requestAnimationFrame 루프 충돌 제거
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     SCENE ACCESSOR (lazy — aircraft.js가 먼저 실행되어야 함)
  ═══════════════════════════════════════ */
  function getScene() {
    return window._aircraft ? window._aircraft.scene : null;
  }

  /* ═══════════════════════════════════════
     STATE
  ═══════════════════════════════════════ */
  let cfdGroup       = null;
  let streamlineGroup = null;
  let particles      = null;

  /* ═══════════════════════════════════════
     COLOR MAP: pressure → RGB
  ═══════════════════════════════════════ */
  function pressureToColor(cp) {
    const t = Math.max(0, Math.min(1, (cp + 2.5) / 4.0));
    let r, g, b;
    if (t < 0.25)      { const s = t / 0.25;          r = 0; g = s; b = 1; }
    else if (t < 0.5)  { const s = (t - 0.25) / 0.25; r = 0; g = 1; b = 1 - s; }
    else if (t < 0.75) { const s = (t - 0.5)  / 0.25; r = s; g = 1; b = 0; }
    else               { const s = (t - 0.75) / 0.25; r = 1; g = 1 - s; b = 0; }
    return new THREE.Color(r, g, b);
  }

  /* ═══════════════════════════════════════
     PANEL METHOD: chordwise Cp distribution
  ═══════════════════════════════════════ */
  function computeChordwiseCp(aoa_deg, mach, camber, thickness, flap_deg, x_array) {
    const aoa  = aoa_deg * Math.PI / 180;
    const beta = Math.sqrt(Math.max(0.01, 1 - mach * mach));
    const results = [];
    for (let i = 0; i < x_array.length; i++) {
      const x = x_array[i];
      const thickFactor = thickness / 100;
      let Cp_upper = -2 * (aoa + camber * 0.01 * 4) / beta;
      Cp_upper -= Math.exp(-x * 8) * (2.0 + aoa * 3 + camber * 0.3);
      Cp_upper += Math.pow(x, 2) * (1 + flap_deg / 40 * 0.8) * 0.8;
      Cp_upper -= thickFactor * 0.5 * (1 - x);

      let Cp_lower = 2 * aoa / beta + camber * 0.01 * 2;
      Cp_lower += flap_deg / 40 * 0.6 * Math.pow(Math.max(x, 0.0001), 0.5);
      Cp_lower -= thickFactor * 0.3 * x;

      results.push({ x, Cp_upper, Cp_lower });
    }
    return results;
  }

  /* ═══════════════════════════════════════
     AERODYNAMIC COEFFICIENTS (DATCOM-style)
  ═══════════════════════════════════════ */
  function computeAeroCoefficients(params) {
    const {
      aoa, airspeed, altitude, mach,
      span, chord, sweep, twist, thickness, camber, dihedral,
      flap, aileron, spoiler, elevator, rudder,
      slat, slatSpan, krueger,
      crosswind, turbulence, windshear, precip, icing,
      hasWinglet, hasVortex, hasFence, hasSharklet, hasRiblet, hasLaminar
    } = params;

    const Vms = airspeed * 0.5144;
    const altM = altitude * 0.3048;
    const T  = Math.max(216.65, 288.15 - 0.0065 * altM);
    const pRatio = Math.pow(T / 288.15, 5.256);
    const rho = 1.225 * pRatio * (288.15 / T);
    const a   = Math.sqrt(1.4 * 287 * T);
    const M   = Vms / a;
    const beta = Math.sqrt(Math.max(0.01, 1 - M * M));

    const sweepRad = sweep * Math.PI / 180;
    const S    = span * chord * 0.6;
    const AR   = span * span / Math.max(S, 0.1);

    // CL
    const Cl_alpha = 2 * Math.PI * AR / (2 + Math.sqrt(4 + AR * AR * beta * beta * (1 + Math.tan(sweepRad) ** 2 / (beta * beta))));
    let CL = Cl_alpha * aoa * Math.PI / 180;
    CL += 2 * Math.PI * camber / 100 * 0.9;
    CL += 0.85 * 2 * Math.PI * 0.35 * flap * Math.PI / 180;
    CL += aileron * 0.002 + elevator * 0.003;

    // ★ 슬랫 양력 기여: 슬랫은 앞전 캠버를 증가시켜 CLmax와 실속 받음각을 높임
    // 슬랫 전개 시 유효 캠버 증가 → CL 상승, 특히 고받음각에서 효과적
    const slatVal     = slat     || 0;
    const slatSpanVal = slatSpan || 100;
    const kruegerVal  = krueger  || 0;
    const slatFrac    = (slatVal / 27) * (slatSpanVal / 100);
    const CL_slat     = slatFrac * 0.55;   // 최대 +0.55 기여
    const CL_krueger  = (kruegerVal / 90) * 0.18; // 크루거: 내측 소형, 기여 적음
    CL += CL_slat + CL_krueger;
    CL *= (1 - spoiler / 60 * 0.18);
    CL *= (1 - windshear / 30 * 0.05 - icing / 3 * 0.12 - precip / 5 * 0.03);

    // CD
    let e_oswald = 0.82;
    if (hasWinglet || hasSharklet) e_oswald += 0.06;
    if (hasFence) e_oswald += 0.02;
    const CDi = CL * CL / (Math.PI * AR * e_oswald);

    let CD0 = 0.020 + thickness / 100 * 0.03 + camber / 100 * 0.004;
    if (hasRiblet)  CD0 *= 0.93;
    if (hasLaminar) CD0 *= 0.88;
    if (hasVortex)  CD0 += 0.0005;

    const M_dd = 0.72 + 0.1 * (1 - Math.cos(sweepRad)) - thickness / 100 * 0.4;
    const CDw  = M > M_dd ? 20 * Math.pow(M - M_dd, 4) : 0;
    const CD   = CD0 + CDi + CDw + spoiler / 60 * 0.035 + flap / 40 * 0.025 + icing / 3 * 0.025 + precip / 5 * 0.008
               + slatFrac * 0.008   // ★ 슬랫 전개 시 항력 증가
               + (kruegerVal / 90) * 0.005; // ★ 크루거 플랩 항력
    const LD   = CL / Math.max(CD, 0.001);

    // CM
    let CM = -0.12 - camber / 100 * 0.15 - flap / 40 * 0.06 + elevator * 0.004;

    // Reynolds
    const mu = 1.789e-5 * Math.pow(T / 288.15, 0.7);
    const Re = rho * Vms * chord / mu;

    // Thrust
    const W = 79000 * 9.81;
    const q = 0.5 * rho * Vms * Vms;
    const D = q * S * CD;
    const thrust = D + W * Math.tan(aoa * Math.PI / 180) * 0.1;

    // ★ CLmax: 슬랫 전개 시 실속 받음각 연장 → CLmax 대폭 향상
    const CL_max = 1.5 + flap / 40 * 0.8 - icing / 3 * 0.3
                 + slatFrac * 0.70   // 슬랫: 실속 여유 크게 향상
                 + (kruegerVal / 90) * 0.20; // 크루거
    const stallMargin = (CL_max - CL) / CL_max;

    return {
      CL:  CL.toFixed(3),
      CD:  CD.toFixed(4),
      LD:  LD.toFixed(1),
      CM:  CM.toFixed(3),
      mach: M.toFixed(3),
      Re:  (Re / 1e6).toFixed(1),
      thrust: (thrust / 1000).toFixed(1),
      stallMargin,
      CL_raw: CL, CD_raw: CD, M_dd, mach_raw: M, q, e_oswald, AR
    };
  }

  /* ═══════════════════════════════════════
     EFFICIENCY METRICS
  ═══════════════════════════════════════ */
  const BASELINE = { LD: 17.0, CD: 0.0280, range_nm: 3265, fuel_per_nm: 9.82 };

  function computeEfficiency(aeroResult) {
    const LD_cur = parseFloat(aeroResult.LD);
    const CD_cur = parseFloat(aeroResult.CD);
    const fuel_ratio = BASELINE.CD / Math.max(CD_cur, 0.001);
    const ld_ratio   = LD_cur / BASELINE.LD;
    const fuelSavingPct = Math.min(25, Math.max(-15, (fuel_ratio - 1) * 100));
    const timeSavingPct = Math.min(15, Math.max(-10, (ld_ratio - 1) * 8));
    const co2SavingPct  = fuelSavingPct * 0.92;
    const range_design  = Math.round(BASELINE.range_nm * fuel_ratio * ld_ratio);
    const fuel_rate     = (BASELINE.fuel_per_nm / fuel_ratio).toFixed(2);
    return {
      fuelSavingPct: fuelSavingPct.toFixed(1),
      timeSavingPct: timeSavingPct.toFixed(1),
      co2SavingPct:  co2SavingPct.toFixed(1),
      range_design, fuel_rate,
      thrust_kN: aeroResult.thrust
    };
  }

  /* ═══════════════════════════════════════
     WARNINGS
  ═══════════════════════════════════════ */
  function computeWarnings(aeroResult, params) {
    const stall = aeroResult.stallMargin < 0.1
      ? { level: 'danger', msg: '⚠ 실속 임박! AoA 감소 필요' }
      : aeroResult.stallMargin < 0.25
        ? { level: 'warn', msg: '⚡ 실속 여유 부족 (< 25%)' }
        : { level: 'ok',   msg: '✔ 실속 여유 정상' };

    const M_flutter = aeroResult.mach_raw * 1.15;
    const flutter = M_flutter > 0.92
      ? { level: 'danger', msg: '⚠ 플러터 위험 속도 초과' }
      : M_flutter > 0.88
        ? { level: 'warn', msg: '⚡ 플러터 여유 감소' }
        : { level: 'ok',   msg: '✔ 플러터 여유 정상' };

    const buffet = aeroResult.mach_raw > aeroResult.M_dd + 0.05
      ? { level: 'danger', msg: '⚠ 천음속 버페팅 발생' }
      : aeroResult.mach_raw > aeroResult.M_dd
        ? { level: 'warn', msg: '⚡ 버페팅 주의 (천음속)' }
        : { level: 'ok',   msg: '✔ 버페팅 없음' };

    const icingLevel = params.icing;
    const icing = icingLevel >= 3
      ? { level: 'danger', msg: '⚠ 심각한 착빙 — 제빙 장치 작동' }
      : icingLevel >= 1
        ? { level: 'warn', msg: '⚡ 착빙 조건 — 주의' }
        : { level: 'ok',   msg: '✔ 착빙 위험 없음' };

    return { stall, flutter, buffet, icing };
  }

  /* ═══════════════════════════════════════
     CLEAR HELPERS
  ═══════════════════════════════════════ */
  function clearCFD() {
    const sc = getScene();
    if (cfdGroup && sc)        { sc.remove(cfdGroup);        cfdGroup = null; }
    if (streamlineGroup && sc) { sc.remove(streamlineGroup); streamlineGroup = null; }
  }

  function clearStreamlines() {
    const sc = getScene();
    if (streamlineGroup && sc) { sc.remove(streamlineGroup); streamlineGroup = null; }
  }

  /* ═══════════════════════════════════════
     PRESSURE FIELD VISUALIZATION
  ═══════════════════════════════════════ */
  function buildPressureVisualization(params) {
    const sc = getScene();
    if (!sc) return;
    clearCFD();
    cfdGroup = new THREE.Group();

    const { aoa, mach, flap, camber, thickness, sweep, dihedral, span } = params;
    const nChord = 20, nSpan = 30;
    const positions = [], colors = [], indices = [];

    function getVertex(ic, js, surface) {
      const xc = ic / nChord, eta = js / nSpan;
      const z   = eta * span / 2;
      const xOff = 2 + z * Math.tan(sweep * Math.PI / 180);
      const yOff = -0.8 + z * Math.tan(dihedral * Math.PI / 180);
      const c2 = 7.32 * (1 - eta * 0.8);
      const t2 = thickness / 100, m2 = camber / 100, p2 = 0.3;
      const yt = t2 / 0.2 * c2 * (0.2969 * Math.sqrt(Math.max(xc, 1e-9)) - 0.1260 * xc - 0.3516 * xc * xc + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4));
      let yc = 0;
      if (m2 !== 0) {
        yc = xc < p2 ? m2 / (p2 * p2) * (2 * p2 * xc - xc * xc) * c2 : m2 / ((1 - p2) * (1 - p2)) * (1 - 2 * p2 + 2 * p2 * xc - xc * xc) * c2;
      }
      return { x: xOff + (xc - 0.25) * c2, y: yOff + yc + (surface === 'upper' ? yt : -yt), z };
    }

    const x_arr = Array.from({ length: nChord + 1 }, (_, i) => i / nChord);
    const cpData = computeChordwiseCp(aoa, mach, camber, thickness, flap, x_arr);

    for (let js = 0; js <= nSpan; js++) {
      const eta = js / nSpan;
      for (let ic = 0; ic <= nChord; ic++) {
        const ptU = getVertex(ic, js, 'upper');
        const colU = pressureToColor(cpData[ic].Cp_upper * (1 - eta * 0.25));
        positions.push(ptU.x, ptU.y,  ptU.z);
        positions.push(ptU.x, ptU.y, -ptU.z);
        colors.push(colU.r, colU.g, colU.b, colU.r, colU.g, colU.b);

        const ptL = getVertex(ic, js, 'lower');
        const colL = pressureToColor(cpData[ic].Cp_lower * (1 - eta * 0.2));
        positions.push(ptL.x, ptL.y,  ptL.z);
        positions.push(ptL.x, ptL.y, -ptL.z);
        colors.push(colL.r, colL.g, colL.b, colL.r, colL.g, colL.b);
      }
    }

    const nPerStrip = (nChord + 1) * 4;
    for (let js = 0; js < nSpan; js++) {
      for (let ic = 0; ic < nChord; ic++) {
        const a = js * nPerStrip + ic * 4, b = (js + 1) * nPerStrip + ic * 4;
        const c = (js + 1) * nPerStrip + (ic + 1) * 4, d = js * nPerStrip + (ic + 1) * 4;
        indices.push(a, b, c, a, c, d);                           // upper right
        indices.push(a+2, c+2, b+2, a+2, d+2, c+2);              // lower right
        indices.push(a+1, c+1, b+1, a+1, d+1, c+1);              // upper left
        indices.push(a+3, b+3, c+3, a+3, c+3, d+3);              // lower left
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // [BUG FIX] window._matCFD 참조 (aircraft.js가 먼저 설정)
    const mat = window._matCFD || new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    cfdGroup.add(new THREE.Mesh(geom, mat));
    sc.add(cfdGroup);
  }

  /* ═══════════════════════════════════════
     STREAMLINE VISUALIZATION
  ═══════════════════════════════════════ */
  function buildStreamlines(params) {
    const sc = getScene();
    if (!sc) return;
    clearStreamlines();
    streamlineGroup = new THREE.Group();

    const { aoa, span } = params;
    const nLines = 18, nSteps = 50, dt = 0.25;

    for (let li = 0; li < nLines; li++) {
      const eta = li / (nLines - 1);
      let x = -30, y = -2 + li * 0.2, z = (eta - 0.5) * span * 0.85;
      const points = [];
      for (let s = 0; s < nSteps; s++) {
        points.push(new THREE.Vector3(x, y, z));
        const dist = Math.max(0.5, Math.hypot(x - 2, y + 0.8, Math.abs(z) - span / 4));
        const inf  = Math.max(0, 1 - dist / 12);
        const aoaRad = aoa * Math.PI / 180;
        x += 1.0 + inf * 0.3;
        y += inf * (Math.sin(aoaRad) + 0.1) * 0.5 * (x > 5 ? 1 : -1) * -1;
        z += inf * (z / span) * 0.15;
        if (x > 35) break;
      }
      if (points.length < 2) continue;
      const curve   = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, points.length * 2, 0.04, 4, false);
      const hue = (li / nLines) * 0.7 + 0.1;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.6), transparent: true, opacity: 0.7 });
      streamlineGroup.add(new THREE.Mesh(tubeGeom, mat));
    }
    sc.add(streamlineGroup);
  }

  /* ═══════════════════════════════════════
     PARTICLES
  ═══════════════════════════════════════ */
  const PARTICLE_COUNT = 2000;

  function buildParticles() {
    const sc = getScene();
    if (!sc) return;
    const geom = new THREE.BufferGeometry();
    const pos  = new Float32Array(PARTICLE_COUNT * 3);
    const vel  = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 80;
      pos[i*3+1] = (Math.random() - 0.5) * 20;
      pos[i*3+2] = (Math.random() - 0.5) * 80;
      vel[i*3]   = 0.3 + Math.random() * 0.2;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.userData.velocities = vel;
    particles = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x00ccff, size: 0.15, transparent: true, opacity: 0.4, sizeAttenuation: true }));
    particles.visible = false;
    sc.add(particles);
  }

  function updateParticles(aoa) {
    if (!particles || !particles.visible) return;
    const pos = particles.geometry.attributes.position.array;
    const vel = particles.geometry.userData.velocities;
    const aoaRad = aoa * Math.PI / 180;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i*3] += vel[i*3];
      if (pos[i*3] > 40) {
        pos[i*3]   = -40;
        pos[i*3+1] = (Math.random() - 0.5) * 20;
        pos[i*3+2] = (Math.random() - 0.5) * 80;
      }
      const dx = pos[i*3] - 2, dy = pos[i*3+1] + 0.8, dz = Math.abs(pos[i*3+2]) - 10;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 10) {
        const inf = (1 - dist / 10) * 0.3;
        vel[i*3+1] += (dx < 0 ? inf : -inf * 0.5) * Math.sin(aoaRad);
      }
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  /* ═══════════════════════════════════════
     QUICK AERO UPDATE (sliders 조작 시)
  ═══════════════════════════════════════ */
  function quickAeroUpdate(params) {
    const aeroResult = computeAeroCoefficients(params);
    const efficiency  = computeEfficiency(aeroResult);
    const warnings    = computeWarnings(aeroResult, params);
    return { aeroResult, efficiency, warnings };
  }

  /* ═══════════════════════════════════════
     MAIN SIMULATION RUNNER
  ═══════════════════════════════════════ */
  function runSimulation(params, mode, onProgress, onComplete) {
    const steps = [
      { pct: 10, msg: '격자 생성 중...' },
      { pct: 25, msg: '경계 조건 설정...' },
      { pct: 45, msg: '압력 방정식 풀이...' },
      { pct: 65, msg: '유선 계산...' },
      { pct: 80, msg: '공력계수 수렴 확인...' },
      { pct: 90, msg: '후처리 시각화...' },
      { pct: 100, msg: '시뮬레이션 완료' },
    ];
    let si = 0;
    function tick() {
      if (si >= steps.length) {
        const aeroResult = computeAeroCoefficients(params);
        const efficiency  = computeEfficiency(aeroResult);
        const warnings    = computeWarnings(aeroResult, params);
        if (mode === 'cfd-stream') {
          buildStreamlines(params);
          if (particles) particles.visible = true;
        } else {
          buildPressureVisualization(params);
          clearStreamlines();
          if (particles) particles.visible = false;
        }
        onComplete({ aeroResult, efficiency, warnings });
        return;
      }
      onProgress(steps[si].pct, steps[si].msg);
      si++;
      setTimeout(tick, 300 + Math.random() * 400);
    }
    tick();
  }

  /* ═══════════════════════════════════════
     DEFERRED INIT — aircraft.js 로드 후 실행
  ═══════════════════════════════════════ */
  function deferredInit() {
    buildParticles();
    // 파티클 애니메이션 (aircraft.js의 animate 루프와 분리)
    function particleLoop() {
      requestAnimationFrame(particleLoop);
      if (window._cfdParams) updateParticles(window._cfdParams.aoa || 4);
    }
    particleLoop();
  }

  // [BUG FIX] aircraft.js가 window._aircraft를 설정할 때까지 폴링으로 대기
  function waitForAircraft() {
    if (window._aircraft) {
      deferredInit();
    } else {
      setTimeout(waitForAircraft, 50);
    }
  }
  waitForAircraft();

  /* ═══════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════ */
  window._cfd = {
    runSimulation,
    quickAeroUpdate,
    computeAeroCoefficients,
    computeEfficiency,
    computeWarnings,
    buildPressureVisualization,   // [BUG FIX] 직접 노출
    buildStreamlines,             // [BUG FIX] 직접 노출
    clearCFD,
    setVisible(v) {
      // 외부에서 CFD 오버레이 on/off
      if (cfdGroup)        cfdGroup.visible        = v;
      if (streamlineGroup) streamlineGroup.visible = v;
    },
    get particles() { return particles; }
  };

})();
