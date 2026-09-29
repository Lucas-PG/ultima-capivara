"""First-person capybara arms (v3), Blender 5.0.1, metres, arm along +Y.

The skin is the sculpt from paw_sculpt.py (metaball paw fused with the
forearm). A dense copy gets the fine detail (fur clumps, pebbled pads, joint
creases, nail ridges) and painted colour per vertex; a decimated copy is the
game mesh. Normal, colour, roughness and occlusion are baked from the dense
sculpt onto the game mesh's own 2K maps. Rolled linen sleeves and glossy claws
join the same texture set. Skin weights follow bone ownership: every vertex
belongs to the hand or to one digit chain, blended across joints only. A
`_FUR` vertex attribute tells the runtime where fur shells grow and how long.

Usage: blender -b --python tools/blender/fp_arms.py [-- --preview <dir>]
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
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paw_sculpt as P

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/fp'; OUT.mkdir(parents=True, exist_ok=True)
TEX = 2048
SKIN_TRIS = 11000
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
started = time.time()


def log(*a):
    print(f'[fp_arms {time.time() - started:6.1f}s]', *a, flush=True)


def srgb(value):
    c = np.array([int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)


def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj


def from_bm(name, bm):
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    return link(bpy.data.objects.new(name, mesh))


def coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def normals(obj):
    n = np.empty(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3)


# ------------------------------------------------------------------ noise
def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xffffff).astype(np.float32) / 0xffffff


def value_noise(p, seed=0):
    """Smooth 3D value noise in [0, 1] for an (n, 3) array of points."""
    i = np.floor(p).astype(np.int64); f = p - i; f = f * f * (3 - 2 * f)
    out = np.zeros(len(p), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, octaves=4, seed=0):
    total, amp, norm = np.zeros(len(p), np.float32), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(p * (2 ** o), seed + o); norm += amp; amp *= .5
    return total / norm


def cells(p, seed=0):
    """Distance to the nearest jittered feature point (Worley F1), cell units."""
    i = np.floor(p).astype(np.int64); best = np.full(len(p), 9.0, np.float32)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                j = np.stack([_hash(c[:, 0], c[:, 1], c[:, 2], seed + k) for k in range(3)], 1)
                best = np.minimum(best, np.linalg.norm(c + j - p, axis=1))
    return best


# ------------------------------------------------------------------ anatomy queries
W = np.array([0, P.WRIST, 0], np.float32)
CHAINS = {f: np.array([tuple(p) for p in P.POINTS[f]], np.float32) + W for f in P.FINGERS}
RADII = {f: np.array(P.DIGITS[f]['radii'], np.float32) for f in P.FINGERS}
TOPS = {f: np.array([tuple(P.digit_frame(f, i)[2]) for i in range(3)], np.float32) for f in P.FINGERS}


def chain_query(pts, finger):
    """Per point: distance to the digit's joint polyline, chain parameter t (0 at the
    base joint, 3 at the tip, extrapolated below 0 behind it), surface radius and
    the digit's top direction there."""
    chain = CHAINS[finger]; best = np.full(len(pts), 9.0, np.float32); t = np.zeros(len(pts), np.float32)
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
    """Owner digit (or None for the hand), chain parameter, and back-of-paw factor."""
    owner = np.full(len(pts), -1, np.int8); tpar = np.zeros(len(pts), np.float32)
    back = np.clip(nrm[:, 2] * 1.4 + .25, 0, 1)
    best = np.full(len(pts), 9.0, np.float32)
    for k, finger in enumerate(P.FINGERS):
        d, t, r, top = chain_query(pts, finger)
        # A digit owns what lies around it past its base joint (the knuckle web stays with the hand).
        mine = (t > .12) & (d < r * 1.55) & (d - r < best)
        owner[mine] = k; tpar[mine] = t[mine]; best[mine] = (d - r)[mine]
        facing = np.clip(np.einsum('ij,ij->i', nrm, top) * 1.3 + .2, 0, 1)
        back[mine] = facing[mine]
    return owner, tpar, back


