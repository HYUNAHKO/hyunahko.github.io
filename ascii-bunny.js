/**
 * ASCII point-cloud background for the intro: the Stanford Bunny as a cloud of
 * soft, Gaussian-splat-like points drawn into a grid of monospace glyphs.
 *   - slowly orbits on its own; drag to orbit it yourself
 *   - points near the cursor are pushed away and spring back into place
 *   - click (or tap) scatters it into noise and it "reconstructs" itself
 */
(function () {
  var canvas = document.getElementById('ascii-bunny');
  if (!canvas || !window.BUNNY_POINTS) return;
  var ctx = canvas.getContext('2d');
  var box = canvas.parentNode;
  // The bunny sits behind the intro text, faded so the text stays readable.
  var anchor = box.querySelector('.name').parentNode;
  var FADE = 0.32;

  var RAMP = " ·:+*";
  var FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  // Colours run from the site's link blue to its accent purple by height.
  var C0 = [23, 114, 208], C1 = [151, 149, 240];

  // ---- point data --------------------------------------------------------
  var raw = atob(window.BUNNY_POINTS);
  var N = raw.length / 6;
  var home = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    for (var k = 0; k < 3; k++) {
      var p = raw.charCodeAt(i * 6 + k), q = raw.charCodeAt(i * 6 + 3 + k);
      home[i * 3 + k] = (p > 127 ? p - 256 : p) / 127;
      nrm[i * 3 + k] = (q > 127 ? q - 256 : q) / 127;
    }
  }
  var off = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  var delay = new Float32Array(N);

  function scatter(strength) {
    for (var i = 0; i < N; i++) {
      for (var k = 0; k < 3; k++) {
        off[i * 3 + k] = (Math.random() * 2 - 1) * strength;
        vel[i * 3 + k] = 0;
      }
      // Points nearer the bottom settle first, so it builds up like a scan.
      delay[i] = (home[i * 3 + 1] + 1) * 0.35 + Math.random() * 0.25;
    }
  }

  // ---- view state -------------------------------------------------------
  var yaw = 0.45, pitch = 0.1, spin = 0.25;
  var dragging = false, lastX = 0, lastY = 0, moved = 0;
  var mouse = { x: -1e4, y: -1e4, inside: false };
  var W = 0, H = 0, bx = 0, by = 0, bs = 1, dpr = 1, cw = 7, ch = 12, cols = 0, rows = 0;
  var dens, shade, tint, wake;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var visible = true, raf = 0, last = 0;

  function resize() {
    var r = canvas.getBoundingClientRect();
    if (r.width < 1) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    var a = anchor.getBoundingClientRect();
    bx = a.left - r.left + a.width / 2; by = a.top - r.top + a.height / 2;
    bs = Math.min(a.height * 0.42, a.width * 0.4);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var fs = W < 500 ? 8 : 10;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 ' + fs + 'px ' + FONT;
    cw = ctx.measureText('M').width; ch = Math.round(fs * 1.15);
    cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
    dens = new Float32Array(cols * rows);
    shade = new Float32Array(cols * rows);
    tint = new Float32Array(cols * rows);
    wake = new Float32Array(cols * rows);
    ctx.textBaseline = 'top';
    if (reduced.matches) draw();
  }

  // ---- simulation -------------------------------------------------------
  function step(dt, t) {
    if (!dragging) yaw += spin * dt;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var scale = bs, cx = bx, cyy = by;
    var R = Math.min(90, W * 0.12);
    for (var i = 0; i < N; i++) {
      var j = i * 3;
      if (t < delay[i]) continue;
      // spring back home
      for (var k = 0; k < 3; k++) {
        vel[j + k] += (-off[j + k] * 38 - vel[j + k] * 7.5) * dt;
      }
      // cursor pushes points outward in the screen plane
      if (mouse.inside) {
        var x = home[j] + off[j], y = home[j + 1] + off[j + 1], z = home[j + 2] + off[j + 2];
        var sx = cx + (x * cy + z * sy) * scale, syy = cyy - y * scale;
        var dx = sx - mouse.x, dy = syy - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 1) {
          var d = Math.sqrt(d2), f = (1 - d / R) * 14 * dt / d;
          // screen dx maps back to the object's rotated x/z axes
          vel[j] += dx * f * cy; vel[j + 2] += dx * f * sy;
          vel[j + 1] -= dy * f;
        }
      }
      for (k = 0; k < 3; k++) off[j + k] += vel[j + k] * dt;
    }
    // background wake left by the cursor
    for (var c = 0; c < wake.length; c++) wake[c] *= Math.pow(0.04, dt);
    if (mouse.inside) {
      var mc = Math.floor(mouse.x / cw), mr = Math.floor(mouse.y / ch);
      for (var r = -2; r <= 2; r++) for (var q = -3; q <= 3; q++) {
        var cc = mc + q, rr = mr + r;
        if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) {
          wake[rr * cols + cc] = Math.max(wake[rr * cols + cc], 1 - (q * q / 12 + r * r / 6));
        }
      }
    }
  }

  // ---- rendering --------------------------------------------------------
  function draw() {
    dens.fill(0); shade.fill(0); tint.fill(0);
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var scale = bs, cx = bx, cyy = by;
    var L = [-0.45, 0.65, 0.62];
    for (var i = 0; i < N; i++) {
      var j = i * 3;
      var x = home[j] + off[j], y = home[j + 1] + off[j + 1], z = home[j + 2] + off[j + 2];
      // yaw then pitch
      var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var nx = nrm[j] * cy + nrm[j + 2] * sy, nz1 = -nrm[j] * sy + nrm[j + 2] * cy;
      var ny = nrm[j + 1] * cp - nz1 * sp, nz = nrm[j + 1] * sp + nz1 * cp;
      var persp = 4 / (4 - z2);
      var px = cx + x1 * scale * persp, py = cyy - y2 * scale * persp;
      // back-facing samples only faintly show through
      var face = nz > -0.05 ? 1 : 0.05;
      var lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) * 0.85 + 0.15;
      var gx = px / cw, gy = py / ch, c0 = Math.floor(gx), r0 = Math.floor(gy);
      var sig = 0.55 * persp;
      for (var r = r0 - 1; r <= r0 + 1; r++) {
        if (r < 0 || r >= rows) continue;
        for (var c = c0 - 1; c <= c0 + 1; c++) {
          if (c < 0 || c >= cols) continue;
          var dx = c + 0.5 - gx, dy = (r + 0.5 - gy) * ch / cw;
          var w = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)) * face;
          var id = r * cols + c;
          dens[id] += w; shade[id] += w * lit; tint[id] += w * (y + 1) / 2;
        }
      }
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = FADE;
    var lastStyle = '';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var id = r * cols + c, d = dens[id], ch_, a, col;
        if (d > 0.04) {
          var s = shade[id] / d, t = tint[id] / d;
          var v = Math.min(1, d * 0.6) * s;
          ch_ = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1)))];
          a = Math.min(1, d) * (0.35 + 0.65 * s);
          col = mix(C0, C1, t, Math.round(a * 8) / 8);
        } else if (wake[id] > 0.05) {
          ch_ = '·';
          col = mix(C0, C1, 0.5, Math.round(wake[id] * 0.5 * 8) / 8);
        } else continue;
        if (col !== lastStyle) { ctx.fillStyle = col; lastStyle = col; }
        ctx.fillText(ch_, c * cw, r * ch);
      }
    }
  }

  function mix(a, b, t, alpha) {
    t = Math.round(Math.max(0, Math.min(1, t)) * 6) / 6;
    return 'rgba(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ',' + alpha + ')';
  }

  // ---- loop -------------------------------------------------------------
  var clock = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    clock += dt;
    step(dt, clock);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function schedule() {
    cancelAnimationFrame(raf);
    if (!visible || reduced.matches) { draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function reconstruct() { scatter(1.6); clock = 0; }

  // ---- input ------------------------------------------------------------
  function local(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  box.addEventListener('pointerdown', function (e) {
    if (e.target.closest('a, button')) return;
    dragging = true; moved = 0;
    var p = local(e); lastX = p[0]; lastY = p[1];
  });
  window.addEventListener('pointermove', function (e) {
    var p = local(e);
    mouse.x = p[0]; mouse.y = p[1];
    mouse.inside = e.pointerType === 'mouse' && p[0] >= 0 && p[1] >= 0 && p[0] <= W && p[1] <= H;
    if (!dragging) return;
    var dx = p[0] - lastX, dy = p[1] - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.01;
    pitch = Math.max(-0.6, Math.min(0.8, pitch + dy * 0.006));
    lastX = p[0]; lastY = p[1];
    if (reduced.matches) draw();
  }, { passive: true });
  window.addEventListener('pointerup', function () {
    if (dragging && moved < 6) { reconstruct(); if (reduced.matches) { off.fill(0); draw(); } }
    dragging = false;
  });
  window.addEventListener('pointercancel', function () { dragging = false; });
  window.addEventListener('blur', function () { mouse.inside = false; dragging = false; });

  new ResizeObserver(resize).observe(box);
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; schedule(); }).observe(canvas);
  reduced.addEventListener && reduced.addEventListener('change', schedule);

  resize();
  if (!reduced.matches) reconstruct();
  schedule();
})();
