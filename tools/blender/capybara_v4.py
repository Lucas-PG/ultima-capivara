"""Última Capivara character v4. Blender 5.0.1; authored in game space
(x right, y up, model faces -z), converted to Blender with V().

The body is a metaball sculpt (smoothly merged volumes) remeshed into one
manifold skin. Clothes are shells cut from that skin at exact hem planes.
Colour and ambient occlusion live in vertex colours; the bandana carries a
team mask attribute. Deform weights come from Blender's heat diffusion; the
face parts (eyes, lids, glints, brows, mouth) follow their own bones.
The skeleton keeps the v3 names so the existing clips and runtime still apply.
"""
import bpy
import bmesh
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/characters'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in (bpy.data.actions, bpy.data.materials, bpy.data.meshes, bpy.data.metaballs, bpy.data.armatures):
    for item in list(data):
        data.remove(item)
scene = bpy.context.scene
scene.render.fps = 30
random.seed(4242)


def V(p):
    return Vector((p[0], -p[2], p[1]))


def G(v):
    """Blender -> game space."""
    return Vector((v.x, v.z, -v.y))


def srgb(hex_value):
    c = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c])


C = {k: srgb(v) for k, v in {
    'fur': 'A8672F', 'fur_light': 'CF9458', 'fur_dark': '7A431E', 'muzzle': '8A5431', 'nose': '3E2A22',
    'paw': '4A3A34', 'pad': '6A5247', 'claw': '231A16', 'ear_in': '5E3B2A',
    'shirt': '6E6B3F', 'shirt_dark': '55532F', 'vest': '5D5A34', 'pouch': '6A6640', 'strap': '5A3B24', 'brass': 'C9973E',
    'shorts': '726C44', 'pocket': '65603B', 'belt': '46311F', 'team': '1FB5A8', 'pack': '66653D', 'roll': 'A38E5D',
    'iris': '5B3518', 'pupil': '120C09', 'white': 'FFFFFF', 'mouth': '2A1712', 'patch': 'D8B44A', 'patch_bg': '2E3B2E',
}.items()}

# ------------------------------------------------------------------ skeleton
arm_data = bpy.data.armatures.new('Capivara_rig')
rig = bpy.data.objects.new('Capivara', arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, start, end, parent=None, deform=True):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = V(start), V(end)
    b.use_deform = deform
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b


EYE = (.13, 1.665, -.105)
bone('root', (0, 0, 0), (0, .18, 0))
bone('spine', (0, .6, 0), (0, 1.15, 0), 'root')
bone('neck', (0, 1.15, 0), (0, 1.45, -.02), 'spine')
bone('head', (0, 1.6, -.04), (0, 1.78, -.04), 'neck')
bone('jaw', (0, 1.51, -.2), (0, 1.55, -.2), 'head', False)
bone('mouth_cavity', (0, 1.505, -.285), (0, 1.535, -.285), 'head', False)
bone('tail', (0, .62, .23), (0, .66, .29), 'spine')
for s, side in [(-1, 'L'), (1, 'R')]:
    eye = (s * EYE[0], EYE[1], EYE[2])
    bone('ear_' + side, (s * .11, 1.73, .075), (s * .11, 1.79, .075), 'head')
    bone('socket_' + side, eye, (eye[0], eye[1] + .044, eye[2]), 'head', False)
    bone('blink_' + side, eye, (eye[0], eye[1] + .044, eye[2]), 'head', False)
    for part in ['tip', 'peak']:
        bone('blink_' + part + '_' + side, eye, (eye[0], eye[1] + .044, eye[2]), 'blink_' + side, False)
    bone('glint_' + side, (eye[0] - s * .006, eye[1] + .008, eye[2] - .012), (eye[0] - s * .006, eye[1] + .05, eye[2] - .012), 'blink_' + side, False)
    bone('brow_' + side, (s * .115, 1.715, -.11), (s * .115, 1.745, -.11), 'head', False)
    bone('mouth_' + side, (s * .03, 1.505, -.285), (s * .03, 1.535, -.285), 'mouth_cavity', False)
    bone('thigh_' + side, (s * .137, .39, .01), (s * .137, .22, .01), 'root')
    bone('shin_' + side, (s * .137, .22, .01), (s * .137, .08, -.04), 'thigh_' + side)
    bone('foot_' + side, (s * .137, .08, -.04), (s * .137, .08, -.17), 'shin_' + side)
    hand = (s * .1, 1.045, -.39 if s == 1 else -.49)
    elbow = (s * .27, 1.00, -.19)
    bone('arm_' + side, (s * .23, 1.2, -.015), elbow, 'spine')
    bone('forearm_' + side, elbow, hand, 'arm_' + side)
    bone('paw_' + side, hand, (hand[0], hand[1], hand[2] - .1), 'forearm_' + side)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
