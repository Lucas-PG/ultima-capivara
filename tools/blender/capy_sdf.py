"""Signed-distance sculpting for the capybara (numpy + OpenVDB, both bundled with Blender).

A sculpt is a tree of nodes evaluated on (n, 3) float32 point arrays in game space
(metres, x right, y up, the character faces -z). Every node carries a bounding box so the
block evaluator only computes primitives that can reach a block. Each surface point also
reports which material won the union, which drives painting and baking later.

Runs inside Blender or in Blender's bundled python (`python3.11`) without bpy.
"""
import math
import numpy as np

F = np.float32
BIG = F(1.0)


def _v(x):
    return np.asarray(x, F)


def rot(yaw=0.0, pitch=0.0, roll=0.0):
    """Rotation matrix (local -> world): roll about z, then pitch about x, then yaw about y."""
    cy, sy, cp, sp, cr, sr = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], F)
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]], F)
    rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], F)
    return ry @ rx @ rz


def frame(axis, up=(0, 1, 0)):
    """Rotation whose local +y points along `axis` (local +z stays as close to `up` x axis as possible)."""
    y = _v(axis); y = y / np.linalg.norm(y)
    u = _v(up)
    if abs(float(y @ u)) > .95:
        u = _v((0, 0, 1)) if abs(y[2]) < .9 else _v((1, 0, 0))
    x = np.cross(y, u); x /= np.linalg.norm(x)
    z = np.cross(x, y)
    return np.stack([x, y, z], 1).astype(F)


class Node:
    lo = np.full(3, -1e9, F)
    hi = np.full(3, 1e9, F)
    mat = 0

    def reaches(self, lo, hi):
        return bool(np.all(self.lo <= hi) and np.all(self.hi >= lo))

    def d(self, p):
        raise NotImplementedError

    def dm(self, p, lo, hi):
        """Distance and material id for block points p with bounds lo/hi."""
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        return self.d(p).astype(F), np.full(len(p), self.mat, np.int16)

    def box(self, lo, hi, pad=0.0):
        self.lo = _v(lo) - pad; self.hi = _v(hi) + pad
        return self


def _bounds(center, extent, pad):
    c, e = _v(center), _v(extent)
    return c - e - pad, c + e + pad


class Ellipsoid(Node):
    """Ellipsoid with half-axes `radii` in its local frame (rotation R: local -> world)."""
    def __init__(self, center, radii, R=None, mat=0):
        self.c, self.r, self.R, self.mat = _v(center), _v(radii), (np.eye(3, dtype=F) if R is None else _v(R)), mat
        ext = np.abs(self.R) @ self.r
        self.lo, self.hi = _bounds(self.c, ext, 0)

    def d(self, p):
        q = (p - self.c) @ self.R
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


class Sphere(Node):
    def __init__(self, center, radius, mat=0):
        self.c, self.r, self.mat = _v(center), F(radius), mat
        self.lo, self.hi = _bounds(self.c, (radius,) * 3, 0)

    def d(self, p):
        return np.linalg.norm(p - self.c, axis=1) - self.r


class RoundCone(Node):
    """Capsule from a (radius ra) to b (radius rb), exact (Inigo Quilez)."""
    def __init__(self, a, b, ra, rb, mat=0):
        self.a, self.b, self.ra, self.rb, self.mat = _v(a), _v(b), F(ra), F(rb), mat
        r = max(ra, rb)
        self.lo = np.minimum(self.a, self.b) - r; self.hi = np.maximum(self.a, self.b) + r

    def d(self, p):
        ba = self.b - self.a; l2 = float(ba @ ba); rr = float(self.ra - self.rb)
        a2 = l2 - rr * rr; il2 = 1.0 / l2
        pa = p - self.a
        y = pa @ ba; z = y - l2
        x = pa * l2 - y[:, None] * ba
        x2 = np.einsum('ij,ij->i', x, x)
        y2 = y * y * l2; z2 = z * z * l2
        k = math.copysign(1, rr) * rr * rr * x2
        out = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - self.ra
        # The first test wins (IQ order): apply the second one first.
        out = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - self.ra, out)
        out = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - self.rb, out)
        return out


