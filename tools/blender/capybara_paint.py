"""Texel-space painting of the v6 character (numpy, no bpy).

Inputs are maps baked from the dense sculpt into the game UVs: position (game space), object
normal, tangent-space normal and occlusion. Materials come from the SDF at each texel's
position, so borders (a vest hem, the scarf edge, a claw) are exact at texture resolution.
Each material paints colour, roughness, metal and a small height field; the height's texel
gradient becomes tangent-space relief added to the baked normal.

Fur is groomed, not noise: overlapping locks (an anisotropic cell pattern laid along a comb
field) with dark roots between them, lighter tips and fine strands inside each lock. Cloth
and leather get seams from a texel-space distance to the nearest other material (stitch rows
along every hem, pocket, flap and strap edge), a woven or grained surface and edge wear.
Texels are painted in chunks so a 4K atlas fits in memory.
"""
import math
import numpy as np
import capy_sdf as S
import capybara_form as C

F = np.float32
M = C.M
CHUNK = 1 << 20


def srgb(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], F)
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4).astype(F)


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * np.asarray(t, F)[..., None]


def _norm(a):
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-6)


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


# ------------------------------------------------------------------ fur grooming
NOSE_ORIGIN = C.v(0, 1.64, -.43)


def fur_flow(p, n):
    """Comb direction, tangent to the skin: back from the nose over the head and cheeks, down
    the neck, body and legs, from the elbow to the fingers on the arms, forward over the feet."""
    y = p[:, 1]
    g = np.zeros_like(p); g[:, 1] = -1
    radial = _norm(p - NOSE_ORIGIN)
    over = radial + np.stack([np.zeros(len(p), F), -.9 * ss(.02, .16, p[:, 2]), np.zeros(len(p), F)], 1)
    g = lerp(g, _norm(over), ss(1.45, 1.53, y))
    for s in (-1, 1):
        el, wr = C.elbow(s), C.wrist(s)
        ax = (wr - el) / np.linalg.norm(wr - el)
        arm = ss(.15, .09, np.linalg.norm(np.cross(p - el, ax), axis=1)) * (s * p[:, 0] > .2) * (y < 1.32)
        g = lerp(g, np.broadcast_to(ax, p.shape), arm)
        loc = (p - wr) @ C.paw_frame(s)
        paw = ss(.02, -.02, -loc[:, 1]) * (np.linalg.norm(p - wr, axis=1) < .2)
        g = lerp(g, np.broadcast_to(C.paw_frame(s)[:, 1], p.shape), paw)
    g = lerp(g, np.broadcast_to(C.v(0, -.35, -1), p.shape), ss(.15, .10, y))
    t = g - n * np.einsum('ij,ij->i', g, n)[:, None]
    length = np.linalg.norm(t, axis=1)
    # Where the comb runs into the skin (the snout tip, the crown), fall back to a sideways tangent.
    fb = np.cross(n, np.broadcast_to(C.v(1, 0, 0), n.shape)); fb = _norm(fb + np.cross(n, np.broadcast_to(C.v(0, 0, 1), n.shape)) * .3)
    t = lerp(t, fb, ss(.35, .05, length))
    return _norm(t).astype(F)


def locks(p, f, across, along, seed):
    """Anisotropic Worley cells laid along f: one cell per lock of fur. Returns the distance to
    the lock border (0 there), the position along the lock (-1 root to 1 tip) and a random
    value per lock."""
    a = np.einsum('ij,ij->i', p, f)
    q = (p / across + a[:, None] * f * (1 / along - 1 / across)).astype(F)
    i = np.floor(q).astype(np.int64)
    d1 = np.full(len(q), 9.0, F); d2 = np.full(len(q), 9.0, F)
    c1 = np.zeros_like(q); h1 = np.zeros(len(q), F)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                j = np.stack([S._hash(c[:, 0], c[:, 1], c[:, 2], seed + k) for k in range(3)], 1)
                fp = (c + .12 + .76 * j).astype(F)
                d = np.linalg.norm(fp - q, axis=1).astype(F)
                closer = d < d1
                d2 = np.where(closer, d1, np.minimum(d2, d))
                c1[closer] = fp[closer]
                h1 = np.where(closer, S._hash(c[:, 0], c[:, 1], c[:, 2], seed + 7), h1)
                d1 = np.where(closer, d, d1)
    t = np.einsum('ij,ij->i', q - c1, f)
    return (d2 - d1).astype(F), np.clip(t / .75, -1, 1).astype(F), h1.astype(F)


