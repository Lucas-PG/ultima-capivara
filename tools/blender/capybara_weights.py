"""Skin weights, team mask and fur mask for the v6 game meshes (numpy, game space).

Body weights are a soft minimum over the sculpt's body parts: a vertex (skin, cloth or gear)
belongs to the parts it is nearest to, blended where parts meet, so a sleeve follows its arm
and a trouser leg its thigh. Gear with its own motion (pack, hip cloth) and the face (lids,
ears, brows, mouth) are then assigned explicitly. Paw digits use ownership along each digit's
joint chain, like the first-person arms, so a finger never drags its neighbour.
"""
import numpy as np
import capy_sdf as S
import capybara_form as C
import paw_sculpt as P

F = np.float32


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _paw_local(pts, s):
    Mr = C.paw_frame(s)
    return ((pts - C.wrist(s)) @ Mr) / C.PAW_SCALE


CHAINS = {f: np.array([tuple(p) for p in P.POINTS[f]], F) for f in P.FINGERS}
RADII = {f: np.array(P.DIGITS[f]['radii'], F) for f in P.FINGERS}


def _chain(q, finger):
    chain = CHAINS[finger]; best = np.full(len(q), 9.0, F); t = np.zeros(len(q), F)
    for s in range(3):
        a, b = chain[s], chain[s + 1]; ab = b - a
        u = ((q - a) @ ab) / (ab @ ab)
        uc = np.clip(u, 0, 1) if s else np.clip(u, -3, 1)
        d = np.linalg.norm(q - (a + uc[:, None] * ab), axis=1)
        better = d < best; best[better] = d[better]; t[better] = (s + uc)[better]
    seg = np.clip(np.floor(t), 0, 2).astype(int); u = np.clip(t - seg, 0, 1)
    r = RADII[finger][seg] * (1 - u) + RADII[finger][np.minimum(seg + 1, 3)] * u
    return best, t, r


def _paw_weights(q, n):
    """Per vertex dict of paw bone weights (names without side), from paw-space points."""
    owner = np.full(len(q), -1, np.int8); tpar = np.zeros(len(q), F); best = np.full(len(q), 9.0, F)
    for k, finger in enumerate(P.FINGERS):
        d, t, r = _chain(q, finger)
        mine = (t > .12) & (d < r * 1.7 + .002) & (d - r < best)
        owner[mine] = k; tpar[mine] = t[mine]; best[mine] = (d - r)[mine]
    out = []
    for i in range(len(q)):
        o, t, y = owner[i], float(tpar[i]), float(q[i, 1])
        if o < 0:
            wr = float(ss(-.022, .008, y))
            out.append({'forearm_twist': 1 - wr, 'paw': wr})
            continue
        f = P.FINGERS[o]; seg = int(min(2, max(0, np.floor(t)))); u = t - seg
        cur, prev, nxt = f'{f}{seg + 1}', ('paw' if seg == 0 else f'{f}{seg}'), (f'{f}{seg + 2}' if seg < 2 else None)
        if u < .22:
            k = .5 + .5 * float(ss(0, .22, u)) if seg else float(ss(.12, .45, t))
            out.append({cur: k, prev: 1 - k})
        elif u > .84 and nxt:
            k = .5 + .5 * (1 - float(ss(.84, 1, u)))
            out.append({cur: k, nxt: 1 - k})
        else:
            out.append({cur: 1.0})
    return out


