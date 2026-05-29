/**
 * ui.js
 * UI 제어 레이어
 * - 슬라이더/버튼 이벤트 처리
 * - 공력 계수 실시간 디스플레이
 * - 효율성 지표 업데이트
 * - 경고 패널
 * - CFD 시뮬레이션 실행
 * - 보고서 생성
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     SLIDER BINDINGS
  ═══════════════════════════════════════ */
  const sliders = [
    { id: 'chord',       valId: 'val-chord',      unit: '',  dec: 1 },
    { id: 'span',        valId: 'val-span',        unit: '',  dec: 1 },
    { id: 'sweep',       valId: 'val-sweep',       unit: '',  dec: 0 },
    { id: 'twist',       valId: 'val-twist',       unit: '',  dec: 1 },
    { id: 'thickness',   valId: 'val-thickness',   unit: '',  dec: 1 },
    { id: 'dihedral',    valId: 'val-dihedral',    unit: '',  dec: 1 },
    { id: 'camber',      valId: 'val-camber',      unit: '',  dec: 1 },
    { id: 'bending',     valId: 'val-bending',     unit: '',  dec: 0 },
    { id: 'elasticity',  valId: 'val-elasticity',  unit: '',  dec: 0 },
    { id: 'wingtip-flex',valId: 'val-wingtip-flex',unit: '',  dec: 1 },
    { id: 'flap',        valId: 'val-flap',        unit: '',  dec: 0 },
    { id: 'aileron',     valId: 'val-aileron',     unit: '',  dec: 0 },
    { id: 'spoiler',     valId: 'val-spoiler',     unit: '',  dec: 0 },
    { id: 'elevator',    valId: 'val-elevator',    unit: '',  dec: 0 },
    { id: 'rudder',      valId: 'val-rudder',      unit: '',  dec: 0 },
    { id: 'altitude',    valId: 'val-altitude',    unit: '',  dec: 0 },
    { id: 'airspeed',    valId: 'val-airspeed',    unit: '',  dec: 0 },
    { id: 'aoa',         valId: 'val-aoa',         unit: '',  dec: 1 },
    { id: 'crosswind',   valId: 'val-crosswind',   unit: '',  dec: 0 },
    { id: 'turbulence',  valId: 'val-turbulence',  unit: '',  dec: 0 },
    { id: 'windshear',   valId: 'val-windshear',   unit: '',  dec: 0 },
    { id: 'temp-dev',    valId: 'val-temp-dev',    unit: '',  dec: 0 },
    { id: 'precip',      valId: 'val-precip',      unit: '',  dec: 0 },
    { id: 'icing',       valId: 'val-icing',       unit: '',  dec: 0 },
  ];

  sliders.forEach(({ id, valId, dec }) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el || !valEl) return;
    function update() {
      valEl.textContent = parseFloat(el.value).toFixed(dec);
      onAnyChange();
    }
    el.addEventListener('input', update);
  });

  /* ═══════════════════════════════════════
     GATHER ALL PARAMS
  ═══════════════════════════════════════ */
  function gatherParams() {
    function v(id) { return parseFloat(document.getElementById(id).value); }
    function c(id) { return document.getElementById(id).checked; }
    return {
      span:      v('span'),
      chord:     v('chord'),
      sweep:     v('sweep'),
      twist:     v('twist'),
      thickness: v('thickness'),
      camber:    v('camber'),
      dihedral:  v('dihedral'),
      bending:   v('bending'),
      elasticity:v('elasticity'),
      wingtipFlex: v('wingtip-flex'),
      flap:      v('flap'),
      aileron:   v('aileron'),
      spoiler:   v('spoiler'),
      elevator:  v('elevator'),
      rudder:    v('rudder'),
      altitude:  v('altitude'),
      airspeed:  v('airspeed'),
      aoa:       v('aoa'),
      mach:      v('airspeed') * 0.5144 / Math.sqrt(1.4 * 287 * Math.max(216.65, 288.15 - 0.0065 * v('altitude') * 0.3048)),
      crosswind: v('crosswind'),
      turbulence:v('turbulence'),
      windshear: v('windshear'),
      tempDev:   v('temp-dev'),
      precip:    v('precip'),
      icing:     v('icing'),
      hasWinglet:  c('addon-winglet'),
      hasVortex:   c('addon-vortex'),
      hasFence:    c('addon-fence'),
      hasSharklet: c('addon-sharklet'),
      hasRiblet:   c('addon-riblet'),
      hasLaminar:  c('addon-laminar'),
    };
  }

  /* ═══════════════════════════════════════
     REAL-TIME UPDATE
  ═══════════════════════════════════════ */
  let updateTimer = null;
  function onAnyChange() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(performQuickUpdate, 150);
  }

  function performQuickUpdate() {
    const params = gatherParams();
    window._cfdParams = params;

    // Update 3D model
    window._aircraft.applyControlSurfaces(
      params.flap, params.aileron, params.spoiler,
      params.elevator, params.rudder
    );
    window._aircraft.applyWingFlex(params.wingtipFlex);

    // Rebuild wings if geometry changed (debounced separately)
    scheduleWingRebuild();

    // Quick aero calc
    const result = window._cfd.quickAeroUpdate(params);
    updateReadouts(result.aeroResult);
    updateEfficiency(result.efficiency);
    updateWarnings(result.warnings);
  }

  let wingRebuildTimer = null;
  function scheduleWingRebuild() {
    clearTimeout(wingRebuildTimer);
    wingRebuildTimer = setTimeout(() => {
      window._aircraft.rebuildWingsFromUI();
    }, 500);
  }

  /* ═══════════════════════════════════════
     READOUT DISPLAY
  ═══════════════════════════════════════ */
  function updateReadouts(aero) {
    document.getElementById('rd-cl').textContent   = aero.CL;
    document.getElementById('rd-cd').textContent   = aero.CD;
    document.getElementById('rd-ld').textContent   = aero.LD;
    document.getElementById('rd-cm').textContent   = aero.CM;
    document.getElementById('rd-mach').textContent = aero.mach;
    document.getElementById('rd-re').textContent   = aero.Re;

    // Color L/D
    const ld = parseFloat(aero.LD);
    const ldEl = document.getElementById('rd-ld');
    if (ld > 18) ldEl.style.color = 'var(--accent2)';
    else if (ld > 15) ldEl.style.color = 'var(--text-pri)';
    else ldEl.style.color = 'var(--danger)';
  }

  /* ═══════════════════════════════════════
     EFFICIENCY DISPLAY
  ═══════════════════════════════════════ */
  function updateEfficiency(eff) {
    const fuel = parseFloat(eff.fuelSavingPct);
    const time = parseFloat(eff.timeSavingPct);
    const co2  = parseFloat(eff.co2SavingPct);

    // Fuel bar (max display ±20%)
    const fuelPct = Math.max(0, Math.min(100, (fuel + 15) / 35 * 100));
    document.getElementById('bar-fuel').style.width = fuelPct + '%';
    document.getElementById('val-fuel-saving').textContent = (fuel > 0 ? '+' : '') + fuel + '%';
    document.getElementById('val-fuel-saving').style.color = fuel >= 0 ? 'var(--accent2)' : 'var(--danger)';

    const timePct = Math.max(0, Math.min(100, (time + 10) / 25 * 100));
    document.getElementById('bar-time').style.width = timePct + '%';
    document.getElementById('val-time-saving').textContent = (time > 0 ? '+' : '') + time + '%';
    document.getElementById('val-time-saving').style.color = time >= 0 ? '#ffcc00' : 'var(--danger)';

    const co2Pct = Math.max(0, Math.min(100, (co2 + 14) / 32 * 100));
    document.getElementById('bar-co2').style.width = co2Pct + '%';
    document.getElementById('val-co2-saving').textContent = (co2 > 0 ? '+' : '') + co2 + '%';
    document.getElementById('val-co2-saving').style.color = co2 >= 0 ? 'var(--accent2)' : 'var(--danger)';

    // Summary
    document.getElementById('es-range-design').textContent = eff.range_design.toLocaleString();
    document.getElementById('es-fuel-rate').textContent = eff.fuel_rate;
    document.getElementById('es-thrust').textContent = eff.thrust_kN;

    // Color range
    const rangeBase = 3265;
    document.getElementById('es-range-design').style.color =
      eff.range_design >= rangeBase ? 'var(--accent2)' : 'var(--danger)';
  }

  /* ═══════════════════════════════════════
     WARNING DISPLAY
  ═══════════════════════════════════════ */
  function updateWarnings(warnings) {
    const map = {
      stall:   'warn-stall',
      flutter: 'warn-flutter',
      buffet:  'warn-buffet',
      icing:   'warn-icing'
    };
    Object.entries(map).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      const w = warnings[key];
      if (!el || !w) return;
      el.className = 'warn-item ' + w.level;
      el.textContent = w.msg;
    });

    // Status dot
    const hasAnyDanger = Object.values(warnings).some(w => w.level === 'danger');
    const hasAnyWarn   = Object.values(warnings).some(w => w.level === 'warn');
    const dot = document.getElementById('status-dot');
    if (hasAnyDanger) {
      dot.className = 'status-dot warn';
      document.getElementById('status-text').textContent = '경고 발생';
    } else if (hasAnyWarn) {
      dot.className = 'status-dot';
      dot.style.background = 'var(--warn)';
    } else {
      dot.className = 'status-dot done';
      document.getElementById('status-text').textContent = '조건 정상';
    }
  }

  /* ═══════════════════════════════════════
     CFD SIMULATION RUN
  ═══════════════════════════════════════ */
  document.getElementById('btn-run-sim').addEventListener('click', runCFD);

  function runCFD() {
    const params = gatherParams();
    const progressWrap = document.getElementById('sim-progress-wrap');
    const progressBar  = document.getElementById('sim-progress-bar');
    const progressText = document.getElementById('sim-progress-text');
    const btnRun = document.getElementById('btn-run-sim');

    progressWrap.style.display = 'block';
    btnRun.disabled = true;
    btnRun.textContent = '⏳ 시뮬레이션 실행 중...';

    const dot = document.getElementById('status-dot');
    dot.className = 'status-dot running';
    document.getElementById('status-text').textContent = '계산 중...';

    const mode = window._currentCFDMode || 'cfd-pressure';

    window._cfd.runSimulation(
      params,
      mode,
      (pct, msg) => {
        progressBar.style.width = pct + '%';
        progressText.textContent = msg;
      },
      (result) => {
        progressBar.style.width = '100%';
        progressText.textContent = '완료';
        setTimeout(() => {
          progressWrap.style.display = 'none';
          progressBar.style.width = '0%';
        }, 1500);

        btnRun.disabled = false;
        btnRun.innerHTML = '<span class="run-icon">▶</span> CFD 시뮬레이션 실행';

        dot.className = 'status-dot done';
        document.getElementById('status-text').textContent = 'CFD 완료';

        updateReadouts(result.aeroResult);
        updateEfficiency(result.efficiency);
        updateWarnings(result.warnings);

        // Store last result for report
        window._lastSimResult = { params, result, timestamp: new Date() };
      }
    );
  }

  /* ═══════════════════════════════════════
     VIEWPORT BUTTONS
  ═══════════════════════════════════════ */
  ['front','top','side','iso'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.addEventListener('click', () => window._aircraft.setView(v));
  });

  document.getElementById('view-wire').addEventListener('click', function() {
    window._aircraft.setRenderMode('wireframe');
    setActiveVpBtn(this);
  });
  document.getElementById('view-solid').addEventListener('click', function() {
    window._aircraft.setRenderMode('solid');
    setActiveVpBtn(this);
  });
  document.getElementById('view-cfd-pressure').addEventListener('click', function() {
    window._currentCFDMode = 'cfd-pressure';
    window._aircraft.setRenderMode('cfd-pressure');
    setActiveVpBtn(this);
    // Quick pressure viz
    const params = gatherParams();
    window._cfd.quickAeroUpdate(params);
  });
  document.getElementById('view-cfd-stream').addEventListener('click', function() {
    window._currentCFDMode = 'cfd-stream';
    setActiveVpBtn(this);
    const params = gatherParams();
    window._cfd.buildStreamlines && window._cfd.buildStreamlines(params, {});
  });

  function setActiveVpBtn(el) {
    document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }

  // Header buttons
  document.getElementById('btn-reset-view').addEventListener('click', () => {
    window._aircraft.setView('iso');
  });
  document.getElementById('btn-toggle-cfd').addEventListener('click', function() {
    this.classList.toggle('active');
    document.getElementById('cfd-legend').style.display =
      this.classList.contains('active') ? 'block' : 'none';
  });

  /* ═══════════════════════════════════════
     FLIGHT PHASE BUTTONS
  ═══════════════════════════════════════ */
  const phasePresets = {
    taxi:    { altitude: 0,     airspeed: 20,  aoa: 0,  flap: 0,  spoiler: 0 },
    takeoff: { altitude: 1000,  airspeed: 180, aoa: 10, flap: 15, spoiler: 0 },
    cruise:  { altitude: 35000, airspeed: 450, aoa: 4,  flap: 0,  spoiler: 0 },
    landing: { altitude: 1000,  airspeed: 140, aoa: 8,  flap: 30, spoiler: 20 }
  };

  document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const phase = this.dataset.phase;
      const preset = phasePresets[phase];
      if (!preset) return;
      Object.entries(preset).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = val;
          const valEl = document.getElementById('val-' + id);
          if (valEl) {
            const dec = sliders.find(s => s.id === id)?.dec ?? 0;
            valEl.textContent = parseFloat(val).toFixed(dec);
          }
        }
      });
      onAnyChange();
    });
  });

  /* ═══════════════════════════════════════
     REPORT GENERATION
  ═══════════════════════════════════════ */
  document.getElementById('btn-export').addEventListener('click', generateReport);

  function generateReport() {
    const params = gatherParams();
    const aeroResult = window._cfd.computeAeroCoefficients(params);
    const efficiency = window._cfd.computeEfficiency(aeroResult, params);
    const warnings   = window._cfd.computeWarnings(aeroResult, params);
    const ts = new Date().toLocaleString('ko-KR');

    const addons = [];
    if (params.hasWinglet)  addons.push('윙렛');
    if (params.hasVortex)   addons.push('와류 발생기');
    if (params.hasFence)    addons.push('윙 펜스');
    if (params.hasSharklet) addons.push('샤클렛');
    if (params.hasRiblet)   addons.push('리블렛 코팅');
    if (params.hasLaminar)  addons.push('층류 제어');

    const warnHTML = Object.values(warnings).map(w =>
      `<tr><td>${w.msg.replace(/[✔⚡⚠]/g,'').trim()}</td><td style="color:${w.level === 'ok' ? '#00ff9d' : w.level === 'warn' ? '#ffcc00' : '#ff3b3b'}">${w.level === 'ok' ? '정상' : w.level === 'warn' ? '주의' : '위험'}</td></tr>`
    ).join('');

    const html = `
<h2>📋 AeroSim CFD 시뮬레이션 보고서</h2>
<p style="color:var(--text-sec); font-size:11px;">생성 시각: ${ts} &nbsp;|&nbsp; 기종: Boeing 737-800</p>

<h2>1. 날개 형상 파라미터</h2>
<table>
  <tr><th>파라미터</th><th>값</th><th>단위</th></tr>
  <tr><td>스팬 (반익)</td><td>${params.span}</td><td>m</td></tr>
  <tr><td>익현 길이</td><td>${params.chord}</td><td>m</td></tr>
  <tr><td>후퇴각</td><td>${params.sweep}</td><td>°</td></tr>
  <tr><td>비틀림각</td><td>${params.twist}</td><td>°</td></tr>
  <tr><td>두께비</td><td>${params.thickness}</td><td>%</td></tr>
  <tr><td>캠버</td><td>${params.camber}</td><td>%</td></tr>
  <tr><td>상반각</td><td>${params.dihedral}</td><td>°</td></tr>
  <tr><td>굽힘 강성 (기준 대비)</td><td>${params.bending}</td><td>%</td></tr>
  <tr><td>탄성 계수 (기준 대비)</td><td>${params.elasticity}</td><td>%</td></tr>
  <tr><td>날개 끝 휨량</td><td>${params.wingtipFlex}</td><td>m</td></tr>
</table>

<h2>2. 조종면 편향 상태</h2>
<table>
  <tr><th>조종면</th><th>편향각</th></tr>
  <tr><td>플랩</td><td>${params.flap}°</td></tr>
  <tr><td>에일러론</td><td>${params.aileron}°</td></tr>
  <tr><td>스포일러</td><td>${params.spoiler}°</td></tr>
  <tr><td>엘리베이터</td><td>${params.elevator}°</td></tr>
  <tr><td>러더</td><td>${params.rudder}°</td></tr>
</table>

<h2>3. 비행 조건 및 기상 상태</h2>
<table>
  <tr><th>항목</th><th>값</th></tr>
  <tr><td>비행 고도</td><td>${params.altitude.toLocaleString()} ft</td></tr>
  <tr><td>비행 속도</td><td>${params.airspeed} kt</td></tr>
  <tr><td>마하수</td><td>${aeroResult.mach}</td></tr>
  <tr><td>받음각 (AoA)</td><td>${params.aoa}°</td></tr>
  <tr><td>측풍</td><td>${params.crosswind} kt</td></tr>
  <tr><td>난기류 강도</td><td>${params.turbulence} / 5</td></tr>
  <tr><td>윈드시어</td><td>${params.windshear} kt/1000ft</td></tr>
  <tr><td>강수 강도</td><td>${params.precip} / 5</td></tr>
  <tr><td>착빙 조건</td><td>${params.icing} / 3</td></tr>
  <tr><td>기온 편차</td><td>${params.tempDev} °C</td></tr>
</table>

<h2>4. 부가 장치 구성</h2>
<p>${addons.length ? addons.join(' | ') : '없음 (기본 구성)'}</p>

<h2>5. CFD 공력 해석 결과</h2>
<table>
  <tr><th>계수</th><th>값</th><th>비고</th></tr>
  <tr><td>양력계수 (CL)</td><td>${aeroResult.CL}</td><td>—</td></tr>
  <tr><td>항력계수 (CD)</td><td>${aeroResult.CD}</td><td>—</td></tr>
  <tr><td>양항비 (L/D)</td><td>${aeroResult.LD}</td><td>기준 17.0</td></tr>
  <tr><td>피칭 모멘트 (CM)</td><td>${aeroResult.CM}</td><td>0.25c 기준</td></tr>
  <tr><td>레이놀즈수</td><td>${aeroResult.Re} × 10⁶</td><td>—</td></tr>
  <tr><td>순항 추력</td><td>${aeroResult.thrust} kN</td><td>—</td></tr>
</table>

<h2>6. 효율성 비교 분석 (기준 B737-800 대비)</h2>
<table>
  <tr><th>지표</th><th>기준값</th><th>설계값</th><th>변화율</th></tr>
  <tr>
    <td>연료 소모 절감</td>
    <td>기준 (0%)</td>
    <td>${efficiency.fuel_rate} kg/nm</td>
    <td style="color:${parseFloat(efficiency.fuelSavingPct) >= 0 ? '#00ff9d':'#ff3b3b'}">${efficiency.fuelSavingPct > 0 ? '+'+''}${efficiency.fuelSavingPct}%</td>
  </tr>
  <tr>
    <td>비행 시간 단축</td>
    <td>기준 (0%)</td>
    <td>—</td>
    <td style="color:${parseFloat(efficiency.timeSavingPct) >= 0 ? '#ffcc00':'#ff3b3b'}">${efficiency.timeSavingPct > 0 ? '+':''}${efficiency.timeSavingPct}%</td>
  </tr>
  <tr>
    <td>CO₂ 배출 감소</td>
    <td>기준 (0%)</td>
    <td>—</td>
    <td style="color:${parseFloat(efficiency.co2SavingPct) >= 0 ? '#00ff9d':'#ff3b3b'}">${efficiency.co2SavingPct > 0 ? '+':''}${efficiency.co2SavingPct}%</td>
  </tr>
  <tr>
    <td>항속거리</td>
    <td>3,265 nm</td>
    <td>${efficiency.range_design.toLocaleString()} nm</td>
    <td style="color:${efficiency.range_design >= 3265 ? '#00ff9d':'#ff3b3b'}">${((efficiency.range_design - 3265) / 3265 * 100).toFixed(1)}%</td>
  </tr>
</table>

<h2>7. 안전성 검토</h2>
<table>
  <tr><th>항목</th><th>판정</th></tr>
  ${warnHTML}
</table>

<h2>8. 종합 평가</h2>
<p>
  현재 날개 설계의 양항비(L/D = ${aeroResult.LD})는 기준 B737-800 대비
  <strong style="color:${parseFloat(aeroResult.LD) >= 17 ? '#00ff9d':'#ff3b3b'}">
  ${((parseFloat(aeroResult.LD) - 17.0) / 17.0 * 100).toFixed(1)}%</strong>
  변화를 나타냅니다.
  ${parseFloat(efficiency.fuelSavingPct) > 0
    ? `연료 소모를 <strong style="color:#00ff9d">${efficiency.fuelSavingPct}%</strong> 절감하여 친환경성이 향상되었습니다.`
    : `연료 소모가 <strong style="color:#ff3b3b">${Math.abs(parseFloat(efficiency.fuelSavingPct))}%</strong> 증가하였습니다. 날개 형상 최적화가 필요합니다.`}
  ${addons.length > 0 ? `부가 장치(${addons.join(', ')})가 공력 성능에 반영되었습니다.` : ''}
</p>
<p style="color:var(--text-sec); font-size:10px; margin-top:12px;">
※ 본 보고서는 패널법 기반 근사 CFD 결과입니다. 정밀 분석을 위해 고차 RANS/LES 해석을 권장합니다.
</p>
    `;

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
  }

  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal-overlay').style.display = 'none';
  });
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });

  document.getElementById('btn-print-report').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-copy-report').addEventListener('click', () => {
    const text = document.getElementById('modal-body').innerText;
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById('btn-copy-report').textContent = '✔ 복사됨';
      setTimeout(() => {
        document.getElementById('btn-copy-report').textContent = '📋 클립보드 복사';
      }, 2000);
    });
  });

  /* ═══════════════════════════════════════
     INITIAL UPDATE
  ═══════════════════════════════════════ */
  setTimeout(() => {
    onAnyChange();
    document.getElementById('status-text').textContent = '준비 완료';
    document.getElementById('status-dot').className = 'status-dot done';
  }, 500);

})();