def aniso(p, f, across, along, seed):
    """Value noise stretched along the flow f (fibres)."""
    a = np.einsum('ij,ij->i', p, f)[:, None]
    q = p / across + a * f * (1 / along - 1 / across)
    return S.value_noise(q.astype(F), seed)


def groom(q, f, across, along, amp, seed):
    """Height and shading terms of groomed fur for points q along flow f."""
    edge, t, hid = locks(q, f, across, along, seed)
    tip = ss(-.8, .9, t)
    # Locks narrow to a point at the tip; strands run the length of each lock.
    ridge = ss(0, .55 - .30 * tip, edge)
    strand = .6 * aniso(q, f, across * .07, along * .35, seed + 11) + .4 * aniso(q, f, across * .16, along * .6, seed + 12)
    h = amp * (ridge * (.35 + .65 * tip) * (.7 + .3 * strand) + .35 * (strand - .5))
    return h, ridge, tip, strand, hid


# ------------------------------------------------------------------ edges (seams and hems)
def _edge_distance(grid, texel, reach):
    """Metres from each texel to the nearest texel of another material in the same island.
    Island borders (the uncovered gutter) are not edges."""
    cov = grid >= 0
    edge = np.zeros(grid.shape, bool)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        nb = np.roll(grid, (dy, dx), (0, 1))
        edge |= cov & (nb >= 0) & (nb != grid)
    steps = int(math.ceil(reach / max(float(np.median(texel[cov])), 1e-5))) + 1
    dist = np.where(edge, 0, steps + 1).astype(F)
    front, reached = edge, edge.copy()
    for k in range(1, steps + 1):
        grow = np.zeros_like(front)
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            grow |= np.roll(front, (dy, dx), (0, 1))
        grow &= cov & ~reached
        dist[grow] = k; reached |= grow; front = grow
    return np.minimum(dist * texel, reach)


def stitches(e, q, rows, pitch=.0042, width=.00055):
    """Stitch rows at distances `rows` (m) from an edge: returns the thread coverage [0, 1]."""
    along = S.value_noise(q * np.array([1 / pitch, 1 / pitch, 1 / pitch], F), 71)
    dash = ss(.30, .45, along) * ss(.95, .80, along)
    out = np.zeros(len(e), F)
    for r in rows:
        out = np.maximum(out, np.exp(-((e - r) / width) ** 2))
    return out * (.35 + .65 * dash)


# ------------------------------------------------------------------ the painter
class _Face:
    """Face landmarks, computed once: eyes, mouth, whisker roots and the muzzle SDF."""
    def __init__(self):
        self.eyes = [(s, *C.eye_point(s), C.eye_frame(s)) for s in (-1, 1)]
        self.mouth = [np.array(C.mouth_path(s), F) for s in (-1, 1)]
        head = C.head()
        pads = []
        for s in (-1, 1):
            for row, (y, zs) in enumerate(((1.612, (-.318, -.302, -.284)), (1.596, (-.322, -.305, -.287, -.270)), (1.580, (-.318, -.300, -.282)))):
                for z in zs:
                    x = .030 + (-.318 - z) * -1.6 + row * .004
                    pads.append((s * max(x, .028), y, z))
        self.whiskers = C.on_surface(head, np.array(pads, F))
        self.muzzle = S.Union([Ellipsoid for Ellipsoid in (
            S.Ellipsoid(C.side((.036, 1.584, -.296), -1), (.066, .058, .052)), S.Ellipsoid(C.side((.036, 1.584, -.296), 1), (.066, .058, .052)),
            S.Ellipsoid((0, 1.516, -.262), (.060, .036, .064)), S.Ellipsoid((0, 1.636, -.312), (.096, .050, .060)))], k=.02)
        self.nostrils = [C.side((.038, 1.646, -.350), s) for s in (-1, 1)]


