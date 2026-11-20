// Progressive enhancement: text and the local SVG never wait for the CDN.
const hero = document.querySelector(".hero");
const artwork = hero?.querySelector(".hero-art");
const mount = artwork?.querySelector(".hero-canvas-mount");

if (hero && artwork && mount && !new URLSearchParams(location.search).has("id")) {
  const start = () => initializeHero().catch(() => {
    artwork.classList.remove("is-3d-ready");
    artwork.dataset.heroState = "fallback";
  });
  // Allow the first HTML/CSS paint before importing or constructing the scene.
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 1000 });
  else window.setTimeout(start, 100);
}

async function initializeHero() {
  if (!mount.isConnected) return;
  artwork.dataset.heroState = "loading";
  let importTimer;
  let modules;
  try {
    modules = await Promise.race([
      Promise.all([import("three"), import("three/addons/environments/RoomEnvironment.js"), import("./3d.js")]),
      new Promise((_, reject) => {
        importTimer = window.setTimeout(() => reject(new Error("3D import timed out")), 10000);
      }),
    ]);
  } finally {
    window.clearTimeout(importTimer);
  }
  if (!mount.isConnected) return;

  const [THREE, { RoomEnvironment }, { createHongyanMonument }] = modules;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const smallScreen = window.matchMedia("(max-width: 767px)");
  const weakDevice = Number(navigator.hardwareConcurrency) > 0 && navigator.hardwareConcurrency <= 4;
  const textures = new Set();
  const disposers = [];
  const scene = new THREE.Scene();
  let renderer;
  let environment;
  let frame = 0;
  let disposed = false;
  let visible = hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < innerHeight;
  let elapsed = 0;
  let lastTime = 0;
  let width = 1;
  let height = 1;
  let resolutionMode;
  const target = new THREE.Vector2();
  const offset = new THREE.Vector2();
  let model;
  let camera;
  let beams;

  const listen = (element, type, listener, options) => {
    element.addEventListener(type, listener, options);
    disposers.push(() => element.removeEventListener(type, listener, options));
  };
  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    disposers.forEach((cleanup) => cleanup());
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) {
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    environment?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    artwork.classList.remove("is-3d-ready");
  };
  const fallback = () => {
    dispose();
    artwork.dataset.heroState = "fallback";
  };
  const draw = () => {
    if (disposed || !mount.isConnected) return;
    try {
      renderer.render(scene, camera);
    } catch {
      fallback();
    }
  };
  const schedule = () => {
    if (!disposed && !frame && !motion.matches && visible && !document.hidden) {
      frame = window.requestAnimationFrame(animate);
    }
  };
  function animate(now) {
    frame = 0;
    if (disposed || motion.matches || !visible || document.hidden) return;
    if (!mount.isConnected) return dispose();
    const delta = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0;
    lastTime = now;
    elapsed += delta;
    model.rotation.y = -.12 + Math.sin(elapsed * Math.PI * 2 / 16) * THREE.MathUtils.degToRad(1);
    model.rotation.x = Math.sin(elapsed * Math.PI * 2 / 16) * THREE.MathUtils.degToRad(.25);
    // Equivalent to lerp(.05) at 60fps, independent of refresh rate.
    offset.lerp(target, 1 - Math.pow(.95, delta * 60));
    camera.setViewOffset(width, height, offset.x, offset.y, width, height);
    draw();
    schedule();
  }

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.pointerEvents = "none";
    renderer.debug.onShaderError = () => { throw new Error("Hero shader compilation failed"); };
    listen(renderer.domElement, "webglcontextlost", (event) => {
      event.preventDefault();
      fallback();
    });

    camera = new THREE.PerspectiveCamera(35, 1, .1, 50);
    camera.position.set(5.4, 3.9, 11.8);
    camera.lookAt(0, 1, 0);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      environment = pmrem.fromScene(room, .04);
      scene.environment = environment.texture;
    } finally {
      room.dispose();
      pmrem.dispose();
    }
    const key = new THREE.DirectionalLight("#ffe0a5", 3.8);
    key.position.set(-6, 9, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#d76b38", 1.5);
    fill.position.set(4, -2, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#ffb55c", 3);
    rim.position.set(-5, 4, -5);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight("#ffe4b9", "#4a1b10", 1.35));

    const canvasTexture = (paint, size = 512) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas textures unavailable");
      paint(context, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      textures.add(texture);
      return texture;
    };
    const monument = createHongyanMonument(THREE, { texture: canvasTexture, lowQuality: smallScreen.matches || weakDevice });
    model = monument.model;
    beams = monument.atmosphere;
    model.traverse((node) => {
      for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        if ('envMapIntensity' in material) material.envMapIntensity = .55;
      }
    });
    scene.add(model, beams);
    const framingDirection = new THREE.Vector3(5.4, 2.9, 11.8).normalize();

    const resize = () => {
      if (disposed || !mount.isConnected) return;
      const nextWidth = Math.max(1, mount.clientWidth);
      const nextHeight = Math.max(1, mount.clientHeight);
      const lowResolution = smallScreen.matches || weakDevice;
      // ResizeObserver also fires on observe(); avoid a second static frame.
      if (nextWidth === width && nextHeight === height && resolutionMode === lowResolution) return;
      width = nextWidth;
      height = nextHeight;
      resolutionMode = lowResolution;
      renderer.setPixelRatio(lowResolution ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      beams.visible = !lowResolution;
      camera.aspect = width / height;
      const distance = Math.max(8.3, 9.4 / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)));
      camera.position.copy(framingDirection).multiplyScalar(distance).add(new THREE.Vector3(0, 1, 0));
      camera.lookAt(0, 1, 0);
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      draw();
    };
    resize();
    if (disposed) return;
    mount.append(renderer.domElement);
    artwork.classList.add("is-3d-ready");
    artwork.dataset.heroState = "ready";

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    disposers.push(() => observer.disconnect());
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (visible) schedule();
      else stop();
    }, { threshold: 0 });
    intersection.observe(hero);
    disposers.push(() => intersection.disconnect());
    // The data container may change independently. Dispose only if the Hero is removed.
    const removal = new MutationObserver(() => {
      if (!mount.isConnected) dispose();
    });
    removal.observe(hero.parentElement, { childList: true, subtree: true });
    disposers.push(() => removal.disconnect());
    listen(document, "visibilitychange", () => document.hidden ? stop() : schedule());
    listen(artwork, "pointermove", (event) => {
      if (motion.matches || smallScreen.matches || event.pointerType !== "mouse") return;
      const bounds = artwork.getBoundingClientRect();
      target.set((event.clientX - bounds.left) / bounds.width * 2 - 1, (event.clientY - bounds.top) / bounds.height * 2 - 1);
      target.clampLength(0, 1).multiplyScalar(5);
    }, { passive: true });
    listen(artwork, "pointerleave", () => target.set(0, 0));
    listen(motion, "change", () => {
      stop();
      target.set(0, 0);
      offset.set(0, 0);
      camera.clearViewOffset();
      model.rotation.set(0, -.12, 0);
      if (motion.matches) draw();
      else schedule();
    });
    listen(smallScreen, "change", () => { target.set(0, 0); offset.set(0, 0); resize(); });
    listen(window, "pagehide", (event) => event.persisted ? stop() : dispose());
    listen(window, "pageshow", schedule);
    schedule();
  } catch (error) {
    fallback();
    console.info("Hero uses the local SVG fallback:", error.message);
  }
}
