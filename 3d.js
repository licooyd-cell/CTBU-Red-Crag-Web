// A real-time architectural monument inspired by the supplied Hongyan reference.
// Repeated beams, windows, roofs and rock formations are instanced for mobile GPUs.
export function createHongyanMonument(THREE, { texture, lowQuality }) {
  const model = new THREE.Group();
  const atmosphere = new THREE.Group();
  let seed = 1949;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stoneMap = texture((ctx, size) => {
    ctx.fillStyle = '#b3a08a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i++) {
      const shade = Math.round(65 + random() * 135);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},.24)`;
      ctx.fillRect(random() * size, random() * size, 1 + random() * 6, 1 + random() * 3);
    }
    for (let i = 0; i < 38; i++) {
      const x = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 90, size * .3, x - 120, size * .7, x + 35, size);
      ctx.strokeStyle = 'rgba(245,226,185,.19)';
      ctx.lineWidth = 1 + random() * 3;
      ctx.stroke();
    }
  });
  const rock = new THREE.MeshStandardMaterial({ color: '#8c4226', metalness: .32, roughness: .7, bumpMap: stoneMap, bumpScale: .08, flatShading: true });
  const flagMaterial = new THREE.MeshPhysicalMaterial({ color: '#ac2d19', metalness: .4, roughness: .48, clearcoat: .18, clearcoatRoughness: .38, bumpMap: stoneMap, bumpScale: .09, side: THREE.DoubleSide });
  const bronze = new THREE.MeshStandardMaterial({ color: '#c29056', metalness: .7, roughness: .38 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#a24827', metalness: .52, roughness: .46, bumpMap: stoneMap, bumpScale: .025 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#834a31', metalness: .32, roughness: .62 });
  const recessMaterial = new THREE.MeshStandardMaterial({ color: '#29150e', metalness: .2, roughness: .8 });
  const baseMaterial = new THREE.MeshPhysicalMaterial({ color: '#7e2519', metalness: .4, roughness: .38, clearcoat: .2, bumpMap: stoneMap, bumpScale: .04 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e4b775', metalness: .78, roughness: .3 });

  const boxes = { beams: [], walls: [], recesses: [], roofs: [] };
  const box = (bucket, x, y, z, sx, sy, sz, ry = 0) => boxes[bucket].push({ x, y, z, sx, sy, sz, ry });
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const matrixObject = new THREE.Object3D();
  const instances = (geometry, material, data) => {
    const mesh = new THREE.InstancedMesh(geometry, material, data.length);
    data.forEach((item, index) => {
      matrixObject.position.set(item.x, item.y, item.z);
      matrixObject.scale.set(item.sx, item.sy, item.sz);
      matrixObject.rotation.set(0, item.ry || 0, 0);
      matrixObject.updateMatrix();
      mesh.setMatrixAt(index, matrixObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    model.add(mesh);
    return mesh;
  };
  const addMesh = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };

  // A three-step stone plinth; its inscription is part of the model, not page UI.
  addMesh(new THREE.BoxGeometry(7.85, .12, 3.95), baseMaterial, 0, -2.03, 0);
  addMesh(new THREE.BoxGeometry(7.6, .34, 3.75), baseMaterial, 0, -1.81, 0);
  addMesh(new THREE.BoxGeometry(7.65, .035, 3.8), bronze, 0, -1.62, 0);
  const plaque = texture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#efc58a';
    ctx.scale(1, 3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 55px "Noto Serif SC", "Songti SC", SimSun, serif';
    ctx.fillText('重庆 · 红岩精神', size / 2, size * .44 / 3);
    ctx.font = '20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('坚定信念  ·  团结奋斗  ·  不懈追求', size / 2, size * .62 / 3);
  }, 1024);
  addMesh(new THREE.PlaneGeometry(4.5, 1.5), new THREE.MeshBasicMaterial({ map: plaque, transparent: true, depthWrite: false, toneMapped: false }), 0, -1.78, 1.883);

  // Deterministic fractured rock, shared across all cliff outcrops.
  const rockGeometry = new THREE.IcosahedronGeometry(1, lowQuality ? 1 : 2);
  const rockPosition = rockGeometry.attributes.position;
  for (let i = 0; i < rockPosition.count; i++) {
    const x = rockPosition.getX(i), y = rockPosition.getY(i), z = rockPosition.getZ(i);
    const fracture = 1 + .12 * Math.sin(x * 11 + y * 6) * Math.cos(z * 9 - y * 7);
    rockPosition.setXYZ(i, x * fracture, y * fracture, z * fracture);
  }
  rockGeometry.computeVertexNormals();
  const rocks = [];
  for (let i = 0; i < 23; i++) {
    const x = -3.1 + random() * 5.8;
    const highLeft = Math.max(0, 1 - Math.abs(x + 1.6) / 2.6);
    rocks.push({ x, y: -1.14 + highLeft * .58, z: -.18 + random() * .75, sx: .52 + random() * .65, sy: .5 + highLeft * .9 + random() * .65, sz: .5 + random() * .45, ry: random() * 3 });
  }
  rocks.push({ x: -2.5, y: .65, z: -.92, sx: .48, sy: 2.25, sz: .6, ry: .1 });
  instances(rockGeometry, rock, rocks);

  // Sculptural flag: an irregular silhouette and physically raised folds.
  const flagGeometry = new THREE.PlaneGeometry(1, 1, lowQuality ? 30 : 64, lowQuality ? 18 : 36);
  const flagVertices = flagGeometry.attributes.position;
  for (let i = 0; i < flagVertices.count; i++) {
    const u = flagVertices.getX(i) + .5, v = flagVertices.getY(i) + .5;
    const bottom = 1.12 + .48 * u + .17 * Math.sin(u * 9);
    const top = 4.2 + .33 * Math.sin(u * 8 - .8) + .2 * u;
    const z = -1.17 + .28 * Math.sin(u * 8 - v * 3) + .13 * Math.sin(u * 19 + v * 8);
    flagVertices.setXYZ(i, -2.82 + u * 5.9, bottom + (top - bottom) * v, z);
  }
  flagGeometry.computeVertexNormals();
  addMesh(flagGeometry, flagMaterial, 0, 0, 0);
  addMesh(new THREE.CylinderGeometry(.035, .035, 6, 12), bronze, -2.87, 1.35, -1.1);
  addMesh(new THREE.ConeGeometry(.1, .28, 8), gold, -2.87, 4.5, -1.1);
  const inscription = texture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f0c58c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(63,16,8,.65)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 5;
    ctx.font = '700 200px KaiTi, STKaiti, "Noto Serif SC", serif';
    ctx.fillText('红', size / 2, 145);
    ctx.fillText('岩', size / 2, 360);
  });
  const letters = addMesh(new THREE.PlaneGeometry(1.45, 2.02), new THREE.MeshStandardMaterial({ map: inscription, transparent: true, metalness: .6, roughness: .48, depthWrite: false, side: THREE.DoubleSide }), -1.97, 2.85, -.58);
  letters.rotation.z = -.12;

  // A swept Chinese roof with lifted eaves, shared by every floor.
  const roofGeometry = new THREE.PlaneGeometry(1, 1, 10, 10);
  const rp = roofGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getY(i);
    const slope = Math.abs(z) * 2;
    const y = .31 * (1 - slope) ** 1.5 + .075 * slope ** 6 + .085 * (Math.abs(x) * 2) ** 5 * slope ** 3;
    rp.setXYZ(i, x, y, z);
  }
  // Reversing the plane's y coordinate into z reverses its upward normal.
  roofGeometry.setIndex(Array.from(roofGeometry.index.array).reduce((out, value, i, array) => {
    if (i % 3 === 0) out.push(array[i], array[i + 2], array[i + 1]);
    return out;
  }, []));
  roofGeometry.computeVertexNormals();
  roofMaterial.side = THREE.DoubleSide;
  const tileLines = [];
  const line = (list, a, b) => list.push(...a, ...b);
  const roof = (x, y, z, width, depth) => {
    boxes.roofs.push({ x, y, z, sx: width, sy: 1, sz: depth });
    // Fine tile joints describe the curvature without hundreds of draw calls.
    const ribs = lowQuality ? 7 : 12;
    for (let i = 0; i <= ribs; i++) {
      const px = (i / ribs - .5) * width;
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          const at = k => {
            const t = k / 4;
            return [x + px, y + .31 * (1 - t) ** 1.5 + .075 * t ** 6 + .085 * (Math.abs(px / width) * 2) ** 5 * t ** 3 + .006, z + side * t * depth / 2];
          };
          line(tileLines, at(j), at(j + 1));
        }
      }
    }
    box('beams', x, y + .08, z + depth / 2, width, .025, .025);
    box('beams', x, y + .08, z - depth / 2, width, .025, .025);
    box('beams', x, y + .32, z, width * 1.04, .025, .028);
  };
  const building = (x, base, z, floors, width, depth) => {
    const floorHeight = .46;
    for (let level = 0; level < floors; level++) {
      const y = base + level * floorHeight;
      box('walls', x, y + .2, z, width * .88, .4, depth * .82);
      box('beams', x, y, z, width * 1.13, .04, depth * 1.18);
      for (let col = 0; col <= 4; col++) {
        const px = x + (col / 4 - .5) * width;
        for (const side of [-1, 1]) {
          box('beams', px, y + .22, z + side * depth * .48, .026, .44, .026);
          if (col < 4) box('recesses', px + width / 8, y + .23, z + side * depth * .414, width / 4 - .05, .26, .012);
        }
      }
      // Balcony uprights and two horizontal rails on the visible facade.
      for (let j = 0; j <= 10; j++) box('beams', x + (j / 10 - .5) * width, y + .12, z + depth * .59, .015, .19, .015);
      for (const railY of [.055, .2]) box('beams', x, y + railY, z + depth * .59, width * 1.05, .018, .022);
      for (const side of [-1, 1]) {
        box('beams', x + side * width * .5, y + .16, z, .022, .024, depth * 1.18);
        for (let j = 0; j <= 5; j++) box('beams', x + side * width * .5, y + .12, z + (j / 5 - .5) * depth, .015, .19, .015);
      }
      if (level === floors - 1 || (floors > 3 && level === 1)) roof(x, y + .46, z, width * 1.24, depth * 1.35);
    }
    // Stilt foundations attach each house to the terrain.
    for (const side of [-1, 1]) box('beams', x + side * width * .42, (base - 1.6) / 2, z + depth * .35, .06, Math.max(.05, base + 1.6), .06);
  };
  building(-2.58, -1.58, .82, 3, 1.03, .87);
  building(-1.25, -1.58, 1.03, 3, 1.17, .9);
  building(.2, -1.58, 1.02, 3, 1.38, 1.06);
  building(1.75, -1.58, .92, 3, 1.12, .91);
  building(2.78, -1.58, .41, 3, .8, .8);
  building(-1.48, -.12, -.12, 3, 1.05, .85);
  building(-.04, .06, -.05, 4, 1.12, .96);
  building(1.4, -.05, -.21, 3, 1.13, .85);
  // A slim Chongqing skyline behind the traditional riverside district.
  for (const [x, h, z] of [[2.13, 3.2, -1.07], [2.77, 2.55, -1.04], [3.24, 1.85, -.82]]) {
    box('walls', x, -1.6 + h / 2, z, .34, h, .32);
    for (let floor = 0; floor < h / .14; floor++) box('beams', x, -1.56 + floor * .14, z + .165, .35, .013, .016);
    for (const dx of [-.15, 0, .15]) box('beams', x + dx, -1.6 + h / 2, z + .168, .013, h, .015);
    box('beams', x, -1.6 + h + .16, z, .018, .32, .018);
  }
  const bridgeLines = [];
  box('beams', 2.72, -.62, 1.42, 2.2, .065, .3, -.12);
  for (const x of [2.03, 3.36]) {
    for (const z of [1.28, 1.56]) {
      box('beams', x, -.57, z, .035, 1.56, .035);
      for (let i = -5; i <= 5; i++) line(bridgeLines, [x, .21, z], [x + i * .12, -.59, z]);
    }
    box('beams', x, .16, 1.42, .08, .05, .36);
  }
  instances(cubeGeometry, bronze, boxes.beams);
  instances(cubeGeometry, wallMaterial, boxes.walls);
  instances(cubeGeometry, recessMaterial, boxes.recesses);
  instances(roofGeometry, roofMaterial, boxes.roofs);
  const addLines = (positions, color, opacity) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    model.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  addLines(tileLines, '#dbb075', .55);
  addLines(bridgeLines, '#f2cf98', .8);

  // A continuous luminous ribbon ties the flag, cliffs and city together.
  const ribbonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.7, .46, .3), new THREE.Vector3(-3.35, .12, 1.5),
    new THREE.Vector3(-1.7, -.08, 2.05), new THREE.Vector3(.2, -.38, 2.22),
    new THREE.Vector3(2.6, -.91, 2.0), new THREE.Vector3(3.76, -1.18, 1.05),
    new THREE.Vector3(2.9, -1.42, -.7),
  ]);
  const glowCore = new THREE.MeshBasicMaterial({ color: '#ffe5ad', toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(ribbonCurve, lowQuality ? 56 : 96, i === 0 ? .014 : .006, 5, false), glowCore);
    ribbon.position.y = i * .035;
    model.add(ribbon);
  }
  const halo = new THREE.Mesh(new THREE.TubeGeometry(ribbonCurve, 56, .065, 5, false), new THREE.MeshBasicMaterial({ color: '#ffb852', transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  model.add(halo);

  // Warm contact shadow and two softly feathered shafts of light.
  const radial = texture((ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(250,199,124,.8)');
    gradient.addColorStop(.35, 'rgba(246,166,78,.18)');
    gradient.addColorStop(1, 'rgba(246,166,78,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }, 128);
  if (!lowQuality) {
    const lightMaterial = new THREE.MeshBasicMaterial({ map: radial, transparent: true, blending: THREE.AdditiveBlending, opacity: .22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (const [x, angle] of [[-2.6, -.35], [-.8, -.44]]) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 10), lightMaterial);
      beam.position.set(x, 2, -2.5);
      beam.rotation.z = angle;
      atmosphere.add(beam);
    }
  }
  const shadowMap = texture((ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(24,8,3,.7)');
    gradient.addColorStop(1, 'rgba(24,8,3,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.11;
  model.add(shadow);
  model.rotation.y = -.12;
  return { model, atmosphere };
}