class RoundBox(Node):
    """Box with half-extents `half` (before rounding by `r`) in a local frame."""
    def __init__(self, center, half, r=0.0, R=None, mat=0):
        self.c, self.h, self.r, self.R, self.mat = _v(center), _v(half), F(r), (np.eye(3, dtype=F) if R is None else _v(R)), mat
        ext = np.abs(self.R) @ (self.h + self.r)
        self.lo, self.hi = _bounds(self.c, ext, 0)

    def d(self, p):
        q = np.abs((p - self.c) @ self.R) - self.h
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0) - self.r


class Torus(Node):
    """Torus in its local xz plane (ring radius `ring`, tube radius `tube`, flattened by `squash` in y)."""
    def __init__(self, center, ring, tube, R=None, squash=1.0, mat=0):
        self.c, self.ring, self.tube, self.R, self.sq, self.mat = _v(center), F(ring), F(tube), (np.eye(3, dtype=F) if R is None else _v(R)), F(squash), mat
        ext = np.abs(self.R) @ _v((ring + tube, tube * squash, ring + tube))
        self.lo, self.hi = _bounds(self.c, ext, 0)

    def d(self, p):
        q = (p - self.c) @ self.R
        qx = np.hypot(q[:, 0], q[:, 2]) - self.ring
        return (np.hypot(qx, q[:, 1] / self.sq) - self.tube) * min(1.0, float(self.sq))


class Plane(Node):
    """Half-space: negative on the side opposite to the normal."""
    def __init__(self, point, normal, mat=0):
        n = _v(normal); self.n = n / np.linalg.norm(n); self.o = F(self.n @ _v(point)); self.mat = mat

    def d(self, p):
        return p @ self.n - self.o


class Loft(Node):
    """Tube through `points` with elliptical sections (half-axes rx along `side`, rz along the
    remaining axis), rounded caps. Approximate distance, exact zero set within a few percent."""
    def __init__(self, points, rx, rz, side=(1, 0, 0), mat=0):
        self.p = _v(points); self.rx = _v(rx); self.rz = _v(rz); self.side = _v(side); self.mat = mat
        r = float(max(self.rx.max(), self.rz.max()))
        self.lo = self.p.min(0) - r; self.hi = self.p.max(0) + r

    def d(self, p):
        out = np.full(len(p), 9.0, F)
        n = len(self.p)
        for i in range(n - 1):
            a, b = self.p[i], self.p[i + 1]; ab = b - a; L2 = float(ab @ ab)
            t = np.clip(((p - a) @ ab) / L2, 0, 1)
            c = a + t[:, None] * ab
            axis = ab / math.sqrt(L2)
            s = self.side - axis * float(self.side @ axis); s /= np.linalg.norm(s)
            w = np.cross(axis, s)
            q = p - c
            u, v, along = q @ s, q @ w, q @ axis
            rx = self.rx[i] + (self.rx[i + 1] - self.rx[i]) * t
            rz = self.rz[i] + (self.rz[i + 1] - self.rz[i]) * t
            rad = np.sqrt((u / rx) ** 2 + (v / rz) ** 2)
            dist = np.sqrt(u * u + v * v + along * along)
            # Elliptical radial distance, scaled back to metres by the local radius.
            rloc = np.where(rad > 1e-6, np.sqrt(u * u + v * v) / np.maximum(rad, 1e-6), np.minimum(rx, rz))
            dd = np.where(np.abs(along) > 1e-5, dist - rloc, np.sqrt(u * u + v * v) - rloc)
            out = np.minimum(out, dd)
        return out