def weights(parts, root, REST, pts, nrm, partv, sigma=.013):
    pts = np.asarray(pts, F)
    _, mat = S.evaluate(root, pts)
    names = ['torso', 'neck', 'head'] + [f'{p}_{n}' for n in 'LR' for p in ('upper', 'fore', 'paw', 'thigh', 'shin', 'foot')]
    D = np.stack([S.evaluate(parts[k], pts)[0] for k in names], 1)
    dmin = D.min(1, keepdims=True)
    soft = np.exp(-(D - dmin) / sigma); soft[soft < .03] = 0
    soft /= soft.sum(1, keepdims=True)
    y = pts[:, 1]
    out = []
    M = C.M
    paw_cache = {}
    for s, n in ((-1, 'L'), (1, 'R')):
        idx = np.where(soft[:, names.index('paw_' + n)] > 0)[0]
        if len(idx):
            q = _paw_local(pts[idx], s)
            pw = _paw_weights(q, nrm[idx])
            for i, w in zip(idx, pw):
                paw_cache[(n, i)] = {('paw_' + k + '_' + n if k not in ('paw', 'forearm_twist') else k + '_' + n): v for k, v in w.items()}
    for i in range(len(pts)):
        w = {}
        def add(bone, value):
            if value > 1e-4:
                w[bone] = w.get(bone, 0) + value
        for j, name in enumerate(names):
            a = soft[i, j]
            if a <= 0:
                continue
            if name == 'torso':
                c = float(ss(.97, 1.16, y[i]))
                b = float(ss(.20, .08, np.linalg.norm((pts[i] - np.array([0, .98, -.20], F)) * np.array([.8, 1, 1.4], F)))) * .8
                add('spine', a * (1 - c) * (1 - b)); add('chest', a * c * (1 - b)); add('belly', a * b)
            elif name == 'neck':
                h = float(ss(1.46, 1.54, y[i])); c = float(ss(1.40, 1.33, y[i]))
                add('chest', a * c); add('neck', a * (1 - c) * (1 - h)); add('head', a * (1 - c) * h)
            elif name == 'head':
                add('head', a)
            else:
                kind, n = name.split('_')
                if kind == 'upper':
                    add('arm_' + n, a)
                elif kind == 'fore':
                    el, wr = REST['forearm_' + n]
                    t = float(np.clip((pts[i] - el) @ (wr - el) / ((wr - el) @ (wr - el)), 0, 1))
                    tw = float(ss(.30, .85, t)); add('forearm_' + n, a * (1 - tw)); add('forearm_twist_' + n, a * tw)
                elif kind == 'paw':
                    for bone, v in paw_cache.get((n, i), {'paw_' + n: 1.0}).items():
                        add(bone, a * v)
                elif kind == 'thigh':
                    add('thigh_' + n, a)
                elif kind == 'shin':
                    add('shin_' + n, a)
                elif kind == 'foot':
                    tb = REST['toes_' + n][0]
                    tz = float(ss(tb[2] + .02, tb[2] - .02, pts[i, 2]))
                    add('foot_' + n, a * (1 - tz)); add('toes_' + n, a * tz)
        m = int(mat[i])
        p = pts[i]
        # Gear with its own motion and rigid leather pieces.
        if m in (M['pack'], M['canvas']) or (m in (M['strap'], M['brass']) and p[2] > .14):
            w = {'pack': 1.0}
        elif m == M['hipcloth']:
            h = float(ss(.86, .70, p[1])); w = {'spine': 1 - h, 'hipcloth': h}
        elif m in (M['leather'], M['brass']) and p[1] < 1.0:
            w = {'spine': 1.0}
        if partv[i] == 1:
            w = {'blink_' + ('R' if p[0] > 0 else 'L'): 1.0}
        elif 'head' in w and w['head'] > .5:
            s = 1 if p[0] > 0 else -1; n = 'R' if s > 0 else 'L'
            e, out_dir = C.eye_point(s)
            de = float(np.linalg.norm(p - e))
            lid = float(ss(C.EYE_R + .016, C.EYE_R + .004, de)) * float((p - e) @ out_dir > -.004)
            ear_c = C.side((.100, 1.786, .090), s)
            ear = float(ss(.050, .030, np.linalg.norm(p - ear_c))) * float(p[1] > 1.745)
            brow = float(ss(.030, .012, np.linalg.norm(p - (e + np.array([0, .030, 0], F))))) * .6
            mc = C.side((.052, 1.540, -.262), s)
            corner = float(ss(.028, .010, np.linalg.norm(p - mc))) * .8
            jaw = float(ss(1.535, 1.51, p[1]) * ss(-.15, -.22, p[2])) * .7
            head = w.pop('head')
            rest = 1.0
            for bone, v in ((('blink_' + n), lid), ('ear_' + n, ear), ('brow_' + n, brow), ('mouth_' + n, corner), ('jaw', jaw)):
                v = min(v, rest); rest -= v
                if v > 0:
                    w[bone] = w.get(bone, 0) + head * v
            w['head'] = w.get('head', 0) + head * rest
        if any(k.startswith('paw_') and k[4:].rstrip('_LR').rstrip('0123456789') in P.FINGERS for k in w):
            # A digit vertex belongs to its paw chain only (no blend with the sleeve or belly).
            w = {k: val for k, val in w.items() if k.startswith('paw_')}
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        total = sum(v for _, v in top)
        out.append({k: v / total for k, v in top if v / total > .002})
    team = np.isin(mat, [M[k] for k in C.TEAM]).astype(F)
    fur = (mat == M['fur']).astype(F)
    return out, team, fur