REST = {b.name: (G(b.head_local), G(b.tail_local)) for b in arm_data.bones}

# ------------------------------------------------------------------ body sculpt
K = 1 / .57  # metaball radius for a desired extent (stiffness 2, threshold .6)
mb = bpy.data.metaballs.new('body')
mb.resolution = .016
mb.threshold = .6
mb_obj = bpy.data.objects.new('body_mb', mb)
scene.collection.objects.link(mb_obj)


def blob(center, radii, stiffness=2.0):
    e = mb.elements.new()
    e.type = 'ELLIPSOID'
    e.co = V(center)
    r = max(radii)
    e.radius = r * K
    rx, ry, rz = radii
    # Game (x, y, z) radii -> Blender (x, z, y) axes.
    e.size_x, e.size_y, e.size_z = rx / r, rz / r, ry / r
    e.stiffness = stiffness


def capsule(a, b, ra, rb, steps=None, squash=1.0):
    a, b = Vector(a), Vector(b)
    n = steps or max(3, int((b - a).length / .025))
    for i in range(n + 1):
        t = i / n
        r = ra + (rb - ra) * t
        blob(tuple(a.lerp(b, t)), (r, r * squash, r), 2.2)


# Torso: a pear-shaped barrel with a soft belly and a broad back.
blob((0, .74, .03), (.3, .26, .27))
blob((0, .98, 0), (.29, .24, .25))
blob((0, 1.17, -.005), (.27, .17, .22))
blob((0, 1.27, 0), (.255, .1, .18))
blob((0, .66, .13), (.26, .2, .17))
blob((0, .9, -.1), (.24, .2, .12))
blob((0, 1.38, -.03), (.17, .12, .165))
# Head: the capybara box. A flat crown running forward into a long, tall,
# blunt muzzle; cheeks and a soft chin; no visible neck break at the back.
blob((0, 1.635, .035), (.16, .13, .165))
blob((0, 1.695, -.07), (.14, .065, .17))
blob((0, 1.6, -.2), (.135, .13, .14))
blob((0, 1.585, -.305), (.118, .118, .07))
for s in (-1, 1):
    blob((s * .095, 1.57, -.095), (.09, .1, .1))
blob((0, 1.505, -.2), (.1, .06, .12))
# Legs: stocky thighs into short shins and long dark feet.
for s in (-1, 1):
    blob((s * .14, .43, .02), (.13, .14, .14))
    blob((s * .14, .25, .0), (.088, .1, .088))
    blob((s * .14, .11, -.01), (.078, .07, .078))
    blob((s * .14, .05, -.085), (.078, .046, .125))
# Arms in the rest (weapon-holding) pose.
for s, side in [(-1, 'L'), (1, 'R')]:
    shoulder, elbow = REST['arm_' + side][0], REST['arm_' + side][1]
    hand = REST['forearm_' + side][1]
    capsule(shoulder, elbow, .072, .06)
    capsule(elbow, hand, .058, .043)
    blob(tuple(hand + Vector((0, -.005, -.035))), (.052, .036, .062))