# ------------------------------------------------------------------ parts
def claws():
    """Thick blunt capybara claws capping each digit tip (dense and game versions)."""
    out = {}
    for level, rings, around in (('hi', 18, 36), ('lo', 6, 12)):
        bm = bmesh.new()
        for finger in P.FINGERS:
            chain = P.POINTS[finger]; axis, side, top = P.digit_frame(finger, 2)
            r = P.DIGITS[finger]['radii'][3]
            tip = chain[3] + Vector((0, P.WRIST, 0))
            prev = None
            for k in range(rings + 1):
                s = k / rings
                # From the nail bed on the back of the distal segment, over the
                # fingertip and past it, curling down to a blunt point.
                along = -r * 1.3 + s * r * 2.35
                curl = max(0, s - .5) / .5
                width = r * (.80 + .10 * math.sin(math.pi * min(1, s * 1.5))) * (1 - .80 * curl ** 1.5)
                thick = r * (.40 + .08 * math.sin(math.pi * min(1, s * 1.3))) * (1 - .70 * curl ** 1.4)
                lift = r * (.74 - .10 * s) - r * 1.0 * curl ** 1.7
                center = tip + axis * along + top * lift
                ring = []
                for j in range(around):
                    a = j * math.tau / around
                    # Flat underside, domed top.
                    y = math.sin(a); z = y * (1 if y > 0 else .35)
                    ring.append(bm.verts.new(center + side * (math.cos(a) * width) + top * (z * thick)))
                if prev:
                    for j in range(around):
                        bm.faces.new((prev[j], prev[(j + 1) % around], ring[(j + 1) % around], ring[j]))
                else:
                    bm.faces.new(list(reversed(ring)))
                prev = ring
            bm.faces.new(prev)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        out[level] = from_bm(f'claws_{level}', bm)
    return out


SLEEVE = [(-.02, .082, .082), (.08, .083, .082), (.17, .080, .078), (.24, .076, .072),
          (.262, .078, .073), (.278, .085, .080), (.294, .088, .083), (.307, .083, .078), (.319, .087, .081),
          (.333, .086, .080), (.345, .078, .072), (.352, .068, .062)]


def sleeve(sides, subdivide):
    """Rolled linen sleeve: loose folds above, a cuff rolled twice below the elbow."""
    prof = []
    for (y0, a0, b0), (y1, a1, b1) in zip(SLEEVE, SLEEVE[1:]):
        for k in range(subdivide):
            t = k / subdivide
            prof.append((y0 + (y1 - y0) * t, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t))
    prof.append(SLEEVE[-1])
    fold = lambda a, y: .0025 * math.sin(a * 7 + y * 21) + .0014 * math.sin(a * 12 - y * 35) + .0006 * math.sin(a * 23 + y * 90)
    return P._loft('sleeve', prof, sides=sides, fold=fold)


# ------------------------------------------------------------------ detail and paint
def fur_mask(pts, nrm, owner, tpar, back, edge):
    """1 where fur grows: the forearm, the wrist, the back and sides of the paw and
    the backs of the digits. Leathery skin only on the palm pads, the undersides
    of the digits and the fingertips, with a ragged edge."""
    q = pts - W
    jag = (edge - .5) * .35
    # The sole: a rounded patch over the palm pads, furred at the heel and edges.
    oval = (q[:, 0] / .032) ** 2 + ((q[:, 1] - .040) / .031) ** 2
    palm = (owner < 0) & (oval < 1 + jag * 1.5) & (nrm[:, 2] < -.2 + jag)
    under = (owner >= 0) & (back < .42 + jag)
    tips = (owner >= 0) & (tpar > 2.55)
    skin = (palm | under | tips) & (pts[:, 1] > P.WRIST - .005)
    return (~skin).astype(np.float32)


