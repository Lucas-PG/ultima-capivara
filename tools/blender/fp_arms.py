"""First-person capybara arms (v4): the world character's own paw, forearm and rolled cuff.

Blender 5.0.1, metres. Arm frame: shoulder at the origin, the arm along +Y (elbow at ELBOW,
wrist at WRIST), the back of the paw +Z, the index toward -X (right arm). This is also the
paw space of capy_hand.py, so the paw is the character's paw (capy_hand.build) placed at the
wrist at PAW_SCALE: third-person guns are drawn at TP_WEAPON_SCALE (1.3) so the big world paw
holds them, first-person guns at 1.0, so the first-person paw is the world paw at 1 / 1.3 and
every grip reads with the same paw-to-gun proportion in both views.

1. The sculpt is signed distance fields (capy_sdf.py): the character's forearm sections
   (capybara_form.arm) and the character's paw, fused with a small fillet, inside the
   character's rolled linen sleeve and cuff (capybara_form.shirt), all scaled by PAW_SCALE
   across the arm. The arm keeps the rig's lengths (the IK framing depends on them).
2. OpenVDB polygonizes it densely; the dense copy gets fine relief and per-vertex paint in
   the character's palette and rules (capybara_paint.py: groomed locks, a lighter inner
   forearm, bare leathery skin on the palm and digits, glossy dark claws, linen), evaluated
   in world-paw coordinates so locks, borders and grain land exactly where they do on the
   character. A decimated copy is the game mesh; colour, roughness, normal and occlusion are
   baked from the dense copy onto its own 2K maps.
3. Skin weights follow bone ownership (every vertex belongs to the hand or to one digit
   chain, blended across joints only); a `_FUR` vertex attribute tells the runtime where fur
   shells grow and how long.

Usage: blender -b --python tools/blender/fp_arms.py [-- --voxel .0006 --tris 15000]
"""
import bpy
import bmesh
import json
import math
import sys
import time
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capy_sdf as S
import capy_hand as H
import capybara_paint as CP

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/fp'; OUT.mkdir(parents=True, exist_ok=True)
TEX = 2048
# Options after `--` (environment variables do not reach the remote build machine).
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = dict(zip(ARGV[::2], ARGV[1::2]))
GAME_TRIS = int(OPT.get('--tris', 15000))
VOXEL = float(OPT.get('--voxel', .0006))
# The world paw at the first-person gun scale (1 / TP_WEAPON_SCALE).
PAW_SCALE = 1 / 1.3
K = PAW_SCALE
ELBOW, WRIST = .30, .60
F = np.float32
MAT = {'fur': 0, 'claw': 1, 'shirt': 2, 'cuff': 3}
PART = {'fur': 0, 'shirt': 1, 'cuff': 1, 'claw': 2}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
started = time.time()


def log(*a):
    print(f'[fp_arms {time.time() - started:6.1f}s]', *a, flush=True)


srgb, ss, lerp = CP.srgb, CP.ss, CP.lerp


def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj


def coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, F); obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def normals(obj):
    n = np.empty(len(obj.data.vertices) * 3, F); obj.data.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3)


def mesh_object(name, verts, faces):
    faces = np.asarray(faces, np.int64); k = faces.shape[1]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', np.asarray(verts, F).ravel())
    me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * k).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(faces), k, np.int32))
    me.update(calc_edges=True); me.validate(clean_customdata=False)
    me.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
    return link(bpy.data.objects.new(name, me))


# ------------------------------------------------------------------ the sculpt (arm space)
W = np.array([0, WRIST, 0], F)
Y = np.array([0, 1, 0], F)


def v(*a):
    return np.array(a, F)