def _catmull(xs, ys, n=400):
    """Densely resampled Catmull-Rom spline through (xs, ys) (xs increasing)."""
    xs = np.asarray(xs, np.float64); ys = np.asarray(ys, np.float64)
    out_x, out_y = [], []
    P = np.concatenate([[2 * ys[0] - ys[1]], ys, [2 * ys[-1] - ys[-2]]])
    X = np.concatenate([[2 * xs[0] - xs[1]], xs, [2 * xs[-1] - xs[-2]]])
    per = max(4, n // (len(xs) - 1))
    for i in range(len(xs) - 1):
        t = np.linspace(0, 1, per, endpoint=False)
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        x0, x1, x2, x3 = X[i], X[i + 1], X[i + 2], X[i + 3]
        f = lambda a, b, c, d: .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
        out_x.append(f(x0, x1, x2, x3)); out_y.append(f(p0, p1, p2, p3))
    out_x.append([xs[-1]]); out_y.append([ys[-1]])
    return np.concatenate(out_x), np.concatenate(out_y)


class ZLoft(Node):
    """Solid lofted along z through stations (z, y_top, y_bottom, half_width_top, half_width_bottom,
    exponent). Sections are superellipses whose half-width blends from bottom to top, so a
    section can be a pear (broad jowls, narrow crown). Approximate distance, exact zero set."""
    def __init__(self, stations, x0=0.0, mat=0):
        st = np.asarray(stations, np.float64)
        order = np.argsort(st[:, 0]); st = st[order]
        self.z = None; cols = []
        for c in range(1, 6):
            z, val = _catmull(st[:, 0], st[:, c]); cols.append(val)
            self.z = z
        self.top, self.bot, self.wt, self.wb, self.n = [np.asarray(c, F) for c in cols]
        self.x0 = F(x0); self.mat = mat
        wmax = float(max(self.wt.max(), self.wb.max()))
        self.lo = _v((x0 - wmax, self.bot.min(), st[0, 0])); self.hi = _v((x0 + wmax, self.top.max(), st[-1, 0]))

    def d(self, p):
        z = p[:, 2]
        inside = (z >= self.z[0]) & (z <= self.z[-1])
        zc = np.clip(z, self.z[0], self.z[-1])
        top = np.interp(zc, self.z, self.top); bot = np.interp(zc, self.z, self.bot)
        wt = np.interp(zc, self.z, self.wt); wb = np.interp(zc, self.z, self.wb); n = np.interp(zc, self.z, self.n)
        yc = (top + bot) * .5; h = np.maximum((top - bot) * .5, 1e-4)
        yn = (p[:, 1] - yc) / h
        w = np.maximum(wb + (wt - wb) * np.clip((yn + 1) * .5, 0, 1), 1e-4)
        r = (np.abs((p[:, 0] - self.x0) / w) ** n + np.abs(yn) ** n) ** (1 / n)
        d = (r - 1) * np.maximum(np.minimum(h, w), .02)
        return np.where(inside, d, np.maximum(d, np.abs(z - zc)) + .002).astype(F)


class Field(Node):
    """Arbitrary vectorised distance function with an explicit bounding box."""
    def __init__(self, fn, lo, hi, mat=0):
        self.fn, self.mat = fn, mat
        self.lo, self.hi = _v(lo), _v(hi)

    def d(self, p):
        return self.fn(p)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * .25


class Union(Node):
    def __init__(self, children, k=0.0, mat=None):
        self.ch = [c for c in children if c is not None]; self.k = float(k)
        self.lo = np.min([c.lo for c in self.ch], 0) - self.k; self.hi = np.max([c.hi for c in self.ch], 0) + self.k
        # `mat` only names the union for culled blocks; children keep their own materials.
        self.mat = mat if mat is not None else self.ch[0].mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        d, m = None, None
        for c in self.ch:
            if not c.reaches(lo, hi):
                continue
            dc, mc = c.dm(p, lo, hi)
            if d is None:
                d, m = dc, mc
                continue
            take = dc < d
            m = np.where(take, mc, m)
            d = smin(d, dc, self.k)
        if d is None:
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        return d, m

    def d(self, p):
        return self.dm(p, p.min(0), p.max(0))[0]


class Cut(Node):
    """a minus b (smooth by k). Material stays a's, or `edge_mat` where the cut surface wins."""
    def __init__(self, a, b, k=0.0, edge_mat=None):
        self.a, self.b, self.k, self.edge = a, b, float(k), edge_mat
        self.lo, self.hi, self.mat = a.lo, a.hi, a.mat

    def dm(self, p, lo, hi):
        da, ma = self.a.dm(p, lo, hi)
        if not self.b.reaches(lo, hi):
            return da, ma
        db, _ = self.b.dm(p, lo, hi)
        d = -smin(-da, db, self.k)
        if self.edge is not None:
            ma = np.where(-db > da, np.int16(self.edge), ma)
        return d, ma


class Intersect(Node):
    def __init__(self, a, b, k=0.0):
        self.a, self.b, self.k = a, b, float(k)
        self.lo = np.maximum(a.lo, b.lo); self.hi = np.minimum(a.hi, b.hi); self.mat = a.mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        da, ma = self.a.dm(p, lo, hi)
        db, _ = self.b.dm(p, lo, hi)
        return -smin(-da, -db, self.k), ma


class Offset(Node):
    """Dilate (r > 0) or erode a node."""
    def __init__(self, a, r, mat=None):
        self.a, self.r = a, float(r)
        self.lo, self.hi = a.lo - max(r, 0), a.hi + max(r, 0)
        self.mat = a.mat if mat is None else mat
        self.force = mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        d, m = self.a.dm(p, lo, hi)
        if self.force is not None:
            m = np.full(len(p), self.force, np.int16)
        return d - F(self.r), m


class Shell(Node):
    """Hollow shell of thickness 2t around a's surface."""
    def __init__(self, a, t, mat=None):
        self.a, self.t = a, float(t)
        self.lo, self.hi = a.lo - t, a.hi + t
        self.mat = a.mat if mat is None else mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        d, _ = self.a.dm(p, lo, hi)
        return np.abs(d) - F(self.t), np.full(len(p), self.mat, np.int16)


class Displace(Node):
    """Adds fn(p) (|fn| <= amp) to a's distance; fn may use the point only."""
    def __init__(self, a, fn, amp):
        self.a, self.fn, self.amp = a, fn, float(amp)
        self.lo, self.hi, self.mat = a.lo - amp, a.hi + amp, a.mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        d, m = self.a.dm(p, lo, hi)
        near = np.abs(d) < self.amp * 2 + .01
        if near.any():
            d = d.copy(); d[near] += self.fn(p[near]).astype(F)
        return d, m


class Transform(Node):
    """Child authored in a local frame: world = origin + M @ local (M orthonormal, reflections allowed)."""
    def __init__(self, a, origin, M, scale=1.0):
        self.a, self.o, self.M, self.k = a, _v(origin), _v(M), F(scale)
        corners = np.array([[x, y, z] for x in (a.lo[0], a.hi[0]) for y in (a.lo[1], a.hi[1]) for z in (a.lo[2], a.hi[2])], F)
        w = (corners * self.k) @ self.M.T + self.o
        self.lo, self.hi, self.mat = w.min(0), w.max(0), a.mat

    def dm(self, p, lo, hi):
        if not self.reaches(lo, hi):
            return np.full(len(p), BIG, F), np.full(len(p), self.mat, np.int16)
        q = ((p - self.o) @ self.M) / self.k
        d, m = self.a.dm(q.astype(F), q.min(0), q.max(0))
        return d * self.k, m


class Material(Node):
    def __init__(self, a, mat):
        self.a, self.mat = a, mat
        self.lo, self.hi = a.lo, a.hi

    def dm(self, p, lo, hi):
        d, _ = self.a.dm(p, lo, hi)
        return d, np.full(len(p), self.mat, np.int16)


def evaluate(node, p, cull=True):
    """Distance and material at arbitrary points (chunked). With cull=False every primitive is
    evaluated, so distances stay true far from the surface (gradients, projections)."""
    d = np.empty(len(p), F); m = np.empty(len(p), np.int16)
    wide = np.full(3, 1e9, F)
    for s in range(0, len(p), 65536):
        q = p[s:s + 65536].astype(F)
        d[s:s + 65536], m[s:s + 65536] = node.dm(q, q.min(0), q.max(0)) if cull else node.dm(q, -wide, wide)
    return d, m


def mesh(node, lo, hi, voxel, block=32, band_voxels=3, log=print):
    """Polygonize node's zero level inside [lo, hi] with OpenVDB. Returns (verts, quads)."""
    import openvdb as vdb
    band = F(band_voxels * voxel)
    grid = vdb.FloatGrid(float(band)); grid.gridClass = vdb.GridClass.LEVEL_SET
    grid.transform = vdb.createLinearTransform(voxelSize=voxel)
    i_lo = np.floor(_v(lo) / voxel).astype(np.int64); i_hi = np.ceil(_v(hi) / voxel).astype(np.int64)
    counts = (i_hi - i_lo + block - 1) // block
    reach = block * voxel * math.sqrt(3) * .5 * 1.6 + float(band)
    ar = np.arange(block)
    local = np.stack(np.meshgrid(ar, ar, ar, indexing='ij'), -1).reshape(-1, 3)
    evaluated = 0
    centres = []
    for bi in range(counts[0]):
        for bj in range(counts[1]):
            for bk in range(counts[2]):
                centres.append((bi, bj, bk))
    cidx = np.array(centres, np.int64)
    corner = i_lo + cidx * block
    cpos = ((corner + block / 2) * voxel).astype(F)
    cd, _ = evaluate(node, cpos)
    for (bi, bj, bk), start, dc in zip(centres, corner, cd):
        if abs(dc) > reach:
            if dc < 0:
                a = tuple(int(x) for x in start); b = tuple(int(x) for x in start + block - 1)
                grid.fill(a, b, float(-band), True)
            continue
        idx = start + local
        p = (idx * voxel).astype(F)
        blo, bhi = p[0], p[-1]
        d, _ = node.dm(p, blo, bhi)
        d = np.clip(d, -band, band).astype(F).reshape(block, block, block)
        grid.copyFromArray(d, ijk=tuple(int(x) for x in start), tolerance=0)
        evaluated += 1
    log(f'sdf blocks {evaluated} of {len(centres)}')
    verts, quads = grid.convertToQuads(isovalue=0.0)
    return np.asarray(verts, F), np.asarray(quads, np.int64)


def vertex_normals(verts, faces):
    n = np.zeros_like(verts)
    if faces.shape[1] == 4:
        a, b, c, d = (verts[faces[:, i]] for i in range(4))
        fn = np.cross(c - a, d - b)
    else:
        a, b, c = (verts[faces[:, i]] for i in range(3))
        fn = np.cross(b - a, c - a)
    for i in range(faces.shape[1]):
        np.add.at(n, faces[:, i], fn)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n


# ------------------------------------------------------------------ noise (shared with painting)
def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xffffff).astype(F) / F(0xffffff)


def value_noise(p, seed=0):
    """Smooth 3D value noise in [0, 1] for an (n, 3) array of points."""
    i = np.floor(p).astype(np.int64); f = (p - i).astype(F); f = f * f * (3 - 2 * f)
    out = np.zeros(len(p), F)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, octaves=4, seed=0):
    total, amp, norm = np.zeros(len(p), F), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(p * (2 ** o), seed + o); norm += amp; amp *= .5
    return total / F(norm)


def cells(p, seed=0):
    """Distance to the nearest jittered feature point (Worley F1), in cell units."""
    i = np.floor(p).astype(np.int64); best = np.full(len(p), 9.0, F)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                j = np.stack([_hash(c[:, 0], c[:, 1], c[:, 2], seed + k) for k in range(3)], 1)
                best = np.minimum(best, np.linalg.norm(c + j - p, axis=1).astype(F))
    return best
