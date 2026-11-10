# Rebuild the head of thai-male.glb: sculpted face, eyeballs, ears, and a dedicated high-res face area.
# Usage: python3 tools/character-head/build_head.py tools/character-head/thai-male-source.glb assets/characters/thai-male.glb
# Needs numpy and Pillow. thai-male-source.glb is the original body with the old flat head; the output replaces
# its head with a sculpted one (nose, brows, cheekbones, lips, eyeballs, ears) and a 1024px atlas whose top
# part is the painted face (paint_face.py). The body keeps its UVs, moved into the lower half of the atlas.
import json, struct, sys, io, math
import numpy as np
from PIL import Image, ImageFilter

SRC, DST = sys.argv[1], sys.argv[2]
raw = open(SRC, 'rb').read()
JL = struct.unpack('<I', raw[12:16])[0]
gl = json.loads(raw[20:20 + JL])
BIN0 = 20 + JL + 8
BINLEN = struct.unpack('<I', raw[20 + JL:24 + JL])[0]
binbuf = raw[BIN0:BIN0 + BINLEN]

def acc(i):
    a = gl['accessors'][i]; bv = gl['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    arr = np.frombuffer(binbuf, dtype=dt, count=a['count'] * n, offset=off).copy()
    return arr.reshape(a['count'], n) if n > 1 else arr

prim = gl['meshes'][0]['primitives'][0]; A = prim['attributes']
P = acc(A['POSITION']).astype(np.float64); N = acc(A['NORMAL']).astype(np.float64); UV = acc(A['TEXCOORD_0']).astype(np.float64)
T = acc(A['TANGENT']).astype(np.float64); J = acc(A['JOINTS_0']).astype(np.int64); W = acc(A['WEIGHTS_0']).astype(np.float64)
I = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
imgs = []
for im in gl['images']:
    bv = gl['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    imgs.append(Image.open(io.BytesIO(binbuf[o:o + bv['byteLength']])).convert('RGB'))
base_img, nrm_img, orm_img = imgs[0], imgs[1], imgs[2]

Y_BOT, Y_TOP = 1.511, 1.75
HEAD_V = 0.40            # head region occupies v in [0, HEAD_V] of the new atlas
NJ = 25

# ---------- original head rings -> base surface R(theta, y) ----------
ringy = np.unique(np.round(P[P[:, 1] > Y_BOT - .004][:, 1], 3))
ringy = ringy[ringy >= Y_BOT - .001]
rings = []
for y in ringy:
    m = np.where(np.abs(P[:, 1] - y) < .002)[0]
    th = np.arctan2(P[m, 0], P[m, 2]); r = np.hypot(P[m, 0], P[m, 2])
    o = np.argsort(th); th, r, m = th[o], r[o], m[o]
    keep = np.concatenate([[True], np.diff(th) > 1e-4]); rings.append((y, th[keep], r[keep], m[keep]))
ring_ys = np.array([r[0] for r in rings])

def ring_r(k, th):
    _, tt, rr, _ = rings[k]
    if rr.max() < 1e-3: return np.zeros_like(th)
    tt2 = np.concatenate([tt - 2 * np.pi, tt, tt + 2 * np.pi]); rr2 = np.concatenate([rr, rr, rr])
    # Catmull-Rom over the periodic samples
    i = np.searchsorted(tt2, th) - 1; t = (th - tt2[i]) / (tt2[i + 1] - tt2[i])
    p0, p1, p2, p3 = rr2[i - 1], rr2[i], rr2[i + 1], rr2[i + 2]
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

def base_r(th, y):
    """Base head radius at angles th (array) for one height y (scalar) or per-element heights."""
    th = np.atleast_1d(np.asarray(th, float)); ys = np.broadcast_to(np.asarray(y, float), th.shape)
    out = np.zeros_like(th)
    for yy in np.unique(ys):
        m = ys == yy
        k = int(np.clip(np.searchsorted(ring_ys, yy) - 1, 0, len(ring_ys) - 2))
        t = (yy - ring_ys[k]) / (ring_ys[k + 1] - ring_ys[k])
        ks = [max(0, k - 1), k, k + 1, min(len(ring_ys) - 1, k + 2)]
        p0, p1, p2, p3 = [ring_r(q, th[m]) for q in ks]
        out[m] = .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    return out

# ---------- face sculpt (metres, + = outward) ----------
EYE_Y, EYE_X = 1.632, 0.034
def g(v, s): return np.exp(-.5 * (v / s) ** 2)
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def almond(x, y):
    """>0 inside the eye opening (soft), per side."""
    dx = (np.abs(x) - EYE_X); dy = y - EYE_Y - .0004 - .0010 * dx / .0124   # outer corner a touch higher
    hw = .0128; top = .0046 * (1 - (dx / hw) ** 2) + .0002; bot = .0033 * (1 - (dx / hw) ** 2)
    inside = (np.abs(dx) < hw) & (dy < top) & (dy > -bot)
    e = np.minimum.reduce([hw - np.abs(dx), top - dy, dy + bot])
    return np.where(inside, np.clip(e / .0012, 0, 1), 0.0)

def sculpt(x, y, front):
    """Reference: a lean, weathered Thai man in his forties: high cheekbones with hollows under them,
    a firm jaw, heavy low brows over hooded narrow eyes, a straight nose, thin lips set a little down."""
    ax = np.abs(x); d = np.zeros_like(x)
    # nose: straight bridge -> defined tip, then the underside tucks in
    t = np.clip((1.638 - y) / (1.638 - 1.592), 0, 1)
    h = np.where(y >= 1.592, .0026 + .0158 * t ** 1.5, .0184 * np.exp(-((1.592 - y) / .0036) ** 2))
    s = .0050 + .0050 * t
    d += h * g(x, s)
    d += .0050 * g(ax - .0150, .0050) * g(y - 1.5915, .0040)          # alae
    # eye sockets, heavy upper-lid fold (hooded), lower lid
    ex = ax - EYE_X; ey = y - EYE_Y
    d -= .0060 * np.exp(-.5 * ((ex / .0175) ** 2 + (ey / .0115) ** 2))
    d += .0026 * g(ex, .0125) * g(ey - .0056, .0020)                   # hooded fold
    d += .0010 * g(ex, .011) * g(ey + .0050, .0016)                    # lower lid
    d -= .0010 * g(ex, .012) * g(ey + .0085, .0020)                    # tear trough
    # brow ridge, forehead, temples
    d += .0055 * g(y - 1.6455, .0055) * smooth(.064, .040, ax)
    d += .0014 * g(y - 1.672, .016) * g(x, .035)
    d -= .0030 * g(ax - .062, .010) * g(y - 1.640, .014)
    # high cheekbones and the hollow under them; nasolabial fold; firm jaw and chin
    d += .0068 * g(ax - .049, .0125) * g(y - 1.6125, .0095)
    d -= .0034 * g(ax - .045, .011) * g(y - 1.581, .010)
    d -= .0022 * g(ax - (.017 + (1.592 - y) * .38), .0028) * smooth(1.560, 1.570, y) * smooth(1.594, 1.586, y)
    d += .0058 * g(y - 1.537, .0085) * g(x, .018)
    d -= .0018 * g(y - 1.5525, .0024) * g(x, .016)
    d += .0042 * g(ax - .046, .008) * g(y - 1.539, .010)
    # thin lips, mouth line with the corners a little down, philtrum
    d += .0030 * g(y - 1.5712, .0026) * g(x, .0165)
    d += .0034 * g(y - 1.5622, .0030) * g(x, .0150)
    d -= .0022 * g(y - (1.5665 - .0016 * (ax / .022) ** 2), .0010) * g(x, .0215)
    d -= .0010 * g(x, .0028) * smooth(1.570, 1.574, y) * smooth(1.586, 1.580, y)
    d -= .0018 * g(ax - .024, .0030) * g(y - 1.5650, .0030)            # mouth corners
    # eye opening: drop the surface behind the eyeball
    d -= .0105 * almond(x, y)
    return d * front

# ---------- grid ----------
rows = list(np.arange(1.5195, 1.6905, .0085)) + [1.700, 1.711, 1.722, 1.732, 1.741]
front = np.linspace(-80, 80, 37); back = np.linspace(80, 280, 13)[1:-1]
cols = np.radians(np.concatenate([front, back]))
cols = np.where(cols > np.pi, cols - 2 * np.pi, cols); cols = np.sort(cols)
cols = np.concatenate([[-np.pi], cols[np.abs(np.abs(cols) - np.pi) > 1e-6], [np.pi]])
print('rows', len(rows), 'cols', len(cols))

def vv(y): return HEAD_V * (Y_TOP - y) / (Y_TOP - Y_BOT)
def uu(th): return .5 + th / (2 * np.pi)

newP, newUV, newJW, newRole = [], [], [], []   # role: 0 skin, 1 boundary(copy normals), 2 eye, 3 ear
def weights_at(y):
    """Interpolate the original ring skin weights (dense 25-vector) at height y."""
    k = int(np.clip(np.searchsorted(ring_ys, y) - 1, 0, len(ring_ys) - 2)); t = np.clip((y - ring_ys[k]) / (ring_ys[k + 1] - ring_ys[k]), 0, 1)
    def dense(q):
        v = rings[q][3][0]; out = np.zeros(NJ)
        for a in range(4): out[J[v, a]] += W[v, a]
        return out
    return dense(k) * (1 - t) + dense(k + 1) * t

def addv(p, uv, w, role):
    newP.append(p); newUV.append(uv); newJW.append(w); newRole.append(role); return len(newP) - 1

tris = []
# row 0: the original boundary ring (positions/weights/normals copied)
_, th0, r0, m0 = rings[0]
th0 = np.concatenate([th0, [np.pi]]) if th0[0] > -np.pi + 1e-4 else th0
row0 = []
for k, th in enumerate(th0):
    v = rings[0][3][k % len(rings[0][3])]
    w = np.zeros(NJ)
    for a in range(4): w[J[v, a]] += W[v, a]
    row0.append(addv(P[v].copy(), (uu(th), vv(Y_BOT)), w, 1)); newRole[-1] = (1, v)
# make sure row0 spans -pi..pi with the seam duplicated
if th0[0] > -np.pi + 1e-4:
    v = rings[0][3][-1]; w = np.zeros(NJ)
    for a in range(4): w[J[v, a]] += W[v, a]
    row0.insert(0, addv(P[v].copy(), (uu(-np.pi), vv(Y_BOT)), w, 1)); newRole[-1] = (1, v); th0 = np.concatenate([[-np.pi], th0])

grid = []
for y in rows:
    r = base_r(cols, y); x = r * np.sin(cols)
    frontw = smooth(Y_BOT, Y_BOT + .012, y) * smooth(-.02, .03, r * np.cos(cols))
    r = r + sculpt(x, np.full_like(x, y), frontw)
    w = weights_at(y); row = []
    for th, rr in zip(cols, r):
        row.append(addv(np.array([rr * np.sin(th), y, rr * np.cos(th)]), (uu(th), vv(y)), w, 0))
    grid.append(row)
# pole
pw = weights_at(Y_TOP); poleY = Y_TOP
pole = [addv(np.array([0, poleY, -.0015]), (uu(th), 0.0), pw, 0) for th in cols]

def stitch(a, ta, b, tb):
    i = j = 0
    while i < len(a) - 1 or j < len(b) - 1:
        if j < len(b) - 1 and (i == len(a) - 1 or tb[j + 1] <= ta[i + 1]):
            tris.append((a[i], b[j + 1], b[j])); j += 1
        else:
            tris.append((a[i], a[i + 1], b[j])); i += 1
stitch(row0, list(th0), grid[0], list(cols))
for k in range(len(grid) - 1):
    a, b = grid[k], grid[k + 1]
    for i in range(len(cols) - 1):
        tris.append((a[i], a[i + 1], b[i])); tris.append((a[i + 1], b[i + 1], b[i]))
for i in range(len(cols) - 1):
    tris.append((grid[-1][i], grid[-1][i + 1], pole[i]))

# ---------- eyeballs ----------
def surf_z(x, y):
    th = np.arcsin(np.clip(x / .09, -1, 1)); r = base_r(np.array([th]), y)[0]
    for _ in range(3):
        th = np.arcsin(np.clip(x / r, -1, 1)); r = base_r(np.array([th]), y)[0]
    return r * np.cos(th)
EYE_R = .0118
EYE_PATCH = (0.42, 0.41, 0.07)   # u0, v0, size
for side in (1, -1):
    cx = side * EYE_X; zl = surf_z(cx, EYE_Y) + sculpt(np.array([cx]), np.array([EYE_Y]), 1)[0] + .0105  # lid level
    cz = zl - .0019 - EYE_R   # set back under the lids
    w = weights_at(EYE_Y); ring = []
    NS, NR = 12, 5
    tip = addv(np.array([cx, EYE_Y, cz + EYE_R]), (EYE_PATCH[0] + EYE_PATCH[2] / 2, EYE_PATCH[1] + EYE_PATCH[2] / 2), w, 2)
    prev = None
    for k in range(1, NR + 1):
        phi = k / NR * 1.75   # up to ~100 degrees from the front
        cur = []
        for s in range(NS + 1):
            psi = s / NS * 2 * np.pi
            p = np.array([cx + EYE_R * np.sin(phi) * np.cos(psi), EYE_Y + EYE_R * np.sin(phi) * np.sin(psi), cz + EYE_R * np.cos(phi)])
            rr = phi / 1.75 * .5
            cur.append(addv(p, (EYE_PATCH[0] + EYE_PATCH[2] * (.5 + rr * np.cos(psi)), EYE_PATCH[1] + EYE_PATCH[2] * (.5 - rr * np.sin(psi))), w, 2))
        if prev is None:
            for s in range(NS): tris.append((tip, cur[s], cur[s + 1]) if side > 0 else (tip, cur[s], cur[s + 1]))
        else:
            for s in range(NS): tris.append((prev[s], cur[s], cur[s + 1])); tris.append((prev[s], cur[s + 1], prev[s + 1]))
        prev = cur

# ---------- ears ----------
EAR_PATCH = (0.02, 0.41, 0.16, 0.08)   # u0, v0, w, h
EAR_Y, EAR_Z = 1.618, -.006
for side in (1, -1):
    hx = base_r(np.array([side * np.pi / 2]), EAR_Y)[0]
    w = weights_at(EAR_Y); NS, NR = 12, 4
    cen = np.array([side * (hx - .002), EAR_Y, EAR_Z])
    tilt = .22
    def ear_pt(a, rr):
        # shell: ellipse outline in (y, z), cupped outward (x) with a rolled rim
        ey, ez = .030 * rr * np.sin(a), .0175 * rr * np.cos(a)
        lobe = (np.sin(a) < -.4) * .004 * rr
        ey -= lobe
        out = .0095 * (np.sqrt(max(0, 1 - rr * rr)) * .35 + rr ** 3 * .9) + .0025
        if rr < .55: out -= .004 * (1 - rr / .55)        # concha hollow
        yy = ey * np.cos(tilt) - ez * np.sin(tilt); zz = ey * np.sin(tilt) + ez * np.cos(tilt)
        return cen + np.array([side * out, yy, zz - .004])
    rows_e = []
    for k in range(NR + 1):
        rr = k / NR; row = []
        for s in range(NS + 1):
            a = s / NS * 2 * np.pi; p = ear_pt(a, max(rr, 1e-3))
            row.append(addv(p, (EAR_PATCH[0] + EAR_PATCH[2] * (.5 + .48 * rr * np.cos(a)), EAR_PATCH[1] + EAR_PATCH[3] * (.5 - .48 * rr * np.sin(a))), w, 3))
        rows_e.append(row)
    # back rim: close the shell toward the head
    back = [addv(cen + np.array([-side * .004, .028 * np.sin(s / NS * 2 * np.pi) * .9, .016 * np.cos(s / NS * 2 * np.pi) * .9 - .004]),
                 (EAR_PATCH[0] + EAR_PATCH[2] * (.5 + .49 * np.cos(s / NS * 2 * np.pi)), EAR_PATCH[1] + EAR_PATCH[3] * (.5 - .49 * np.sin(s / NS * 2 * np.pi))), w, 3) for s in range(NS + 1)]
    rows_e.append(back)
    for k in range(len(rows_e) - 1):
        a, b = rows_e[k], rows_e[k + 1]
        for s in range(NS):
            t1, t2 = (a[s], b[s], b[s + 1]), (a[s], b[s + 1], a[s + 1])
            if side < 0: t1, t2 = t1[::-1], t2[::-1]
            tris.append(t1); tris.append(t2)

newP = np.array(newP); newUV = np.array(newUV); tris = np.array(tris)
# Orientation: make every head/ear triangle face outward from the head centre, eyes from the eye centre.
cent = np.array([0, 1.62, -.005])
for k, (a, b, c) in enumerate(tris):
    n = np.cross(newP[b] - newP[a], newP[c] - newP[a]); m = (newP[a] + newP[b] + newP[c]) / 3
    role = newRole[a] if isinstance(newRole[a], int) else 1
    if role == 2: ref = m - np.array([np.sign(m[0]) * EYE_X, EYE_Y, m[2] - .01])
    else: ref = m - cent
    if np.dot(n, ref) < 0: tris[k] = (a, c, b)
# glTF uses counter-clockwise front faces; the original mesh decides the convention: check one body triangle.
a, b, c = I[0]; on = np.cross(P[b] - P[a], P[c] - P[a]); flip = np.dot(on, N[a]) < 0
if flip: tris = tris[:, ::-1]

# normals
nn = np.zeros_like(newP)
for a, b, c in tris:
    n = np.cross(newP[b] - newP[a], newP[c] - newP[a])
    if flip: n = -n
    nn[a] += n; nn[b] += n; nn[c] += n
# weld normals across UV seams (same position)
key = {}
for i, p in enumerate(newP):
    k = tuple(np.round(p, 5)); key.setdefault(k, []).append(i)
for ids in key.values():
    if len(ids) > 1: s = nn[ids].sum(0); nn[ids] = s
nn /= np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12
for i, r in enumerate(newRole):
    if not isinstance(r, int): nn[i] = N[r[1]]

# ---------- assemble the mesh ----------
headset = P[:, 1] > Y_BOT + .002
keep_tris = I[~(headset[I] | (np.abs(P[I][:, :, 1] - Y_BOT) < .002)).all(1)]
# keep only triangles that are not entirely within the head (ring Y_BOT counts as head for this test)
inhead = (P[:, 1] >= Y_BOT - .001)
keep_tris = I[~inhead[I].all(1)]
used = np.unique(keep_tris)
remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
P2, N2, UV2, T2, J2, W2 = P[used], N[used], UV[used], T[used], J[used], W[used]
UV2 = np.stack([UV2[:, 0], .5 + .5 * UV2[:, 1]], 1)
off = len(used)
Jn = np.zeros((len(newP), 4), int); Wn = np.zeros((len(newP), 4))
for i, w in enumerate(newJW):
    o = np.argsort(-w)[:4]; Jn[i] = o; Wn[i] = w[o] / w[o].sum()
# tangents from UV (u increases with theta)
Tn = np.zeros((len(newP), 4)); Tn[:, 3] = 1
for i, p in enumerate(newP):
    tx = np.array([np.cos(np.arctan2(p[0], p[2])), 0, -np.sin(np.arctan2(p[0], p[2]))])
    tx = tx - nn[i] * np.dot(tx, nn[i]); tx /= np.linalg.norm(tx) + 1e-9; Tn[i, :3] = tx
Pall = np.vstack([P2, newP]).astype(np.float32); Nall = np.vstack([N2, nn]).astype(np.float32)
UVall = np.vstack([UV2, newUV]).astype(np.float32); Tall = np.vstack([T2, Tn]).astype(np.float32)
Jall = np.vstack([J2, Jn]).astype(np.uint8); Wall = np.vstack([W2, Wn]).astype(np.float32)
Iall = np.vstack([remap[keep_tris], tris + off]).astype(np.uint16 if len(Pall) < 65536 else np.uint32)
print('verts', len(P), '->', len(Pall), 'tris', len(I), '->', len(Iall), '(head', len(tris), ')')

# ---------- textures ----------
S = 1024
def body_layer(img, size=S):
    out = Image.new('RGB', (size, size)); out.paste(img.resize((size, size // 2), Image.LANCZOS), (0, size // 2)); return out
sys.path.insert(0, __import__('os').path.dirname(__file__)); from paint_face import paint
ring0_u = (rings[0][1], UV[rings[0][3], 0])
base_new, orm_new, nrm_new = paint(S, HEAD_V, Y_TOP, Y_BOT, base_r, sculpt, almond, EYE_X, EYE_Y, EYE_PATCH, EAR_PATCH,
                                   body_layer(base_img), body_layer(orm_img), body_layer(nrm_img), base_img, ring0_u)

# ---------- write GLB ----------
def jpg(im, q=90): b = io.BytesIO(); im.save(b, 'JPEG', quality=q); return b.getvalue()
blobs = [Pall.tobytes(), Nall.tobytes(), UVall.tobytes(), Tall.tobytes(), Jall.tobytes(), Wall.tobytes(), Iall.tobytes()]
pngs = [jpg(base_new), jpg(nrm_new, 92), jpg(orm_new, 92)]
# rebuild buffer: keep non-mesh views (inverse bind matrices etc) by copying them, replace mesh attribute views + images
old_views = gl['bufferViews']; new_bin = bytearray(); new_views = []
def put(data, target=None):
    while len(new_bin) % 4: new_bin.append(0)
    v = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(data)}
    if target: v['target'] = target
    new_bin.extend(data); new_views.append(v); return len(new_views) - 1
mesh_acc = {A['POSITION']: 0, A['NORMAL']: 1, A['TEXCOORD_0']: 2, A['TANGENT']: 3, A['JOINTS_0']: 4, A['WEIGHTS_0']: 5, prim['indices']: 6}
img_views = {im['bufferView']: k for k, im in enumerate(gl['images'])}
view_map = {}
for ai, a in enumerate(gl['accessors']):
    if ai in mesh_acc:
        k = mesh_acc[ai]; arrs = [Pall, Nall, UVall, Tall, Jall, Wall, Iall]
        a['bufferView'] = put(blobs[k], 34963 if k == 6 else 34962); a['byteOffset'] = 0; a['count'] = int(len(arrs[k]) if k < 6 else Iall.size)
        if k == 6: a['componentType'] = 5123 if Iall.dtype == np.uint16 else 5125
        if k == 0: a['min'] = Pall.min(0).tolist(); a['max'] = Pall.max(0).tolist()
    else:
        ov = a['bufferView']
        if ov not in view_map:
            v = old_views[ov]; o = v.get('byteOffset', 0); view_map[ov] = put(binbuf[o:o + v['byteLength']], v.get('target'))
        a['bufferView'] = view_map[ov]
for k, im in enumerate(gl['images']):
    im['bufferView'] = put(pngs[k]); im['mimeType'] = 'image/jpeg'
gl['bufferViews'] = new_views
while len(new_bin) % 4: new_bin.append(0)
gl['buffers'] = [{'byteLength': len(new_bin)}]
js = json.dumps(gl, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(new_bin)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(new_bin)) + b'BIN\x00' + bytes(new_bin)
open(DST, 'wb').write(out)
print('wrote', DST, len(out), 'bytes')