# The character's forearm (capybara_form.arm): widest below the elbow, tapering to a broad
# wrist; the larger half-axis runs back to palm (the character's `out` side is the back of the
# paw), the smaller across the knuckles. Stations keep the character's 30 / 70 percent spacing.
FORE_Y = [ELBOW, ELBOW + (WRIST - ELBOW) * .30, ELBOW + (WRIST - ELBOW) * .70, WRIST]
FORE_BACK = [.086 * K, .088 * K, .076 * K, .064 * K]
FORE_SIDE = [.080 * K, .080 * K, .066 * K, .052 * K]
# Inside the sleeve the arm runs on as the character's upper arm; the sleeve hides it.
UPPER_Y = [.12, .20, ELBOW]
UPPER_R = [.096 * K, .096 * K, .086 * K]
SLEEVE_Y = [-.12, .16, ELBOW]
SLEEVE_R = [.116 * K, .116 * K, .106 * K]
# The character's shirt sleeve ends just past the elbow in a flat cuff band folded back over
# a soft roll (capybara_form.shirt), offset .020 off the upper arm.
SLEEVE_END = ELBOW + .030 * K


def sleeve_folds(p):
    """The character's sleeve drape and the crumple above the cuff (capybara_form.shirt_folds)."""
    t = p[:, 1]
    around = np.arctan2(p[:, 0], p[:, 2])
    wob = S.value_noise(np.stack([t * 26, around * 1.5, np.full(len(t), 3.0, F)], 1).astype(F), 61)
    drape = np.sin(around * 3 + t * 22 + wob * 3) * .6 + np.sin(around * 5 - t * 14 + wob * 5) * .4
    crumple = np.sin(t * 70 + around * 2 + wob * 6) * ss(.16, .25, t)
    return ((.0040 * drape + .0028 * crumple) * (.5 + .5 * wob) * K).astype(F)


def sculpt():
    fore = S.Loft([(0, y, 0) for y in FORE_Y], FORE_BACK, FORE_SIDE, side=(0, 0, 1), mat=MAT['fur'])
    upper = S.Loft([(0, y, 0) for y in UPPER_Y], UPPER_R, UPPER_R, side=(0, 0, 1), mat=MAT['fur'])
    paw = S.Transform(H.build(MAT['fur'], MAT['claw']), W, np.eye(3, dtype=F), K)
    skin = S.Union([S.Union([upper, fore], k=.030 * K, mat=MAT['fur']), paw], k=.012 * K)
    tube = S.Loft([(0, y, 0) for y in SLEEVE_Y], SLEEVE_R, SLEEVE_R, side=(0, 0, 1))
    sleeve = S.Intersect(S.Displace(tube, sleeve_folds, .007 * K), S.Plane(v(0, SLEEVE_END, 0), Y))
    # Keep the shoulder end inside the frame edge: a flat, closed cap at y = 0.
    sleeve = S.Intersect(sleeve, S.Plane(v(0, -.005, 0), -Y))
    R = S.frame(Y, up=(0, 0, 1))
    cuff = S.Union([S.Torus(v(0, SLEEVE_END - .010 * K, 0), .100 * K, .024 * K, R=R, squash=1.35),
                    S.Torus(v(0, SLEEVE_END - .046 * K, 0), .103 * K, .017 * K, R=R, squash=1.2)], k=.010 * K)
    cloth = S.Union([S.Material(sleeve, MAT['shirt']), S.Material(cuff, MAT['cuff'])], k=.004 * K)
    return S.Union([skin, cloth], k=.004 * K)


# ------------------------------------------------------------------ anatomy queries
CHAINS = {f: np.array(H.POINTS[f], F) * K + W for f in H.FINGERS}
RADII = {f: np.array(H.DIGITS[f]['radii'], F) * K for f in H.FINGERS}
TOPS = {f: np.array([H.digit_frame(f, i)[2] for i in range(3)], F) for f in H.FINGERS}


