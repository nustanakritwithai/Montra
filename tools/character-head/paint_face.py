# Paint the head region (and ear / eye patches) of the new atlas. All features are placed in model
# space (x across, y up, metres) and match the sculpt in build_head.py.
import numpy as np
from PIL import Image, ImageFilter

def rgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255

def noise2(h, w, scale, seed):
    """Smooth value noise in [0,1] (bilinear upsample of a random grid)."""
    rng = np.random.default_rng(seed)
    gh, gw = max(2, int(h / scale) + 2), max(2, int(w / scale) + 2)
    g = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255

def paint(S, HEAD_V, Y_TOP, Y_BOT, base_r, sculpt, almond, EYE_X, EYE_Y, EYE_PATCH, EAR_PATCH,
          base_layer, orm_layer, nrm_layer, orig_base, ring0_u):
    base = np.asarray(base_layer, np.float32) / 255
    orm = np.asarray(orm_layer, np.float32) / 255
    nrm = np.asarray(nrm_layer, np.float32) / 255
    H = int(round(HEAD_V * S)); Wd = S
    v = (np.arange(H) + .5) / S; u = (np.arange(Wd) + .5) / S
    th = (u - .5) * 2 * np.pi
    ys = Y_TOP - v / HEAD_V * (Y_TOP - Y_BOT)
    TH, Y = np.meshgrid(th, ys)
    R = np.stack([base_r(th, y) for y in ys])
    X = R * np.sin(TH); Z = R * np.cos(TH); front = np.clip(Z / .05, 0, 1)
    AX = np.abs(X); ATH = np.degrees(np.abs(TH))
    def g(a, s): return np.exp(-.5 * (a / s) ** 2)
    def sm(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

    skin = rgb('#94653f')
    col = np.ones((H, Wd, 3), np.float32) * skin
    lo = noise2(H, Wd, 40, 1)[..., None]; hi = noise2(H, Wd, 2.2, 2)[..., None]; mid = noise2(H, Wd, 9, 3)[..., None]
    col *= (.965 + .07 * lo) * (.985 + .03 * hi)
    # warm zones: cheeks, nose, ears region, lips handled below
    warm = (.55 * g(AX - .046, .014) * g(Y - 1.600, .012) + .6 * g(X, .008) * g(Y - 1.597, .007)) * front
    col += warm[..., None] * np.array([.025, -.008, -.012])
    # forehead a touch lighter, under-jaw and neck darker toward the seam
    col *= (1 + .03 * g(Y - 1.668, .012) * front)[..., None]
    col *= (1 - .10 * sm(1.545, 1.515, Y) * (1 - .6 * front))[..., None]
    # stubble shadow on chin, jaw and upper lip (not on the lips)
    beard = (sm(1.590, 1.575, Y) * sm(.075, .055, AX) * sm(1.515, 1.528, Y)) * front
    lipmask = g(X / 1.25, .016) * (g(Y - 1.5715, .0034) + g(Y - 1.5615, .0036))
    beard *= np.clip(1 - 1.6 * lipmask, 0, 1)
    beard = beard * (.6 + .4 * hi[..., 0])
    col = col * (1 - .10 * beard[..., None]) + .10 * beard[..., None] * rgb('#5d5551')

    ao = np.ones((H, Wd), np.float32)
    ex = AX - EYE_X; ey = Y - EYE_Y
    ao -= .20 * np.exp(-.5 * ((ex / .016) ** 2 + (ey / .010) ** 2)) * front          # socket
    ao -= .18 * g(ex + .011, .004) * g(ey, .005) * front                                # inner corner
    ao -= .22 * g(ey - .0068, .0011) * g(ex, .011) * front                               # lid crease
    ao -= .25 * g(AX - .0175, .0028) * g(Y - 1.5925, .004) * front                       # alar crease
    ao -= .20 * g(Y - 1.5545, .0022) * g(X, .016) * front                                # under the lower lip
    ao -= .25 * g(AX - .025, .0024) * g(Y - 1.5665, .0024) * front                       # mouth corners
    ao -= .15 * g(AX - (.018 + (1.592 - Y) * .35), .003) * sm(1.562, 1.570, Y) * sm(1.594, 1.586, Y) * front
    ao = np.clip(ao, .45, 1)
    col *= ao[..., None]

    # lips: upper with a soft cupid's bow, lower fuller; dark mouth line
    bow = .0012 * (1 - g(X, .004)) * g(X, .012)
    up = sm(1.5668, 1.5682, Y) * sm(1.5755 + bow, 1.5738 + bow, Y)
    lw = sm(1.5560, 1.5578, Y) * sm(1.5665, 1.5652, Y)
    width = np.clip(1 - (AX / .0225) ** 2, 0, 1) ** .6
    lip = np.clip((up * .9 + lw) * width, 0, 1) * front
    lipc = rgb('#6e4234') * (1 + .06 * (lw > up)[..., None])
    col = col * (1 - .45 * lip[..., None]) + .45 * lip[..., None] * lipc * (.92 + .1 * hi)
    line = g(Y - (1.5666 - .0005 * g(X, .006)), .00055) * sm(.026, .021, AX) * front
    col = col * (1 - .75 * line[..., None]) + .75 * line[..., None] * rgb('#3e2420')
    # nostrils
    nos = np.exp(-.5 * (((AX - .0075) / .0032) ** 2 + ((Y - 1.5898) / .0016) ** 2)) * front
    col = col * (1 - .85 * nos[..., None]) + .85 * nos[..., None] * rgb('#3a221c')

    # weathered: deeper nasolabial line, under-eye shadow, faint forehead lines, sun warmth on nose/cheeks
    nl = g(AX - (.017 + (1.592 - Y) * .38), .0022) * sm(1.560, 1.570, Y) * sm(1.594, 1.586, Y) * front
    col *= (1 - .16 * nl)[..., None]
    col *= (1 - .10 * sm(.035, .065, AX) * front)[..., None]
    col *= (1 - .08 * g(AX - .045, .011) * g(Y - 1.581, .010) * front)[..., None]
    col *= (1 - .10 * g(AX - EYE_X, .010) * g(Y - EYE_Y + .0085, .0028) * front)[..., None]
    lines = (np.sin((Y - 1.668) * 2 * np.pi / .0055) > .85) * g(Y - 1.670, .008) * g(X, .03) * front
    col *= (1 - .05 * lines)[..., None]
    col += (g(AX - .048, .016) * g(Y - 1.605, .012) * front)[..., None] * np.array([.015, .0, -.01])
    # facial hair (salt and pepper): thin moustache, chin beard and soul patch, stubble along the jaw
    fine = np.asarray(Image.fromarray((noise2(H // 3 + 2, Wd, 1.0, 31) * 255).astype(np.uint8)).resize((Wd, H), Image.BICUBIC), np.float32) / 255  # hair-like vertical strokes
    grey = np.clip((noise2(H, Wd, 1.6, 33) - .70) / .12, 0, 1) * .6
    must = sm(1.5755, 1.5775, Y) * sm(1.5845, 1.5815, Y) * sm(.0235, .019, AX) * (1 - .55 * g(X, .0025))
    mdown = sm(.0185, .0215, AX) * sm(.0245, .0215, AX) * sm(1.5595, 1.5640, Y) * sm(1.5800, 1.5770, Y)
    goatee = sm(1.5300, 1.5340, Y) * sm(1.5560, 1.5535, Y) * sm(.0190 + (1.556 - Y) * .15, .0130, AX)
    soul = g(X, .0035) * sm(1.5480, 1.5500, Y) * sm(1.5570, 1.5555, Y)
    beardm = np.clip(must + .8 * mdown + goatee + soul, 0, 1) * front * (.70 + .35 * fine)
    hairc_f = rgb('#1b1513') * (1 - grey[..., None]) + rgb('#5f5752') * grey[..., None]
    col = col * (1 - .85 * np.clip(beardm, 0, 1)[..., None]) + .85 * np.clip(beardm, 0, 1)[..., None] * hairc_f
    stub = sm(1.592, 1.578, Y) * sm(.078, .060, AX) * sm(1.516, 1.530, Y) * (1 - np.clip(beardm * 2, 0, 1)) * (1 - lipmask) * front
    col = col * (1 - .16 * stub[..., None] * fine[..., None]) + .16 * stub[..., None] * fine[..., None] * rgb('#2d2624')
    by = 1.6448 + .0006 * np.clip((AX - .012) / .03, 0, 1) - .0016 * np.clip((AX - .044) / .014, 0, 1) ** 2
    thick = .0052 - .0018 * np.clip((AX - .014) / .042, 0, 1)
    strands = noise2(H, Wd, 1.1, 7)
    stretch = np.asarray(Image.fromarray((noise2(H // 2 + 1, Wd, 1.0, 9) * 255).astype(np.uint8)).resize((Wd * 1, H), Image.BICUBIC), np.float32) / 255
    brow = sm(thick, thick * .5, np.abs(Y - by)) * sm(.0095, .0135, AX) * sm(.061, .053, AX) * front
    brow = np.clip(brow * (.55 + .7 * stretch), 0, 1)
    col = col * (1 - .92 * brow[..., None]) + .92 * brow[..., None] * rgb('#161010')

    # lash lines round the opening and the inner-corner caruncle; inside the opening (hidden) stays dark
    alm = almond(X, Y)
    near = np.zeros_like(alm)
    for dy in (.0008, .0014):
        near = np.maximum(near, almond(X, Y - dy))
    upper = np.clip(near - alm, 0, 1) * front
    lower = np.clip(almond(X, Y + .0007) - alm, 0, 1) * front
    col = col * (1 - .9 * upper[..., None]) + .9 * upper[..., None] * rgb('#1c1210')
    col = col * (1 - .45 * lower[..., None]) + .45 * lower[..., None] * rgb('#4a2f28')
    car = g(ex + .0125, .0016) * g(ey, .0016) * front
    col = col * (1 - .6 * car[..., None]) + .6 * car[..., None] * rgb('#b06a62')
    col = np.where(alm[..., None] > .5, rgb('#2a1a16'), col)

    # hair with a natural hairline (slight M, temples, sideburns, above the ears, nape)
    pts = np.array([(0, 1.690), (22, 1.692), (38, 1.701), (52, 1.693), (64, 1.668), (74, 1.624), (84, 1.614),
                    (90, 1.651), (106, 1.654), (118, 1.605), (140, 1.566), (180, 1.560)])
    yh = np.interp(ATH, pts[:, 0], pts[:, 1])
    edge = noise2(H, Wd, 3, 11)
    hair = sm(yh - .0012, yh + .0042 + .002 * edge, Y)
    streak = np.asarray(Image.fromarray((noise2(H, Wd // 3 + 1, 1.2, 13) * 255).astype(np.uint8)).resize((Wd, H), Image.BICUBIC), np.float32) / 255
    # swept back: strands run front-to-back, so the streak noise is stretched along v (height)
    sweep = np.asarray(Image.fromarray((noise2(H // 6 + 2, Wd, 1.0, 17) * 255).astype(np.uint8)).resize((Wd, H), Image.BICUBIC), np.float32) / 255
    hairc = rgb('#151112') * (.75 + .6 * sweep[..., None]) + rgb('#3a3434') * .35 * (sweep[..., None] > .72)
    streakg = g(np.degrees(TH) + 52, 12) * sm(1.640, 1.665, Y)            # his right temple, combed back
    hairc = hairc * (1 - .8 * streakg[..., None] * sweep[..., None]) + .8 * streakg[..., None] * sweep[..., None] * rgb('#b8b2ac')
    scalp = sm(yh - .004, yh + .001, Y) * (1 - hair)
    col = col * (1 - .25 * scalp[..., None])
    col = col * (1 - hair[..., None]) + hair[..., None] * hairc

    # seam: blend into the original neck colour along the bottom row
    th0, u0 = ring0_u
    o = np.argsort(th0); u_of_th = np.interp(th, th0[o], u0[o], period=2 * np.pi)
    ob = np.asarray(orig_base, np.float32) / 255
    rowv = int(.174 * ob.shape[0])
    neck = ob[rowv, np.clip((u_of_th * ob.shape[1]).astype(int), 0, ob.shape[1] - 1)]
    sb = sm(Y_BOT + .010, Y_BOT + .001, Y)[..., None]
    col = col * (1 - sb) + sb * neck[None, :, :]

    base[:H] = np.clip(col, 0, 1)
    # The old atlas has a near-black seam line between its head band and the body (old v .145-.165), which
    # falls on the top of the neck. Replace those rows with the clean neck skin just below, slightly
    # shaded under the jaw (body half of the atlas: v' = .5 + .5 v).
    r0, r1, rs = int((.5 + .5 * .138) * S), int((.5 + .5 * .168) * S), int((.5 + .5 * .174) * S)
    shade = np.linspace(.88, 1, r1 - r0)[:, None, None]
    row = base[rs - 2:rs + 3].mean(0)
    k = np.ones(15) / 15; row = np.stack([np.convolve(np.pad(row[:, c], 7, mode='wrap'), k, 'valid') for c in range(3)], 1)
    base[r0:r1] = row[None, :, :] * shade
    # feather the copied band into the original neck below it
    fb = int(.012 * S); t = np.linspace(1, 0, fb)[:, None, None]
    base[r1:r1 + fb] = base[r1:r1 + fb] * (1 - t * .6) + row[None] * shade[-1] * t * .6
    # ORM: occlusion (baked lightly), roughness by zone, no metal
    rough = np.full((H, Wd), .56, np.float32)
    rough -= .10 * g(X, .010) * g(Y - 1.598, .010) * front    # nose tip
    rough -= .06 * g(Y - 1.665, .015) * front                  # forehead sheen
    rough = rough * (1 - lip) + .50 * lip
    rough = rough * (1 - hair) + .72 * hair
    orm[:H, :, 0] = np.clip(.75 + .25 * ao, 0, 1); orm[:H, :, 1] = rough; orm[:H, :, 2] = 0
    nrm[:H] = np.array([.5, .5, 1.0])
    # fine pores/brow strands in the normal map (subtle)
    hy = (hi[..., 0] - .5) * .05
    nrm[:H, :, 0] += hy; nrm[:H, :, 1] += (mid[..., 0] - .5) * .03
    nrm[:H, :, 0] += (stretch - .5) * .12 * brow

    # ---- eye patch ----
    u0e, v0e, sz = EYE_PATCH
    px0, py0, n = int(u0e * S), int(v0e * S), int(sz * S)
    yy, xx = np.mgrid[0:n, 0:n] + .5
    cx = (xx / n - .5); cy = (yy / n - .5); rr = np.hypot(cx, cy); ang = np.arctan2(cy, cx)
    sclera = rgb('#968979') * (1 - .45 * np.clip((rr - .18) / .3, 0, 1))[..., None] * (1 - .30 * np.clip(-cy / .25, 0, 1))[..., None]
    pink = (np.abs(np.cos(ang)) > .8) * np.clip((rr - .18) / .2, 0, 1)
    sclera = sclera * (1 - .25 * pink[..., None]) + .25 * pink[..., None] * rgb('#c98a80')
    rad = noise2(n, 64, 1.0, 21)
    radial = rad[np.clip((rr * 2 * (n - 1)).astype(int), 0, n - 1), ((ang + np.pi) / (2 * np.pi) * 63).astype(int)]
    iris_r = .225
    iris = rgb('#2b1a11') * (.75 + .5 * radial[..., None]) * (1 - .45 * np.clip((rr - iris_r * .8) / (iris_r * .2), 0, 1))[..., None]
    e = sclera.copy()
    e = np.where((rr < iris_r)[..., None], iris, e)
    e = np.where((rr < .08)[..., None], rgb('#0b0706'), e)
    base[py0:py0 + n, px0:px0 + n] = e
    orm[py0:py0 + n, px0:px0 + n] = np.array([1, .10, 0])
    nrm[py0:py0 + n, px0:px0 + n] = np.array([.5, .5, 1])

    # ---- ear patch ----
    u0a, v0a, wa, ha = EAR_PATCH
    ex0, ey0, ew, eh = int(u0a * S), int(v0a * S), int(wa * S), int(ha * S)
    yy, xx = np.mgrid[0:eh, 0:ew] + .5
    ax_ = (xx / ew - .5) / .48; ay_ = -(yy / eh - .5) / .48; rr = np.hypot(ax_, ay_)
    ear = np.ones((eh, ew, 3)) * skin * rgb('#ffffff')
    ear = ear * (1 + np.array([.06, -.01, -.02]) * np.clip(rr, 0, 1)[..., None])
    ear *= (1 - .38 * np.clip((.6 - rr) / .45, 0, 1))[..., None]
    ear *= (1 - .45 * g(rr - .12, .06))[..., None]
    ear *= (1 - .18 * g(rr - .72, .05))[..., None]
    base[ey0:ey0 + eh, ex0:ex0 + ew] = ear
    orm[ey0:ey0 + eh, ex0:ex0 + ew] = np.array([.9, .52, 0])
    nrm[ey0:ey0 + eh, ex0:ex0 + ew] = np.array([.5, .5, 1])

    def im(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return im(base), im(orm), im(nrm)