def paint_skin(obj):
    """Displace the dense skin with fine detail and store colour and roughness per vertex."""
    pts, nrm = coords(obj), normals(obj)
    owner, tpar, back = paw_regions(pts, nrm)
    on_paw = pts[:, 1] > P.WRIST - .012
    furry = fur_mask(pts, nrm, owner, tpar, back, fbm(pts * 900, 3, seed=5))
    # Fur: clumps combed along the arm, finer strands inside them.
    flow = pts * np.array([1, .25, 1], np.float32)
    clump = fbm(flow * 520, 3, seed=1); strand = value_noise(flow * np.array([2600, 2600, 2600], np.float32), seed=2)
    fur_h = (clump - .5) * .0011 + (strand - .5) * .00035
    # Skin: pebbled leather, softer on the pad tops, creased across the joints.
    peb = cells(pts * 1100, seed=3)
    skin_h = (.5 - np.clip(peb, 0, .8)) * .00032
    crease = np.zeros(len(pts), np.float32)
    for k, finger in enumerate(P.FINGERS):
        mine = owner == k
        for joint in (1, 2):
            x = tpar[mine] - joint
            crease[mine] += np.exp(-(x / .06) ** 2) * (1 - back[mine]) * 1.0 + (np.exp(-((x - .08) / .035) ** 2) + np.exp(-((x + .08) / .035) ** 2)) * back[mine] * .45
    # Palm creases: two soft folds across the palm pads.
    palm = on_paw & (owner < 0) & (back < .5)
    for y0 in (.034, .044):
        crease[palm] += np.exp(-((pts[palm, 1] - P.WRIST - y0 - pts[palm, 0] * .25) / .0011) ** 2) * .7
    height = furry * fur_h + (1 - furry) * skin_h - crease * .00055
    obj.data.vertices.foreach_set('co', (pts + nrm * height[:, None]).ravel())
    obj.data.update()
    # Colour: warm chestnut fur, darker in the clump gaps, a caramel inner
    # forearm; dark leathery pads with lighter worn tops; darker creases.
    fur_base = srgb('8C4E2B'); fur_light = srgb('B7784A'); inner = srgb('A8703F')
    streak = fbm(pts * np.array([760, 110, 760], np.float32), 3, seed=7)
    broad = fbm(pts * 55, 3, seed=8)
    gap = np.clip(fur_h / .0007 + .5, 0, 1)
    fur = fur_base[None] * ((.86 + .26 * streak) * (.93 + .14 * broad) * (.78 + .30 * gap))[:, None]
    fur = fur + (fur_light - fur) * (np.clip(streak - .62, 0, 1) * 1.6)[:, None]
    fur = fur + (inner - fur) * (np.clip(-nrm[:, 2], 0, 1) * (~on_paw) * .32)[:, None]
    skin_base = srgb('4A3A33'); skin_top = srgb('6A554A'); skin_dark = srgb('2C211C')
    worn = np.clip((.55 - peb) * 1.8, 0, 1)[:, None]
    skin = skin_base + (skin_top - skin_base) * worn * .6
    skin = skin + (skin_dark - skin) * np.clip(crease, 0, 1)[:, None] * .75
    colour = fur * furry[:, None] + skin * (1 - furry[:, None])
    rough = furry * (.80 + .1 * strand) + (1 - furry) * (.62 - .14 * worn[:, 0])
    return colour, rough


def paint_sleeve(obj):
    pts, nrm = coords(obj), normals(obj)
    ang = np.arctan2(pts[:, 2], pts[:, 0])
    u, v = ang * .08 / .0011, pts[:, 1] / .0011
    weave = np.sin(u * math.pi) * np.sin(v * math.pi)
    slub = fbm(pts * np.array([300, 60, 300], np.float32), 3, seed=9)
    obj.data.vertices.foreach_set('co', (pts + nrm * ((weave * .00012 + (slub - .5) * .0003)[:, None])).ravel()); obj.data.update()
    base = srgb('D6CAB0'); shade = srgb('A8997C')
    colour = base * (.94 + .06 * weave[:, None]) * (.9 + .2 * slub[:, None])
    colour = colour + (shade - colour) * np.clip((pts[:, 1] - .27) * 0, 0, 1)[:, None]
    return colour, .9 + .06 * slub