def chain_query(pts, finger):
    """Per point: distance to the digit's joint polyline, chain parameter t (0 at the base
    joint, 3 at the tip, extrapolated below 0 behind it), surface radius and the digit's top."""
    chain = CHAINS[finger]; best = np.full(len(pts), 9.0, F); t = np.zeros(len(pts), F)
    for s in range(3):
        a, b = chain[s], chain[s + 1]; ab = b - a
        u = ((pts - a) @ ab) / (ab @ ab)
        uc = np.clip(u, 0, 1) if s else np.clip(u, -3, 1)
        d = np.linalg.norm(pts - (a + uc[:, None] * ab), axis=1)
        better = d < best; best[better] = d[better]; t[better] = (s + uc)[better]
    seg = np.clip(np.floor(t), 0, 2).astype(int)
    u = np.clip(t - seg, 0, 1)
    r = RADII[finger][seg] * (1 - u) + RADII[finger][np.minimum(seg + 1, 3)] * u
    return best, t, r, TOPS[finger][seg]


def paw_regions(pts, nrm):
    """Owner digit (or -1 for the hand), chain parameter, and back-of-digit factor."""
    owner = np.full(len(pts), -1, np.int8); tpar = np.zeros(len(pts), F)
    back = np.clip(nrm[:, 2] * 1.4 + .25, 0, 1)
    best = np.full(len(pts), 9.0, F)
    for k, finger in enumerate(H.FINGERS):
        d, t, r, top = chain_query(pts, finger)
        # A digit owns what lies around it past its base joint (the knuckle web stays with the hand).
        mine = (t > .12) & (d < r * 1.55) & (d - r < best) & (pts[:, 1] > WRIST)
        owner[mine] = k; tpar[mine] = t[mine]; best[mine] = (d - r)[mine]
        facing = np.clip(np.einsum('ij,ij->i', nrm, top) * 1.3 + .2, 0, 1)
        back[mine] = facing[mine]
    return owner, tpar, back


def world(pts):
    """Arm-space points in the world character's metres (the paint and grooming units)."""
    return (pts / K).astype(F)


def hand_local(pts):
    """Points in the world paw's own space (capy_hand metres)."""
    return ((pts - W) / K).astype(F)


def bare_skin(pts, nrm):
    """The character's paw rule (capybara_paint): bare leathery skin on the palm and on the
    digits past the knuckles, fur on the back of the paw up to the knuckles."""
    h = hand_local(pts)
    # A soft, tufted border (the character's 4 mm speckle reads as grit this close to the eye).
    jag = (S.fbm(world(pts) * 140, 2, seed=13) - .5) * .016
    on_paw = (h[:, 1] > -.02) & (np.linalg.norm(h, axis=1) < .30)
    palm = ss(.016, .004, h[:, 2] + jag) * ss(-.012, .012, h[:, 1])
    digits = ss(.088, .104, h[:, 1] + jag)
    return np.maximum(palm, digits) * on_paw


def weave(q, pitch, amp):
    u = S.value_noise(q * np.array([1 / pitch, 1 / (pitch * 6), 1 / pitch], F), 21)
    w = S.value_noise(q * np.array([1 / (pitch * 6), 1 / pitch, 1 / (pitch * 6)], F), 22)
    return ((np.sin(q[:, 0] / pitch * math.pi) * np.sin(q[:, 1] / pitch * math.pi) * .5 + (u + w - 1) * .5) * amp).astype(F)


# ------------------------------------------------------------------ detail and paint
def groom(q, across, along, amp, seed):
    """capybara_paint.groom for one flow frame (across x and z, along y, world-paw metres)."""
    d1, edge, hid = CP._worley2(np.stack([q[:, 0] / across, q[:, 2] / across], 1), seed)
    al = q[:, 1]
    ph = np.mod(al / (along * 1.6) + hid * 7.31 + .5 * d1, 1.0)
    clump = ss(.70, .15, d1)
    fine = S.value_noise(np.stack([q[:, 0] / (across * .09), q[:, 2] / (across * .09), al / (along * .7)], 1).astype(F), seed + 11)
    med = S.value_noise(np.stack([q[:, 0] / (across * .28), q[:, 2] / (across * .28), al / (along * 1.1)], 1).astype(F), seed + 12)
    strand = .55 * fine + .45 * med
    tip = ss(.55, .97, ph) * clump * ss(.35, .65, med)
    ridge = clump * (.55 + .45 * ss(0.0, .30, ph))
    h = amp * (clump * (.35 + .65 * ph) * .7 + .45 * (strand - .5))
    return h, ridge, tip, strand, hid


