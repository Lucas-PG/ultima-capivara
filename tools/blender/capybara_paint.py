"""Texel-space painting of the v6 character (numpy, no bpy).

Inputs are maps baked from the dense sculpt into the game UVs: position (game space), object
normal, tangent-space normal and occlusion. Materials come from the SDF at each texel's
position, so borders (a vest hem, the bandana edge, a claw) are exact at texture resolution.

The style is the game's: large readable value shapes, soft gradients, occlusion in the folds
and clean seams; micro variation stays under about 8 percent in value, so the character sits
with the painterly world and the clean weapons. Fur is one golden tan family from head to
feet, groomed into soft locks along a comb field (their relief lives mostly in the normal
map), with a darker crown and nape, lighter cheeks and throat and a pale buff muzzle. Cloth and
leather get stitch rows from a texel-space distance to the nearest other material. The team
cloth is a clean neutral value the runtime tints: folds and weave only, never blotches.
Texels are painted in chunks so a 4K atlas fits in memory.
"""
import math
import numpy as np
import capy_sdf as S
import capybara_form as C

F = np.float32
M = C.M
CHUNK = 1 << 20
# The palette (sRGB hex). The first-person arms are matched to these.
FUR_BASE, FUR_TIP, FUR_DARK, FUR_LIGHT, FUR_BUFF = 'B47C49', 'CC9763', '8E5A33', 'C79B6A', 'D5B68C'
SKIN, SKIN_LIGHT, CLAW, NOSE = '4E433E', '6C5E57', '2A2320', '6A5E58'
LINEN, DENIM, OLIVE, LEATHER, LEATHER_DARK, RUCKSACK, BRASS = 'E4D8C0', '51627E', '74755A', '6E4A31', '55382A', '7E6444', 'C39A52'
# Mean of the lock shading over the pelt (measured on the build), so a lock's average stays the palette value.
LOCK_SHADE_MEAN = .895


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
        arm = ss(.20, .12, np.linalg.norm(np.cross(p - el, ax), axis=1)) * (s * p[:, 0] > .2) * (y < 1.32)
        g = lerp(g, np.broadcast_to(ax, p.shape), arm)
        loc = (p - wr) @ C.paw_frame(s)
        paw = ss(.02, -.02, -loc[:, 1]) * (np.linalg.norm(p - wr, axis=1) < .30)
        g = lerp(g, np.broadcast_to(C.paw_frame(s)[:, 1], p.shape), paw)
    g = lerp(g, np.broadcast_to(C.v(0, -.35, -1), p.shape), ss(.15, .10, y))
    t = g - n * np.einsum('ij,ij->i', g, n)[:, None]
    length = np.linalg.norm(t, axis=1)
    # Where the comb runs into the skin (the snout tip, the crown), fall back to a sideways tangent.
    fb = np.cross(n, np.broadcast_to(C.v(1, 0, 0), n.shape)); fb = _norm(fb + np.cross(n, np.broadcast_to(C.v(0, 0, 1), n.shape)) * .3)
    t = lerp(t, fb, ss(.35, .05, length))
    return _norm(t).astype(F)


def flow_frames(p):
    """Flow-aligned lock coordinates, blended like the comb in fur_flow: (weight, across1, across2,
    along) per region, in metres. Each region has coordinates in which its comb is one axis (the
    head radial from the nose, the body and legs down, the forearms elbow to wrist, the paws along
    the digits, the feet forward), so the locks never shear where the comb turns: a global
    coordinate system seen through a turning comb scrambles them into cells and ripples."""
    y = p[:, 1]; one = np.ones(len(p), F)
    frames = []

    def blend(t, coords):
        for fr in frames:
            fr[0] = fr[0] * (1 - t)
        frames.append([np.asarray(t, F) * one, *coords])
    frames.append([one.copy(), p[:, 0], p[:, 2], -y])
    d = p - NOSE_ORIGIN; r = np.linalg.norm(d, axis=1)
    # The back of the head combs down into the nape: there it keeps partly to the body's frame.
    blend(ss(1.45, 1.53, y) * (1 - .6 * ss(.04, .18, p[:, 2])), (d[:, 0] / r * .35, d[:, 1] / r * .35, r))
    for s in (-1, 1):
        el, wr = C.elbow(s), C.wrist(s)
        ax = (wr - el) / np.linalg.norm(wr - el)
        e1 = _norm(np.cross(ax, C.v(0, 1, 0))[None])[0]; e2 = np.cross(ax, e1)
        q = p - el
        arm = ss(.20, .12, np.linalg.norm(np.cross(q, ax), axis=1)) * (s * p[:, 0] > .2) * (y < 1.32)
        blend(arm, (q @ e1, q @ e2, q @ ax))
        loc = (p - wr) @ C.paw_frame(s)
        paw = ss(.02, -.02, -loc[:, 1]) * (np.linalg.norm(p - wr, axis=1) < .30)
        blend(paw, (loc[:, 0], loc[:, 2], loc[:, 1]))
    fd = C.norm(C.v(0, -.35, -1)); f1 = C.v(1, 0, 0); f2 = np.cross(fd, f1)
    blend(ss(.15, .10, y), (p @ f1, p @ f2, p @ fd))
    return frames


