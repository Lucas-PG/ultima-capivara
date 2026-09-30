"""Texel-space painting of the v6 character (numpy, no bpy).

Inputs are maps baked from the dense sculpt into the game UVs: position (game space), object
normal, tangent-space normal and occlusion. Materials come from the SDF at each texel's
position, so borders (a vest hem, the scarf edge, a claw) are exact at texture resolution.
Each material paints colour, roughness, metal and a small height field (fur strands and
clumps, linen weave with a faint check, denim twill, trouser canvas, leather grain, stitch
rows); the height's texel gradient becomes tangent-space relief added to the baked normal.
"""
import math
import numpy as np
import capy_sdf as S
import capybara_form as C

F = np.float32
M = C.M


def srgb(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], F)
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4).astype(F)


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * np.asarray(t, F)[..., None]


def materials_at(root, p, log):
    """SDF material at each point, evaluated in spatially coherent chunks (for culling)."""
    key = np.floor(p / .09).astype(np.int64)
    order = np.lexsort((key[:, 2], key[:, 1], key[:, 0]))
    mat = np.empty(len(p), np.int16)
    for s in range(0, len(p), 32768):
        idx = order[s:s + 32768]
        q = p[idx]
        _, mat[idx] = root.dm(q, q.min(0), q.max(0))
    return mat


def fur_flow(p, n):
    """Direction the fur lies in (tangent to the surface): back over the head, down the body and
    limbs, toward the paws on the arms, out along the cheeks."""
    y = p[:, 1]
    g = np.zeros_like(p); g[:, 1] = -1
    head = ss(1.44, 1.52, y)
    hg = np.stack([np.sign(p[:, 0]) * .25, np.full(len(p), .35, F), np.ones(len(p), F)], 1)
    g = lerp(g, hg, head)
    for s in (-1, 1):
        el, wr = C.elbow(s), C.wrist(s)
        arm = ss(.18, .10, np.linalg.norm(np.cross(p - el, (wr - el) / np.linalg.norm(wr - el)), axis=1)) * (s * p[:, 0] > .2)
        g = lerp(g, np.broadcast_to((wr - el) / np.linalg.norm(wr - el), p.shape), arm * (y < 1.3))
    g = g - n * np.einsum('ij,ij->i', g, n)[:, None]
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-6)


def aniso(p, f, across, along, seed):
    """Noise stretched along the flow f (fibres)."""
    a = np.einsum('ij,ij->i', p, f)[:, None]
    q = p / across + a * f * (1 / along - 1 / across)
    return S.value_noise(q.astype(F), seed)