def paint(obj, mat):
    """Displace the dense sculpt with fine relief; colour and roughness per vertex."""
    pts, nrm = coords(obj), normals(obj)
    q = world(pts)
    colour = np.zeros((len(pts), 3), F); rough = np.full(len(pts), .8, F); height = np.zeros(len(pts), F)
    broad = S.fbm(q * 5, 2, seed=31)
    # ---- fur and bare skin
    fur = mat == MAT['fur']
    p, n, qq = pts[fur], nrm[fur], q[fur]
    # The character's combed locks (capybara_paint.groom) in the arm's own flow frame: the comb runs
    # from the elbow down the forearm and over the back of the paw to the digits, which is arm-space
    # +y throughout, so the locks never shear. Paw and forearm locks are 9 x 26 mm on the world paw.
    h, ridge, tip, strand, hid = groom(qq, .009, .026, .0008, 2)
    c = np.broadcast_to(srgb(CP.FUR_BASE), p.shape).copy()
    hl = hand_local(p)
    # A lighter inner forearm (the palm side behind the wrist) and lighter undersides.
    inner = ss(.04, -.05, hl[:, 2]) * ss(.22, .12, np.abs(hl[:, 0])) * ss(.08, .01, hl[:, 1]) * ss(-.34, -.22, hl[:, 1])
    c = lerp(c, srgb(CP.FUR_LIGHT), np.maximum(inner * .6, np.clip(-n[:, 2], 0, 1) * .35 * (hl[:, 1] < .02)))
    # Lock shading as on the character: dark roots and gaps, light tips, a value per lock, fine
    # strands, renormalised so a lock's mean stays the palette value.
    shade = (.76 + .28 * ridge) * (.86 + .28 * strand) * (.94 + .12 * hid)
    c = c * (shade / CP.LOCK_SHADE_MEAN)[:, None]
    c = lerp(c, srgb(CP.FUR_TIP), tip * .55)
    c = c * (.985 + .03 * broad[fur])[:, None]
    rgh = .82 + .06 * strand - .08 * ridge * tip
    skin = bare_skin(p, n)
    grain = S.cells(qq * 420, 11)
    sk = lerp(srgb(CP.SKIN), srgb(CP.SKIN_LIGHT), np.clip(n[:, 2], 0, 1) * .35 + np.clip(.55 - grain, 0, 1) * .16)
    # Close to the eye the paw also shows its joints: creases under each digit joint, soft
    # wrinkles over the knuckles and two folds across the palm pad, darker in the skin tone.
    owner, tpar, back = paw_regions(p, n)
    crease = np.zeros(len(p), F)
    for k in range(len(H.FINGERS)):
        mine = owner == k
        for joint in (1, 2):
            x = tpar[mine] - joint
            under = (1 - back[mine]) ** 2
            crease[mine] += np.exp(-(x / .05) ** 2) * under + (np.exp(-((x - .08) / .03) ** 2) + np.exp(-((x + .08) / .03) ** 2)) * back[mine] ** 2 * .18
    palm_pad = (owner < 0) & (hl[:, 2] < -.01) & (hl[:, 1] > .03)
    for y0 in (.070, .088):
        crease[palm_pad] += np.exp(-((hl[palm_pad, 1] - y0 - hl[palm_pad, 0] * .25) / .0022) ** 2) * .7
    crease *= skin
    sk = lerp(sk, srgb('2C2420'), np.clip(crease, 0, 1) * .55)
    c = lerp(c, sk, skin)
    colour[fur] = c
    rough[fur] = rgh * (1 - skin) + skin * (.62 - .10 * np.clip(.55 - grain, 0, 1))
    height[fur] = (h * (1 - skin) + skin * (.5 - np.clip(grain, 0, .8)) * .00040) * K - crease * .0003
    # ---- claws: short, blunt, glossy and dark, lighter along the top
    sel = mat == MAT['claw']
    streak = S.value_noise(q[sel] * np.array([3000, 400, 3000], F), 11)
    colour[sel] = lerp(srgb(CP.CLAW), srgb('5A4A40'), np.clip(nrm[sel, 2], 0, 1) * .5) * (.9 + .2 * streak)[:, None]
    rough[sel] = .30 + .06 * streak
    # ---- linen sleeve and cuff: the character's shirt, a quiet weave, soft slub
    sel = (mat == MAT['shirt']) | (mat == MAT['cuff'])
    wv = weave(q[sel], .0016, .02)
    slub = S.fbm(q[sel] * np.array([300, 60, 300], F), 3, seed=9)
    colour[sel] = np.broadcast_to(srgb(CP.LINEN), (int(sel.sum()), 3)) * (1 + wv)[:, None] * (.97 + .06 * slub)[:, None]
    # The cuff's fold edges: a slightly darker tone-on-tone band where the roll turns under.
    cuff = mat == MAT['cuff']
    colour[cuff] = lerp(colour[cuff], srgb('CDBFA4'), np.clip(-nrm[cuff, 1], 0, 1) * .5)
    rough[sel] = .90
    height[sel] = weave(q[sel], .0012, .00008) * K + (slub - .5) * .00025
    obj.data.vertices.foreach_set('co', (pts + nrm * height[:, None]).ravel()); obj.data.update()
    return colour, rough