blob((0, .6, .26), (.05, .045, .05))
dg = bpy.context.evaluated_depsgraph_get()
body_mesh = bpy.data.meshes.new_from_object(mb_obj.evaluated_get(dg))
bpy.data.objects.remove(mb_obj)
body = bpy.data.objects.new('body', body_mesh)
scene.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
rem = body.modifiers.new('remesh', 'REMESH')
rem.mode = 'VOXEL'
rem.voxel_size = .011
rem.use_smooth_shade = True
sm = body.modifiers.new('smooth', 'SMOOTH')
sm.factor = .5
sm.iterations = 6
bpy.ops.object.modifier_apply(modifier='remesh')
bpy.ops.object.modifier_apply(modifier='smooth')
# Budget the skin now: garments are cut from this surface, and nothing
# downstream decimates LOD0 (collapsing across thin cloth layers tears it).
body.data.calc_loop_triangles()
dec = body.modifiers.new('budget', 'DECIMATE')
dec.ratio = 12500 / len(body.data.loop_triangles)
bpy.ops.object.modifier_apply(modifier='budget')


def bm_of(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    return bm


# ------------------------------------------------------------------ helpers
parts = []


def mesh_from_bm(name, bm, color, region='body'):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj['region'] = region
    obj['color'] = list(color) if not isinstance(color, str) else color
    for p in mesh.polygons:
        p.use_smooth = True
    parts.append(obj)
    return obj


def ellipsoid(name, center, radii, color, region='detail', segments=20, rings=12, rotation=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1)
    bmesh.ops.scale(bm, vec=Vector((radii[0], radii[2], radii[1])), verts=bm.verts)
    if rotation:
        bmesh.ops.rotate(bm, matrix=rotation, verts=bm.verts)
    bmesh.ops.translate(bm, vec=V(center), verts=bm.verts)
    return mesh_from_bm(name, bm, color, region)


def rounded_box(name, center, size, color, region='cloth', bevel=.012, rotation=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[2], size[1])), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .45), segments=3, affect='EDGES', profile=.6)
    if rotation:
        bmesh.ops.rotate(bm, matrix=rotation, verts=bm.verts)
    bmesh.ops.translate(bm, vec=V(center), verts=bm.verts)
    return mesh_from_bm(name, bm, color, region)