def _worley2(u, seed):
    """2D Worley in the across plane: distance to the nearest feature (the lock's axis), to the
    cell border, and a random value per lock."""
    i = np.floor(u).astype(np.int64)
    d1 = np.full(len(u), 9.0, F); d2 = np.full(len(u), 9.0, F); h1 = np.zeros(len(u), F)
    z = np.zeros(len(u), np.int64)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = i[:, 0] + dx, i[:, 1] + dy
            fx = cx + .1 + .8 * S._hash(cx, cy, z, seed); fy = cy + .1 + .8 * S._hash(cx, cy, z, seed + 1)
            dd = np.hypot(fx - u[:, 0], fy - u[:, 1]).astype(F)
            closer = dd < d1
            d2 = np.where(closer, d1, np.minimum(d2, dd)); h1 = np.where(closer, S._hash(cx, cy, z, seed + 7), h1); d1 = np.where(closer, dd, d1)
    return d1.astype(F), (d2 - d1).astype(F), h1.astype(F)


def groom(q, f, across, along, amp, seed):
    """Height and shading terms of combed fur: soft long clumps (one lock around each across-plane
    feature) whose value ramps to a lighter tip before the next lock begins, strands along their
    length. Returns height, clump (lit body of a lock), tip, strand and a random value per lock."""
    out = [np.zeros(len(q), F) for _ in range(5)]
    for w, c1, c2, al in flow_frames(q):
        sel = w > 1e-3
        if not sel.any():
            continue
        c1, c2, al, ww = c1[sel], c2[sel], al[sel], w[sel]
        d1, edge, hid = _worley2(np.stack([c1 / across, c2 / across], 1), seed)
        # The along phase of each lock; its tip is pointed (the sides of a lock end earlier).
        ph = np.mod(al / (along * 1.6) + hid * 7.31 + .5 * d1, 1.0)
        clump = ss(.70, .15, d1)
        fine = S.value_noise(np.stack([c1 / (across * .09), c2 / (across * .09), al / (along * .7)], 1).astype(F), seed + 11)
        med = S.value_noise(np.stack([c1 / (across * .28), c2 / (across * .28), al / (along * 1.1)], 1).astype(F), seed + 12)
        strand = .55 * fine + .45 * med
        tip = ss(.55, .97, ph) * clump * ss(.35, .65, med)
        ridge = clump * (.55 + .45 * ss(0.0, .30, ph))
        h = amp * (clump * (.35 + .65 * ph) * .7 + .45 * (strand - .5))
        for o, v in zip(out, (h, ridge, tip, strand, hid)):
            o[sel] += ww * v
    return tuple(out)


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
        self.openings = {s: C.eye_opening(s) for s in (-1, 1)}
        self.mouth = [np.array(C.mouth_path(s), F) for s in (-1, 1)]
        self.whiskers = np.concatenate([C.whisker_roots(s) for s in (-1, 1)])
        # The lower front of the muzzle (whisker pads, lips), the chin and a rim round the nose
        # leather: the pale buff zone.
        self.muzzle = S.Union([S.Ellipsoid((0, 1.575, -.320), (.098, .056, .078)), S.Ellipsoid((0, 1.515, -.282), (.070, .036, .070)),
                               S.Ellipsoid((0, 1.648, -.334), (.088, .062, .040))], k=.02)
        self.nostrils = [C.side(C.NOSTRIL, s) for s in (-1, 1)]


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
        armhole = np.isin(mat, [M['shirt'], M['denim']]) & (low[:, 1] > 1.04) & (low[:, 1] < 1.43) & (np.abs(low[:, 0]) > .19)
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
        d = np.linalg.norm((p - C.v(s * .272, 1.165, .005)) / np.array([1, 1.4, 1], F), axis=1)
        crevice = np.maximum(crevice, ss(.095, .050, d) * cloth)
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
    cloth_ids = [M[k] for k in ('shirt', 'cuff', 'denim', 'denim_pocket', 'trouser', 'trouser_pocket', 'trouser_cuff')]
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
    fold = np.select([np.isin(mat, [M['denim'], M['denim_pocket']])[:, None], np.isin(mat, [M['trouser'], M['trouser_pocket'], M['trouser_cuff']])[:, None]],
                     [srgb('2F3D58'), srgb('4C4C32')], srgb('A69B86')) * (.75 + .25 * ao)[:, None]
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
    # Flat swatches in the free atlas corner for geometry that is not baked (the whiskers).
    k = int(W * C.SWATCH_STRIP * .8)
    albedo[:k, :k] = srgb('EFE6D4'); orm[:k, :k] = np.array([0, .5, 0], F)
    log('painted', 'lock shade mean', round(float(np.mean(_SHADE_MEANS)), 4) if _SHADE_MEANS else '-')
    return albedo, orm, normal