def paint_claws(obj):
    pts = coords(obj)
    streak = value_noise(pts * np.array([4000, 600, 4000], np.float32), seed=11)
    base = srgb('2A1D18'); tip = srgb('4E392C')
    colour = base * (.85 + .3 * streak[:, None])
    return colour + (tip - colour) * .15, .22 + .08 * streak


def set_colour_attrs(obj, colour, rough):
    rgba = np.concatenate([np.clip(colour, 0, 1), np.clip(rough, 0, 1)[:, None]], 1).astype(np.float32)
    attr = obj.data.color_attributes.new('paint', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', rgba.ravel())


# ------------------------------------------------------------------ build
log('sculpt')
skin_hi = P.sculpt(smooth=0)
skin_lo = skin_hi.copy(); skin_lo.data = skin_hi.data.copy(); link(skin_lo); skin_lo.name = 'skin_lo'
bpy.context.view_layer.objects.active = skin_lo
m = skin_lo.modifiers.new('dec', 'DECIMATE'); m.ratio = SKIN_TRIS / max(1, len(skin_lo.data.polygons) * 2)
bpy.ops.object.modifier_apply(modifier=m.name)
log('skin', len(skin_hi.data.polygons), '->', len(skin_lo.data.polygons))
claw = claws()
sleeve_hi, sleeve_lo = sleeve(160, 6), sleeve(40, 1)
sleeve_hi.name, sleeve_lo.name = 'sleeve_hi', 'sleeve_lo'

log('paint')
colour, rough = paint_skin(skin_hi); set_colour_attrs(skin_hi, colour, rough)
colour, rough = paint_sleeve(sleeve_hi); set_colour_attrs(sleeve_hi, colour, rough)
colour, rough = paint_claws(claw['hi']); set_colour_attrs(claw['hi'], colour, rough)
for o in (skin_hi, skin_lo, sleeve_hi, sleeve_lo, claw['hi'], claw['lo']):
    for poly in o.data.polygons: poly.use_smooth = True

# Fur length on the game mesh, from the same regions as the paint.
pts, nrm = coords(skin_lo), normals(skin_lo)
owner, tpar, back = paw_regions(pts, nrm)
on_paw = pts[:, 1] > P.WRIST - .012
furry = fur_mask(pts, nrm, owner, tpar, back, np.full(len(pts), .5, np.float32))
fur_len = np.where(on_paw, furry * (1 - np.clip((tpar - 1.0) / 1.2, 0, 1) * (owner >= 0)) * .55, 1.0).astype(np.float32)

# One game mesh: skin, sleeve, claws; each part keeps a per-vertex tag.
tags = {}
for name, o in (('skin', skin_lo), ('sleeve', sleeve_lo), ('claw', claw['lo'])):
    tag = o.data.attributes.new('part', 'INT', 'POINT'); tag.data.foreach_set('value', [{'skin': 0, 'sleeve': 1, 'claw': 2}[name]] * len(o.data.vertices))
fur = skin_lo.data.attributes.new('_FUR', 'FLOAT', 'POINT'); fur.data.foreach_set('value', fur_len)
for o in (sleeve_lo, claw['lo']):
    a = o.data.attributes.new('_FUR', 'FLOAT', 'POINT'); a.data.foreach_set('value', [0.0] * len(o.data.vertices))
bpy.ops.object.select_all(action='DESELECT')
for o in (skin_lo, sleeve_lo, claw['lo']): o.select_set(True)
bpy.context.view_layer.objects.active = skin_lo
bpy.ops.object.join()
arm = bpy.context.active_object; arm.name = 'arm_lo'
bm = bmesh.new(); bm.from_mesh(arm.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(arm.data); bm.free()
log('game mesh', len(arm.data.polygons), 'tris')

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
highs = [skin_hi, sleeve_hi, claw['hi']]


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
node = bake_mat.node_tree.nodes.new('ShaderNodeTexImage'); bake_mat.node_tree.nodes.active = node
arm.data.materials.clear(); arm.data.materials.append(bake_mat)


def bake(kind, image, material=None, **kw):
    node.image = image
    for o in highs:
        o.data.materials.clear()
        if material: o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    for o in highs: o.select_set(True)
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.bake(type=kind, **kw)
    px = np.empty(TEX * TEX * 4, np.float32); image.pixels.foreach_get(px)
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
    img.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((TEX, TEX, 1), np.float32)], 2).astype(np.float32).ravel())
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
arm.data.materials.clear(); arm.data.materials.append(mat)