def shell(name, keep, offset, thickness, color, region='cloth', cuts=(), layers=1):
    """Cut a garment from the skin: bisect at exact hem planes, keep faces whose
    centre passes `keep`, push out along normals and give it thickness."""
    bm = bm_of(body)
    for co, no in cuts:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=V(co), plane_no=V(no) - V((0, 0, 0)), clear_inner=False, clear_outer=False)
    bm.faces.ensure_lookup_table()
    drop = [f for f in bm.faces if not keep(G(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    stray = [v for v in bm.verts if (G(v.co) - Vector((0, .9, 0))).length > 1.2]
    bmesh.ops.delete(bm, geom=stray, context='VERTS')
    obj = mesh_from_bm(name, bm, color, region)
    bpy.context.view_layer.objects.active = obj
    if layers == 2:
        sol = obj.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = thickness
        sol.offset = 1
        sol.use_even_offset = True
        bpy.ops.object.modifier_apply(modifier='thick')
    bm = bm_of(obj)
    stray = [v for v in bm.verts if (G(v.co) - Vector((0, .9, 0))).length > 1.15]
    for v in stray:
        # Solidify can shoot a degenerate rim vertex far out; pull it back to its neighbours.
        near = [e.other_vert(v).co for e in v.link_edges if (G(e.other_vert(v).co) - Vector((0, .9, 0))).length <= 1.15]
        v.co = sum(near, Vector()) / len(near) if near else V((0, .9, 0))
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def arm_param(p, side):
    """Distance along the upper arm from the shoulder, and distance from its axis."""
    a, b = REST['arm_' + side]
    ab = b - a
    t = (p - a).dot(ab) / ab.length_squared
    return t, (p - (a + ab * max(0, min(1, t)))).length


def near_arm(p, limit=.2):
    return any(arm_param(p, side)[0] > limit and arm_param(p, side)[1] < .11 for side in 'LR')


# ------------------------------------------------------------------ clothes
torso_x = .21
shirt = shell('shirt', lambda p: .84 < p.y < 1.37 and
              (abs(p.x) < torso_x + .1 or any(0 <= arm_param(p, s)[0] < .42 and arm_param(p, s)[1] < .1 for s in 'LR')) and
              not any(arm_param(p, s)[0] >= .42 for s in 'LR'),
              .01, .008, C['shirt'], cuts=[((0, .84, 0), (0, 1, 0)), ((0, 1.37, 0), (0, 1, 0))] +
              [(tuple(REST['arm_' + s][0].lerp(REST['arm_' + s][1], .42)), tuple(REST['arm_' + s][1] - REST['arm_' + s][0])) for s in 'LR'])
vest = shell('vest', lambda p: .86 < p.y < 1.33 and abs(p.x) < .235 and not near_arm(p, -.1),
             .024, .014, C['vest'], cuts=[((0, .86, 0), (0, 1, 0)), ((0, 1.33, 0), (0, 1, 0)), ((.235, 0, 0), (1, 0, 0)), ((-.235, 0, 0), (1, 0, 0))], layers=2)
shorts = shell('shorts', lambda p: .27 < p.y < .86 and not (p.y < .5 and abs(abs(p.x) - .14) > .15),
               .014, .01, C['shorts'], cuts=[((0, .27, 0), (0, 1, 0)), ((0, .86, 0), (0, 1, 0))])
belt = shell('belt', lambda p: .79 < p.y < .85, .024, .012, C['belt'], cuts=[((0, .79, 0), (0, 1, 0)), ((0, .85, 0), (0, 1, 0))])
bandana_ring = shell('bandana_ring', lambda p: 1.33 < p.y < 1.41 and not near_arm(p, -.2), .022, .01, C['team'], region='team',
                     cuts=[((0, 1.33, 0), (0, 1, 0)), ((0, 1.41, 0), (0, 1, 0))])

# Bandana flap: a folded triangle on the chest.
bm = bmesh.new()
tri = [V((-.13, 1.4, -.235)), V((.13, 1.4, -.235)), V((0, 1.19, -.315))]
back = [p + V((0, 0, .012)) for p in tri]
vs = [bm.verts.new(p) for p in tri + back]
bm.faces.new([vs[0], vs[1], vs[2]])
bm.faces.new([vs[5], vs[4], vs[3]])
for i in range(3):
    j = (i + 1) % 3
    bm.faces.new([vs[i], vs[i + 3], vs[j + 3], vs[j]])
mesh_from_bm('bandana_flap', bm, C['team'], 'team')
# Vest pouches, straps, buckle; cargo pockets; belt buckle.
for s in (-1, 1):
    for i, y in enumerate([1.14, 1.0]):
        rounded_box('pouch', (s * .095, y, -.27 + (.012 if i else 0)), (.085, .1, .05), C['pouch'], bevel=.012)
        rounded_box('pouch_flap', (s * .095, y + .045, -.297 + (.012 if i else 0)), (.088, .03, .012), C['vest'], bevel=.006)
    rounded_box('shoulder_strap', (s * .14, 1.3, -.02), (.05, .03, .3), C['strap'], bevel=.008)
    rounded_box('cargo_pocket', (s * .235, .5, -.03), (.03, .12, .1), C['pocket'], bevel=.01)
    rounded_box('cargo_flap', (s * .247, .565, -.03), (.012, .03, .105), C['shorts'], bevel=.006)
rounded_box('buckle', (0, .82, -.305), (.07, .05, .02), C['brass'], bevel=.006)
rounded_box('vest_buckle', (0, 1.07, -.285), (.05, .03, .02), C['brass'], bevel=.006)
# Backpack with a rolled bedroll on top.
rounded_box('backpack', (0, 1.0, .305), (.34, .34, .15), C['pack'], bevel=.04)
rounded_box('pack_pocket', (0, .92, .39), (.24, .14, .05), C['pouch'], bevel=.02)
for s in (-1, 1):
    rounded_box('pack_strap', (s * .09, 1.02, .39), (.03, .3, .012), C['strap'], bevel=.006)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=.068, radius2=.068, depth=.36)
bmesh.ops.rotate(bm, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=bm.verts)
bmesh.ops.translate(bm, vec=V((0, 1.23, .3)), verts=bm.verts)
mesh_from_bm('bedroll', bm, C['roll'], 'cloth')
for x in (-.12, .12):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=.072, radius2=.072, depth=.022)
    bmesh.ops.rotate(bm, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=V((x, 1.23, .3)), verts=bm.verts)
    mesh_from_bm('roll_strap', bm, C['strap'], 'cloth')
# Shoulder patch: a small palm emblem on the right sleeve.
a, b = REST['arm_R']
patch_at = a.lerp(b, .22) + Vector((.07, .02, 0))
rounded_box('patch', tuple(patch_at), (.012, .06, .05), C['patch_bg'], bevel=.006)
rounded_box('patch_palm', tuple(patch_at + Vector((.007, .0, 0))), (.004, .035, .01), C['patch'], bevel=.001)

# ------------------------------------------------------------------ face, ears, paws
skin_tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())