def set_colour_attrs(obj, colour, rough):
    rgba = np.concatenate([np.clip(colour, 0, 1), np.clip(rough, 0, 1)[:, None]], 1).astype(F)
    attr = obj.data.color_attributes.new('paint', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', rgba.ravel())


def materials(pts, node):
    return S.evaluate(node, pts.astype(F), cull=False)[1]


# ------------------------------------------------------------------ build
node = sculpt()
lo_b, hi_b = v(-.12, -.02, -.12), v(.12, WRIST + .25, .12)
verts, quads = S.mesh(node, lo_b, hi_b, VOXEL, log=log)
quads = quads[:, ::-1]
log('dense surface', len(verts), 'vertices')
hi = mesh_object('arm_hi', verts, quads)
mat_hi = materials(coords(hi), node)
log('paint')
colour, rough = paint(hi, mat_hi); set_colour_attrs(hi, colour, rough)

lo = hi.copy(); lo.data = hi.data.copy(); link(lo); lo.name = 'arm_lo'
lo.data.color_attributes.remove(lo.data.color_attributes['paint'])
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
m = lo.modifiers.new('dec', 'DECIMATE'); m.ratio = GAME_TRIS / max(1, len(lo.data.polygons) * 2); m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=m.name)
bm = bmesh.new(); bm.from_mesh(lo.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(lo.data); bm.free()
arm = lo
log('game mesh', len(arm.data.polygons), 'tris')

pts, nrm = coords(arm), normals(arm)
mat_lo = materials(pts, node)
part = np.array([PART[{v_: k for k, v_ in MAT.items()}[m_]] for m_ in mat_lo], np.int32)
tag = arm.data.attributes.new('part', 'INT', 'POINT'); tag.data.foreach_set('value', part)
# Fur length: the forearm full, the back of the paw shorter toward the knuckles; none on the
# bare skin, the claws and the linen.
bare = bare_skin(pts, nrm)
hl = hand_local(pts)
on_paw = hl[:, 1] > -.02
fur_len = np.where(part == 0, (1 - bare) * np.where(on_paw, .6 - .35 * ss(.02, .10, hl[:, 1]), 1.0), 0.0).astype(F)
fur_len = np.where(fur_len > .02, fur_len, 0).astype(F)
attr = arm.data.attributes.new('_FUR', 'FLOAT', 'POINT'); attr.data.foreach_set('value', fur_len)

# UVs: one atlas for the whole arm, both sides share it (the left arm mirrors the right).
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.004, area_weight=0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=.003, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ bake
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 1
scene.render.bake.margin = 8; scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .004; scene.render.bake.max_ray_distance = .008
highs = [hi]


def emit_material(name, channel):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'paint'
    if channel == 'rgb':
        nt.links.new(attr.outputs['Color'], em.inputs['Color'])
    else:
        comb = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'): nt.links.new(attr.outputs['Alpha'], comb.inputs[k])
        nt.links.new(comb.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mt


def target_image(name, data):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=True)
    if data: img.colorspace_settings.name = 'Non-Color'
    return img


bake_mat = bpy.data.materials.new('bake_target'); bake_mat.use_nodes = True
bake_node = bake_mat.node_tree.nodes.new('ShaderNodeTexImage'); bake_mat.node_tree.nodes.active = bake_node
arm.data.materials.clear(); arm.data.materials.append(bake_mat)


def bake(kind, image, material=None, **kw):
    bake_node.image = image
    for o in highs:
        o.data.materials.clear()
        if material: o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    for o in highs: o.select_set(True)
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.bake(type=kind, **kw)
    px = np.empty(TEX * TEX * 4, F); image.pixels.foreach_get(px)
    return px.reshape(TEX, TEX, 4)[..., :3]


log('bake colour'); albedo = bake('EMIT', target_image('albedo', False), emit_material('emit_rgb', 'rgb'))
log('bake roughness'); rough_px = bake('EMIT', target_image('rough', True), emit_material('emit_a', 'a'))[..., 0]
log('bake normal'); normal_px = bake('NORMAL', target_image('normal', True), bpy.data.materials.new('plain'), normal_space='TANGENT')
scene.cycles.samples = 64; scene.world = scene.world or bpy.data.worlds.new('w'); scene.world.light_settings.distance = .03
log('bake occlusion'); ao = bake('AO', target_image('ao', True), bpy.data.materials.new('plain2'))[..., 0]

# Occlusion goes into the colour a little (painted cavities) and fully into ORM.
albedo = albedo * (.72 + .28 * ao[..., None])


def save(name, rgb, srgb_out):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    if srgb_out:
        rgb = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, 1), 1 / 2.4) - .055)
    else:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((TEX, TEX, 1), F)], 2).astype(F).ravel())
    img.filepath_raw = str(OUT / f'{name}.png'); img.file_format = 'PNG'; img.save()
    return img


