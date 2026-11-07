  // Lantern light is faked with additive pools: dozens of real point lights
  // exceed the 4-light material limit and cost too much on phones.
  const lightPoolMat = additiveMat("lantern light pool", radialTexture("light pool", 128, [
    [0, "rgba(255,176,92,.62)"], [.32, "rgba(255,140,60,.26)"], [1, "rgba(255,110,40,0)"]]));
  function lightPool(x, z, radius, y = .04) {
    if (radius >= 1.2) addLightSpot(x, 2.2, z, "#ffa65a", Math.min(1.2, radius / 2.2));
    const pool = B.MeshBuilder.CreateGround("lantern pool", { width: radius * 2, height: radius * 2 }, scene);
    pool.position.set(x, y, z); pool.material = lightPoolMat; pool.isPickable = false;
    return pool;
  }
  function yantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      const r = s / 2; c.clearRect(0, 0, s, s); c.translate(r, r);
      c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      for (const [radius, width] of [[118, 5], [104, 2], [70, 3], [30, 2]]) {
        c.lineWidth = width; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      }
      c.lineWidth = 3; c.beginPath();
      for (let i = 0; i <= 8; i++) { const a = i * Math.PI * 3 / 4; c.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); }
      c.stroke();
      c.font = "bold 17px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const glyphs = "นะมะพะธะอะอุมะ";
      for (let i = 0; i < glyphs.length; i++) {
        const a = i / glyphs.length * Math.PI * 2;
        c.save(); c.rotate(a); c.fillText(glyphs[i], 0, -111 + 0); c.restore();
      }
      c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
    });
  }
  // Square grid yantra (yan tarang): bordered cells of sacred syllables
  // around an unalom, the seal used under every spirit gate and rest ward.
  function squareYantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      c.clearRect(0, 0, s, s); c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      c.lineWidth = 5; c.strokeRect(14, 14, s - 28, s - 28);
      c.lineWidth = 2; c.strokeRect(28, 28, s - 56, s - 56);
      const cell = (s - 92) / 3, o = 46;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(o + i * cell, o); c.lineTo(o + i * cell, o + 3 * cell); c.moveTo(o, o + i * cell); c.lineTo(o + 3 * cell, o + i * cell); c.stroke(); }
      c.strokeRect(o, o, cell * 3, cell * 3);
      c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const syllables = ["นะ", "โม", "พุท", "ธา", "", "ยะ", "อะ", "อุ", "มะ"];
      syllables.forEach((t, i) => { if (t) c.fillText(t, o + (i % 3 + .5) * cell, o + (Math.floor(i / 3) + .5) * cell); });
      // Unalom in the centre cell.
      const cx = s / 2, cy = s / 2; c.lineWidth = 3; c.beginPath();
      for (let t = 0; t < 12; t += .2) { const r = 1 + t * .9; c.lineTo(cx + Math.cos(t) * r, cy + 6 + Math.sin(t) * r); }
      c.moveTo(cx + 10, cy + 6); c.quadraticCurveTo(cx + 4, cy - 10, cx, cy - 20); c.stroke();
      for (const [x, y, a] of [[s / 2, 6, 0], [s - 6, s / 2, Math.PI / 2], [s / 2, s - 6, Math.PI], [6, s / 2, -Math.PI / 2]]) {
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(-14, 10); c.lineTo(0, -4); c.lineTo(14, 10); c.closePath(); c.fill(); c.restore();
      }
    });
  }
  const portalYantraMat = additiveMat("portal yantra", squareYantraTexture("portal yantra", "rgba(150,255,230,.95)", "#5fffe0"));
  const restYantraMat = additiveMat("rest yantra", squareYantraTexture("rest yantra", "rgba(255,206,120,.4)", "#ffb35a"));
  // Roads: Chaikin-smoothed ribbons with a soft dark verge and rounded ends.
  function ribbonMesh(name, points, width, material, y, seed = 0, wobble = .12) {
    const positions = [], uvs = [], normals = [], indices = [];
    let dist = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)], p = points[i];
      const dx = next.x - prev.x, dz = next.z - prev.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (i) dist += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const w = width / 2 * (1 + (noise(i * .37 + seed, 201) - .5) * wobble);
      positions.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      uvs.push(0, dist / width, 1, dist / width); normals.push(0, 1, 0, 0, 1, 0);
      if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); } // counter-clockwise from above: faces up
    }
    const mesh = new B.Mesh(name, scene), data = new B.VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs; data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false;
    return mesh;
  }
  const vergeTexture = paintTexture("road verge", 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.3, "rgba(0,0,0,.75)"); g.addColorStop(.7, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  vergeTexture.hasAlpha = true;
  function vergeMat(name, hex) {
    const m = mat(name, hex); m.opacityTexture = vergeTexture; m.backFaceCulling = false; m.specularColor = B.Color3.Black();
    return m;
  }
  function buildRoad(points, width, material, verge, parent, seed = 0, straight = false) {
    const smooth = straight ? points : smoothPath(points), y = .012 + (seed % 5) * .002, parts = [];
    parts.push(ribbonMesh("road verge", smooth, width + 1.8, verge, y - .006, seed, .2));
    parts.push(ribbonMesh("road", smooth, width, material, y, seed));
    for (const end of [smooth[0], smooth[smooth.length - 1]]) {
      const cap = B.MeshBuilder.CreateDisc("road end", { radius: width / 2, tessellation: 20 }, scene);
      cap.rotation.x = Math.PI / 2; cap.position.set(end.x, y - .003, end.z); cap.material = material; cap.isPickable = false; parts.push(cap);
      const soft = B.MeshBuilder.CreateDisc("road end verge", { radius: width / 2 + .9, tessellation: 20 }, scene);
      soft.rotation.x = Math.PI / 2; soft.position.set(end.x, y - .008, end.z); soft.material = verge; soft.isPickable = false; parts.push(soft);
    }
    for (const part of parts) if (parent) part.parent = parent;
    return parts;
  }
  function yantraDisc(x, z, radius, material, parent, y = .05) {
    const disc = B.MeshBuilder.CreateGround("yantra seal", { width: radius * 2, height: radius * 2 }, scene);
    disc.position.set(x, y, z); disc.material = material; disc.isPickable = false;
    if (parent) disc.parent = parent;
    return disc;
  }