def on_surface(point, direction, inset=0.0):
    """Game-space point projected onto the skin along -direction from outside."""
    d = V(direction) - V((0, 0, 0))
    d.normalize()
    hit = skin_tree.ray_cast(V(point) + d * .3, -d, .6)
    return G(hit[0]) - Vector(direction).normalized() * inset if hit[0] is not None else Vector(point)


for s, side in [(-1, 'L'), (1, 'R')]:
    eye = on_surface((s * EYE[0], EYE[1], EYE[2]), (s * .75, .25, -.6), .02)
    look = Matrix.Rotation(-s * .55, 3, 'Z')
    out = Vector((s * .75, .25, -.6)).normalized()
    ellipsoid('eye_' + side, tuple(eye), (.028, .03, .026), C['pupil'], 'blink_' + side, 18, 12, look)
    ellipsoid('iris_' + side, tuple(eye + out * .02 + Vector((0, .002, 0))), (.016, .018, .008), C['iris'], 'blink_' + side, 14, 8, look)
    ellipsoid('pupil_' + side, tuple(eye + out * .025 + Vector((0, .003, 0))), (.009, .011, .005), C['pupil'], 'blink_' + side, 12, 8, look)
    ellipsoid('glint_' + side, tuple(eye + out * .028 + Vector((-s * .004, .012, 0))), (.0055, .0055, .003), C['white'], 'glint_' + side, 10, 6)
    ellipsoid('brow_' + side, tuple(on_surface((s * .11, 1.705, -.12), (s * .5, .8, -.3), .01)), (.038, .008, .018), C['fur_dark'], 'brow_' + side, 14, 8, Matrix.Rotation(s * .25, 3, 'Y'))
    ear = on_surface((s * .1, 1.72, .07), (s * .4, 1, .2), .01)
    ellipsoid('ear_' + side, tuple(ear), (.05, .055, .028), C['fur'], 'ear_' + side, 16, 10, Matrix.Rotation(s * .3, 3, 'Y'))
    ellipsoid('ear_in_' + side, tuple(ear + Vector((-s * .004, -.004, -.018))), (.032, .036, .012), C['ear_in'], 'ear_' + side, 12, 8, Matrix.Rotation(s * .3, 3, 'Y'))
    ellipsoid('nostril_' + side, tuple(on_surface((s * .04, 1.62, -.33), (s * .2, .5, -.85), .002)), (.014, .008, .02), C['pupil'], 'detail', 10, 6, Matrix.Rotation(s * .35, 3, 'Y'))
    # Paw digits and claws around each hand, and toes on each foot.
    hand = REST['forearm_' + side][1]
    fwd = (REST['paw_' + side][1] - hand).normalized()
    for i, dx in enumerate((-.03, -.01, .01, .03)):
        base = hand + fwd * .06 + Vector((dx, -.012, 0))
        tip = base + fwd * .035 + Vector((0, -.02, 0))
        for k in range(4):
            t = k / 3
            ellipsoid('finger', tuple(base.lerp(tip, t)), (.014, .014, .014), C['paw'], 'body', 10, 6)
        ellipsoid('claw', tuple(tip + fwd * .012 + Vector((0, -.004, 0))), (.008, .006, .012), C['claw'], 'body', 8, 6)
    for dx in (-.04, 0, .04):
        toe = Vector((s * .14 + dx, .03, -.2))
        ellipsoid('toe', tuple(toe), (.025, .025, .04), C['paw'], 'body', 10, 6)
        ellipsoid('toe_claw', tuple(toe + Vector((0, -.004, -.04))), (.012, .01, .016), C['claw'], 'body', 8, 6)