def paint(root, P_map, N_obj, N_tan, AO, eye_texels, covered, log=print, P_low=None):
    H, W = covered.shape
    idx = np.flatnonzero(covered.ravel())
    p = P_map.reshape(-1, 3)[idx].astype(F)
    n = N_obj.reshape(-1, 3)[idx].astype(F); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    eye = eye_texels.ravel()[idx]
    mat = materials_at(root, p, log)
    if P_low is not None:
        # Where the decimated armhole bridges the crevice between vest and sleeve, projection rays
        # land on either garment from texel to texel: the game surface's own position decides.
        low = P_low.reshape(-1, 3)[idx].astype(F)
        armhole = np.isin(mat, [M['shirt'], M['denim']]) & (low[:, 1] > 1.08) & (low[:, 1] < 1.43) & (np.abs(low[:, 0]) > .145)
        mat[armhole] = materials_at(root, low[armhole], log)
        # Where the game surface bridges the crevice itself (far from the sculpt), the few texels
        # stretch across it: paint that bridge as the shadowed fold it stands for, without pattern.
        crevice = np.zeros(len(p), F)
        crevice[armhole] = ss(.003, .009, np.linalg.norm(p[armhole] - low[armhole], axis=1))
        p[armhole] = low[armhole]
    else:
        crevice = np.zeros(len(p), F)
    # The armpit stretches when the arms come up to a gun: keep it a plain shadowed fold there,
    # so the skinned stretch has no check, weave or stitch pattern to smear into streaks.
    cloth = np.isin(mat, [M['shirt'], M['denim']])
    for s in (-1, 1):
        d = np.linalg.norm((p - C.v(s * .222, 1.205, .005)) / np.array([1, 1.4, 1], F), axis=1)
        crevice = np.maximum(crevice, ss(.085, .045, d) * cloth)
    mat[eye] = M['eye']
    mat = _mode_filter(mat, idx, covered.shape, radius=max(2, W // 1400))
    log('texel materials', len(p))
    # Texel size (m) from the baked positions, for seams and relief.
    Pm = P_map.astype(F)
    du = np.linalg.norm(np.gradient(Pm, axis=1), axis=2); dv = np.linalg.norm(np.gradient(Pm, axis=0), axis=2)
    med = float(np.median(du[covered]))
    ok = covered & (du < med * 4) & (dv < med * 4) & (du > 1e-7) & (dv > 1e-7)
    texel = np.where(ok, np.sqrt(du * dv), med).astype(F)
    # UV stretch: the smaller of the forward and backward position steps between covered texels
    # (island borders do not count). Stretched cloth texels cannot hold weave or stitches.
    def step(axis):
        a = np.linalg.norm(np.diff(Pm, axis=axis), axis=2); va = np.logical_and(np.take(covered, range(1, covered.shape[axis]), axis), np.take(covered, range(covered.shape[axis] - 1), axis))
        a = np.where(va, a, np.inf); pad = [(0, 0), (0, 0)]; pad[axis] = (1, 0); fw = np.pad(a, pad, constant_values=np.inf)
        pad[axis] = (0, 1); bw = np.pad(a, pad, constant_values=np.inf)
        m = np.minimum(fw, bw); return np.where(np.isfinite(m), m, 0)
    stretch = np.maximum(step(0), step(1)).ravel()[idx] / med
    cloth_ids = [M[k] for k in ('shirt', 'denim', 'denim_pocket', 'trouser', 'trouser_pocket')]
    crevice = np.maximum(crevice, ss(2.5, 5.0, stretch) * np.isin(mat, cloth_ids)); del stretch
    grid = np.full(H * W, -1, np.int16); grid[idx] = mat; grid = grid.reshape(H, W)
    edge = _edge_distance(grid, texel, .012).ravel()[idx]
    del grid
    log('edges')
    face = _Face()
    ao = AO.reshape(-1)[idx].astype(F)
    col = np.zeros((len(p), 3), F); rough = np.full(len(p), .8, F); metal = np.zeros(len(p), F); hgt = np.zeros(len(p), F)
    for s0 in range(0, len(p), CHUNK):
        sl = slice(s0, s0 + CHUNK)
        col[sl], rough[sl], metal[sl], hgt[sl] = _paint_texels(p[sl], n[sl], mat[sl], edge[sl], ao[sl], face)
        log('painted', min(s0 + CHUNK, len(p)), 'of', len(p))
    fold = np.select([np.isin(mat, [M['denim'], M['denim_pocket']])[:, None], np.isin(mat, [M['trouser'], M['trouser_pocket']])[:, None]],
                     [srgb('2C3850'), srgb('4A4930')], srgb('8A7F6C')) * (.75 + .25 * ao)[:, None]
    col = lerp(col, fold, crevice * .9); del fold
    hgt *= 1 - crevice
    team = np.isin(mat, [M[k] for k in C.TEAM]).astype(F)
    del p, n, edge

    def image(values, channels):
        out = np.zeros((H * W, channels), F); out[idx] = values.reshape(len(idx), channels)
        return out.reshape(H, W, channels)
    albedo = image(col, 3); del col
    height = image(hgt, 1)[..., 0]; del hgt
    gu = np.gradient(height, axis=1) / np.where(ok, du, 1); gv = np.gradient(height, axis=0) / np.where(ok, dv, 1)
    del height, du, dv, Pm
    gu = np.where(ok, np.clip(gu, -2, 2), 0); gv = np.where(ok, np.clip(gv, -2, 2), 0)
    base = N_tan * 2 - 1
    flat = image(crevice, 1)
    base = base * (1 - flat) + np.array([0, 0, 1], F) * flat; del flat
    detail = np.stack([-gu, -gv, np.ones_like(gu)], -1); del gu, gv
    detail /= np.linalg.norm(detail, axis=2, keepdims=True)
    # Whiteout blend of the baked sculpt normal and the painted relief.
    nb = np.stack([base[..., 0] + detail[..., 0], base[..., 1] + detail[..., 1], base[..., 2] * detail[..., 2]], -1)
    del base, detail
    nb /= np.maximum(np.linalg.norm(nb, axis=2, keepdims=True), 1e-6)
    normal = np.where(covered[..., None], nb * .5 + .5, np.array([.5, .5, 1], F)).astype(F); del nb
    orm = np.zeros((H, W, 3), F)
    orm[..., 0] = image(team, 1)[..., 0]
    orm[..., 1] = image(np.clip(rough, .04, 1), 1)[..., 0]
    orm[..., 2] = image(metal, 1)[..., 0]
    # Grow painted texels into the empty gutter so mips and filtering never pull in black.
    albedo, orm = _dilate(albedo, covered), _dilate(orm, covered)
    log('painted')
    return albedo, orm, normal


def _paint_texels(p, n, mat, edge, ao, face):
    col = np.zeros((len(p), 3), F); rough = np.full(len(p), .8, F); metal = np.zeros(len(p), F); hgt = np.zeros(len(p), F)
    broad = S.fbm(p * 7, 3, seed=31)
    # ------------------------------------------------------------------ fur (body, head, limbs)
    fur = np.isin(mat, [M['fur'], M['ear_in']])
    if fur.any():
        q, nq = p[fur], n[fur]
        f = fur_flow(q, nq)
        head = (q[:, 1] > 1.46) & (np.abs(q[:, 0]) < .30)
        near_paw = np.zeros(len(q), bool)
        for s in (-1, 1):
            near_paw |= np.linalg.norm(q - C.wrist(s), axis=1) < .13
        h = np.zeros(len(q), F); ridge = np.zeros(len(q), F); tip = np.zeros(len(q), F); strand = np.zeros(len(q), F); hid = np.zeros(len(q), F)
        for sel, across, along, amp, seed in ((head, .0085, .026, .0007, 1), (near_paw & ~head, .0055, .015, .0005, 2), (~head & ~near_paw, .014, .046, .0013, 3)):
            if sel.any():
                h[sel], ridge[sel], tip[sel], strand[sel], hid[sel] = groom(q[sel], f[sel], across, along, amp, seed)
        base, light = srgb('97552F'), srgb('C4834F')
        c = np.broadcast_to(base, q.shape).copy()
        # Regional tone: lighter belly, throat and undersides, a darker crown and back ridge.
        c = lerp(c, srgb('A2653A'), np.clip(-nq[:, 1], 0, 1) * .55 * (q[:, 1] < 1.62))
        c = lerp(c, srgb('74401F'), np.clip(nq[:, 1], 0, 1) * .45 * (q[:, 1] > 1.66))
        c = lerp(c, srgb('7C4424'), ss(.08, .18, q[:, 2]) * ss(1.2, 1.5, q[:, 1]) * .5)
        for s in (-1, 1):
            loc = (q - C.wrist(s)) @ C.paw_frame(s)
            inner = ss(.04, -.05, loc[:, 2]) * ss(.20, .12, np.abs(loc[:, 0]))
            inner *= ss(.08, .01, loc[:, 1]) * ss(-.32, -.22, loc[:, 1])
            c = lerp(c, srgb('A8703F'), inner * .75)
        # Groom shading: dark roots between the locks, lit crests, pale tips, one tint per lock.
        c = c * (.76 + .30 * ridge * (.45 + .55 * tip))[:, None] * (.84 + .30 * strand)[:, None]
        c = lerp(c, light, ss(.45, 1.0, tip) * ridge * ss(.45, .8, strand) * .6)
        c = c * (.92 + .16 * hid)[:, None] * np.stack([1 + .05 * (hid - .5), np.ones(len(q), F), 1 - .06 * (hid - .5)], 1)
        c = c * (.96 + .08 * broad[fur])[:, None]
        rgh = .74 + .12 * strand - .08 * ridge * tip
        # ------------------------------------------------------------------ face
        hs = np.flatnonzero(head)
        if len(hs):
            qh = q[hs]; ch = c[hs]; hh = h[hs]
            # The greyish tan muzzle: whisker pads, lips and chin, fading into the cheeks.
            dm = S.evaluate(face.muzzle, qh, cull=False)[0]
            mz = ss(.016, -.006, dm)
            muz = lerp(srgb('9C8068'), srgb('B59A7E'), ss(1.60, 1.53, qh[:, 1]))
            muz = muz * (.86 + .22 * ridge[hs] * (.5 + .5 * tip[hs]))[:, None] * (.94 + .1 * strand[hs])[:, None]
            ch = lerp(ch, muz, mz * .92)
            hh = hh * (1 - .45 * mz)
            # Mouth line and the shadow under the upper lip.
            dl = np.full(len(qh), 9.0, F)
            for path in face.mouth:
                for a, b in zip(path[:-1], path[1:]):
                    ab = b - a; t = np.clip(((qh - a) @ ab) / (ab @ ab), 0, 1)
                    dl = np.minimum(dl, np.linalg.norm(qh - (a + t[:, None] * ab), axis=1))
            ch = lerp(ch, srgb('4A382E'), ss(.010, .003, dl) * .5)
            ch = lerp(ch, srgb('231915'), ss(.0035, .0012, dl) * .95)
            # Whisker roots: three rows of dark pores on each pad.
            dw = np.full(len(qh), 9.0, F)
            for w in face.whiskers:
                dw = np.minimum(dw, np.linalg.norm(qh - w, axis=1))
            ch = lerp(ch, srgb('3A2A22'), ss(.0021, .0009, dw) * .85)
            hh = hh - ss(.0021, .0009, dw) * .0002
            for s, e, out, E in face.eyes:
                de = np.linalg.norm(qh - e, axis=1)
                # A dark lid margin, a soft darker socket, a pale tuft over the brow.
                ch = lerp(ch, srgb('1E1410'), ss(C.EYE_R + .0045, C.EYE_R + .0015, de) * .95)
                ch = lerp(ch, srgb('5C321C'), ss(C.EYE_R + .016, C.EYE_R + .005, de) * .55)
                bq = (qh - (e + E[:, 2] * .034 + E[:, 0] * .010)) @ E
                brow = ss(1.25, .55, np.linalg.norm(bq / np.array([.040, .030, .010], F), axis=1))
                ch = lerp(ch, srgb('C8925F'), brow * .62)
                # A pale crescent under the eye frames it, so the eye still reads as a dark dot at range.
                uq = (qh - (e - E[:, 2] * .026 + E[:, 0] * .004)) @ E
                under = ss(1.2, .5, np.linalg.norm(uq / np.array([.036, .020, .012], F), axis=1))
                ch = lerp(ch, srgb('B98050'), under * .45)
            # The nostril walls cut through the pad into the fur below: keep them dark too.
            dn = np.min([np.linalg.norm((qh - c0) / np.array([1, 1.6, 1], F), axis=1) for c0 in face.nostrils], 0)
            ch = lerp(ch, srgb('100C0A'), ss(.022, .012, dn)); hh = hh * ss(.012, .022, dn)
            ear = mat[fur][hs] == M['ear_in']
            ch[ear] = lerp(srgb('5E4034'), srgb('3E2A22'), S.fbm(qh[ear] * 300, 2, 9)) * (.9 + .2 * strand[hs][ear])[:, None]
            hh[ear] *= .3
            c[hs] = ch; h[hs] = hh
        # Paws and feet: dark leathery skin on the pads, fingertips and toes; fur on the backs.
        skin = np.zeros(len(q), F)
        for s in (-1, 1):
            loc = ((q - C.wrist(s)) @ C.paw_frame(s)) / C.PAW_SCALE
            on_paw = (loc[:, 1] > -.004) & (np.linalg.norm(loc, axis=1) < .16)
            under = (nq @ (C.paw_frame(s) @ np.array([0, 0, 1], F))) < .15
            jag = (S.value_noise(q * 900, 13) - .5) * .06
            skin = np.maximum(skin, (on_paw & ((nq @ (C.paw_frame(s) @ np.array([0, 0, 1], F)) < .15 + jag) | (loc[:, 1] > .088 + jag * .1))).astype(F))
            foot = (np.abs(q[:, 0] - s * .132) < .12) & (q[:, 1] < .10)
            toes = foot & (q[:, 2] < -.08)
            skin = np.maximum(skin, toes.astype(F) * ss(.095, .07, q[:, 1]))
        grain = S.cells(q * 1100, 11)
        crease = np.exp(-((S.value_noise(q * np.array([60, 60, 60], F), 14) - .5) / .03) ** 2)
        sk = lerp(srgb('3C302B'), srgb('66544A'), np.clip((.55 - grain) * 1.8, 0, 1) * .6)
        sk = lerp(sk, srgb('241B17'), crease * .5)
        c = lerp(c, sk, skin)
        h = h * (1 - skin) + skin * ((.5 - np.clip(grain, 0, .8)) * .00026 - crease * .0002)
        rgh = rgh * (1 - skin) + skin * (.55 + .2 * grain)
        col[fur] = c; hgt[fur] = h; rough[fur] = rgh
    # ------------------------------------------------------------------ nose pad
    sel = mat == M['nose']
    if sel.any():
        q = p[sel]
        peb = S.cells(q * 1300, 81)
        c = lerp(srgb('4B413D'), srgb('675B55'), np.clip((.6 - peb) * 1.7, 0, 1) * .55)
        c = lerp(c, srgb('3A3230'), ss(1.66, 1.62, q[:, 1]) * .5)
        dn = np.min([np.linalg.norm((q - c0) / np.array([1, 1.6, 1], F), axis=1) for c0 in face.nostrils], 0)
        c = lerp(c, srgb('100C0A'), ss(.020, .011, dn))
        col[sel] = c; rough[sel] = .42 + .25 * peb; hgt[sel] = (.5 - np.clip(peb, 0, .8)) * .00018
    # ------------------------------------------------------------------ cloth and gear
    e_all = edge

    def put(keys, fn):
        sel = np.isin(mat, [M[k] for k in keys])
        if sel.any():
            c, r, h, m = fn(p[sel], n[sel], e_all[sel], ao[sel])
            col[sel] = c; rough[sel] = r; hgt[sel] = h; metal[sel] = m
        return sel

    def weave(q, pitch, amp):
        u = S.value_noise(q * np.array([1 / pitch, 1 / (pitch * 6), 1 / pitch], F), 21)
        v = S.value_noise(q * np.array([1 / (pitch * 6), 1 / pitch, 1 / (pitch * 6)], F), 22)
        return (np.sin(q[:, 0] / pitch * math.pi) * np.sin(q[:, 1] / pitch * math.pi) * .5 + (u + v - 1) * .5) * amp

    def check(q, nq, pitch):
        """Plaid lines: horizontal by height, vertical by x on the front and back, z on the sides."""
        hz = np.exp(-((((q[:, 1] / pitch) % 1) - .5) / .07) ** 2)
        side = np.abs(nq[:, 0]) > np.abs(nq[:, 2])
        u = np.where(side, q[:, 2], q[:, 0])
        vt = np.exp(-((((u / pitch) % 1) - .5) / .07) ** 2)
        hz2 = np.exp(-((((q[:, 1] / pitch + .5) % 1) - .5) / .035) ** 2)
        vt2 = np.exp(-((((u / pitch + .5) % 1) - .5) / .035) ** 2)
        return np.maximum(hz, vt), np.maximum(hz2, vt2)

    def shirt(q, nq, e, a):
        lines, fine = check(q, nq, .026)
        base = srgb('E6D9C0') * (.94 + .08 * S.fbm(q * 55, 3, 41))[:, None]
        c = lerp(base, srgb('B89A76'), lines * .20)
        c = lerp(c, srgb('B2604E'), fine * .10)
        st = stitches(e, q, (.0035,))
        c = lerp(c, srgb('BFAE92'), ss(.0022, .0006, e) * .5)
        c = lerp(c, srgb('9E8C70'), st * .5)
        h = weave(q, .0011, .00010) + st * .00006 - ss(.0020, 0, e) * .00012
        return c, np.full(len(q), .88, F), h, np.zeros(len(q), F)
    put(('shirt',), shirt)

    def denim(q, nq, e, a):
        tw = np.sin((q[:, 0] + q[:, 1] * 1.1 - q[:, 2] * .4) / .0012 * math.pi)
        wear = S.fbm(q * 16, 3, 43)
        c = lerp(srgb('3E5276'), srgb('6B7FA2'), np.clip((wear - .6) * 2.2, 0, 1) * .6)
        # Edges and raised seams wear pale; occluded folds stay dark indigo.
        c = lerp(c, srgb('7F93B2'), ss(.0035, .0005, e) * .55 + np.clip(a - .9, 0, 1) * 2.5)
        c = lerp(c, srgb('2E3F5E'), np.clip(.75 - a, 0, 1) * .6)
        st = stitches(e, q, (.0030, .0060))
        c = c * (.90 + .10 * tw)[:, None]
        c = lerp(c, srgb('C8904C'), st * .85)
        h = tw * .00008 + st * .00010 - ss(.0016, 0, e) * .00018
        return c, .80 - .1 * st, h, np.zeros(len(q), F)
    put(('denim', 'denim_pocket'), denim)

    def trouser(q, nq, e, a):
        c = srgb('626039') * (.9 + .16 * S.fbm(q * 30, 3, 44))[:, None]
        c = lerp(c, srgb('838156'), np.clip(S.fbm(q * 9, 2, 45) - .58, 0, 1) * 1.6)
        motif = np.sin(q[:, 0] * 480 + q[:, 1] * 480) * np.sin(q[:, 0] * 480 - q[:, 1] * 480 + q[:, 2] * 300)
        c = c * (.95 + .05 * motif)[:, None]
        c = lerp(c, srgb('8E8A5E'), ss(.003, .0005, e) * .4)
        c = lerp(c, srgb('3F3E24'), np.clip(.7 - a, 0, 1) * .5)
        st = stitches(e, q, (.0032, .0064))
        c = lerp(c, srgb('A99466'), st * .75)
        h = weave(q, .0013, .00016) + st * .0001 - ss(.0016, 0, e) * .00016
        return c, np.full(len(q), .9, F), h, np.zeros(len(q), F)
    put(('trouser', 'trouser_pocket'), trouser)

    def leather(tone, thread='C9AE80'):
        def fn(q, nq, e, a):
            g = S.cells(q * 420, 46)
            c = srgb(tone) * (.84 + .26 * S.fbm(q * 25, 3, 47))[:, None]
            c = lerp(c, srgb('2A1A10'), np.clip(.25 - g, 0, 1) * 1.4)
            # Burnished dark edges, a pale scuffed band on raised wear, stitches.
            c = lerp(c, srgb('2E1D12'), ss(.0022, .0004, e) * .7)
            c = lerp(c, srgb('A07A56'), np.clip(a - .92, 0, 1) * 4 * S.fbm(q * 60, 2, 48))
            st = stitches(e, q, (.0034,), pitch=.0048)
            c = lerp(c, srgb(thread), st * .8)
            h = (g - .5) * .00016 + st * .0001 - ss(.0014, 0, e) * .00022
            return c, .55 - .1 * st + .1 * g, h, np.zeros(len(q), F)
        return fn
    put(('leather',), leather('6A4630'))
    put(('pouch', 'pack_flap'), leather('75502F'))
    put(('pack',), leather('7B5334'))
    put(('strap',), leather('5A3B26'))

    def brass(q, nq, e, a):
        c = srgb('C79A4E') * (.8 + .3 * S.fbm(q * 80, 2, 51))[:, None]
        c = lerp(c, srgb('4A3A22'), np.clip(.85 - a, 0, 1) * 1.8)
        return c, .30 + .25 * np.clip(.9 - a, 0, 1), (S.fbm(q * 400, 2, 52) - .5) * .00004, np.full(len(q), .9, F)
    put(('brass',), brass)

    def button(q, nq, e, a):
        c = lerp(srgb('D6CCB6'), srgb('A89C84'), ss(.002, .0005, e))
        return c, np.full(len(q), .5, F), np.zeros(len(q), F), np.zeros(len(q), F)
    put(('button',), button)

    def claw(q, nq, e, a):
        c = lerp(srgb('201915'), srgb('4E3E33'), S.value_noise(q * np.array([900, 200, 900], F), 52) * .5)
        return c, np.full(len(q), .3, F), np.zeros(len(q), F), np.zeros(len(q), F)
    put(('claw',), claw)

    def sole(q, nq, e, a):
        g = S.cells(q * 600, 53)
        return srgb('2F2622') * (.9 + .2 * g)[:, None], np.full(len(q), .75, F), (g - .5) * .00022, np.zeros(len(q), F)
    put(('sole',), sole)

    # Team cloth: neutral grey (luminance .36) with folds, weave and a hem; the runtime tints it.
    def team_cloth(q, nq, e, a):
        folds = np.sin(q[:, 0] * 90 + q[:, 1] * 140 + S.fbm(q * 20, 2, 56) * 4)
        stripe = np.exp(-(((q[:, 1] * 30 + q[:, 0] * 8) % 1 - .5) / .12) ** 2) * (S.fbm(q * 9, 2, 57) > .5)
        hem = ss(.004, .0015, e)
        g = .36 * (.86 + .22 * S.fbm(q * 35, 3, 54)) * (1 + weave(q, .0012, .10)) * (.92 + .10 * folds) * (1 - .16 * stripe) * (1 - .18 * hem)
        return np.repeat(np.clip(g, .1, .6)[:, None], 3, 1), np.full(len(q), .86, F), weave(q, .0012, .00018) - hem * .0001, np.zeros(len(q), F)
    put(C.TEAM, team_cloth)

    # Eyes: a big dark-brown iris ringed darker, a warm sliver of white at the corners and a
    # catchlight that survives minification; the real specular comes from the low roughness.
    esel = mat == M['eye']
    if esel.any():
        q = p[esel]
        c = np.zeros((len(q), 3), F)
        for s, e, out, E in face.eyes:
            k = (q[:, 0] > 0) == (s > 0)
            d = _norm(q[k] - e)
            ang = np.arccos(np.clip(d @ out, -1, 1))
            streak = S.value_noise(np.stack([np.arctan2(d @ E[:, 2], d @ E[:, 0]) * 9, ang * 22, np.zeros(k.sum())], 1).astype(F), 55)
            ce = lerp(srgb('7A4A22'), srgb('3A2112'), ss(.18, .56, ang) * .75 + streak * .2)
            ce = lerp(ce, srgb('070504'), ss(.27, .21, ang))
            ce = lerp(ce, srgb('1A0F09'), ss(.52, .64, ang))
            ce = lerp(ce, srgb('D9C8AC'), ss(.70, .80, ang))
            gleam = _norm((out + E[:, 2] * .30 - E[:, 0] * .22)[None])[0]
            ce = lerp(ce, srgb('FFF4E2'), ss(.19, .11, np.linalg.norm(d - gleam, axis=1)))
            c[k] = ce
        col[esel] = c; rough[esel] = .04; hgt[esel] = 0
    # Occlusion from the bake: cavities, folds and the undersides of gear.
    # Fur keeps more of its light (its own locks already shade it), cloth and gear the full occlusion.
    fur = np.isin(mat, [M['fur'], M['ear_in']])
    col *= np.where(fur, .72 + .28 * ao ** 1.3, .60 + .40 * ao ** 1.3)[:, None]
    return col, rough, metal, hgt


def _mode_filter(mat, idx, shape, radius=2):
    """Majority vote over a (2r+1)^2 texel window: removes isolated texels whose baked position
    landed on a neighbouring surface (collar texels that hit the scarf, say)."""
    H, W = shape
    grid = np.full(H * W, -1, np.int16); grid[idx] = mat; grid = grid.reshape(H, W)
    best = np.zeros((H, W), np.int16); score = np.full((H, W), -1.0, np.float32)
    k = 2 * radius + 1
    for m in np.unique(mat):
        a = (grid == m).astype(np.float32)
        c = np.cumsum(np.cumsum(np.pad(a, ((radius + 1, radius), (radius + 1, radius))), 0), 1)
        box = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
        better = box > score
        best[better] = m; score[better] = box[better]
    out = best.ravel()[idx]
    # Clean team specks and the vest/sleeve boundary. Small genuine features elsewhere
    # (snaps, claw tips, buttons) keep their texels.
    team = np.isin(mat, [M[k] for k in C.TEAM]); team_out = np.isin(out, [M[k] for k in C.TEAM])
    cloth = np.isin(mat, [M['shirt'], M['denim']]) & np.isin(out, [M['shirt'], M['denim']])
    return np.where((team != team_out) | cloth, out, mat).astype(np.int16)


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
