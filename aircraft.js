/**
 * aircraft.js
 * Three.js 3D B737-800 모델 생성 및 제어
 * - 동체 (fuselage)
 * - 날개 (wings): 플랩, 에일러론, 스포일러
 * - 수직미익/수평미익: 러더, 엘리베이터
 * - 엔진 나셀
 * - 윙렛 및 부가 장치
 */

(function() {
  'use strict';

  /* ═══════════════════════════════════════
     SCENE SETUP
  ═══════════════════════════════════════ */
  const canvas = document.getElementById('three-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
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
     ORBIT CONTROLS (manual implementation)
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
  window.addEventListener('mouseup', () => isDragging = false);
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
    spherical.r = Math.max(8, Math.min(200, spherical.r + e.deltaY * 0.05));
  });
  // Touch support
  let prevTouches = [];
  canvas.addEventListener('touchstart', e => { prevTouches = Array.from(e.touches); });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = Array.from(e.touches);
    if (touches.length === 1) {
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
  const ambientLight = new THREE.AmbientLight(0x102030, 0.8);
  scene.add(ambientLight);

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

  const rimLight = new THREE.DirectionalLight(0x0088ff, 0.8);
  rimLight.position.set(-30, 10, -40);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x4488aa, 0.4);
  fillLight.position.set(0, -20, 0);
  scene.add(fillLight);

  /* ═══════════════════════════════════════
     GRID / REFERENCE
  ═══════════════════════════════════════ */
  const gridHelper = new THREE.GridHelper(200, 40, 0x0a1a2a, 0x0a1a2a);
  gridHelper.position.y = -10;
  scene.add(gridHelper);

  // Reference axes
  const axesHelper = new THREE.AxesHelper(8);
  axesHelper.position.set(-35, -9, 0);
  scene.add(axesHelper);

  /* ═══════════════════════════════════════
     MATERIALS
  ═══════════════════════════════════════ */
  const matFuselage = new THREE.MeshStandardMaterial({
    color: 0xd8e8f0, metalness: 0.7, roughness: 0.25,
    envMapIntensity: 0.5
  });
  const matWing = new THREE.MeshStandardMaterial({
    color: 0xc8dcea, metalness: 0.65, roughness: 0.3
  });
  const matControlSurface = new THREE.MeshStandardMaterial({
    color: 0x9ab8cc, metalness: 0.5, roughness: 0.35
  });
  const matEngine = new THREE.MeshStandardMaterial({
    color: 0x888fa0, metalness: 0.8, roughness: 0.2
  });
  const matEngineInlet = new THREE.MeshStandardMaterial({
    color: 0x222830, metalness: 0.9, roughness: 0.15
  });
  const matWinglet = new THREE.MeshStandardMaterial({
    color: 0x1a2a3a, metalness: 0.6, roughness: 0.3
  });
  const matVortexGen = new THREE.MeshStandardMaterial({
    color: 0x334455, metalness: 0.7, roughness: 0.3
  });
  const matWindow = new THREE.MeshStandardMaterial({
    color: 0x4488aa, metalness: 0.1, roughness: 0.1,
    transparent: true, opacity: 0.7
  });
  const matCFD = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0, roughness: 0.8,
    transparent: true, opacity: 0.85
  });

  /* ═══════════════════════════════════════
     AIRCRAFT ROOT GROUP
  ═══════════════════════════════════════ */
  const aircraftGroup = new THREE.Group();
  scene.add(aircraftGroup);

  /* ─── HELPER: lathe profile ─── */
  function makeLatheProfile(points, segs = 24) {
    const geom = new THREE.LatheGeometry(
      points.map(p => new THREE.Vector2(p[0], p[1])),
      segs
    );
    return geom;
  }

  /* ═══════════════════════════════════════
     FUSELAGE — B737-800 profile
  ═══════════════════════════════════════ */
  function buildFuselage() {
    const group = new THREE.Group();

    // Main tube: circular cross-section, tapered nose & tail
    // B737-800: ~39.5m long, 3.76m wide
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19.75, 0, 0), // nose tip
      new THREE.Vector3(-18, 0, 0),
      new THREE.Vector3(-14, 0, 0),
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(14, 0, 0),
      new THREE.Vector3(17, 0, 0),
      new THREE.Vector3(18.5, 0.3, 0),
      new THREE.Vector3(19.75, 0.9, 0),  // tail cone
    ]);

    const radii = [0.1, 0.8, 1.82, 1.88, 1.88, 1.88, 1.88, 1.85, 1.2, 0.15];

    // Build fuselage using TubeGeometry with varying radius
    const segments = 80;
    const geom = new THREE.TubeGeometry(path, segments, 1.88, 20, false);

    // Flatten bottom slightly (cabin floor)
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -1.6) pos.setY(i, -1.6);
    }
    geom.computeVertexNormals();

    const fuselage = new THREE.Mesh(geom, matFuselage);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    group.add(fuselage);

    // Nose cone (more pointed)
    const noseGeom = new THREE.SphereGeometry(1.88, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    noseGeom.rotateZ(Math.PI / 2);
    const noseScale = new THREE.Matrix4().makeScale(2.8, 1, 1);
    noseGeom.applyMatrix4(noseScale);
    const nose = new THREE.Mesh(noseGeom, matFuselage);
    nose.position.x = -19.75;
    nose.castShadow = true;
    group.add(nose);

    // Windows row (passenger)
    const windowGeom = new THREE.BoxGeometry(0.45, 0.32, 0.05);
    const windowPositions = [];
    for (let i = -15; i < 17; i += 1.1) {
      windowPositions.push(i);
    }
    windowPositions.forEach(xPos => {
      ['left', 'right'].forEach(side => {
        const win = new THREE.Mesh(windowGeom, matWindow);
        win.position.set(xPos, 0.6, side === 'left' ? -1.9 : 1.9);
        if (side === 'right') win.rotation.y = Math.PI;
        group.add(win);
      });
    });

    // Cockpit windows
    const cpGeom = new THREE.BoxGeometry(0.5, 0.35, 0.05);
    [-0.25, 0.25].forEach(offset => {
      ['left', 'right'].forEach(side => {
        const cp = new THREE.Mesh(cpGeom, matWindow);
        cp.position.set(-17.5 + offset * 0.5, 0.9, side === 'left' ? -1.5 : 1.5);
        cp.rotation.y = side === 'left' ? 0.35 : -0.35;
        group.add(cp);
      });
    });

    // Door outlines
    const doorGeom = new THREE.BoxGeometry(0.05, 1.8, 0.8);
    [-13, 2, 13].forEach(x => {
      [-1, 1].forEach(side => {
        const door = new THREE.Mesh(doorGeom, new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.6, roughness: 0.4 }));
        door.position.set(x, 0.1, side * 1.91);
        group.add(door);
      });
    });

    // Belly fairing
    const fairGeom = new THREE.CylinderGeometry(0.7, 0.5, 12, 12, 1, false, 0, Math.PI);
    fairGeom.rotateZ(Math.PI / 2);
    fairGeom.rotateX(Math.PI);
    const fairing = new THREE.Mesh(fairGeom, matFuselage);
    fairing.position.set(0, -1.88, 0);
    group.add(fairing);

    return group;
  }

  /* ═══════════════════════════════════════
     WING SECTION BUILDER (NACA airfoil)
  ═══════════════════════════════════════ */
  function naca4Profile(m, p, t, c, nPoints) {
    // m = max camber / 100, p = max camber pos / 10, t = thickness / 100
    const pts = [];
    for (let i = 0; i <= nPoints; i++) {
      const x = (1 - Math.cos(i / nPoints * Math.PI)) / 2 * c;
      const xc = x / c;
      const yt = t / 0.2 * c * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc * xc + 0.2843 * xc * xc * xc - 0.1015 * xc * xc * xc * xc);
      let yc = 0, dyc_dx = 0;
      if (m !== 0) {
        if (xc < p) {
          yc = m / (p * p) * (2 * p * xc - xc * xc) * c;
          dyc_dx = 2 * m / (p * p) * (p - xc);
        } else {
          yc = m / ((1 - p) * (1 - p)) * (1 - 2 * p + 2 * p * xc - xc * xc) * c;
          dyc_dx = 2 * m / ((1 - p) * (1 - p)) * (p - xc);
        }
      }
      const theta = Math.atan(dyc_dx);
      pts.push({
        xu: x - yt * Math.sin(theta), yu: yc + yt * Math.cos(theta),
        xl: x + yt * Math.sin(theta), yl: yc - yt * Math.cos(theta)
      });
    }
    return pts;
  }

  function buildWingGeometry(params) {
    const { span, rootChord, tipChord, sweep, twist, thickness, camber, dihedral } = params;
    const halfSpan = span / 2;
    const nProf = 16;

    // NACA 23012 approximation (m=0.02, p=0.3, t=thickness)
    const rootProf = naca4Profile(0.02, 0.3, thickness / 100, rootChord, nProf);
    const tipProf  = naca4Profile(0.02, 0.3, thickness / 100, tipChord,  nProf);

    const positions = [];
    const indices = [];

    function addProfile(prof, z, xOffset, yOffset, twistAngle) {
      const cosT = Math.cos(twistAngle), sinT = Math.sin(twistAngle);
      // Upper surface
      for (let i = 0; i <= nProf; i++) {
        const xu = prof[i].xu - rootChord / 4; // quarter-chord ref
        const yu = prof[i].yu;
        const xr = xu * cosT - yu * sinT + xOffset;
        const yr = xu * sinT + yu * cosT + yOffset;
        positions.push(xr, yr, z);
      }
      // Lower surface (reverse order)
      for (let i = nProf; i >= 0; i--) {
        const xl = prof[i].xl - rootChord / 4;
        const yl = prof[i].yl;
        const xr = xl * cosT - yl * sinT + xOffset;
        const yr = xl * sinT + yl * cosT + yOffset;
        positions.push(xr, yr, z);
      }
    }

    const nSections = 16;
    for (let si = 0; si <= nSections; si++) {
      const t = si / nSections;
      const z = halfSpan * t;
      const chord = rootChord + (tipChord - rootChord) * t;
      const xOff = z * Math.tan(sweep * Math.PI / 180);
      const yOff = z * Math.tan(dihedral * Math.PI / 180);
      const twistAngle = (twist * t) * Math.PI / 180;

      // interpolate profile
      const prof = rootProf.map((rp, i) => ({
        xu: rp.xu + (tipProf[i].xu - rp.xu) * t * (tipChord / rootChord),
        yu: rp.yu + (tipProf[i].yu - rp.yu) * t,
        xl: rp.xl + (tipProf[i].xl - rp.xl) * t * (tipChord / rootChord),
        yl: rp.yl + (tipProf[i].yl - rp.yl) * t
      }));

      addProfile(prof, z, xOff, yOff, twistAngle);
    }

    const nPerSection = (nProf + 1) * 2;
    for (let si = 0; si < nSections; si++) {
      const base = si * nPerSection;
      const next = (si + 1) * nPerSection;
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
     CONTROL SURFACE BUILDER
  ═══════════════════════════════════════ */
  function buildControlSurface(width, chord, thickness) {
    const geom = new THREE.BoxGeometry(chord, thickness, width);
    return geom;
  }

  /* ═══════════════════════════════════════
     COMPLETE WING ASSEMBLY
  ═══════════════════════════════════════ */
  const wingParams = {
    span: 34.3,
    rootChord: 7.32,
    tipChord: 1.5,
    sweep: 25,
    twist: -3,
    thickness: 12,
    camber: 2.5,
    dihedral: 6
  };

  let wingGroup, leftWingMesh, rightWingMesh;
  let leftFlap, rightFlap, leftAileron, rightAileron;
  let leftSpoilers = [], rightSpoilers = [];
  let leftWinglet, rightWinglet;
  let leftVortexGens = [], rightVortexGens = [];
  let leftWingFence, rightWingFence;

  function buildWings(params) {
    if (wingGroup) aircraftGroup.remove(wingGroup);
    wingGroup = new THREE.Group();

    const wGeom = buildWingGeometry(params);

    // Left wing (mirror)
    leftWingMesh = new THREE.Mesh(wGeom, matWing);
    leftWingMesh.castShadow = true;
    leftWingMesh.scale.z = -1;
    leftWingMesh.position.set(2, -0.8, 0);
    wingGroup.add(leftWingMesh);

    // Right wing
    rightWingMesh = new THREE.Mesh(wGeom, matWing);
    rightWingMesh.castShadow = true;
    rightWingMesh.position.set(2, -0.8, 0);
    wingGroup.add(rightWingMesh);

    // ── FLAPS ──
    // Positioned at trailing edge inboard section
    const flapW = params.span * 0.35;
    const flapGeom = new THREE.BoxGeometry(params.rootChord * 0.28, params.thickness / 100 * params.rootChord * 0.4, flapW);
    const flapMat = matControlSurface.clone();

    leftFlap = new THREE.Mesh(flapGeom, flapMat);
    leftFlap.position.set(5.2, -1.1, -(params.span * 0.2));
    leftFlap.castShadow = true;
    wingGroup.add(leftFlap);

    rightFlap = new THREE.Mesh(flapGeom, flapMat.clone());
    rightFlap.position.set(5.2, -1.1, params.span * 0.2);
    rightFlap.castShadow = true;
    wingGroup.add(rightFlap);

    // ── AILERONS ──
    const ailW = params.span * 0.2;
    const ailGeom = new THREE.BoxGeometry(params.tipChord * 0.32, params.thickness / 100 * params.tipChord * 0.35, ailW);

    leftAileron = new THREE.Mesh(ailGeom, matControlSurface.clone());
    leftAileron.position.set(
      2 + Math.tan(params.sweep * Math.PI / 180) * params.span * 0.5 * 0.75,
      -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span * 0.5 * 0.75,
      -(params.span * 0.5 * 0.75)
    );
    wingGroup.add(leftAileron);

    rightAileron = new THREE.Mesh(ailGeom, matControlSurface.clone());
    rightAileron.position.set(
      2 + Math.tan(params.sweep * Math.PI / 180) * params.span * 0.5 * 0.75,
      -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span * 0.5 * 0.75,
      params.span * 0.5 * 0.75
    );
    wingGroup.add(rightAileron);

    // ── SPOILERS ──
    const nSpoilers = 5;
    leftSpoilers = []; rightSpoilers = [];
    for (let i = 0; i < nSpoilers; i++) {
      const t = 0.15 + i * 0.13;
      const sp = params.span / 2 * t;
      const xOff = 2 + Math.tan(params.sweep * Math.PI / 180) * sp + 0.5;
      const yOff = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * sp + 0.25;
      const spGeom = new THREE.BoxGeometry(1.0, 0.06, 1.2);
      const matSp = new THREE.MeshStandardMaterial({ color: 0x7a9ab0, metalness: 0.5, roughness: 0.35 });

      const lSp = new THREE.Mesh(spGeom, matSp);
      lSp.position.set(xOff, yOff, -sp);
      leftSpoilers.push(lSp);
      wingGroup.add(lSp);

      const rSp = new THREE.Mesh(spGeom, matSp.clone());
      rSp.position.set(xOff, yOff, sp);
      rightSpoilers.push(rSp);
      wingGroup.add(rSp);
    }

    // ── WINGLETS ──
    const wlGeom = new THREE.BoxGeometry(0.3, 2.8, 0.8);
    leftWinglet = new THREE.Mesh(wlGeom, matWinglet);
    leftWinglet.position.set(
      2 + Math.tan(params.sweep * Math.PI / 180) * params.span / 2 + 0.6,
      -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span / 2 + 0.6,
      -params.span / 2 - 0.2
    );
    leftWinglet.rotation.x = 0.15;
    leftWinglet.rotation.z = -0.3;
    wingGroup.add(leftWinglet);

    rightWinglet = new THREE.Mesh(wlGeom, matWinglet.clone());
    rightWinglet.position.set(
      2 + Math.tan(params.sweep * Math.PI / 180) * params.span / 2 + 0.6,
      -0.8 + Math.tan(params.dihedral * Math.PI / 180) * params.span / 2 + 0.6,
      params.span / 2 + 0.2
    );
    rightWinglet.rotation.x = -0.15;
    rightWinglet.rotation.z = -0.3;
    wingGroup.add(rightWinglet);

    // ── VORTEX GENERATORS ──
    leftVortexGens = []; rightVortexGens = [];
    for (let i = 0; i < 8; i++) {
      const t = 0.1 + i * 0.1;
      const sp = params.span / 2 * t;
      const xOff = 2 + Math.tan(params.sweep * Math.PI / 180) * sp - 1.0;
      const yOff = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * sp + 0.15;
      const vgGeom = new THREE.BoxGeometry(0.1, 0.12, 0.06);
      const lvg = new THREE.Mesh(vgGeom, matVortexGen);
      lvg.position.set(xOff, yOff, -sp);
      lvg.rotation.y = 0.3;
      leftVortexGens.push(lvg);
      wingGroup.add(lvg);

      const rvg = new THREE.Mesh(vgGeom, matVortexGen.clone());
      rvg.position.set(xOff, yOff, sp);
      rvg.rotation.y = -0.3;
      rightVortexGens.push(rvg);
      wingGroup.add(rvg);
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
    updateAddonVisibility();
  }

  /* ═══════════════════════════════════════
     ENGINES (CFM56)
  ═══════════════════════════════════════ */
  let engineGroup;
  function buildEngines(params) {
    if (engineGroup) aircraftGroup.remove(engineGroup);
    engineGroup = new THREE.Group();

    const engineSpan = params.span * 0.3;
    const engineX = 2 + Math.tan(params.sweep * Math.PI / 180) * engineSpan * 0.5 - 3;
    const engineY = -0.8 + Math.tan(params.dihedral * Math.PI / 180) * engineSpan * 0.5 - 1.6;

    [-1, 1].forEach(side => {
      const eGroup = new THREE.Group();

      // Nacelle body
      const nacelleGeom = new THREE.CylinderGeometry(1.1, 0.95, 4.5, 20);
      nacelleGeom.rotateX(Math.PI / 2);
      const nacelle = new THREE.Mesh(nacelleGeom, matEngine);
      nacelle.castShadow = true;
      eGroup.add(nacelle);

      // Inlet ring
      const inletGeom = new THREE.TorusGeometry(1.1, 0.12, 12, 24);
      const inlet = new THREE.Mesh(inletGeom, matEngineInlet);
      inlet.position.z = -2.2;
      eGroup.add(inlet);

      // Inlet interior
      const inletInteriorGeom = new THREE.CircleGeometry(0.95, 20);
      const inletInterior = new THREE.Mesh(inletInteriorGeom, matEngineInlet);
      inletInterior.position.z = -2.1;
      eGroup.add(inletInterior);

      // Exhaust nozzle
      const nozzleGeom = new THREE.CylinderGeometry(0.75, 0.55, 1.0, 16);
      nozzleGeom.rotateX(Math.PI / 2);
      const nozzle = new THREE.Mesh(nozzleGeom, matEngine);
      nozzle.position.z = 2.7;
      eGroup.add(nozzle);

      // Pylon
      const pylonGeom = new THREE.BoxGeometry(0.22, 1.0, 2.0);
      const pylon = new THREE.Mesh(pylonGeom, matFuselage);
      pylon.position.y = 0.8;
      eGroup.add(pylon);

      eGroup.position.set(engineX, engineY, side * engineSpan * 0.5);
      engineGroup.add(eGroup);
    });

    aircraftGroup.add(engineGroup);
  }

  /* ═══════════════════════════════════════
     TAIL SURFACES
  ═══════════════════════════════════════ */
  let tailGroup;
  let elevatorLeft, elevatorRight, rudder;

  function buildTail() {
    if (tailGroup) aircraftGroup.remove(tailGroup);
    tailGroup = new THREE.Group();

    // ── VERTICAL STABILIZER (Fin) ──
    const vtGeom = new THREE.BufferGeometry();
    const vtVerts = new Float32Array([
      // Root leading edge bottom, root trailing edge, tip leading edge, tip trailing edge
      16.5, 0, 0,   19.0, 0, 0,    // root LE, TE
      16.0, 6.2, 0, 18.8, 6.2, 0,  // tip LE, TE (with slight sweep)
    ]);
    // Build as extruded shape
    const finShape = new THREE.Shape();
    finShape.moveTo(16.5, 0);
    finShape.lineTo(19.0, 0);
    finShape.lineTo(18.8, 6.2);
    finShape.lineTo(16.0, 6.2);
    finShape.closePath();

    const finExtSettings = { depth: 0.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3 };
    const finGeom = new THREE.ExtrudeGeometry(finShape, finExtSettings);
    finGeom.rotateX(Math.PI / 2);
    finGeom.translate(0, 0, -0.14);

    const vertFin = new THREE.Mesh(finGeom, matWing);
    vertFin.castShadow = true;
    tailGroup.add(vertFin);

    // ── RUDDER ──
    const rudderShape = new THREE.Shape();
    rudderShape.moveTo(18.2, 0.3);
    rudderShape.lineTo(19.1, 0.3);
    rudderShape.lineTo(18.9, 5.8);
    rudderShape.lineTo(18.0, 5.8);
    rudderShape.closePath();
    const rudderGeom = new THREE.ExtrudeGeometry(rudderShape, { depth: 0.22, bevelEnabled: false });
    rudderGeom.rotateX(Math.PI / 2);
    rudderGeom.translate(0, 0, -0.11);
    rudder = new THREE.Mesh(rudderGeom, matControlSurface);
    tailGroup.add(rudder);

    // ── HORIZONTAL STABILIZERS ──
    const htShape = new THREE.Shape();
    htShape.moveTo(16.8, 0);
    htShape.lineTo(18.5, 0);
    htShape.lineTo(18.8, 6.5);
    htShape.lineTo(17.2, 6.5);
    htShape.closePath();
    const htSettings = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 };

    [-1, 1].forEach(side => {
      const htGeom = new THREE.ExtrudeGeometry(htShape, htSettings);
      htGeom.rotateX(Math.PI / 2);
      htGeom.rotateZ(side === -1 ? Math.PI / 2 : -Math.PI / 2);
      const ht = new THREE.Mesh(htGeom, matWing);
      ht.castShadow = true;
      ht.position.set(0, 1.8, side * 0.11);
      tailGroup.add(ht);
    });

    // ── ELEVATORS ──
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
    const matGear = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.8, roughness: 0.3 });
    const matWheel = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 });

    const gearGroup = new THREE.Group();

    // Nose gear
    const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 8), matGear);
    noseStrut.position.set(-14, -3.2, 0);
    gearGroup.add(noseStrut);

    const noseWheelGeom = new THREE.TorusGeometry(0.4, 0.15, 8, 16);
    [-0.25, 0.25].forEach(z => {
      const w = new THREE.Mesh(noseWheelGeom, matWheel);
      w.rotation.y = Math.PI / 2;
      w.position.set(-14, -4.3, z);
      gearGroup.add(w);
    });

    // Main gear (2 sets)
    [-1, 1].forEach(side => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8), matGear);
      strut.position.set(4, -3.5, side * 2.8);
      gearGroup.add(strut);

      for (let i = -1; i <= 1; i += 2) {
        const wGeom = new THREE.TorusGeometry(0.48, 0.18, 8, 16);
        [-0.28, 0.28].forEach(z2 => {
          const w = new THREE.Mesh(wGeom, matWheel);
          w.rotation.y = Math.PI / 2;
          w.position.set(4 + i * 0.55, -4.8, side * 2.8 + z2);
          gearGroup.add(w);
        });
      }
    });

    aircraftGroup.add(gearGroup);
  }

  /* ═══════════════════════════════════════
     ADDON VISIBILITY
  ═══════════════════════════════════════ */
  function updateAddonVisibility() {
    if (!leftWinglet) return;
    const hasWinglet = document.getElementById('addon-winglet').checked;
    const hasVortex = document.getElementById('addon-vortex').checked;
    const hasFence = document.getElementById('addon-fence').checked;

    leftWinglet.visible = hasWinglet && !document.getElementById('addon-sharklet').checked;
    rightWinglet.visible = hasWinglet && !document.getElementById('addon-sharklet').checked;

    leftVortexGens.forEach(v => v.visible = hasVortex);
    rightVortexGens.forEach(v => v.visible = hasVortex);

    if (leftWingFence) {
      leftWingFence.visible = hasFence;
      rightWingFence.visible = hasFence;
    }

    // Sharklet: modify winglet appearance
    if (document.getElementById('addon-sharklet').checked) {
      leftWinglet.visible = true; rightWinglet.visible = true;
      leftWinglet.scale.set(1, 1.35, 0.7);
      rightWinglet.scale.set(1, 1.35, 0.7);
    } else {
      leftWinglet.scale.set(1, 1, 1);
      rightWinglet.scale.set(1, 1, 1);
    }
  }

  ['addon-winglet','addon-vortex','addon-fence','addon-sharklet','addon-riblet','addon-laminar'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateAddonVisibility);
  });

  /* ═══════════════════════════════════════
     INITIAL BUILD
  ═══════════════════════════════════════ */
  const fuselageGroup = buildFuselage();
  aircraftGroup.add(fuselageGroup);
  buildWings(wingParams);
  buildEngines(wingParams);
  buildTail();
  buildLandingGear();

  /* ═══════════════════════════════════════
     CONTROL SURFACE ANIMATION
  ═══════════════════════════════════════ */
  function applyControlSurfaces(flapDeg, aileronDeg, spoilerDeg, elevatorDeg, rudderDeg) {
    const toRad = d => d * Math.PI / 180;

    if (leftFlap)  leftFlap.rotation.z  = -toRad(flapDeg) * 0.5;
    if (rightFlap) rightFlap.rotation.z = -toRad(flapDeg) * 0.5;

    if (leftAileron)  leftAileron.rotation.z  =  toRad(aileronDeg) * 0.5;
    if (rightAileron) rightAileron.rotation.z = -toRad(aileronDeg) * 0.5;

    const spoilerFrac = spoilerDeg / 60;
    leftSpoilers.forEach((sp, i) => {
      sp.rotation.x = toRad(spoilerDeg) * (0.5 + i * 0.1);
    });
    rightSpoilers.forEach((sp, i) => {
      sp.rotation.x = toRad(spoilerDeg) * (0.5 + i * 0.1);
    });

    if (elevatorLeft)  elevatorLeft.rotation.z  =  toRad(elevatorDeg) * 0.4;
    if (elevatorRight) elevatorRight.rotation.z = -toRad(elevatorDeg) * 0.4;

    if (rudder) rudder.rotation.y = toRad(rudderDeg) * 0.5;
  }

  /* ═══════════════════════════════════════
     WING GEOMETRY UPDATE
  ═══════════════════════════════════════ */
  function rebuildWingsFromUI() {
    const p = {
      span: parseFloat(document.getElementById('span').value),
      rootChord: parseFloat(document.getElementById('chord').value) * 1.8,
      tipChord:  parseFloat(document.getElementById('chord').value) * 0.42,
      sweep:     parseFloat(document.getElementById('sweep').value),
      twist:     parseFloat(document.getElementById('twist').value),
      thickness: parseFloat(document.getElementById('thickness').value),
      camber:    parseFloat(document.getElementById('camber').value),
      dihedral:  parseFloat(document.getElementById('dihedral').value),
    };
    buildWings(p);
    buildEngines(p);
  }

  // Apply wing flex (wingtip bending)
  function applyWingFlex(flexM) {
    if (!rightWingMesh) return;
    const flex = flexM / 17;
    rightWingMesh.rotation.z = flex * 0.08;
    leftWingMesh.rotation.z  = -flex * 0.08;
  }

  /* ═══════════════════════════════════════
     RENDER MODES
  ═══════════════════════════════════════ */
  let renderMode = 'solid'; // 'solid' | 'wireframe' | 'cfd-pressure' | 'cfd-stream'

  function setRenderMode(mode) {
    renderMode = mode;
    const isWire = mode === 'wireframe';
    [matFuselage, matWing, matControlSurface, matEngine, matWinglet].forEach(m => {
      m.wireframe = isWire;
    });
    window._cfd && window._cfd.setVisible(mode === 'cfd-pressure' || mode === 'cfd-stream');
    document.getElementById('cfd-legend').style.display =
      (mode === 'cfd-pressure' || mode === 'cfd-stream') ? 'block' : 'none';
  }

  /* ═══════════════════════════════════════
     PRESET VIEWS
  ═══════════════════════════════════════ */
  function setView(name) {
    switch (name) {
      case 'front': spherical = { theta: 0, phi: Math.PI / 2, r: 70 }; break;
      case 'top':   spherical = { theta: 0, phi: 0.05, r: 70 }; break;
      case 'side':  spherical = { theta: Math.PI / 2, phi: Math.PI / 2, r: 70 }; break;
      case 'iso':   spherical = { theta: 0.8, phi: 0.9, r: 55 }; break;
    }
    target.set(0, 0, 0);
  }

  /* ═══════════════════════════════════════
     RESIZE
  ═══════════════════════════════════════ */
  function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(onResize).observe(canvas);
  onResize();

  /* ═══════════════════════════════════════
     ANIMATION LOOP
  ═══════════════════════════════════════ */
  let turbulenceTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    updateCamera();

    // Turbulence animation
    const turbLevel = parseFloat(document.getElementById('turbulence').value);
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
     PUBLIC API (used by ui.js)
  ═══════════════════════════════════════ */
  window._aircraft = {
    scene, camera, renderer,
    aircraftGroup,
    applyControlSurfaces,
    applyWingFlex,
    rebuildWingsFromUI,
    setView,
    setRenderMode,
    updateAddonVisibility,
    wingParams,
    getWingParams() {
      return {
        span:      parseFloat(document.getElementById('span').value),
        chord:     parseFloat(document.getElementById('chord').value),
        sweep:     parseFloat(document.getElementById('sweep').value),
        twist:     parseFloat(document.getElementById('twist').value),
        thickness: parseFloat(document.getElementById('thickness').value),
        camber:    parseFloat(document.getElementById('camber').value),
        dihedral:  parseFloat(document.getElementById('dihedral').value),
      };
    }
  };

})();
