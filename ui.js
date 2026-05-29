/**
 * ui.js  (수정판 v2)
 * UI 제어 레이어
 *
 * 수정 사항:
 * 1. 모든 이벤트 바인딩을 DOMContentLoaded + _aircraft/_cfd 준비 후 실행
 * 2. view-cfd-stream 버튼에서 buildStreamlines 직접 호출 (이전엔 undefined)
 * 3. sliders에 'change' 이벤트도 추가 (모바일/스크린리더 대응)
 * 4. phase preset에서 누락된 val-* 업데이트 수정
 * 5. 보고서 생성 시 computeEfficiency 인수 수정 (params 제거)
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     초기화 — aircraft.js & cfd.js 준비 후 실행
  ═══════════════════════════════════════ */
  function waitAndInit() {
    if (!window._aircraft || !window._cfd) {
      setTimeout(waitAndInit, 60);
      return;
    }
    initUI();
  }

  // [BUG FIX] DOMContentLoaded 보장
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndInit);
  } else {
    waitAndInit();
  }

  /* ═══════════════════════════════════════
     SLIDER DEFINITIONS
  ═══════════════════════════════════════ */
  const SLIDERS = [
    { id: 'chord',        valId: 'val-chord',       dec: 1 },
    { id: 'span',         valId: 'val-span',        dec: 1 },
    { id: 'sweep',        valId: 'val-sweep',       dec: 0 },
    { id: 'twist',        valId: 'val-twist',       dec: 1 },
    { id: 'thickness',    valId: 'val-thickness',   dec: 1 },
    { id: 'dihedral',     valId: 'val-dihedral',    dec: 1 },
    { id: 'camber',       valId: 'val-camber',      dec: 1 },
    { id: 'bending',      valId: 'val-bending',     dec: 0 },
    { id: 'elasticity',   valId: 'val-elasticity',  dec: 0 },
    { id: 'wingtip-flex', valId: 'val-wingtip-flex',dec: 1 },
    { id: 'flap',         valId: 'val-flap',        dec: 0 },
    { id: 'aileron',      valId: 'val-aileron',     dec: 0 },
    { id: 'spoiler',      valId: 'val-spoiler',     dec: 0 },
    { id: 'elevator',     valId: 'val-elevator',    dec: 0 },
    { id: 'rudder',       valId: 'val-rudder',      dec: 0 },
    { id: 'altitude',     valId: 'val-altitude',    dec: 0 },
    { id: 'airspeed',     valId: 'val-airspeed',    dec: 0 },
    { id: 'aoa',          valId: 'val-aoa',         dec: 1 },
    { id: 'crosswind',    valId: 'val-crosswind',   dec: 0 },
    { id: 'turbulence',   valId: 'val-turbulence',  dec: 0 },
    { id: 'windshear',    valId: 'val-windshear',   dec: 0 },
    { id: 'temp-dev',     valId: 'val-temp-dev',    dec: 0 },
    { id: 'precip',       valId: 'val-precip',      dec: 0 },
    { id: 'icing',        valId: 'val-icing',       dec: 0 },
  ];

  /* ═══════════════════════════════════════
     GATHER PARAMS
  ═══════════════════════════════════════ */
  function gatherParams() {
    function v(id) {
      const el = document.getElementById(id);
      return el ? parseFloat(el.value) : 0;
    }
    function c(id) {
      const el = document.getElementById(id);
      return el ? el.checked : false;
    }
    const airspeed = v('airspeed');
    const altitude = v('altitude');
    const altM = altitude * 0.3048;
    const T    = Math.max(216.65, 288.15 - 0.0065 * altM);
    const a    = Math.sqrt(1.4 * 287 * T);
    const mach = (airspeed * 0.5144) / a;

    return {
      span:       v('span'),
      chord:      v('chord'),
      sweep:      v('sweep'),
      twist:      v('twist'),
      thickness:  v('thickness'),
      camber:     v('camber'),
      dihedral:   v('dihedral'),
      bending:    v('bending'),
      elasticity: v('elasticity'),
      wingtipFlex: v('wingtip-flex'),
      flap:       v('flap'),
      aileron:    v('aileron'),
      spoiler:    v('spoiler'),
      elevator:   v('elevator'),
      rudder:     v('rudder'),
      altitude,
      airspeed,
      aoa:        v('aoa'),
      mach,
      crosswind:  v('crosswind'),
      turbulence: v('turbulence'),
      windshear:  v('windshear'),
      tempDev:    v('temp-dev'),
      precip:     v('precip'),
      icing:      v('icing'),
      hasWinglet:  c('addon-winglet'),
      hasVortex:   c('addon-vortex'),
      hasFence:    c('addon-fence'),
      hasSharklet: c('addon-sharklet'),
      hasRiblet:   c('addon-riblet'),
      hasLaminar:  c('addon-laminar'),
    };
  }

  /* ═══════════════════════════════════════
     DISPLAY HELPERS
  ═══════════════════════════════════════ */
  function updateReadouts(aero) {
    function set(id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    set('rd-cl', aero.CL);
    set('rd-cd', aero.CD);
    set('rd-ld', aero.LD);
    set('rd-cm', aero.CM);
    set('rd-mach', aero.mach);
    set('rd-re',   aero.Re);

    const ldEl = document.getElementById('rd-ld');
    if (ldEl) {
      const ld = parseFloat(aero.LD);
      ldEl.style.color = ld > 18 ? 'var(--accent2)' : ld > 15 ? 'var(--text-pri)' : 'var(--danger)';
    }
  }

  function updateEfficiency(eff) {
    function setBar(barId, valId, pct, color) {
      const bar = document.getElementById(barId);
      const val = document.getElementById(valId);
      if (!bar || !val) return;
      const clamp = Math.max(0, Math.min(100, pct));
      bar.style.width = clamp + '%';
      const num = parseFloat(pct.toFixed ? pct : '0');
      val.textContent = (num > 0 ? '+' : '') + (typeof pct === 'string' ? pct : pct.toFixed(1)) + '%';
      val.style.color = num >= 0 ? color : 'var(--danger)';
    }

    const fuel = parseFloat(eff.fuelSavingPct);
    const time = parseFloat(eff.timeSavingPct);
    const co2  = parseFloat(eff.co2SavingPct);

    setBar('bar-fuel', 'val-fuel-saving', Math.max(0, (fuel + 15) / 35 * 100), 'var(--accent2)');
    document.getElementById('val-fuel-saving').textContent = (fuel > 0 ? '+' : '') + eff.fuelSavingPct + '%';
    document.getElementById('val-fuel-saving').style.color = fuel >= 0 ? 'var(--accent2)' : 'var(--danger)';

    const tp = Math.max(0, (time + 10) / 25 * 100);
    if (document.getElementById('bar-time')) document.getElementById('bar-time').style.width = tp + '%';
    document.getElementById('val-time-saving').textContent = (time > 0 ? '+' : '') + eff.timeSavingPct + '%';
    document.getElementById('val-time-saving').style.color = time >= 0 ? '#ffcc00' : 'var(--danger)';

    const cp = Math.max(0, (co2 + 14) / 32 * 100);
    if (document.getElementById('bar-co2')) document.getElementById('bar-co2').style.width = cp + '%';
    document.getElementById('val-co2-saving').textContent = (co2 > 0 ? '+' : '') + eff.co2SavingPct + '%';
    document.getElementById('val-co2-saving').style.color = co2 >= 0 ? 'var(--accent2)' : 'var(--danger)';

    function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
    setEl('es-range-design', eff.range_design.toLocaleString());
    setEl('es-fuel-rate',    eff.fuel_rate);
    setEl('es-thrust',       eff.thrust_kN);
    const rEl = document.getElementById('es-range-design');
    if (rEl) rEl.style.color = eff.range_design >= 3265 ? 'var(--accent2)' : 'var(--danger)';
  }

  function updateWarnings(warnings) {
    const map = { stall:'warn-stall', flutter:'warn-flutter', buffet:'warn-buffet', icing:'warn-icing' };
    Object.entries(map).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      const w  = warnings[key];
      if (!el || !w) return;
      el.className  = 'warn-item ' + w.level;
      el.textContent = w.msg;
    });
    const dot     = document.getElementById('status-dot');
    const textEl  = document.getElementById('status-text');
    const anyDanger = Object.values(warnings).some(w => w.level === 'danger');
    const anyWarn   = Object.values(warnings).some(w => w.level === 'warn');
    if (dot) dot.className = anyDanger ? 'status-dot warn' : anyWarn ? 'status-dot' : 'status-dot done';
    if (anyDanger && textEl) textEl.textContent = '경고 발생';
    else if (!anyDanger && !anyWarn && textEl) textEl.textContent = '조건 정상';
  }

  /* ═══════════════════════════════════════
     REAL-TIME UPDATE
  ═══════════════════════════════════════ */
  let updateTimer = null;
  let wingRebuildTimer = null;

  function onAnyChange() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(performQuickUpdate, 120);
  }

  function performQuickUpdate() {
    const params = gatherParams();
    window._cfdParams = params;

    // 3D 조종면 & 날개 휨
    window._aircraft.applyControlSurfaces(params.flap, params.aileron, params.spoiler, params.elevator, params.rudder);
    window._aircraft.applyWingFlex(params.wingtipFlex);

    // 날개 형상 재빌드 (geometry 변경 시 debounce)
    clearTimeout(wingRebuildTimer);
    wingRebuildTimer = setTimeout(() => {
      window._aircraft.rebuildWingsFromUI();
    }, 600);

    // 공력 계산 & 화면 갱신
    const result = window._cfd.quickAeroUpdate(params);
    updateReadouts(result.aeroResult);
    updateEfficiency(result.efficiency);
    updateWarnings(result.warnings);
  }

  /* ═══════════════════════════════════════
     MAIN INIT (aircraft + cfd 준비 완료 후)
  ═══════════════════════════════════════ */
  function initUI() {

    // ── 슬라이더 이벤트 ──
    SLIDERS.forEach(({ id, valId, dec }) => {
      const el    = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (!el || !valEl) return;
      function onSlide() {
        valEl.textContent = parseFloat(el.value).toFixed(dec);
        onAnyChange();
      }
      el.addEventListener('input',  onSlide);
      el.addEventListener('change', onSlide);  // [BUG FIX] change 이벤트 추가
    });

    // ── 체크박스(addon) 이벤트 ──
    ['addon-winglet','addon-vortex','addon-fence','addon-sharklet','addon-riblet','addon-laminar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          window._aircraft.updateAddonVisibility();
          onAnyChange();
        });
      }
    });

    // ── 뷰포트 버튼 ──
    ['front','top','side','iso'].forEach(name => {
      const el = document.getElementById('view-' + name);
      if (el) el.addEventListener('click', () => window._aircraft.setView(name));
    });

    const wireBtn = document.getElementById('view-wire');
    if (wireBtn) wireBtn.addEventListener('click', function() {
      window._aircraft.setRenderMode('wireframe');
      setActiveVpBtn(this);
    });
    const solidBtn = document.getElementById('view-solid');
    if (solidBtn) solidBtn.addEventListener('click', function() {
      window._aircraft.setRenderMode('solid');
      setActiveVpBtn(this);
    });
    const pressBtn = document.getElementById('view-cfd-pressure');
    if (pressBtn) pressBtn.addEventListener('click', function() {
      window._currentCFDMode = 'cfd-pressure';
      setActiveVpBtn(this);
      // 즉시 압력장 표시
      const params = gatherParams();
      window._cfd.buildPressureVisualization(params);
      const legend = document.getElementById('cfd-legend');
      if (legend) legend.style.display = 'block';
    });
    const streamBtn = document.getElementById('view-cfd-stream');
    if (streamBtn) streamBtn.addEventListener('click', function() {
      window._currentCFDMode = 'cfd-stream';
      setActiveVpBtn(this);
      // [BUG FIX] buildStreamlines 직접 호출 (이전엔 undefined 오류)
      const params = gatherParams();
      window._cfd.buildStreamlines(params);
      const legend = document.getElementById('cfd-legend');
      if (legend) legend.style.display = 'block';
    });

    function setActiveVpBtn(el) {
      document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
    }

    // ── 헤더 버튼 ──
    const resetViewBtn = document.getElementById('btn-reset-view');
    if (resetViewBtn) resetViewBtn.addEventListener('click', () => window._aircraft.setView('iso'));

    const cfdToggle = document.getElementById('btn-toggle-cfd');
    if (cfdToggle) cfdToggle.addEventListener('click', function() {
      this.classList.toggle('active');
      const show = this.classList.contains('active');
      window._cfd.setVisible(show);
      const legend = document.getElementById('cfd-legend');
      if (legend) legend.style.display = show ? 'block' : 'none';
    });

    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) exportBtn.addEventListener('click', generateReport);

    // ── 비행 단계 프리셋 ──
    const phasePresets = {
      taxi:    { altitude: 0,     airspeed: 20,  aoa: 0,  flap: 0,  spoiler: 0 },
      takeoff: { altitude: 1000,  airspeed: 180, aoa: 10, flap: 15, spoiler: 0 },
      cruise:  { altitude: 35000, airspeed: 450, aoa: 4,  flap: 0,  spoiler: 0 },
      landing: { altitude: 1000,  airspeed: 140, aoa: 8,  flap: 30, spoiler: 20 },
    };

    document.querySelectorAll('.phase-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const preset = phasePresets[this.dataset.phase];
        if (!preset) return;
        Object.entries(preset).forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = val;
          // [BUG FIX] val-* span도 함께 업데이트
          const s = SLIDERS.find(s => s.id === id);
          const dec = s ? s.dec : 0;
          const valEl = document.getElementById('val-' + id);
          if (valEl) valEl.textContent = parseFloat(val).toFixed(dec);
        });
        onAnyChange();
      });
    });

    // ── CFD 실행 버튼 ──
    const runBtn = document.getElementById('btn-run-sim');
    if (runBtn) runBtn.addEventListener('click', runCFD);

    // ── 모달 ──
    const modalClose = document.getElementById('modal-close');
    if (modalClose) modalClose.addEventListener('click', () => {
      document.getElementById('modal-overlay').style.display = 'none';
    });
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.addEventListener('click', function(e) {
      if (e.target === this) this.style.display = 'none';
    });
    const printBtn = document.getElementById('btn-print-report');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    const copyBtn = document.getElementById('btn-copy-report');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const text = document.getElementById('modal-body').innerText;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✔ 복사됨';
        setTimeout(() => { copyBtn.textContent = '📋 클립보드 복사'; }, 2000);
      }).catch(() => {
        // clipboard API 미지원 fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyBtn.textContent = '✔ 복사됨';
        setTimeout(() => { copyBtn.textContent = '📋 클립보드 복사'; }, 2000);
      });
    });

    // ── 초기 계산 ──
    setTimeout(() => {
      onAnyChange();
      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot)  dot.className = 'status-dot done';
      if (text) text.textContent = '준비 완료';
    }, 300);
  }

  /* ═══════════════════════════════════════
     CFD SIMULATION RUN
  ═══════════════════════════════════════ */
  function runCFD() {
    const params      = gatherParams();
    const progressWrap = document.getElementById('sim-progress-wrap');
    const progressBar  = document.getElementById('sim-progress-bar');
    const progressText = document.getElementById('sim-progress-text');
    const btnRun       = document.getElementById('btn-run-sim');

    if (progressWrap) progressWrap.style.display = 'block';
    if (btnRun) { btnRun.disabled = true; btnRun.textContent = '⏳ 계산 중...'; }

    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot)  dot.className = 'status-dot running';
    if (text) text.textContent = '계산 중...';

    const mode = window._currentCFDMode || 'cfd-pressure';

    window._cfd.runSimulation(
      params, mode,
      (pct, msg) => {
        if (progressBar)  progressBar.style.width  = pct + '%';
        if (progressText) progressText.textContent = msg;
      },
      (result) => {
        if (progressBar)  progressBar.style.width  = '100%';
        if (progressText) progressText.textContent = '완료';
        setTimeout(() => {
          if (progressWrap) progressWrap.style.display = 'none';
          if (progressBar)  progressBar.style.width  = '0%';
        }, 1500);
        if (btnRun) {
          btnRun.disabled  = false;
          btnRun.innerHTML = '<span class="run-icon">▶</span> CFD 시뮬레이션 실행';
        }
        if (dot)  dot.className = 'status-dot done';
        if (text) text.textContent = 'CFD 완료';

        updateReadouts(result.aeroResult);
        updateEfficiency(result.efficiency);
        updateWarnings(result.warnings);
        window._lastSimResult = { params, result, timestamp: new Date() };
      }
    );
  }

  /* ═══════════════════════════════════════
     REPORT GENERATION
  ═══════════════════════════════════════ */
  function generateReport() {
    const params      = gatherParams();
    const aeroResult  = window._cfd.computeAeroCoefficients(params);
    // [BUG FIX] computeEfficiency는 aeroResult만 인수로 받음
    const efficiency  = window._cfd.computeEfficiency(aeroResult);
    const warnings    = window._cfd.computeWarnings(aeroResult, params);
    const ts          = new Date().toLocaleString('ko-KR');

    const addons = [];
    if (params.hasWinglet)  addons.push('윙렛');
    if (params.hasVortex)   addons.push('와류 발생기');
    if (params.hasFence)    addons.push('윙 펜스');
    if (params.hasSharklet) addons.push('샤클렛');
    if (params.hasRiblet)   addons.push('리블렛 코팅');
    if (params.hasLaminar)  addons.push('층류 제어');

    const warnHTML = Object.values(warnings).map(w => {
      const clr = w.level === 'ok' ? '#00ff9d' : w.level === 'warn' ? '#ffcc00' : '#ff3b3b';
      const lbl = w.level === 'ok' ? '정상' : w.level === 'warn' ? '주의' : '위험';
      return `<tr><td>${w.msg.replace(/[✔⚡⚠]/g,'').trim()}</td><td style="color:${clr}">${lbl}</td></tr>`;
    }).join('');

    const ldDiff = ((parseFloat(aeroResult.LD) - 17.0) / 17.0 * 100).toFixed(1);
    const rangeDiff = ((efficiency.range_design - 3265) / 3265 * 100).toFixed(1);

    const html = `
<h2>📋 AeroSim CFD 시뮬레이션 보고서</h2>
<p style="color:var(--text-sec);font-size:11px">생성: ${ts} &nbsp;|&nbsp; 기종: Boeing 737-800</p>

<h2>1. 날개 형상 파라미터</h2>
<table>
  <tr><th>파라미터</th><th>값</th><th>단위</th></tr>
  <tr><td>스팬</td><td>${params.span}</td><td>m</td></tr>
  <tr><td>익현 길이</td><td>${params.chord}</td><td>m</td></tr>
  <tr><td>후퇴각</td><td>${params.sweep}</td><td>°</td></tr>
  <tr><td>비틀림각</td><td>${params.twist}</td><td>°</td></tr>
  <tr><td>두께비</td><td>${params.thickness}</td><td>%</td></tr>
  <tr><td>캠버</td><td>${params.camber}</td><td>%</td></tr>
  <tr><td>상반각</td><td>${params.dihedral}</td><td>°</td></tr>
  <tr><td>굽힘 강성 (기준비)</td><td>${params.bending}</td><td>%</td></tr>
  <tr><td>탄성 계수 (기준비)</td><td>${params.elasticity}</td><td>%</td></tr>
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
  <tr><td>양력계수 CL</td><td>${aeroResult.CL}</td><td>—</td></tr>
  <tr><td>항력계수 CD</td><td>${aeroResult.CD}</td><td>—</td></tr>
  <tr><td>양항비 L/D</td><td>${aeroResult.LD}</td><td>기준 17.0</td></tr>
  <tr><td>피칭 모멘트 CM</td><td>${aeroResult.CM}</td><td>0.25c 기준</td></tr>
  <tr><td>레이놀즈수</td><td>${aeroResult.Re} × 10⁶</td><td>—</td></tr>
  <tr><td>순항 추력</td><td>${aeroResult.thrust} kN</td><td>—</td></tr>
</table>

<h2>6. 효율성 비교 분석 (기준 B737-800 대비)</h2>
<table>
  <tr><th>지표</th><th>기준값</th><th>설계값</th><th>변화율</th></tr>
  <tr>
    <td>연료 소모 절감</td><td>0%</td><td>${efficiency.fuel_rate} kg/nm</td>
    <td style="color:${parseFloat(efficiency.fuelSavingPct)>=0?'#00ff9d':'#ff3b3b'}">${parseFloat(efficiency.fuelSavingPct)>0?'+':''}${efficiency.fuelSavingPct}%</td>
  </tr>
  <tr>
    <td>비행 시간 단축</td><td>0%</td><td>—</td>
    <td style="color:${parseFloat(efficiency.timeSavingPct)>=0?'#ffcc00':'#ff3b3b'}">${parseFloat(efficiency.timeSavingPct)>0?'+':''}${efficiency.timeSavingPct}%</td>
  </tr>
  <tr>
    <td>CO₂ 배출 감소</td><td>0%</td><td>—</td>
    <td style="color:${parseFloat(efficiency.co2SavingPct)>=0?'#00ff9d':'#ff3b3b'}">${parseFloat(efficiency.co2SavingPct)>0?'+':''}${efficiency.co2SavingPct}%</td>
  </tr>
  <tr>
    <td>항속거리</td><td>3,265 nm</td><td>${efficiency.range_design.toLocaleString()} nm</td>
    <td style="color:${efficiency.range_design>=3265?'#00ff9d':'#ff3b3b'}">${rangeDiff}%</td>
  </tr>
</table>

<h2>7. 안전성 검토</h2>
<table><tr><th>항목</th><th>판정</th></tr>${warnHTML}</table>

<h2>8. 종합 평가</h2>
<p>
  현재 설계의 양항비(L/D = ${aeroResult.LD})는 기준 대비
  <strong style="color:${parseFloat(ldDiff)>=0?'#00ff9d':'#ff3b3b'}">${ldDiff > 0 ? '+':''}${ldDiff}%</strong> 변화입니다.
  ${parseFloat(efficiency.fuelSavingPct) > 0
    ? `연료 소모를 <strong style="color:#00ff9d">${efficiency.fuelSavingPct}%</strong> 절감하여 친환경성이 향상되었습니다.`
    : `연료 소모가 <strong style="color:#ff3b3b">${Math.abs(parseFloat(efficiency.fuelSavingPct))}%</strong> 증가하였습니다.`}
  ${addons.length ? `부가 장치(${addons.join(', ')})가 공력 성능에 반영되었습니다.` : ''}
</p>
<p style="color:var(--text-sec);font-size:10px;margin-top:12px">
  ※ 본 보고서는 패널법 기반 근사 CFD 결과입니다. 정밀 분석을 위해 RANS/LES 해석을 권장합니다.
</p>`;

    const body = document.getElementById('modal-body');
    if (body) body.innerHTML = html;
    const mo = document.getElementById('modal-overlay');
    if (mo) mo.style.display = 'flex';
  }

})();