ellipsoid('mouth', tuple(on_surface((0, 1.525, -.3), (0, -.1, -1), .006)), (.055, .016, .02), C['mouth'], 'mouth_cavity', 16, 8)

# ------------------------------------------------------------------ colour
def fur_colour(p, n):
    """Painted fur: warm top light, lighter belly and throat, darker back,
    darker muzzle ring and nose, leathery paws and feet, soft clump noise."""
    col = C['fur']
    belly = max(0, -n.z) * max(0, 1 - abs(p.x) / .22) * (1 if .5 < p.y < 1.45 else 0)
    col = col.lerp(C['fur_light'], belly * .65)
    col = col.lerp(C['fur_dark'], max(0, n.z) ** 2 * .45 * (1 if p.y < 1.45 else .3))
    # Muzzle darkening toward the nose, nose pad.
    snout = max(0, min(1, (-p.z - .24) / .1)) * (1 if p.y > 1.47 else 0)
    col = col.lerp(C['muzzle'], snout * .55)
    nose = max(0, 1 - math.hypot(p.x / .07, (p.y - 1.625) / .045)) * (1 if p.z < -.3 else 0)
    col = col.lerp(C['nose'], min(1, nose * 2.5))
    # Paws, forearm ends and feet.
    for side in 'LR':
        hand = REST['forearm_' + side][1]
        if (p - hand).length < .075 or ((p - hand).dot(REST['paw_' + side][1] - hand) > 0 and (p - hand).length < .12):
            col = C['paw'].lerp(C['pad'], max(0, -n.y) * .6)
    if p.y < .15:
        col = C['paw'].lerp(C['pad'], max(0, -n.y) * .5)
    noise = .5 + .5 * math.sin(p.x * 61 + p.y * 23) * math.sin(p.z * 57 - p.y * 41)
    return col * (.94 + .1 * noise)


FACE = ['blink_L', 'blink_R', 'glint_L', 'glint_R', 'brow_L', 'brow_R', 'mouth_cavity', 'ear_L', 'ear_R']


def log(message):
    print('CAPY_STEP', message, flush=True)


# 1. Base colour and region ids per part, then one joined mesh.
for obj in [body] + parts:
    mesh = obj.data
    mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    mesh.attributes.new('_TEAM', 'FLOAT', 'POINT')
    mesh.attributes.new('region_id', 'INT', 'POINT')
    # Adding attributes reallocates storage: fetch every reference afterwards.
    attr, team, rid = mesh.color_attributes['Color'], mesh.attributes['_TEAM'], mesh.attributes['region_id']
    region = obj.get('region', 'body')
    base = Vector(obj['color']) if obj is not body else None
    for v in mesh.vertices:
        col = fur_colour(G(v.co), G(v.normal)) if obj is body else base
        attr.data[v.index].color = (col.x, col.y, col.z, 1)
        team.data[v.index].value = 1 if region == 'team' else 0
        rid.data[v.index].value = FACE.index(region) + 1 if region in FACE else 0
for obj in [body] + parts:
    far = [G(v.co) for v in obj.data.vertices if (G(v.co) - Vector((0, .9, 0))).length > 1.3]
    if far or obj is body or obj.name.startswith('shirt'):
        c = obj.data.color_attributes['Color'].data[0].color
        print('CAPY_DEBUG', obj.name, len(obj.data.vertices), [tuple(round(x, 2) for x in f) for f in far[:3]], tuple(round(x, 3) for x in c))
log('painted')
# Heat diffusion on the closed skin alone; clothes and gear borrow the weights
# of the nearest skin vertex (open overlapping shells defeat the solver).
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
from mathutils.kdtree import KDTree
body_tree = KDTree(len(body.data.vertices))
for v in body.data.vertices:
    body_tree.insert(v.co, v.index)
