/**
 * cfd.js
 * 전산유체역학(CFD) 시뮬레이션 엔진
 * - 압력 분포 계산 (패널법 기반 근사)
 * - 유선(streamline) 시각화
 * - 공력계수 산출 (CL, CD, CM)
 * - 효율성 지표 계산
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     CFD VISUALIZATION MESHES
  ═══════════════════════════════════════ */
  let cfdGroup = null;
  let streamlineGroup = null;
  let particleSystem = null;
  let pressureArrows = [];
  let isVisible = false;

  const scene = () => window._aircraft.scene;

  /* ═══════════════════════════════════════
     COLOR MAP: pressure → RGB
  ═══════════════════════════════════════ */
  function pressureToColor(cp) {
    // cp range: -2.5 (low/blue) to +1.5 (high/red)
    const t = Math.max(0, Math.min(1, (cp + 2.5) / 4.0));
    // Spectral colormap: blue → cyan → green → yellow → red
    let r, g, b;
    if (t < 0.25) {
      const s = t / 0.25;
      r = 0; g = s; b = 1;
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      r = 0; g = 1; b = 1 - s;
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      r = s; g = 1; b = 0;
    } else {
      const s = (t - 0.75) / 0.25;
      r = 1; g = 1 - s; b = 0;
    }
    return new THREE.Color(r, g, b);
  }

  /* ═══════════════════════════════════════
     PANEL METHOD: thin airfoil Cp distribution
  ═══════════════════════════════════════ */
  function computeChordwiseCp(aoa_deg, mach, camber, thickness, flap_deg, x_array) {
    const aoa = aoa_deg * Math.PI / 180;
    const beta = Math.sqrt(Math.max(0.01, 1 - mach * mach)); // Prandtl-Glauert
    const results = [];

    for (let i = 0; i < x_array.length; i++) {
      const x = x_array[i]; // 0..1 chord fraction
      // Joukowski-type Cp approximation
      const camberFactor = 1 + camber / 100 * 8;
      const thickFactor = thickness / 100;

      // Upper surface: lower pressure (suction)
      let Cp_upper = -2 * (aoa + camber * 0.01 * 4) / beta;
      // Leading edge suction peak
      const le_factor = Math.exp(-x * 8) * (2.0 + aoa * 3 + camber * 0.3);
      Cp_upper -= le_factor;
      // Trailing edge pressure recovery
      const te_factor = Math.pow(x, 2) * (1 + flap_deg / 40 * 0.8);
      Cp_upper += te_factor * 0.8;
      // Thickness effect
      Cp_upper -= thickFactor * 0.5 * (1 - x);

      // Lower surface: higher pressure
      let Cp_lower = 2 * aoa / beta;
      Cp_lower += camber * 0.01 * 2;
      Cp_lower += flap_deg / 40 * 0.6 * Math.pow(x, 0.5);
      Cp_lower -= thickFactor * 0.3 * x;

      results.push({ x, Cp_upper, Cp_lower });
    }
    return results;
  }

  /* ═══════════════════════════════════════
     SPANWISE LIFT DISTRIBUTION
  ═══════════════════════════════════════ */
  function computeSpanwiseLift(aoa, span, sweep, taper, twist, aileron_deg, params) {
    const nStations = 30;
    const stations = [];
    for (let i = 0; i <= nStations; i++) {
      const eta = i / nStations; // 0 = root, 1 = tip
      // Modified lifting line (Schrenk approximation + twist + aileron)
      const chord_ratio = 1 - (1 - taper) * eta;
      const twist_effect = twist * eta * Math.PI / 180;
      const effective_aoa = aoa + twist_effect;
      const sweep_correction = 1 / Math.cos(sweep * Math.PI / 180);

      // Elliptic + planform mix
      const elliptic = Math.sqrt(1 - eta * eta);
      const planform = chord_ratio;
      const cl_local = (effective_aoa * 2 * Math.PI * sweep_correction) * (0.6 * elliptic + 0.4 * planform);

      // Aileron effect (outboard)
      let ail_delta = 0;
      if (eta > 0.6) {
        ail_delta = aileron_deg * Math.PI / 180 * 0.7 * (eta - 0.6) / 0.4;
      }

      stations.push({
        eta, y: eta * span / 2,
        cl: cl_local + ail_delta,
        chord: chord_ratio
      });
    }
    return stations;
  }

  /* ═══════════════════════════════════════
     AERODYNAMIC COEFFICIENTS
  ═══════════════════════════════════════ */
  function computeAeroCoefficients(params) {
    const {
      aoa, mach, altitude, airspeed,
      span, chord, sweep, twist, thickness, camber, dihedral,
      flap, aileron, spoiler, elevator, rudder,
      crosswind, turbulence, windshear, precip, icing,
      hasWinglet, hasVortex, hasFence, hasSharklet, hasRiblet, hasLaminar,
      bendingStiffness, elasticity, wingtipFlex
    } = params;

    // Base airspeed in m/s
    const Vms = airspeed * 0.5144;
    // Density at altitude (ISA model)
    const altFt = altitude;
    const T = Math.max(216.65, 288.15 - 0.0065 * altFt * 0.3048);
    const p_ratio = Math.pow(T / 288.15, 5.256);
    const rho = 1.225 * p_ratio * (288.15 / T);

    // Mach number
    const a = Math.sqrt(1.4 * 287 * T);
    const M = Vms / a;
    const beta = Math.sqrt(Math.max(0.01, 1 - M * M));

    // Wing geometry factors
    const AR = span * span / (span * chord * 0.6); // approximate area
    const taper = 0.25;
    const sweepRad = sweep * Math.PI / 180;

    // CL calculation (DATCOM-style)
    const Cl_alpha = 2 * Math.PI * AR / (2 + Math.sqrt(4 + AR * AR * beta * beta * (1 + Math.tan(sweepRad) * Math.tan(sweepRad) / (beta * beta))));
    let CL = Cl_alpha * aoa * Math.PI / 180;

    // Camber contribution
    CL += 2 * Math.PI * camber / 100 * 0.9;

    // Flap effect
    const eta_f = 0.35; // flap chord ratio
    const CL_flap = 0.85 * 2 * Math.PI * eta_f * flap * Math.PI / 180;
    CL += CL_flap;

    // Aileron (small CL change)
    CL += aileron * 0.002;

    // Elevator effect on whole aircraft CL
    CL += elevator * 0.003;

    // Spoiler: drag increase, some CL loss
    const spoiler_factor = 1 - spoiler / 60 * 0.18;
    CL *= spoiler_factor;

    // Weather effects
    const windshear_penalty = windshear / 30 * 0.05;
    const icing_penalty = icing / 3 * 0.12;
    const precip_penalty = precip / 5 * 0.03;
    CL *= (1 - windshear_penalty - icing_penalty - precip_penalty);

    // Induced drag: CDi = CL²/(π·AR·e)
    let e_oswald = 0.82; // baseline Oswald efficiency
    if (hasWinglet || hasSharklet) e_oswald += 0.06;
    if (hasFence) e_oswald += 0.02;
    const CDi = CL * CL / (Math.PI * AR * e_oswald);

    // Profile drag (CD0)
    let CD0 = 0.020 + thickness / 100 * 0.03 + camber / 100 * 0.004;
    if (hasRiblet) CD0 *= 0.93;
    if (hasLaminar) CD0 *= 0.88;
    if (hasVortex) CD0 += 0.0005; // slight drag addition

    // Wave drag (transonic)
    const M_dd = 0.72 + 0.1 * (1 - Math.cos(sweepRad)) - thickness / 100 * 0.4;
    let CDw = 0;
    if (M > M_dd) {
      CDw = 20 * Math.pow(M - M_dd, 4);
    }

    // Spoiler drag
    const CD_spoiler = spoiler / 60 * 0.035;

    // Flap drag
    const CD_flap = flap / 40 * 0.025;

    // Landing gear (if phase = landing/taxi - handled in UI)
    let CD_gear = 0;

    // Icing drag
    const CD_icing = icing / 3 * 0.025;

    // Precip drag
    const CD_precip = precip / 5 * 0.008;

    const CD = CD0 + CDi + CDw + CD_spoiler + CD_flap + CD_icing + CD_precip;

    // L/D ratio
    const LD = CL / Math.max(CD, 0.001);

    // Pitching moment (CM about 0.25c)
    let CM = -0.12 - camber / 100 * 0.15 - flap / 40 * 0.06;
    CM += elevator * 0.004;

    // Reynolds number
    const mu = 1.789e-5 * Math.pow(T / 288.15, 0.7);
    const Re = rho * Vms * chord / mu;

    // Lift & Drag forces
    const S = span * chord * 0.6; // wing area approx
    const q = 0.5 * rho * Vms * Vms;
    const L = q * S * CL;
    const D = q * S * CD;

    // Stall check
    const CL_max = 1.5 + flap / 40 * 0.8 - icing / 3 * 0.3;
    const stallMargin = (CL_max - CL) / CL_max;

    // Thrust needed for level flight (simplified)
    const W = 79000 * 9.81; // B737-800 MTOW approx in N
    const thrust = D + (W * Math.tan(aoa * Math.PI / 180) * 0.1);

    return {
      CL: CL.toFixed(3),
      CD: CD.toFixed(4),
      LD: LD.toFixed(1),
      CM: CM.toFixed(3),
      mach: M.toFixed(3),
      Re: (Re / 1e6).toFixed(1),
      L: L.toFixed(0),
      D: D.toFixed(0),
      thrust: (thrust / 1000).toFixed(1),
      stallMargin,
      CL_raw: CL,
      CD_raw: CD,
      M_dd,
      mach_raw: M,
      q,
      e_oswald,
      AR
    };
  }

  /* ═══════════════════════════════════════
     EFFICIENCY METRICS vs. BASELINE
  ═══════════════════════════════════════ */
  // B737-800 baseline: L/D ~17.0, fuel burn ~2.4 t/hr at cruise
  const BASELINE = {
    LD: 17.0,
    CD: 0.0280,
    range_nm: 3265,
    fuel_per_nm: 9.82, // kg/nm
    cruise_speed_kt: 450,
    thrust_kN: 54.2
  };

  function computeEfficiency(aeroResult, params) {
    const LD_current = parseFloat(aeroResult.LD);
    const CD_current = parseFloat(aeroResult.CD);
    const M_current = parseFloat(aeroResult.mach);

    // Fuel saving: proportional to CD reduction
    const fuel_ratio = BASELINE.CD / Math.max(CD_current, 0.001);
    const fuelSavingPct = Math.min(25, Math.max(-15, (fuel_ratio - 1) * 100));

    // Speed: higher L/D allows more speed at same thrust
    const ld_ratio = LD_current / BASELINE.LD;
    const timeSavingPct = Math.min(15, Math.max(-10, (ld_ratio - 1) * 8));

    // CO2: proportional to fuel saving
    const co2SavingPct = fuelSavingPct * 0.92;

    // Design range
    const range_design = BASELINE.range_nm * fuel_ratio * ld_ratio;
    const fuel_rate = BASELINE.fuel_per_nm / fuel_ratio;

    return {
      fuelSavingPct: fuelSavingPct.toFixed(1),
      timeSavingPct: timeSavingPct.toFixed(1),
      co2SavingPct:  co2SavingPct.toFixed(1),
      range_design:  Math.round(range_design),
      fuel_rate:     fuel_rate.toFixed(2),
      thrust_kN:     aeroResult.thrust
    };
  }

  /* ═══════════════════════════════════════
     WARNING CHECKS
  ═══════════════════════════════════════ */
  function computeWarnings(aeroResult, params) {
    const warnings = {};

    // Stall
    if (aeroResult.stallMargin < 0.1) {
      warnings.stall = { level: 'danger', msg: '⚠ 실속 임박! AoA 감소 필요' };
    } else if (aeroResult.stallMargin < 0.25) {
      warnings.stall = { level: 'warn', msg: '⚡ 실속 여유 부족 (< 25%)' };
    } else {
      warnings.stall = { level: 'ok', msg: '✔ 실속 여유 정상' };
    }

    // Flutter (simplified: check if flutter margin exists)
    const flutterSpeed = 1.15; // Vd/Vc factor
    const M_flutter = aeroResult.mach_raw * flutterSpeed;
    if (M_flutter > 0.92) {
      warnings.flutter = { level: 'danger', msg: '⚠ 플러터 위험 속도 초과' };
    } else if (M_flutter > 0.88) {
      warnings.flutter = { level: 'warn', msg: '⚡ 플러터 여유 감소' };
    } else {
      warnings.flutter = { level: 'ok', msg: '✔ 플러터 여유 정상' };
    }

    // Buffet (transonic)
    if (aeroResult.mach_raw > aeroResult.M_dd + 0.05) {
      warnings.buffet = { level: 'danger', msg: '⚠ 천음속 버페팅 발생' };
    } else if (aeroResult.mach_raw > aeroResult.M_dd) {
      warnings.buffet = { level: 'warn', msg: '⚡ 버페팅 주의 (천음속)' };
    } else {
      warnings.buffet = { level: 'ok', msg: '✔ 버페팅 없음' };
    }

    // Icing
    const icingLevel = params.icing;
    if (icingLevel >= 3) {
      warnings.icing = { level: 'danger', msg: '⚠ 심각한 착빙 — 제빙 장치 작동' };
    } else if (icingLevel >= 1) {
      warnings.icing = { level: 'warn', msg: '⚡ 착빙 조건 — 주의' };
    } else {
      warnings.icing = { level: 'ok', msg: '✔ 착빙 위험 없음' };
    }

    return warnings;
  }

  /* ═══════════════════════════════════════
     PRESSURE FIELD VISUALIZATION
  ═══════════════════════════════════════ */
  function buildPressureVisualization(params, aeroResult) {
    clearCFD();
    cfdGroup = new THREE.Group();
    scene().add(cfdGroup);

    const { aoa, mach, flap, camber, thickness, sweep, dihedral } = params;
    const span = params.span;

    // Build colored wing surface showing pressure distribution
    const nChord = 20, nSpan = 30;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const indices = [];

    function getVertex(i_chord, i_span, surface) {
      const xc = i_chord / nChord;
      const eta = i_span / nSpan;
      const z = eta * span / 2;
      const xOff = 2 + z * Math.tan(sweep * Math.PI / 180);
      const yOff = -0.8 + z * Math.tan(dihedral * Math.PI / 180);

      // NACA profile point
      const c = (7.32 * (1 - eta * 0.8));
      const t = thickness / 100;
      const m = camber / 100;
      const p = 0.3;
      const yt = t / 0.2 * c * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc * xc + 0.2843 * xc * xc * xc - 0.1015 * xc * xc * xc * xc);
      let yc = 0;
      if (m !== 0) {
        yc = xc < p ? m / (p * p) * (2 * p * xc - xc * xc) * c : m / ((1 - p) * (1 - p)) * (1 - 2 * p + 2 * p * xc - xc * xc) * c;
      }
      const x_pos = xOff + (xc - 0.25) * c;
      const y_pos = yOff + yc + (surface === 'upper' ? yt : -yt);
      return { x: x_pos, y: y_pos, z };
    }

    const x_arr = Array.from({ length: nChord + 1 }, (_, i) => i / nChord);
    const cpData = computeChordwiseCp(aoa, mach, camber, thickness, flap, x_arr);

    let idx = 0;
    for (let js = 0; js <= nSpan; js++) {
      const eta = js / nSpan;
      for (let ic = 0; ic <= nChord; ic++) {
        const xc = ic / nChord;
        // Upper surface
        const ptU = getVertex(ic, js, 'upper');
        const CpU = cpData[ic].Cp_upper * (1 - eta * 0.25);
        const colU = pressureToColor(CpU);
        positions.push(ptU.x, ptU.y,  ptU.z);
        positions.push(ptU.x, ptU.y, -ptU.z);
        colors.push(colU.r, colU.g, colU.b);
        colors.push(colU.r, colU.g, colU.b);

        // Lower surface
        const ptL = getVertex(ic, js, 'lower');
        const CpL = cpData[ic].Cp_lower * (1 - eta * 0.2);
        const colL = pressureToColor(CpL);
        positions.push(ptL.x, ptL.y,  ptL.z);
        positions.push(ptL.x, ptL.y, -ptL.z);
        colors.push(colL.r, colL.g, colL.b);
        colors.push(colL.r, colL.g, colL.b);
      }
    }

    // Build indices for upper surface (right wing)
    const nPerStrip = (nChord + 1) * 4;
    for (let js = 0; js < nSpan; js++) {
      for (let ic = 0; ic < nChord; ic++) {
        // Upper right
        const a = js * nPerStrip + ic * 4;
        const b = (js + 1) * nPerStrip + ic * 4;
        const c = (js + 1) * nPerStrip + (ic + 1) * 4;
        const d = js * nPerStrip + (ic + 1) * 4;
        indices.push(a, b, c, a, c, d);

        // Lower right
        const a2 = a + 2, b2 = b + 2, c2 = c + 2, d2 = d + 2;
        indices.push(a2, c2, b2, a2, d2, c2);

        // Upper left (mirror)
        const al = a + 1, bl = b + 1, cl = c + 1, dl = d + 1;
        indices.push(al, cl, bl, al, dl, cl);

        // Lower left
        const al2 = a2 + 1, bl2 = b2 + 1, cl2 = c2 + 1, dl2 = d2 + 1;
        indices.push(al2, bl2, cl2, al2, cl2, dl2);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, matCFD);
    cfdGroup.add(mesh);
  }

  /* ═══════════════════════════════════════
     STREAMLINE VISUALIZATION
  ═══════════════════════════════════════ */
  function buildStreamlines(params, aeroResult) {
    if (streamlineGroup) {
      scene().remove(streamlineGroup);
    }
    streamlineGroup = new THREE.Group();

    const { aoa, mach, span, sweep, dihedral, chord } = params;
    const nLines = 18;
    const nSteps = 50;
    const dt = 0.25;

    for (let li = 0; li < nLines; li++) {
      const eta = li / (nLines - 1);
      const z_start = (eta - 0.5) * span * 0.85;
      const y_start = -2 + li * 0.2;
      const x_start = -30;

      // Trace streamline
      const points = [];
      let x = x_start, y = y_start, z = z_start;

      for (let s = 0; s < nSteps; s++) {
        points.push(new THREE.Vector3(x, y, z));

        // Velocity field (simplified potential flow + wing effect)
        const distToWing = Math.max(0.5, Math.hypot(x - 2, y + 0.8, Math.abs(z) - span / 4));
        const wingInfluence = Math.max(0, 1 - distToWing / 12);
        const aoaRad = aoa * Math.PI / 180;

        // Freestream + upwash/downwash
        const vx = 1.0 + wingInfluence * 0.3;
        const vy = wingInfluence * (Math.sin(aoaRad) + 0.1) * 0.5 *
                   Math.sign(x - 5) * -1; // upwash before, downwash aft
        const vz_induced = wingInfluence * (z / span) * 0.15; // spanwise flow

        x += vx * dt;
        y += vy * dt;
        z += vz_induced * dt;

        if (x > 35) break;
      }

      if (points.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, points.length * 2, 0.04, 4, false);
      const hue = (li / nLines) * 0.7 + 0.1;
      const streamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.8, 0.6),
        transparent: true, opacity: 0.7
      });
      const tube = new THREE.Mesh(tubeGeom, streamMat);
      streamlineGroup.add(tube);
    }

    scene().add(streamlineGroup);
  }

  /* ═══════════════════════════════════════
     PARTICLE SYSTEM (flow particles)
  ═══════════════════════════════════════ */
  let particles = null;
  const PARTICLE_COUNT = 3000;

  function buildParticles() {
    if (particles) scene().remove(particles);
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      velocities[i * 3]     = 0.3 + Math.random() * 0.2;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.userData.velocities = velocities;

    const mat = new THREE.PointsMaterial({
      color: 0x00ccff, size: 0.15, transparent: true, opacity: 0.4,
      sizeAttenuation: true
    });
    particles = new THREE.Points(geom, mat);
    particles.visible = false;
    scene().add(particles);
  }

  function updateParticles(aoa) {
    if (!particles || !particles.visible) return;
    const pos = particles.geometry.attributes.position.array;
    const vel = particles.geometry.userData.velocities;
    const aoaRad = aoa * Math.PI / 180;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     += vel[i * 3];
      pos[i * 3 + 1] += vel[i * 3 + 1];
      pos[i * 3 + 2] += vel[i * 3 + 2];

      // Reset if out of bounds
      if (pos[i * 3] > 40) {
        pos[i * 3]     = -40;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      }

      // Wing influence
      const dx = pos[i * 3] - 2, dy = pos[i * 3 + 1] + 0.8;
      const dz = Math.abs(pos[i * 3 + 2]);
      const dist = Math.hypot(dx, dy, dz - 10);
      if (dist < 10) {
        const inf = (1 - dist / 10) * 0.3;
        vel[i * 3 + 1] += (dx < 0 ? inf : -inf * 0.5) * Math.sin(aoaRad);
      }
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  /* ═══════════════════════════════════════
     CLEAR CFD
  ═══════════════════════════════════════ */
  function clearCFD() {
    if (cfdGroup) { scene().remove(cfdGroup); cfdGroup = null; }
    if (streamlineGroup) { scene().remove(streamlineGroup); streamlineGroup = null; }
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
        // Compute final results
        const aeroResult = computeAeroCoefficients(params);
        const efficiency  = computeEfficiency(aeroResult, params);
        const warnings    = computeWarnings(aeroResult, params);

        // Build visualization
        if (mode === 'cfd-stream') {
          buildStreamlines(params, aeroResult);
          if (particles) particles.visible = true;
        } else {
          buildPressureVisualization(params, aeroResult);
          clearStreamlines();
        }

        onComplete({ aeroResult, efficiency, warnings });
        return;
      }
      onProgress(steps[si].pct, steps[si].msg);
      si++;
      const delay = 300 + Math.random() * 400;
      setTimeout(tick, delay);
    }
    tick();
  }

  function clearStreamlines() {
    if (streamlineGroup) { scene().remove(streamlineGroup); streamlineGroup = null; }
  }

  /* ═══════════════════════════════════════
     REAL-TIME AERO UPDATE (no simulation)
  ═══════════════════════════════════════ */
  function quickAeroUpdate(params) {
    const aeroResult = computeAeroCoefficients(params);
    const efficiency  = computeEfficiency(aeroResult, params);
    const warnings    = computeWarnings(aeroResult, params);
    return { aeroResult, efficiency, warnings };
  }

  /* ═══════════════════════════════════════
     INIT
  ═══════════════════════════════════════ */
  buildParticles();

  // Particle animation hook
  (function loop() {
    requestAnimationFrame(loop);
    if (window._cfdParams) updateParticles(window._cfdParams.aoa || 4);
  })();

  /* ═══════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════ */
  window._cfd = {
    runSimulation,
    quickAeroUpdate,
    computeAeroCoefficients,
    computeEfficiency,
    computeWarnings,
    setVisible(v) { isVisible = v; },
    clearCFD,
    particles
  };

  // Expose matCFD ref
  window._matCFD = matCFD;

})();