_SHADE_MEANS = []


def _paint_texels(p, n, mat, edge, ao, face):
    col = np.zeros((len(p), 3), F); rough = np.full(len(p), .8, F); metal = np.zeros(len(p), F); hgt = np.zeros(len(p), F)
    # One soft, large-scale value variation for everything (about 3 percent).
    broad = S.fbm(p * 5, 2, seed=31)
    # ------------------------------------------------------------------ fur (body, head, limbs)
    fur = mat == M['fur']
    if fur.any():
        q, nq = p[fur], n[fur]
        f = fur_flow(q, nq)
        head = (q[:, 1] > 1.46) & (np.abs(q[:, 0]) < .30)
        local = [(q - C.wrist(s)) @ C.paw_frame(s) for s in (-1, 1)]
        near_paw = (np.linalg.norm(local[0], axis=1) < .30) | (np.linalg.norm(local[1], axis=1) < .30)
        h = np.zeros(len(q), F); ridge = np.zeros(len(q), F); tip = np.zeros(len(q), F); strand = np.zeros(len(q), F); hid = np.zeros(len(q), F)
        # Locks (across x along, metres) and their relief: bold enough to read as fur at 1 to 3 m,
        # small enough that the mips average them out cleanly beyond about 5 m.
        for sel, across, along, amp, seed in ((head, .012, .034, .0013, 1), (near_paw & ~head, .009, .026, .0008, 2), (~head & ~near_paw, .020, .062, .0020, 3)):
            if sel.any():
                h[sel], ridge[sel], tip[sel], strand[sel], hid[sel] = groom(q[sel], f[sel], across, along, amp, seed)
        c = np.broadcast_to(srgb(FUR_BASE), q.shape).copy()
        # The value design in large shapes: lighter throat, belly and undersides; a darker crown,
        # nape and back of the head; the backs of the limbs a little darker.
        c = lerp(c, srgb(FUR_LIGHT), np.clip(-nq[:, 1], 0, 1) * .65)
        c = lerp(c, srgb(FUR_DARK), ss(.35, .85, nq[:, 1]) * ss(1.72, 1.80, q[:, 1]) * .45)
        c = lerp(c, srgb(FUR_DARK), ss(.07, .20, q[:, 2]) * ss(1.28, 1.50, q[:, 1]) * ss(1.88, 1.70, q[:, 1]) * .50)
        c = lerp(c, srgb(FUR_DARK), ss(.05, .35, nq[:, 2]) * (q[:, 1] < 1.30) * .30)
        for loc in local:
            inner = ss(.04, -.05, loc[:, 2]) * ss(.22, .12, np.abs(loc[:, 0])) * ss(.08, .01, loc[:, 1]) * ss(-.34, -.22, loc[:, 1])
            c = lerp(c, srgb(FUR_LIGHT), inner * .6)
        # Lock shading: dark roots and gaps, light tips, a value per lock, fine strands. It is
        # renormalised so a lock's mean stays the palette value (the far read keeps the colours).
        shade = (.76 + .28 * ridge) * (.86 + .28 * strand) * (.94 + .12 * hid)
        c = c * (shade / LOCK_SHADE_MEAN)[:, None]
        _SHADE_MEANS.append(float(shade.mean()))
        c = lerp(c, srgb(FUR_TIP), tip * .55)
        c = c * (.985 + .03 * broad[fur])[:, None]
        rgh = .82 + .06 * strand - .08 * ridge * tip
        # ------------------------------------------------------------------ face
        hs = np.flatnonzero(head)
        if len(hs):
            qh = q[hs]; ch = c[hs]; hh = h[hs]
            # The crown tuft lightens toward its tips (it stands above the crown surface).
            ch = lerp(ch, srgb(FUR_TIP), ss(1.812, 1.845, qh[:, 1]) * .75)
            # Lighter cheeks, jaw and throat below the eye line.
            ch = lerp(ch, srgb(FUR_LIGHT), ss(1.71, 1.56, qh[:, 1]) * ss(.14, -.06, qh[:, 2]) * .78)
            # The pale buff muzzle: the lower half of the muzzle front (whisker pads and lips), the
            # chin and a thin rim round the nose leather, fading softly back into the cheeks.
            dm = S.evaluate(face.muzzle, qh, cull=False)[0]
            lower = ss(1.628, 1.598, qh[:, 1] - .10 * np.clip(qh[:, 2] + .34, 0, .20)) * ss(-.10, -.20, qh[:, 2])
            mz = np.maximum(ss(.018, -.014, dm) * .55, lower)
            ch = lerp(ch, srgb(FUR_BUFF) * (.97 + .05 * ridge[hs])[:, None], mz * .88)
            hh = hh * (1 - .5 * mz)
            # The dark bridge running up from the nose leather between the eyes.
            bridge = ss(.050, .015, np.abs(qh[:, 0])) * ss(-.22, -.32, qh[:, 2]) * ss(1.69, 1.72, qh[:, 1])
            ch = lerp(ch, srgb('8A6A55'), bridge * .55)
            # Mouth line and a soft shadow under the upper lip.
            dl = np.full(len(qh), 9.0, F)
            for path in face.mouth:
                for a, b in zip(path[:-1], path[1:]):
                    ab = b - a; t = np.clip(((qh - a) @ ab) / (ab @ ab), 0, 1)
                    dl = np.minimum(dl, np.linalg.norm(qh - (a + t[:, None] * ab), axis=1))
            ch = lerp(ch, srgb('7A6250'), ss(.012, .004, dl) * .45)
            ch = lerp(ch, srgb('2A1F1B'), ss(.0040, .0016, dl) * .95)
            # Whisker roots: three rows of dark pores on each pad.
            dw = np.full(len(qh), 9.0, F)
            for w in face.whiskers:
                dw = np.minimum(dw, np.linalg.norm(qh - w, axis=1))
            ch = lerp(ch, srgb('5A4538'), ss(.0030, .0014, dw) * .85)
            for s, e, out, E in face.eyes:
                de = np.linalg.norm(qh - e, axis=1)
                # The lid line: thin below, a bold upper lid that ends in a small flick at the back
                # corner (it gives the eye its shape at a distance); then a soft light ring, a pale
                # brow over it and a pale lower lid.
                up = ((qh - e) @ E[:, 2]) / C.EYE_R; fw = ((qh - e) @ E[:, 0]) / C.EYE_R
                # Distance to the edge of the lid opening: the line hugs the margin.
                dcut = np.abs(S.evaluate(face.openings[s], qh, cull=False)[0])
                width = .0016 + .0026 * ss(-.10, .60, up) + .0030 * ss(-.55, -1.0, fw) * ss(-.20, .40, up)
                near = de < C.EYE_R + .030
                ch = lerp(ch, srgb('1E1512'), ss(width, width * .45, dcut) * near * .97)
                ring = ss(width, width + .004, dcut) * ss(C.EYE_R + .026, C.EYE_R + .014, de)
                ch = lerp(ch, srgb(FUR_TIP), ring * .30)
                bq = (qh - (e + E[:, 2] * .040 + E[:, 0] * .012)) @ E
                brow = ss(1.25, .55, np.linalg.norm(bq / np.array([.050, .034, .012], F), axis=1))
                ch = lerp(ch, srgb(FUR_TIP), brow * .55)
                uq = (qh - (e - E[:, 2] * .032 + E[:, 0] * .004)) @ E
                under = ss(1.2, .5, np.linalg.norm(uq / np.array([.042, .024, .013], F), axis=1))
                ch = lerp(ch, srgb(FUR_LIGHT), under * .45)
            # The nostril walls cut through the leather into the fur below: keep them dark too.
            dn = np.min([np.linalg.norm((qh - c0) / np.array([1, 1.6, 1], F), axis=1) for c0 in face.nostrils], 0)
            ch = lerp(ch, srgb('120E0C'), ss(.016, .009, dn)); hh = hh * ss(.009, .016, dn)
            c[hs] = ch; h[hs] = hh
        # Paws and feet: bare dark grey-brown leathery skin on the palm, the digits and the toes;
        # fur on the back of the paw up to the knuckles and on the instep.
        skin = np.zeros(len(q), F)
        jag = (S.value_noise(q * 260, 13) - .5) * .012
        for loc, s in zip(local, (-1, 1)):
            on_paw = (loc[:, 1] > -.02) & (np.linalg.norm(loc, axis=1) < .30)
            palm = ss(.016, .004, loc[:, 2] + jag) * ss(-.012, .012, loc[:, 1])
            digits = ss(.088, .104, loc[:, 1] + jag)
            skin = np.maximum(skin, np.maximum(palm, digits) * on_paw)
            fl = (q - C.foot_point(s, 0, 0, 0)) @ C.foot_frame(s)
            on_foot = (np.linalg.norm(fl[:, [0, 2]], axis=1) < .28) & (q[:, 1] < .13)
            toes = ss(-.075, -.105, fl[:, 2] + jag * 2) * ss(.125, .085, q[:, 1])
            skin = np.maximum(skin, toes * on_foot)
        grain = S.cells(q * 420, 11)
        sk = lerp(srgb(SKIN), srgb(SKIN_LIGHT), np.clip(nq[:, 1], 0, 1) * .35 + np.clip(.55 - grain, 0, 1) * .16)
        c = lerp(c, sk, skin)
        h = h * (1 - skin) + skin * (.5 - np.clip(grain, 0, .8)) * .00040
        rgh = rgh * (1 - skin) + skin * .62
        col[fur] = c; hgt[fur] = h; rough[fur] = rgh
    # ------------------------------------------------------------------ ears and nose leather
    sel = mat == M['ear_in']
    if sel.any():
        q = p[sel]
        inner = np.clip(-(n[sel] @ np.array([0, 0, 1], F)), 0, 1)       # the cup faces forward
        col[sel] = lerp(srgb('4E403B'), srgb('8A6258'), inner * .85); rough[sel] = .75
        hgt[sel] = (S.fbm(q * 300, 2, 9) - .5) * .00008
    sel = mat == M['nose']
    if sel.any():
        q = p[sel]
        peb = S.cells(q * 900, 81)
        c = lerp(srgb(NOSE), srgb('75665F'), np.clip(n[sel][:, 1], 0, 1) * .6)
        c = lerp(c, srgb('463A36'), ss(1.62, 1.55, q[:, 1]) * .5)
        dn = np.min([np.linalg.norm((q - c0) / np.array([1, 1.6, 1], F), axis=1) for c0 in face.nostrils], 0)
        c = lerp(c, srgb('120E0C'), ss(.015, .008, dn))
        col[sel] = c; rough[sel] = .46; hgt[sel] = (.5 - np.clip(peb, 0, .8)) * .00016
    # ------------------------------------------------------------------ cloth and gear
    def put(keys, fn):
        sel = np.isin(mat, [M[k] for k in keys])
        if sel.any():
            c, r, h, m = fn(p[sel], n[sel], edge[sel], ao[sel])
            col[sel] = c * (.985 + .03 * broad[sel])[:, None]; rough[sel] = r; hgt[sel] = h; metal[sel] = m
        return sel

    def weave(q, pitch, amp):
        u = S.value_noise(q * np.array([1 / pitch, 1 / (pitch * 6), 1 / pitch], F), 21)
        v = S.value_noise(q * np.array([1 / (pitch * 6), 1 / pitch, 1 / (pitch * 6)], F), 22)
        return (np.sin(q[:, 0] / pitch * math.pi) * np.sin(q[:, 1] / pitch * math.pi) * .5 + (u + v - 1) * .5) * amp

    zero = lambda q: np.zeros(len(q), F)
    full = lambda q, value: np.full(len(q), value, F)

    def seam(c, e, q, thread, rows, hem=.0024, dark=.78):
        """A folded hem (slightly darker band at the edge) and clean stitch rows inside it."""
        st = stitches(e, q, rows)
        c = c * (1 - (1 - dark) * ss(hem, hem * .25, e))[:, None]
        return lerp(c, srgb(thread), st * .9), st

    def shirt(q, nq, e, a):
        # Linen: a soft gradient, a very quiet weave (no plaid) and tone-on-tone seams.
        c = np.broadcast_to(srgb(LINEN), q.shape) * (1 - .05 * ss(1.35, .95, q[:, 1]))[:, None] * (1 + weave(q, .0016, .02))[:, None]
        c, st = seam(c, e, q, 'CDBFA4', (.0040,), dark=.90)
        return c, full(q, .90), weave(q, .0012, .00008) + st * .00005 - ss(.0020, 0, e) * .00010, zero(q)
    put(('shirt', 'collar', 'cuff'), shirt)

    def denim(q, nq, e, a):
        tw = np.sin((q[:, 0] + q[:, 1] * 1.1 - q[:, 2] * .4) / .0014 * math.pi)
        # A soft fade on the broad lit faces, deeper indigo in the folds; no streaks along seams.
        c = lerp(srgb(DENIM), srgb('5A7197'), np.clip(a - .80, 0, .2) * 2.0 * S.fbm(q * 6, 2, 43))
        c = c * (.985 + .03 * tw)[:, None]
        c, st = seam(c, e, q, 'C9944F', (.0034, .0066), dark=.84)
        return c, .82 - .08 * st, tw * .00006 + st * .00010 - ss(.0016, 0, e) * .00016, zero(q)
    put(('denim', 'denim_pocket', 'denim_collar'), denim)

    def trouser(q, nq, e, a):
        c = lerp(srgb(OLIVE), srgb('7F7D55'), np.clip(a - .80, 0, .2) * 1.8 * S.fbm(q * 5, 2, 45))
        c = c * (1 + weave(q, .0018, .025))[:, None]
        c, st = seam(c, e, q, 'A8976A', (.0036, .0070), dark=.84)
        return c, full(q, .90), weave(q, .0013, .00012) + st * .0001 - ss(.0016, 0, e) * .00016, zero(q)
    put(('trouser', 'trouser_pocket', 'trouser_cuff'), trouser)

    def leather(tone, thread='C9AE80'):
        def fn(q, nq, e, a):
            g = S.cells(q * 300, 46)
            # Smooth leather with a lighter worn face and soft burnished edges.
            c = lerp(srgb(tone), srgb(tone) * 1.22, np.clip(a - .82, 0, .18) * 3.0 * S.fbm(q * 8, 2, 47))
            c = c * (.97 + .05 * g)[:, None]
            c, st = seam(c, e, q, thread, (.0038,), hem=.0030, dark=.72)
            return c, .58 - .08 * st, (g - .5) * .00008 + st * .0001 - ss(.0014, 0, e) * .00020, zero(q)
        return fn
    put(('leather', 'pouch'), leather(LEATHER))
    put(('strap',), leather(LEATHER_DARK))

    def canvas_bag(q, nq, e, a):
        c = lerp(srgb(RUCKSACK), srgb('A08A62'), np.clip(a - .80, 0, .2) * 1.8 * S.fbm(q * 5, 2, 48))
        c = c * (1 + weave(q, .0020, .03))[:, None]
        c, st = seam(c, e, q, 'BBA67C', (.0040,), dark=.82)
        return c, full(q, .88), weave(q, .0015, .00014) + st * .0001 - ss(.0016, 0, e) * .00016, zero(q)
    put(('pack', 'pack_flap'), canvas_bag)

    def brass(q, nq, e, a):
        c = np.broadcast_to(srgb(BRASS), q.shape) * (.92 + .16 * np.clip(nq[:, 1], -1, 1) * .5 + .08)[:, None]
        c = lerp(c, srgb('5A4526'), np.clip(.80 - a, 0, 1) * 1.5)
        return c, .32 + .2 * np.clip(.9 - a, 0, 1), zero(q), full(q, .9)
    put(('brass',), brass)

    def button(q, nq, e, a):
        return lerp(srgb('D8CDB6'), srgb('A89C84'), ss(.0022, .0006, e)), full(q, .5), zero(q), zero(q)
    put(('button',), button)

    def claw(q, nq, e, a):
        return lerp(srgb(CLAW), srgb('5A4A40'), np.clip(nq[:, 1], 0, 1) * .5), full(q, .30), zero(q), zero(q)
    put(('claw',), claw)

    def sole(q, nq, e, a):
        g = S.cells(q * 400, 53)
        return srgb('2F2724') * (.95 + .1 * g)[:, None], full(q, .75), (g - .5) * .00016, zero(q)
    put(('sole',), sole)

    # Team cloth: a clean neutral value (luminance .36) the runtime tints. Detail is value only:
    # the sculpted folds (occlusion, below), a quiet weave and a folded hem; never hue noise.
    def team_cloth(q, nq, e, a):
        hem = ss(.0045, .0015, e)
        g = .36 * (1 + weave(q, .0016, .03)) * (1 - .10 * hem)
        return np.repeat(np.clip(g, .1, .6)[:, None], 3, 1), full(q, .86), weave(q, .0013, .00012) - hem * .0001, zero(q)
    team = put(C.TEAM, team_cloth)

    # Eyes: a large warm amber iris ringed darker around a wide pupil, a sliver of warm white at
    # the corners and a catchlight that survives minification; the specular comes from the gloss.
    esel = mat == M['eye']
    if esel.any():
        q = p[esel]
        c = np.zeros((len(q), 3), F)
        for s, e, out, E in face.eyes:
            k = (q[:, 0] > 0) == (s > 0)
            d = _norm(q[k] - e)
            ang = np.arccos(np.clip(d @ out, -1, 1))
            # A big warm brown iris, a dark pupil, a darker rim, a sliver of warm white at the corners
            # and a large catchlight high on the front (below the heavy upper lid).
            ce = lerp(srgb('A8692C'), srgb('5A3418'), ss(.14, .56, ang) * .90)
            ce = lerp(ce, srgb('0A0706'), ss(.25, .19, ang))
            ce = lerp(ce, srgb('1A0F09'), ss(.54, .64, ang))
            ce = lerp(ce, srgb('E8DCC6'), ss(.70, .80, ang))
            gleam = _norm((out + E[:, 2] * .22 + E[:, 0] * .14)[None])[0]
            ce = lerp(ce, srgb('FFF8EC'), ss(.20, .12, np.linalg.norm(d - gleam, axis=1)))
            small = _norm((out - E[:, 2] * .20 - E[:, 0] * .22)[None])[0]
            ce = lerp(ce, srgb('F3E6D2'), ss(.09, .05, np.linalg.norm(d - small, axis=1)) * .8)
            c[k] = ce
        col[esel] = c; rough[esel] = .04; hgt[esel] = 0
    # Occlusion from the bake: soft shadow in the folds and under the gear. The team cloth keeps a
    # lighter floor so a fold never reads as a dark blotch once it is tinted.
    floor = np.where(fur, .74, np.where(team, .70, .60))
    col *= (floor + (1 - floor) * ao ** 1.2)[:, None]
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
