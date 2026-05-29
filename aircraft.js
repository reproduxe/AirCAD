/**
 * aircraft.js  (수정판 v2)
 * Three.js 3D B737-800 모델 — 버그 수정
 *
 * 수정 사항:
 * 1. buildWings 재호출 시 wingGroup 뿐 아니라 engineGroup도 제거
 * 2. matCFD를 window._matCFD로 전역 노출 (cfd.js 참조 전에 정의)
 * 3. setRenderMode에서 window._cfd null-guard 강화
 * 4. ResizeObserver 초기 호출 타이밍 수정
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     SCENE SETUP
  ═══════════════════════════════════════ */
  const canvas = document.getElementById('three-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020810);
  scene.fog = new THREE.FogExp2(0x020810, 0.008);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(30, 18, 50);
  camera.lookAt(0, 0, 0);

  /* ═══════════════════════════════════════
     ORBIT CONTROLS (직접 구현)
  ═══════════════════════════════════════ */
  let isDragging = false, isRightDrag = false;
  let prevMouse = { x: 0, y: 0 };
  let spherical = { theta: 0.8, phi: 0.9, r: 55 };
  let target = new THREE.Vector3(0, 0, 0);

  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    isRightDrag = e.button === 2;
    prevMouse = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = (e.clientX - prevMouse.x) * 0.008;
    const dy = (e.clientY - prevMouse.y) * 0.008;
    prevMouse = { x: e.clientX, y: e.clientY };
    if (isRightDrag) {
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      target.addScaledVector(right, -dx * spherical.r * 0.5);
      target.addScaledVector(up, dy * spherical.r * 0.5);
    } else {
      spherical.theta -= dx;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy));
    }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    spherical.r = Math.max(8, Math.min(200, spherical.r + e.deltaY * 0.05));
  }, { passive: false });

  let prevTouches = [];
  canvas.addEventListener('touchstart', e => { prevTouches = Array.from(e.touches); }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = Array.from(e.touches);
    if (touches.length === 1 && prevTouches.length >= 1) {
      const dx = (touches[0].clientX - prevTouches[0].clientX) * 0.01;
      const dy = (touches[0].clientY - prevTouches[0].clientY) * 0.01;
      spherical.theta -= dx;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy));
    } else if (touches.length === 2 && prevTouches.length === 2) {
      const prevDist = Math.hypot(prevTouches[0].clientX - prevTouches[1].clientX, prevTouches[0].clientY - prevTouches[1].clientY);
      const currDist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      spherical.r = Math.max(8, Math.min(200, spherical.r - (currDist - prevDist) * 0.1));
    }
    prevTouches = touches;
  }, { passive: false });

  function updateCamera() {
    camera.position.set(
      target.x + spherical.r * Math.sin(spherical.phi) * Math.sin(spherical.theta),
      target.y + spherical.r * Math.cos(spherical.phi),
      target.z + spherical.r * Math.sin(spherical.phi) * Math.cos(spherical.theta)
    );
    camera.lookAt(target);
  }

  /* ═══════════════════════════════════════
     LIGHTING
  ═══════════════════════════════════════ */
  scene.add(new THREE.AmbientLight(0x102030, 0.8));

  const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
  sunLight.position.set(40, 60, 30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = -80;
  sunLight.shadow.camera.right = 80;
  sunLight.shadow.camera.top = 80;
  sunLight.shadow.camera.bottom = -80;
  scene.add(sunLight);
  scene.add(new THREE.DirectionalLight(0x0088ff, 0.8).translateX(-30).translateY(10).translateZ(-40));
  scene.add(new THREE.DirectionalLight(0x4488aa, 0.4).translateY(-20));

  const gridHelper = new THREE.GridHelper(200, 40, 0x0a1a2a, 0x0a1a2a);
  gridHelper.position.y = -10;
  scene.add(gridHelper);

  /* ═══════════════════════════════════════
     MATERIALS
  ═══════════════════════════════════════ */
  const matFuselage  = new THREE.MeshStandardMaterial({ color: 0xd8e8f0, metalness: 0.7, roughness: 0.25 });
  const matWing      = new THREE.MeshStandardMaterial({ color: 0xc8dcea, metalness: 0.65, roughness: 0.3 });
  const matControlSurface = new THREE.MeshStandardMaterial({ color: 0x9ab8cc, metalness: 0.5, roughness: 0.35 });
  const matEngine    = new THREE.MeshStandardMaterial({ color: 0x888fa0, metalness: 0.8, roughness: 0.2 });
  const matEngineInlet = new THREE.MeshStandardMaterial({ color: 0x222830, metalness: 0.9, roughness: 0.15 });
  const matWinglet   = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.6, roughness: 0.3 });
  const matVortexGen = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.7, roughness: 0.3 });
  const matWindow    = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.7 });
  // [BUG FIX] matCFD를 전역으로 노출해서 cfd.js에서도 안전하게 참조할 수 있도록 수정
  const matCFD = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.8, transparent: true, opacity: 0.85 });
  window._matCFD = matCFD;

  /* ═══════════════════════════════════════
     AIRCRAFT ROOT GROUP
  ═══════════════════════════════════════ */
  const aircraftGroup = new THREE.Group();
  scene.add(aircraftGroup);

  /* ═══════════════════════════════════════
     FUSELAGE — B737-800
  ═══════════════════════════════════════ */
  function buildFuselage() {
    const group = new THREE.Group();

    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19.75, 0, 0),
      new THREE.Vector3(-18, 0, 0),
      new THREE.Vector3(-14, 0, 0),
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(14, 0, 0),
      new THREE.Vector3(17, 0, 0),
      new THREE.Vector3(18.5, 0.3, 0),
      new THREE.Vector3(19.75, 0.9, 0),
    ]);

    const geom = new THREE.TubeGeometry(path, 80, 1.88, 20, false);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -1.6) pos.setY(i, -1.6);
    }
    geom.computeVertexNormals();
    const fuselage = new THREE.Mesh(geom, matFuselage);
    fuselage.castShadow = true; fuselage.receiveShadow = true;
    group.add(fuselage);

    // Nose
    const noseGeom = new THREE.SphereGeometry(1.88, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    noseGeom.rotateZ(Math.PI / 2);
    noseGeom.applyMatrix4(new THREE.Matrix4().makeScale(2.8, 1, 1));
    const nose = new THREE.Mesh(noseGeom, matFuselage);
    nose.position.x = -19.75; nose.castShadow = true;
    group.add(nose);

    // Windows
    const wGeom = new THREE.BoxGeometry(0.45, 0.32, 0.05);
    for (let x = -15; x < 17; x += 1.1) {
      ['left','right'].forEach(side => {
        const w = new THREE.Mesh(wGeom, matWindow);
        w.position.set(x, 0.6, side === 'left' ? -1.9 : 1.9);
        group.add(w);
      });
    }

    // Cockpit windows
    const cpGeom = new THREE.BoxGeometry(0.5, 0.35, 0.05);
    [-0.25, 0.25].forEach(off => {
      ['left','right'].forEach(side => {
        const cp = new THREE.Mesh(cpGeom, matWindow);
        cp.position.set(-17.5 + off * 0.5, 0.9, side === 'left' ? -1.5 : 1.5);
        cp.rotation.y = side === 'left' ? 0.35 : -0.35;
        group.add(cp);
      });
    });

    // Doors
    const doorGeom = new THREE.BoxGeometry(0.05, 1.8, 0.8);
    const doorMat  = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.6, roughness: 0.4 });
    [-13, 2, 13].forEach(x => {
      [-1, 1].forEach(s => {
        const d = new THREE.Mesh(doorGeom, doorMat);
        d.position.set(x, 0.1, s * 1.91);
        group.add(d);
      });
    });

    // Belly fairing
    const fairGeom = new THREE.CylinderGeometry(0.7, 0.5, 12, 12, 1, false, 0, Math.PI);
    fairGeom.rotateZ(Math.PI / 2); fairGeom.rotateX(Math.PI);
    const fair = new THREE.Mesh(fairGeom, matFuselage);
    fair.position.set(0, -1.88, 0);
    group.add(fair);

    return group;
  }

  /* ═══════════════════════════════════════
     NACA 4-digit airfoil profile
  ═══════════════════════════════════════ */
  function naca4Profile(m, p, t, c, nPts) {
    const pts = [];
    for (let i = 0; i <= nPts; i++) {
      const x  = (1 - Math.cos(i / nPts * Math.PI)) / 2 * c;
      const xc = x / c;
      const yt = t / 0.2 * c * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc * xc + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4));
      let yc = 0, dyc = 0;
      if (m !== 0) {
        if (xc < p) { yc = m / (p * p) * (2 * p * xc - xc * xc) * c; dyc = 2 * m / (p * p) * (p - xc); }
        else         { yc = m / ((1 - p) * (1 - p)) * (1 - 2 * p + 2 * p * xc - xc * xc) * c; dyc = 2 * m / ((1 - p) * (1 - p)) * (p - xc); }
      }
      const th = Math.atan(dyc);
      pts.push({ xu: x - yt * Math.sin(th), yu: yc + yt * Math.cos(th), xl: x + yt * Math.sin(th), yl: yc - yt * Math.cos(th) });
    }
    return pts;
  }

  /* ═══════════════════════════════════════
     WING GEOMETRY (NACA 23012)
  ═══════════════════════════════════════ */
  function buildWingGeometry(params) {
    const { span, rootChord, tipChord, sweep, twist, thickness, camber, dihedral } = params;
    const halfSpan = span / 2;
    const nProf = 16, nSections = 16;

    const rootProf = naca4Profile(0.02, 0.3, thickness / 100, rootChord, nProf);
    const tipProf  = naca4Profile(0.02, 0.3, thickness / 100, tipChord,  nProf);

    const positions = [], indices = [];

    function addProfile(prof, z, xOffset, yOffset, twistAngle) {
      const cosT = Math.cos(twistAngle), sinT = Math.sin(twistAngle);
      for (let i = 0; i <= nProf; i++) {
        const xu = prof[i].xu - rootChord / 4, yu = prof[i].yu;
        positions.push(xu * cosT - yu * sinT + xOffset, xu * sinT + yu * cosT + yOffset, z);
      }
      for (let i = nProf; i >= 0; i--) {
        const xl = prof[i].xl - rootChord / 4, yl = prof[i].yl;
        positions.push(xl * cosT - yl * sinT + xOffset, xl * sinT + yl * cosT + yOffset, z);
      }
    }

    for (let si = 0; si <= nSections; si++) {
      const t = si / nSections;
      const z = halfSpan * t;
      const xOff = z * Math.tan(sweep * Math.PI / 180);
      const yOff = z * Math.tan(dihedral * Math.PI / 180);
      const twistAngle = (twist * t) * Math.PI / 180;
      const tRatio = tipChord / rootChord;
      const prof = rootProf.map((rp, i) => ({
        xu: rp.xu + (tipProf[i].xu - rp.xu) * t * tRatio,
        yu: rp.yu + (tipProf[i].yu - rp.yu) * t,
        xl: rp.xl + (tipProf[i].xl - rp.xl) * t * tRatio,
        yl: rp.yl + (tipProf[i].yl - rp.yl) * t
      }));
      addProfile(prof, z, xOff, yOff, twistAngle);
    }

    const nPerSection = (nProf + 1) * 2;
    for (let si = 0; si < nSections; si++) {
      const base = si * nPerSection, next = (si + 1) * nPerSection;
      for (let pi = 0; pi < nPerSection - 1; pi++) {
        const a = base + pi, b = next + pi, c = next + pi + 1, d = base + pi + 1;
        indices.push(a, b, c, a, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  /* ═══════════════════════════════════════
     WING STATE
  ═══════════════════════════════════════ */
  let wingGroup = null;
  let engineGroup = null;           // [BUG FIX] 엔진 그룹도 추적
  let leftWingMesh, rightWingMesh;
  let leftFlap, rightFlap, leftAileron, rightAileron;
  let leftSpoilers = [], rightSpoilers = [];
  let leftWinglet, rightWinglet;
  let leftVortexGens = [], rightVortexGens = [];
  let leftWingFence, rightWingFence;

  function buildWings(params) {
    // [BUG FIX] 이전 wingGroup & engineGroup 모두 제거
    if (wingGroup)  aircraftGroup.remove(wingGroup);
    if (engineGroup) aircraftGroup.remove(engineGroup);
    wingGroup = new THREE.Group();

    const wGeom = buildWingGeometry(params);

    leftWingMesh = new THREE.Mesh(wGeom, matWing);
    leftWingMesh.castShadow = true;
    leftWingMesh.scale.z = -1;
    leftWingMesh.position.set(2, -0.8, 0);
    wingGroup.add(leftWingMesh);

    rightWingMesh = new THREE.Mesh(wGeom, matWing);
    rightWingMesh.castShadow = true;
    rightWingMesh.position.set(2, -0.8, 0);
    wingGroup.add(rightWingMesh);

    // ── FLAPS ──
    const flapW = params.span * 0.35;
    const flapGeom = new THREE.BoxGeometry(params.rootChord * 0.28, Math.max(0.05, params.thickness / 100 * params.rootChord * 0.4), flapW);
    leftFlap = new THREE.Mesh(flapGeom, matControlSurface.clone());
    leftFlap.position.set(5.2, -1.1, -(params.span * 0.2));
    leftFlap.castShadow = true;
    wingGroup.add(leftFlap);

    rightFlap = new THREE.Mesh(flapGeom, matControlSurface.clone());
    rightFlap.position.set(5.2, -1.1, params.span * 0.2);
    rightFlap.castShadow = true;
    wingGroup.add(rightFlap);

    // ── AILERONS ──
    const ailW = params.span * 0.2;
    const ailGeom = new THREE.BoxGeometry(params.tipChord * 0.32, Math.max(0.04, params.thickness / 100 * params.tipChord * 0.35), ailW);
    const ailXBase = 2 + Math.tan(params.sweep * Math.PI / 180) * params.span * 0.5 * 0.75;
    const ailYBase = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span * 0.5 * 0.75;

    leftAileron = new THREE.Mesh(ailGeom, matControlSurface.clone());
    leftAileron.position.set(ailXBase, ailYBase, -(params.span * 0.5 * 0.75));
    wingGroup.add(leftAileron);

    rightAileron = new THREE.Mesh(ailGeom, matControlSurface.clone());
    rightAileron.position.set(ailXBase, ailYBase, params.span * 0.5 * 0.75);
    wingGroup.add(rightAileron);

    // ── SPOILERS (5개) ──
    leftSpoilers = []; rightSpoilers = [];
    for (let i = 0; i < 5; i++) {
      const t2 = 0.15 + i * 0.13;
      const sp = params.span / 2 * t2;
      const xOff = 2 + Math.tan(params.sweep * Math.PI / 180) * sp + 0.5;
      const yOff = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * sp + 0.25;
      const spGeom = new THREE.BoxGeometry(1.0, 0.06, 1.2);
      const spMat = new THREE.MeshStandardMaterial({ color: 0x7a9ab0, metalness: 0.5, roughness: 0.35 });
      const lSp = new THREE.Mesh(spGeom, spMat);
      lSp.position.set(xOff, yOff, -sp);
      leftSpoilers.push(lSp); wingGroup.add(lSp);
      const rSp = new THREE.Mesh(spGeom, spMat.clone());
      rSp.position.set(xOff, yOff, sp);
      rightSpoilers.push(rSp); wingGroup.add(rSp);
    }

    // ── WINGLETS ──
    const tipX = 2 + Math.tan(params.sweep * Math.PI / 180) * params.span / 2 + 0.6;
    const tipY = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span / 2 + 0.6;
    const wlGeom = new THREE.BoxGeometry(0.3, 2.8, 0.8);

    leftWinglet = new THREE.Mesh(wlGeom, matWinglet.clone());
    leftWinglet.position.set(tipX, tipY, -params.span / 2 - 0.2);
    leftWinglet.rotation.x = 0.15; leftWinglet.rotation.z = -0.3;
    wingGroup.add(leftWinglet);

    rightWinglet = new THREE.Mesh(wlGeom, matWinglet.clone());
    rightWinglet.position.set(tipX, tipY, params.span / 2 + 0.2);
    rightWinglet.rotation.x = -0.15; rightWinglet.rotation.z = -0.3;
    wingGroup.add(rightWinglet);

    // ── VORTEX GENERATORS ──
    leftVortexGens = []; rightVortexGens = [];
    for (let i = 0; i < 8; i++) {
      const t3 = 0.1 + i * 0.1;
      const sp = params.span / 2 * t3;
      const vgGeom = new THREE.BoxGeometry(0.1, 0.12, 0.06);
      const lvg = new THREE.Mesh(vgGeom, matVortexGen.clone());
      lvg.position.set(2 + Math.tan(params.sweep * Math.PI / 180) * sp - 1.0, -0.8 + Math.tan(params.dihedral * Math.PI / 180) * sp + 0.15, -sp);
      lvg.rotation.y = 0.3;
      leftVortexGens.push(lvg); wingGroup.add(lvg);
      const rvg = new THREE.Mesh(vgGeom, matVortexGen.clone());
      rvg.position.set(lvg.position.x, lvg.position.y, sp);
      rvg.rotation.y = -0.3;
      rightVortexGens.push(rvg); wingGroup.add(rvg);
    }

    // ── WING FENCE ──
    const fenceGeom = new THREE.BoxGeometry(2.5, 0.35, 0.05);
    leftWingFence = new THREE.Mesh(fenceGeom, matWing.clone());
    leftWingFence.position.set(
      2 + Math.tan(params.sweep * Math.PI / 180) * params.span * 0.4,
      -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span * 0.4 + 0.1,
      -params.span * 0.4
    );
    wingGroup.add(leftWingFence);
    rightWingFence = leftWingFence.clone();
    rightWingFence.position.z = params.span * 0.4;
    wingGroup.add(rightWingFence);

    aircraftGroup.add(wingGroup);
    updateAddonVisibility();   // 체크박스 상태 즉시 반영
    buildEngines(params);      // [BUG FIX] 엔진도 같이 재빌드
  }

  /* ═══════════════════════════════════════
     ENGINES (CFM56)
  ═══════════════════════════════════════ */
  function buildEngines(params) {
    engineGroup = new THREE.Group();
    const engSpan = params.span * 0.3;
    const engX = 2 + Math.tan(params.sweep * Math.PI / 180) * engSpan * 0.5 - 3;
    const engY = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * engSpan * 0.5 - 1.6;

    [-1, 1].forEach(side => {
      const eg = new THREE.Group();
      const nacGeom = new THREE.CylinderGeometry(1.1, 0.95, 4.5, 20);
      nacGeom.rotateX(Math.PI / 2);
      eg.add(new THREE.Mesh(nacGeom, matEngine));

      const inletGeom = new THREE.TorusGeometry(1.1, 0.12, 12, 24);
      const inletMesh = new THREE.Mesh(inletGeom, matEngineInlet);
      inletMesh.position.z = -2.2; eg.add(inletMesh);

      const intGeom = new THREE.CircleGeometry(0.95, 20);
      const intMesh = new THREE.Mesh(intGeom, matEngineInlet);
      intMesh.position.z = -2.1; eg.add(intMesh);

      const nozGeom = new THREE.CylinderGeometry(0.75, 0.55, 1.0, 16);
      nozGeom.rotateX(Math.PI / 2);
      const nozMesh = new THREE.Mesh(nozGeom, matEngine);
      nozMesh.position.z = 2.7; eg.add(nozMesh);

      const pylGeom = new THREE.BoxGeometry(0.22, 1.0, 2.0);
      const pylMesh = new THREE.Mesh(pylGeom, matFuselage);
      pylMesh.position.y = 0.8; eg.add(pylMesh);

      eg.position.set(engX, engY, side * engSpan * 0.5);
      engineGroup.add(eg);
    });

    aircraftGroup.add(engineGroup);
  }

  /* ═══════════════════════════════════════
     TAIL SURFACES
  ═══════════════════════════════════════ */
  let elevatorLeft, elevatorRight, rudder;

  function buildTail() {
    const tailGroup = new THREE.Group();
    const extCfg = { depth: 0.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3 };

    // Vertical fin
    const finShape = new THREE.Shape();
    finShape.moveTo(16.5, 0); finShape.lineTo(19.0, 0);
    finShape.lineTo(18.8, 6.2); finShape.lineTo(16.0, 6.2); finShape.closePath();
    const finGeom = new THREE.ExtrudeGeometry(finShape, extCfg);
    finGeom.rotateX(Math.PI / 2); finGeom.translate(0, 0, -0.14);
    tailGroup.add(new THREE.Mesh(finGeom, matWing));

    // Rudder
    const rudderShape = new THREE.Shape();
    rudderShape.moveTo(18.2, 0.3); rudderShape.lineTo(19.1, 0.3);
    rudderShape.lineTo(18.9, 5.8); rudderShape.lineTo(18.0, 5.8); rudderShape.closePath();
    const rudderGeom = new THREE.ExtrudeGeometry(rudderShape, { depth: 0.22, bevelEnabled: false });
    rudderGeom.rotateX(Math.PI / 2); rudderGeom.translate(0, 0, -0.11);
    rudder = new THREE.Mesh(rudderGeom, matControlSurface);
    tailGroup.add(rudder);

    // Horizontal stabilizers
    const htShape = new THREE.Shape();
    htShape.moveTo(16.8, 0); htShape.lineTo(18.5, 0);
    htShape.lineTo(18.8, 6.5); htShape.lineTo(17.2, 6.5); htShape.closePath();
    const htCfg = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 };
    [-1, 1].forEach(side => {
      const htGeom = new THREE.ExtrudeGeometry(htShape, htCfg);
      htGeom.rotateX(Math.PI / 2);
      htGeom.rotateZ(side === -1 ? Math.PI / 2 : -Math.PI / 2);
      const ht = new THREE.Mesh(htGeom, matWing);
      ht.castShadow = true;
      ht.position.set(0, 1.8, side * 0.11);
      tailGroup.add(ht);
    });

    // Elevators
    const elevGeom = new THREE.BoxGeometry(3.5, 0.18, 2.5);
    elevatorLeft = new THREE.Mesh(elevGeom, matControlSurface.clone());
    elevatorLeft.position.set(18.3, 1.8, -4.5);
    tailGroup.add(elevatorLeft);
    elevatorRight = new THREE.Mesh(elevGeom, matControlSurface.clone());
    elevatorRight.position.set(18.3, 1.8, 4.5);
    tailGroup.add(elevatorRight);

    aircraftGroup.add(tailGroup);
  }

  /* ═══════════════════════════════════════
     LANDING GEAR
  ═══════════════════════════════════════ */
  function buildLandingGear() {
    const gMat = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.8, roughness: 0.3 });
    const wMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 });
    const gg = new THREE.Group();

    const nStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 8), gMat);
    nStrut.position.set(-14, -3.2, 0); gg.add(nStrut);
    const nwGeom = new THREE.TorusGeometry(0.4, 0.15, 8, 16);
    [-0.25, 0.25].forEach(z => {
      const w = new THREE.Mesh(nwGeom, wMat);
      w.rotation.y = Math.PI / 2; w.position.set(-14, -4.3, z); gg.add(w);
    });

    [-1, 1].forEach(side => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8), gMat);
      strut.position.set(4, -3.5, side * 2.8); gg.add(strut);
      const mwGeom = new THREE.TorusGeometry(0.48, 0.18, 8, 16);
      [-0.28, 0.28].forEach(z2 => {
        [-0.55, 0.55].forEach(xi => {
          const w = new THREE.Mesh(mwGeom, wMat);
          w.rotation.y = Math.PI / 2;
          w.position.set(4 + xi, -4.8, side * 2.8 + z2); gg.add(w);
        });
      });
    });
    aircraftGroup.add(gg);
  }

  /* ═══════════════════════════════════════
     ADDON VISIBILITY
  ═══════════════════════════════════════ */
  function updateAddonVisibility() {
    if (!leftWinglet) return;
    const hasWinglet  = document.getElementById('addon-winglet').checked;
    const hasVortex   = document.getElementById('addon-vortex').checked;
    const hasFence    = document.getElementById('addon-fence').checked;
    const hasSharklet = document.getElementById('addon-sharklet').checked;

    // 윙렛/샤클렛 상호 배타
    leftWinglet.visible  = hasWinglet || hasSharklet;
    rightWinglet.visible = hasWinglet || hasSharklet;
    if (hasSharklet) {
      leftWinglet.scale.set(1, 1.35, 0.7);
      rightWinglet.scale.set(1, 1.35, 0.7);
    } else {
      leftWinglet.scale.set(1, 1, 1);
      rightWinglet.scale.set(1, 1, 1);
    }

    leftVortexGens.forEach(v => { v.visible = hasVortex; });
    rightVortexGens.forEach(v => { v.visible = hasVortex; });

    if (leftWingFence)  leftWingFence.visible  = hasFence;
    if (rightWingFence) rightWingFence.visible  = hasFence;
  }

  /* ═══════════════════════════════════════
     INITIAL BUILD
  ═══════════════════════════════════════ */
  aircraftGroup.add(buildFuselage());
  buildWings({
    span: 34.3, rootChord: 7.32, tipChord: 1.5,
    sweep: 25, twist: -3, thickness: 12, camber: 2.5, dihedral: 6
  });
  buildTail();
  buildLandingGear();

  /* ═══════════════════════════════════════
     CONTROL SURFACES
  ═══════════════════════════════════════ */
  function applyControlSurfaces(flapDeg, aileronDeg, spoilerDeg, elevatorDeg, rudderDeg) {
    const r = d => d * Math.PI / 180;
    if (leftFlap)  leftFlap.rotation.z  = -r(flapDeg) * 0.5;
    if (rightFlap) rightFlap.rotation.z = -r(flapDeg) * 0.5;
    if (leftAileron)  leftAileron.rotation.z  =  r(aileronDeg) * 0.5;
    if (rightAileron) rightAileron.rotation.z = -r(aileronDeg) * 0.5;
    leftSpoilers.forEach((sp, i)  => { sp.rotation.x =  r(spoilerDeg) * (0.5 + i * 0.1); });
    rightSpoilers.forEach((sp, i) => { sp.rotation.x =  r(spoilerDeg) * (0.5 + i * 0.1); });
    if (elevatorLeft)  elevatorLeft.rotation.z  =  r(elevatorDeg) * 0.4;
    if (elevatorRight) elevatorRight.rotation.z = -r(elevatorDeg) * 0.4;
    if (rudder) rudder.rotation.y = r(rudderDeg) * 0.5;
  }

  /* ═══════════════════════════════════════
     WING REBUILD FROM UI
  ═══════════════════════════════════════ */
  function rebuildWingsFromUI() {
    const g = id => parseFloat(document.getElementById(id).value);
    buildWings({
      span:      g('span'),
      rootChord: g('chord') * 1.8,
      tipChord:  g('chord') * 0.42,
      sweep:     g('sweep'),
      twist:     g('twist'),
      thickness: g('thickness'),
      camber:    g('camber'),
      dihedral:  g('dihedral'),
    });
  }

  function applyWingFlex(flexM) {
    if (!rightWingMesh) return;
    const flex = flexM / 17;
    rightWingMesh.rotation.z = flex * 0.08;
    leftWingMesh.rotation.z  = -flex * 0.08;
  }

  /* ═══════════════════════════════════════
     RENDER MODES
  ═══════════════════════════════════════ */
  function setRenderMode(mode) {
    const isWire = mode === 'wireframe';
    [matFuselage, matWing, matControlSurface, matEngine, matWinglet].forEach(m => { m.wireframe = isWire; });
    const showCFD = mode === 'cfd-pressure' || mode === 'cfd-stream';
    // null-guard: cfd.js가 아직 로드 안 됐을 수도 있음
    if (window._cfd && window._cfd.setVisible) window._cfd.setVisible(showCFD);
    const legend = document.getElementById('cfd-legend');
    if (legend) legend.style.display = showCFD ? 'block' : 'none';
  }

  /* ═══════════════════════════════════════
     PRESET VIEWS
  ═══════════════════════════════════════ */
  function setView(name) {
    const views = {
      front: { theta: 0,             phi: Math.PI / 2, r: 70 },
      top:   { theta: 0,             phi: 0.05,        r: 70 },
      side:  { theta: Math.PI / 2,   phi: Math.PI / 2, r: 70 },
      iso:   { theta: 0.8,           phi: 0.9,         r: 55 },
    };
    if (views[name]) {
      spherical = { ...views[name] };
      target.set(0, 0, 0);
    }
  }

  /* ═══════════════════════════════════════
     RESIZE
  ═══════════════════════════════════════ */
  function onResize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (w && h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  // ResizeObserver + fallback
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(canvas);
  } else {
    window.addEventListener('resize', onResize);
  }
  onResize();

  /* ═══════════════════════════════════════
     ANIMATION LOOP
  ═══════════════════════════════════════ */
  let turbulenceTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    updateCamera();
    const turbEl = document.getElementById('turbulence');
    const turbLevel = turbEl ? parseFloat(turbEl.value) : 0;
    if (turbLevel > 0) {
      turbulenceTime += 0.016;
      const amp = turbLevel * 0.003;
      aircraftGroup.rotation.x = Math.sin(turbulenceTime * 1.3) * amp;
      aircraftGroup.rotation.z = Math.sin(turbulenceTime * 0.9) * amp * 0.7;
    } else {
      aircraftGroup.rotation.x = 0;
      aircraftGroup.rotation.z = 0;
    }
    renderer.render(scene, camera);
  }
  animate();

  /* ═══════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════ */
  window._aircraft = {
    scene, camera, renderer, aircraftGroup,
    applyControlSurfaces,
    applyWingFlex,
    rebuildWingsFromUI,
    setView,
    setRenderMode,
    updateAddonVisibility,
    getWingParams() {
      const g = id => parseFloat(document.getElementById(id).value);
      return { span: g('span'), chord: g('chord'), sweep: g('sweep'), twist: g('twist'), thickness: g('thickness'), camber: g('camber'), dihedral: g('dihedral') };
    }
  };

})();
