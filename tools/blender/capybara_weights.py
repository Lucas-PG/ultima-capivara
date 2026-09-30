"""Skin weights, team mask and fur mask for the v6 game meshes (numpy, game space).

Body weights are a soft minimum over the sculpt's body parts: a vertex (skin, cloth or gear)
belongs to the parts it is nearest to, blended where parts meet, so a sleeve follows its arm
and a trouser leg its thigh. Gear with its own motion (pack, hip cloth) and the face (lids,
ears, brows, mouth, bandana tails, blanket) are then assigned explicitly. Paw digits use ownership
along each digit's joint chain, like the first-person arms, so a finger never drags its neighbour.
"""
import numpy as np
import capy_sdf as S
import capybara_form as C
import capy_hand as P

F = np.float32


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _paw_local(pts, s):
    Mr = C.paw_frame(s)
    return (pts - C.wrist(s)) @ Mr


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
        mine = (t > .12) & (d < r * 1.7 + .004) & (d - r < best)
        owner[mine] = k; tpar[mine] = t[mine]; best[mine] = (d - r)[mine]
    out = []
    for i in range(len(q)):
        o, t, y = owner[i], float(tpar[i]), float(q[i, 1])
        if o < 0:
            wr = float(ss(-.045, .018, y))
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
                b = float(ss(.24, .10, np.linalg.norm((pts[i] - np.array([0, .98, -.23], F)) * np.array([.8, 1, 1.4], F)))) * .8
                add('spine', a * (1 - c) * (1 - b)); add('chest', a * c * (1 - b)); add('belly', a * b)
            elif name == 'neck':
                h = float(ss(1.46, 1.54, y[i])); c = float(ss(1.40, 1.33, y[i]))
                add('chest', a * c); add('neck', a * (1 - c) * (1 - h)); add('head', a * (1 - c) * h)
            elif name == 'head':
                add('head', a)
            else:
                kind, n = name.split('_')
                if kind == 'upper':
                    # Near the armhole the shirt stays with the chest like the vest beside it,
                    # so raising the arm to a gun stretches cloth instead of opening a gap.
                    sh, el = REST['arm_' + n]
                    t = float(np.clip((pts[i] - sh) @ (el - sh) / ((el - sh) @ (el - sh)), 0, 1))
                    keep = float(ss(.18, .44, t)) if int(mat[i]) == M['shirt'] else 1.0
                    add('arm_' + n, a * keep); add('chest', a * (1 - keep))
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
        leather_ids = (M['leather'], M['brass'], M['pouch'], M['pack_flap'])
        if m == M['canvas']:
            w = {'bedroll': 1.0}
        elif m == M['pack'] or (m in (M['strap'], M['brass'], M['pouch'], M['pack_flap']) and p[2] > .14):
            # Straps and buckles on the blanket go with it, the rest with the rucksack.
            w = {'bedroll': 1.0} if p[1] > 1.30 and p[2] > .18 else {'pack': 1.0}
        elif m == M['hipcloth']:
            h = float(ss(C.RAG_TOP[1] - .03, C.RAG_TOP[1] - .17, p[1])); w = {'spine': 1 - h, 'hipcloth': h}
        elif m == M['scarf']:
            # The band rides the neck and chest (never the head); each tail swings from the knot.
            c = float(ss(1.45, 1.38, p[1])); tail = float(ss(1.352, 1.300, p[1])) * float(p[2] < -.15)
            w = {'chest': c * (1 - tail), 'neck': (1 - c) * (1 - tail), 'scarf_' + ('R' if p[0] > 0 else 'L'): tail}
            w = {k: val for k, val in w.items() if val > 1e-4}
        elif m == M['collar']:
            w = {'chest': 1.0}
        elif m in leather_ids and .78 < p[1] < 1.0:
            w = {'spine': 1.0}
        elif m in (M['denim'], M['denim_pocket'], M['denim_collar'], M['strap'], M['brass']):
            # The vest and its straps ride the torso: arm weights would tear them at the armhole
            # when the arms come up to a gun.
            w = {k: val for k, val in w.items() if not k.startswith(('arm_', 'forearm_'))} or {'chest': 1.0}
        if partv[i] == 1:
            w = {'blink_' + ('R' if p[0] > 0 else 'L'): 1.0}
        elif partv[i] == 2:
            w = {'head': 1.0}            # whiskers
        elif 'head' in w and w['head'] > .5:
            s = 1 if p[0] > 0 else -1; n = 'R' if s > 0 else 'L'
            e, out_dir = C.eye_point(s)
            de = float(np.linalg.norm(p - e))
            lid = float(ss(C.EYE_R + .016, C.EYE_R + .004, de)) * float((p - e) @ out_dir > -.004)
            ear_c = C.side(C.EAR, s)
            ear = float(ss(.066, .042, np.linalg.norm(p - ear_c))) * float(p[1] > 1.735)
            brow = float(ss(.036, .014, np.linalg.norm(p - (e + np.array([0, .034, 0], F))))) * .6
            mc = C.side(C.MOUTH_CORNER, s)
            corner = float(ss(.028, .010, np.linalg.norm(p - mc))) * .8
            jaw = float(ss(1.535, 1.51, p[1]) * ss(-.15, -.22, p[2])) * .7
            # The nose leather and the top of the muzzle front ride the nose bone (the idle's twitch).
            nose = float(ss(.060, .030, np.linalg.norm(p - C.v(0, 1.668, -.345)))) * float(p[2] < -.29) * .85
            head = w.pop('head')
            rest = 1.0
            for bone, v in ((('blink_' + n), lid), ('ear_' + n, ear), ('brow_' + n, brow), ('mouth_' + n, corner), ('jaw', jaw), ('nose', nose)):
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
    # Fur length for the close-range shells: full on the pelt, short on the muzzle, none on the
    # nose leather, lids, ears, the bare skin of the paws (palm and digits) and the toes.
    fur = ((mat == M['fur']) & (np.asarray(partv) == 0)).astype(F)
    head = pts[:, 1] > 1.45
    # Shorter toward the muzzle and gone at its front, fading so the pelt has no hard edge.
    fur *= np.where(head, .35 + .65 * np.clip((pts[:, 2] + .30) / .14, 0, 1), 1.0) * np.where(head & (pts[:, 2] < -.30), 0, 1)
    for s in (-1, 1):
        e, _ = C.eye_point(s)
        fur *= np.linalg.norm(pts - e, axis=1) > C.EYE_R + .010
        # Paw: fur on the back of the hand up to the knuckles only.
        loc = _paw_local(pts, s); on_paw = (loc[:, 1] > -.01) & (np.linalg.norm(loc, axis=1) < .30)
        fur *= ~(on_paw & ((loc[:, 1] > .095) | (loc[:, 2] < .012)))
        fur *= np.where(on_paw, .6, 1.0)
        # Foot: fur on the instep, none on the toes and sole.
        fl = (pts - C.foot_point(s, 0, 0, 0)) @ C.foot_frame(s)
        fur *= ~((np.linalg.norm(fl[:, [0, 2]], axis=1) < .26) & (pts[:, 1] < .10) & (fl[:, 2] < -.085))
    return out, team, fur.astype(F)