albedo_img = save('capy_arm_albedo', albedo, True)
normal_img = save('capy_arm_normal', normal_px, False)
orm_img = save('capy_arm_orm', np.stack([ao, rough_px, np.zeros_like(ao)], -1), False)
for o in highs: bpy.data.objects.remove(o)

mat = bpy.data.materials.new('capybara_arm'); mat.use_nodes = True; nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
t = nt.nodes.new('ShaderNodeTexImage'); t.image = albedo_img; nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal_img; nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm_img; sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(to.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
mat['capyArmsV3'] = True
mat['capyArmsV4'] = True
arm.data.materials.clear(); arm.data.materials.append(mat)

# ------------------------------------------------------------------ weights and rig
ELBOW_V, WRIST_V = Vector((0, ELBOW, 0)), Vector((0, WRIST, 0))
BONES = {'upper': (Vector((0, 0, 0)), ELBOW_V, None), 'fore': (ELBOW_V, WRIST_V, 'upper'), 'fore_twist': (ELBOW_V, WRIST_V, 'fore'),
         'hand': (WRIST_V, WRIST_V + Vector((0, .110 * K, 0)), 'fore_twist')}
for name, (a, b, parent) in H.digit_bones().items():
    BONES[name] = (Vector(tuple(float(x) for x in a * K)) + WRIST_V, Vector(tuple(float(x) for x in b * K)) + WRIST_V, parent)

pts, nrm = coords(arm), normals(arm)
owner, tpar, _ = paw_regions(pts, nrm)
# Claws belong to their digit's tip bone.
for k, finger in enumerate(H.FINGERS):
    d, _t, _r, _ = chain_query(pts, finger)
    if k == 0: nearest, ndist = np.zeros(len(pts), np.int8), d.copy()
    else:
        closer = d < ndist; nearest[closer] = k; ndist[closer] = d[closer]
claw_v = part == 2
owner[claw_v] = nearest[claw_v]; tpar[claw_v] = 2.9
weights = [dict() for _ in range(len(pts))]
sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
for i, (p, o, t) in enumerate(zip(pts, owner, tpar)):
    y = p[1]
    if part[i] == 1 or y < WRIST - .015:
        blend = float(sm(.275, .33, y)); twist = float(sm(.34, .55, y)); wrist = float(sm(WRIST - .035, WRIST - .002, y))
        w = {'upper': 1 - blend, 'fore': blend * (1 - twist), 'fore_twist': blend * twist * (1 - wrist), 'hand': blend * twist * wrist}
    elif o < 0:
        wrist = float(sm(WRIST - .02, WRIST + .012, y))
        w = {'fore_twist': 1 - wrist, 'hand': wrist}
    else:
        f = H.FINGERS[o]; seg = int(min(2, max(0, math.floor(t)))); u = t - seg
        cur, prev, nxt = f'{f}{seg + 1}', ('hand' if seg == 0 else f'{f}{seg}'), (f'{f}{seg + 2}' if seg < 2 else None)
        if u < .22:
            k = .5 + .5 * float(sm(0, .22, u)) if seg else float(sm(.12, .45, t))
            w = {cur: k, prev: 1 - k}
        elif u > .84 and nxt:
            k = .5 + .5 * (1 - float(sm(.84, 1, u)))
            w = {cur: k, nxt: 1 - k}
        else:
            w = {cur: 1.0}
    weights[i] = {k: v_ for k, v_ in w.items() if v_ > .002}


def build_side(side):
    suffix = 'R' if side > 0 else 'L'
    data = arm.data.copy(); data.name = f'arm_{suffix}'
    matrix = Matrix.Translation((side * .2, 0, 0)) @ Matrix.Diagonal((side, 1, 1, 1))
    data.transform(matrix)
    if side < 0: data.flip_normals()
    data.update()
    obj = link(bpy.data.objects.new(f'arm_{suffix}', data))
    armature = bpy.data.armatures.new(f'rig_{suffix}')
    rig = link(bpy.data.objects.new(f'rig_{suffix}', armature))
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    for name, (a, b, parent) in BONES.items():
        bone = armature.edit_bones.new(f'{name}_{suffix}'); bone.head = matrix @ a; bone.tail = matrix @ b
        bone.align_roll(Vector((0, 0, 1)))
        if parent: bone.parent = armature.edit_bones[f'{parent}_{suffix}']
    bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
    obj.parent = rig; mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    groups = {name: obj.vertex_groups.new(name=f'{name}_{suffix}') for name in BONES}
    for i, influence in enumerate(weights):
        total = sum(influence.values())
        for name, value in influence.items():
            groups[name].add([i], value / total, 'REPLACE')
    return rig, obj


rigs = [build_side(1), build_side(-1)]
bpy.data.objects.remove(arm)
report = {'triangles': sum(len(obj.data.polygons) for _, obj in rigs), 'vertices': sum(len(obj.data.vertices) for _, obj in rigs),
          'bones': list(BONES), 'shoulderOffsetX': .2, 'pawScale': round(PAW_SCALE, 5),
          'material': 'the world paw (capy_hand) at 1/1.3 with the character forearm and cuff: baked albedo + normal + ORM, fur shells from _FUR',
          'digits': 4, 'textureSize': TEX}
bpy.ops.export_scene.gltf(filepath=str(OUT / 'fp-arms.raw.glb'), export_format='GLB', export_skins=True, export_animations=False,
                          export_yup=True, export_def_bones=False, export_extras=True, export_attributes=True,
                          export_vertex_color='NONE', export_image_format='WEBP', export_image_quality=92)
(OUT / 'fp-arms-report.json').write_text(json.dumps(report, indent=2))
log('FP_ARMS', json.dumps(report))