body_tree.balance()
body_groups = {g.index: g.name for g in body.vertex_groups}
for obj in parts:
    if obj.get('region') in FACE:
        continue
    groups = {}
    for v in obj.data.vertices:
        _co, source, _d = body_tree.find(v.co)
        for g in body.data.vertices[source].groups:
            name = body_groups[g.group]
            group = groups.get(name) or obj.vertex_groups.new(name=name)
            groups[name] = group
            group.add([v.index], g.weight, 'REPLACE')
log('weights transferred')
bpy.ops.object.select_all(action='DESELECT')
for obj in [body] + parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
skin = bpy.context.view_layer.objects.active
skin.name = 'skin'
for p in skin.data.polygons:
    p.use_smooth = True
skin.data.calc_loop_triangles()
source_tris = len(skin.data.loop_triangles)
log(f'joined {source_tris}')
log('decimated')
print('CAPY_DEBUG after decimate', tuple(round(x, 3) for x in skin.data.color_attributes['Color'].data[0].color), len(skin.data.color_attributes))
# 3. Ambient occlusion into the vertex colour (warm, painted cavities).
bm = bmesh.new()
bm.from_mesh(skin.data)
tree = BVHTree.FromBMesh(bm)
bm.free()
rng = random.Random(9)
dirs = []
while len(dirs) < 20:
    d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
    if .1 < d.length <= 1:
        dirs.append(d.normalized())
colors = skin.data.color_attributes['Color']
rids = skin.data.attributes['region_id']
for v in skin.data.vertices:
    rid = rids.data[v.index].value
    if 0 < rid <= len(FACE) and FACE[rid - 1].startswith(('blink', 'glint')):
        continue
    origin = v.co + v.normal * .0012
    hits, total = 0.0, 0.0
    for d in dirs:
        c = d.dot(v.normal)
        if c <= 0:
            d, c = -d, -c
        total += c
        hit = tree.ray_cast(origin, d, .07)
        if hit[0] is not None:
            hits += c * (1 - hit[3] / .07) ** .6
    occ = 1 - hits / max(total, 1e-6)
    shade = .45 + .55 * occ ** 1.2
    r, g, b, _ = colors.data[v.index].color
    colors.data[v.index].color = (r * shade, g * shade * (.88 + .12 * occ), b * shade * (.8 + .2 * occ), 1)
skin.data.color_attributes.active_color = colors
log('occlusion')
# 4. Face parts follow their own bones.
groups = {g.name: g for g in skin.vertex_groups}
face_verts = {name: [] for name in FACE}
rids = skin.data.attributes['region_id']
for v in skin.data.vertices:
    rid = rids.data[v.index].value
    if 0 < rid <= len(FACE):
        face_verts[FACE[rid - 1]].append(v.index)
for name, verts in face_verts.items():
    if not verts:
        continue
    for g in skin.vertex_groups:
        g.remove(verts)
    group = groups.get(name) or skin.vertex_groups.new(name=name)
    group.add(verts, 1, 'REPLACE')
skin.data.attributes.remove(skin.data.attributes['region_id'])
material = bpy.data.materials.new('Capivara_v4')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
vc = material.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Color'
material.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = .88
skin.data.materials.clear()
skin.data.materials.append(material)
skin.data.calc_loop_triangles()
lod0 = len(skin.data.loop_triangles)
report = {'sourceTriangles': source_tris, 'lods': [], 'hitbox': {'head': {'center': [0, 1.6, -.04], 'radius': .25}, 'body': {'radius': .3, 'top': 1.42}},
          'clips': ['idle', 'run', 'jump'], 'material': 'vertex colour + _TEAM mask'}
for level, budget in enumerate([lod0, 8000, 2200]):
    obj = skin.copy()
    obj.data = skin.data.copy()
    scene.collection.objects.link(obj)
    obj.name = f'Capybara_LOD{level}'
    obj.data.name = obj.name
    bpy.context.view_layer.objects.active = obj
    if budget < lod0:
        dec = obj.modifiers.new('budget', 'DECIMATE')
        dec.ratio = budget / lod0
        dec.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.data.validate(verbose=False, clean_customdata=False)
    obj.data.calc_loop_triangles()
    report['lods'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
bpy.data.objects.remove(skin, do_unlink=True)
log('lods')
exec((Path(__file__).resolve().parent / 'capybara_clips.py').read_text())