def paint(root, P_map, N_obj, N_tan, AO, eye_texels, covered, log=print):
    H, W = covered.shape
    idx = np.flatnonzero(covered.ravel())
    p = P_map.reshape(-1, 3)[idx].astype(F)
    n = N_obj.reshape(-1, 3)[idx].astype(F); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    eye = eye_texels.ravel()[idx]
    mat = materials_at(root, p, log)
    mat[eye] = M['eye']
    log('texel materials', len(p))
    col = np.zeros((len(p), 3), F); rough = np.full(len(p), .8, F); metal = np.zeros(len(p), F); hgt = np.zeros(len(p), F)
    team = np.isin(mat, [M[k] for k in C.TEAM]).astype(F)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    broad = S.fbm(p * 7, 3, seed=31)
    # ------------------------------------------------------------------ fur (body, head, limbs)
    fur = np.isin(mat, [M['fur'], M['ear_in']])
    if fur.any():
        q, nq = p[fur], n[fur]
        f = fur_flow(q, nq)
        strand = aniso(q, f, .0011, .012, 1)
        clump = aniso(q, f, .006, .03, 2)
        tips = aniso(q, f, .0016, .004, 3)
        h = (clump - .5) * .00035 + (strand - .5) * .00028
        base, light, dark = srgb('A05A30'), srgb('C98A55'), srgb('5E3219')
        c = lerp(base, dark, np.clip((.5 - clump) * 1.4, 0, 1) * .8)
        c = lerp(c, light, np.clip(tips - .55, 0, 1) * 1.6 * (.4 + .6 * clump))
        c = c * (.90 + .20 * strand)[:, None]
        c = lerp(c, srgb('B7784A'), np.clip(-nq[:, 1], 0, 1) * .35 * (q[:, 1] < 1.45))  # lighter belly and undersides
        c = lerp(c, srgb('7C4526'), np.clip(nq[:, 1], 0, 1) * .25 * (q[:, 1] > 1.6))   # darker crown
        c = c * (.92 + .16 * broad[fur])[:, None]
        # Face: caramel muzzle, dark rhinarium, darker lip line, dark lid rims, brows.
        head = q[:, 1] > 1.45
        mz = ss(-.17, -.27, q[:, 2]) * ss(1.715, 1.655, q[:, 1]) * head
        mz = np.maximum(mz, ss(1.56, 1.50, q[:, 1]) * ss(-.12, -.20, q[:, 2]) * head * .8)
        c = lerp(c, lerp(srgb('B08C70'), srgb('8E705C'), strand * .6), mz * .9)
        nose = ss(.95, .55, np.hypot(q[:, 0] / .072, (q[:, 1] - 1.660) / .046)) * ss(-.27, -.302, q[:, 2])
        c = lerp(c, srgb('3F3431'), nose); h = h * (1 - nose) + nose * (S.cells(q * 900, 5) - .5) * -.0003
        mouth = np.array([[0, 1.556, -.336], [.036, 1.533, -.318], [.060, 1.537, -.288]], F)
        dl = np.full(len(q), 9.0, F)
        for sgn in (-1, 1):
            pts_m = mouth * np.array([sgn, 1, 1], F)
            for a, b in zip(pts_m[:-1], pts_m[1:]):
                ab = b - a; t = np.clip(((q - a) @ ab) / (ab @ ab), 0, 1)
                dl = np.minimum(dl, np.linalg.norm(q - (a + t[:, None] * ab), axis=1))
        lip = ss(.006, .0015, dl) * head
        c = lerp(c, srgb('33241F'), lip * .85)
        for s in (-1, 1):
            e, out = C.eye_point(s)
            de = np.linalg.norm(q - e, axis=1)
            rim = ss(C.EYE_R + .007, C.EYE_R + .002, de)
            c = lerp(c, srgb('2E1D16'), rim * .9)
            brow = ss(.028, .010, np.linalg.norm(q - (e + np.array([0, .028, .004], F)), axis=1))
            c = lerp(c, srgb('6A3A20'), brow * .45)
            # Whisker pores and a few dark whisker roots on the muzzle sides.
            wz = ss(-.24, -.30, q[:, 2]) * ss(.06, .09, s * q[:, 0]) * ss(1.63, 1.58, q[:, 1])
            pores = (S.cells(q * 260, 7 + s) < .16) * wz
            c = lerp(c, srgb('3A2A22'), pores * .8)
        ear = mat[fur] == M['ear_in']
        c[ear] = lerp(srgb('6E4838'), srgb('4E3228'), S.fbm(q[ear] * 300, 2, 9))
        # Paws and feet: dark leathery skin on the pads, fingertips and toes; fur on the backs.
        skin = np.zeros(len(q), F)
        for s in (-1, 1):
            loc = ((q - C.wrist(s)) @ C.paw_frame(s)) / C.PAW_SCALE
            on_paw = (loc[:, 1] > -.004) & (np.linalg.norm(loc, axis=1) < .16)
            under = (nq @ (C.paw_frame(s) @ np.array([0, 0, 1], F))) < .15
            skin = np.maximum(skin, (on_paw & (under | (loc[:, 1] > .088))).astype(F))
            foot = (np.abs(q[:, 0] - s * .132) < .12) & (q[:, 1] < .10)
            toes = foot & (q[:, 2] < -.10)
            skin = np.maximum(skin, toes.astype(F) * ss(.08, .05, q[:, 1]))
        grain = S.cells(q * 700, 11)
        sk = lerp(srgb('3F322D'), srgb('5E4C43'), np.clip((.55 - grain) * 1.6, 0, 1) * .6)
        c = lerp(c, sk, skin)
        h = h * (1 - skin) + skin * (.5 - np.clip(grain, 0, .8)) * .00035
        col[fur] = c; hgt[fur] = h
        rough[fur] = (.80 + .1 * strand) * (1 - nose * .45) * (1 - skin * .2)
    # ------------------------------------------------------------------ cloth and gear
    def weave(q, pitch, amp):
        u = S.value_noise(q * np.array([1 / pitch, 1 / (pitch * 6), 1 / pitch], F), 21)
        v = S.value_noise(q * np.array([1 / (pitch * 6), 1 / pitch, 1 / (pitch * 6)], F), 22)
        return (np.sin(q[:, 0] / pitch * math.pi) * np.sin(q[:, 1] / pitch * math.pi) * .5 + (u + v - 1) * .5) * amp

    def put(key, colour, r, h=None, vary=.1, m=0.0):
        sel = mat == M[key]
        if not sel.any():
            return sel
        q = p[sel]
        col[sel] = colour(q) if callable(colour) else srgb(colour) * (1 - vary / 2 + vary * S.fbm(q * 40, 3, seed=M[key]))[:, None]
        rough[sel] = r; metal[sel] = m
        if h is not None:
            hgt[sel] = h(q)
        return sel

    def shirt(q):
        check = (np.abs(((q[:, 0] + q[:, 2] * .3) / .014) % 1 - .5) < .06) | (np.abs((q[:, 1] / .014) % 1 - .5) < .06)
        base = srgb('E2D4BB') * (.93 + .1 * S.fbm(q * 55, 3, 41))[:, None]
        return lerp(base, srgb('B79F80'), check * .35)
    put('shirt', shirt, .9, lambda q: weave(q, .0012, .00018))

    def denim(q):
        tw = np.sin((q[:, 0] + q[:, 1]) / .0016 * math.pi)
        wear = S.fbm(q * 22, 3, 43)
        c = lerp(srgb('465A7E'), srgb('7F93B3'), np.clip((wear - .55) * 2.2, 0, 1))
        return c * (.9 + .1 * tw)[:, None]
    put('denim', denim, .82, lambda q: np.sin((q[:, 0] + q[:, 1]) / .0016 * math.pi) * .00016)

    def trouser(q):
        c = srgb('66643F') * (.9 + .16 * S.fbm(q * 30, 3, 44))[:, None]
        return lerp(c, srgb('8A8558'), np.clip(S.fbm(q * 9, 2, 45) - .6, 0, 1) * 1.5)
    put('trouser', trouser, .88, lambda q: weave(q, .0014, .00022))

    def leather(tone):
        def f(q):
            g = S.cells(q * 380, 46)
            c = srgb(tone) * (.85 + .25 * S.fbm(q * 25, 3, 47))[:, None]
            return lerp(c, srgb('2E1D13'), np.clip(.25 - g, 0, 1) * 1.5)
        return f
    put('leather', leather('6A4630'), .55, lambda q: (S.cells(q * 380, 46) - .5) * .0002)
    put('pack', leather('7B5334'), .6, lambda q: (S.cells(q * 300, 48) - .5) * .00025)
    put('strap', leather('5A3B26'), .55, lambda q: (S.cells(q * 380, 49) - .5) * .00015)
    put('canvas', lambda q: srgb('7E5E40') * (.85 + .2 * S.fbm(q * 60, 3, 50))[:, None], .85, lambda q: weave(q, .0016, .00025))
    put('brass', lambda q: srgb('C0924A') * (.8 + .3 * S.fbm(q * 80, 2, 51))[:, None], .38, m=.9)
    put('claw', lambda q: lerp(srgb('241C18'), srgb('4A3A30'), S.value_noise(q * np.array([900, 200, 900], F), 52) * .5), .28)
    put('sole', '2F2622', .75, lambda q: (S.cells(q * 500, 53) - .5) * .0003)
    # Team cloth: neutral grey (luminance .36) with folds and weave; the runtime tints it.
    tsel = team > .5
    if tsel.any():
        q = p[tsel]
        g = .36 * (.86 + .22 * S.fbm(q * 35, 3, 54)) * (1 + weave(q, .0013, .10))
        col[tsel] = np.repeat(np.clip(g, .1, .6)[:, None], 3, 1); rough[tsel] = .86
        hgt[tsel] = weave(q, .0013, .0002)
    # Eyes: glossy dark brown iris around a black pupil; very little white shows on a capybara.
    esel = mat == M['eye']
    if esel.any():
        q = p[esel]
        side = np.where(q[:, 0] > 0, 1, -1)
        c = np.zeros((len(q), 3), F)
        for s in (-1, 1):
            e, out = C.eye_point(s)
            k = side == s
            d = (q[k] - e); d /= np.linalg.norm(d, axis=1, keepdims=True)
            ang = np.arccos(np.clip(d @ out, -1, 1))
            streak = S.value_noise(np.stack([np.arctan2(d[:, 1], d[:, 2]) * 8, ang * 20, np.zeros(k.sum())], 1).astype(F), 55)
            ce = lerp(srgb('5A3A22'), srgb('2A1A10'), ss(.2, .55, ang) * .7 + streak * .3)
            ce = lerp(ce, srgb('080605'), ss(.30, .24, ang))
            ce = lerp(ce, srgb('3B2A22'), ss(.62, .80, ang))
            c[k] = ce
        col[esel] = c; rough[esel] = .05; hgt[esel] = 0
    # Edge wear and cavity from the baked occlusion; stitching rows where garments end.
    ao = AO.reshape(-1)[idx].astype(F)
    col *= (.62 + .38 * ao ** 1.3)[:, None]
    # ------------------------------------------------------------------ images
    def image(values, channels):
        out = np.zeros((H * W, channels), F); out[idx] = values.reshape(len(idx), channels)
        return out.reshape(H, W, channels)
    albedo = image(col, 3)
    height = image(hgt, 1)[..., 0]
    Pm = P_map.astype(F)
    du = np.linalg.norm(np.gradient(Pm, axis=1), axis=2); dv = np.linalg.norm(np.gradient(Pm, axis=0), axis=2)
    med = float(np.median(du[covered]))
    ok = covered & (du < med * 4) & (dv < med * 4) & (du > 1e-7) & (dv > 1e-7)
    gu = np.gradient(height, axis=1) / np.where(ok, du, 1); gv = np.gradient(height, axis=0) / np.where(ok, dv, 1)
    gu = np.where(ok, np.clip(gu, -2, 2), 0); gv = np.where(ok, np.clip(gv, -2, 2), 0)
    base = N_tan * 2 - 1
    detail = np.stack([-gu, -gv, np.ones_like(gu)], -1)
    detail /= np.linalg.norm(detail, axis=2, keepdims=True)
    # Whiteout blend of the baked sculpt normal and the painted relief.
    nb = np.stack([base[..., 0] + detail[..., 0], base[..., 1] + detail[..., 1], base[..., 2] * detail[..., 2]], -1)
    nb /= np.maximum(np.linalg.norm(nb, axis=2, keepdims=True), 1e-6)
    normal = np.where(covered[..., None], nb * .5 + .5, np.array([.5, .5, 1], F))
    orm = np.zeros((H, W, 3), F)
    orm[..., 0] = image(team, 1)[..., 0]
    orm[..., 1] = image(np.clip(rough, .04, 1), 1)[..., 0]
    orm[..., 2] = image(metal, 1)[..., 0]
    # Grow painted texels into the empty gutter so mips and filtering never pull in black.
    albedo, orm = _dilate(albedo, covered), _dilate(orm, covered)
    log('painted')
    return albedo, orm, normal.astype(F)


def _dilate(img, mask, rounds=8):
    img = img.copy(); m = mask.copy()
    for _ in range(rounds):
        acc = np.zeros_like(img); cnt = np.zeros(mask.shape, F)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1))
            acc += si * sm[..., None]; cnt += sm
        grow = (~m) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]; m = m | grow
    return img