# ------------------------------------------------------------------ weights and rig
ELBOW, WRIST = Vector((0, P.ELBOW, 0)), Vector((0, P.WRIST, 0))
BONES = {'upper': (Vector((0, 0, 0)), ELBOW, None), 'fore': (ELBOW, WRIST, 'upper'), 'fore_twist': (ELBOW, WRIST, 'fore'),
         'hand': (WRIST, WRIST + Vector((0, .052, 0)), 'fore_twist')}
for name, (a, b, parent) in P.digit_bones().items():
    BONES[name] = (a + WRIST, b + WRIST, parent)

pts, nrm = coords(arm), normals(arm)
part = np.empty(len(pts), np.int32); arm.data.attributes['part'].data.foreach_get('value', part)
owner, tpar, _ = paw_regions(pts, nrm)
# Claws belong to their digit's tip bone.
for k, finger in enumerate(P.FINGERS):
    d, t, r, _ = chain_query(pts, finger)
    if k == 0: nearest, ndist = np.zeros(len(pts), np.int8), d.copy()
    else:
        closer = d < ndist; nearest[closer] = k; ndist[closer] = d[closer]
claw_v = part == 2
owner[claw_v] = nearest[claw_v]; tpar[claw_v] = 2.9
weights = [dict() for _ in range(len(pts))]
ss = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
for i, (p, o, t) in enumerate(zip(pts, owner, tpar)):
    y = p[1]
    if part[i] == 1 or y < P.WRIST - .015:
        blend = float(ss(.275, .33, y)); twist = float(ss(.34, .55, y)); wrist = float(ss(P.WRIST - .035, P.WRIST - .002, y))
        w = {'upper': 1 - blend, 'fore': blend * (1 - twist), 'fore_twist': blend * twist * (1 - wrist), 'hand': blend * twist * wrist}
    elif o < 0:
        wrist = float(ss(P.WRIST - .02, P.WRIST + .012, y))
        w = {'fore_twist': 1 - wrist, 'hand': wrist}
    else:
        f = P.FINGERS[o]; seg = int(min(2, max(0, math.floor(t)))); u = t - seg
        cur, prev, nxt = f'{f}{seg + 1}', ('hand' if seg == 0 else f'{f}{seg}'), (f'{f}{seg + 2}' if seg < 2 else None)
        if u < .22:
            k = .5 + .5 * float(ss(0, .22, u)) if seg else float(ss(.12, .45, t))
            w = {cur: k, prev: 1 - k}
        elif u > .84 and nxt:
            k = .5 + .5 * (1 - float(ss(.84, 1, u)))
            w = {cur: k, nxt: 1 - k}
        else:
            w = {cur: 1.0}
    weights[i] = {k: v for k, v in w.items() if v > .002}


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
          'bones': list(BONES), 'shoulderOffsetX': .2, 'material': 'baked sculpt: albedo + normal + ORM, fur shells from _FUR',
          'digits': 4, 'textureSize': TEX}
bpy.ops.export_scene.gltf(filepath=str(OUT / 'fp-arms.raw.glb'), export_format='GLB', export_skins=True, export_animations=False,
                          export_yup=True, export_def_bones=False, export_extras=True, export_attributes=True,
                          export_vertex_color='NONE', export_image_format='WEBP', export_image_quality=92)
(OUT / 'fp-arms-report.json').write_text(json.dumps(report, indent=2))
log('FP_ARMS', json.dumps(report))
