"""Última Capivara character v4. Blender 5.0.1; authored in game space
(x right, y up, model faces -z), converted to Blender with V().

The body uses authored cross-sections voxel-unioned into one manifold skin.
Clothes are shells cut from that skin at exact hem planes.
A shared surface atlas adds fur, cloth and leather relief to vertex colours;
the bandana carries a team mask. Anatomical body weights and explicitly owned
finger weights avoid diffusion between close surfaces. Face parts follow
their own bones. The original rig names and clips remain, with 24 finger joints
and two forearm twist joints.
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
from capy_paw import arm_geometry, digit_bones, fur_tufts
from character_surfaces import make_material, map_surfaces, FUR, PAW, CLOTH, CANVAS, LEATHER, METAL, NAIL, EYE as EYE_SURFACE
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
    'fur': '976440', 'fur_light': 'BD9069', 'fur_dark': '69452F', 'muzzle': 'AC805C', 'nose': '3E2A22',
    'paw': '4A3A34', 'pad': '6A5247', 'claw': '231A16', 'ear_in': '5E3B2A',
    'shirt': 'D4C9B2', 'shirt_dark': 'AAA08B', 'vest': '344C63', 'pouch': '6D513A', 'strap': '5A3B24', 'brass': 'C9973E',
    'shorts': '6D6C55', 'pocket': '605F4C', 'belt': '46311F', 'team': '1FB5A8', 'pack': '66653D', 'roll': 'A38E5D',
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


EYE = (.145, 1.665, -.125)
bone('root', (0, 0, 0), (0, .18, 0))
bone('spine', (0, .6, 0), (0, 1.15, 0), 'root')
bone('neck', (0, 1.15, 0), (0, 1.45, -.02), 'spine')
bone('head', (0, 1.6, -.04), (0, 1.78, -.04), 'neck')
bone('jaw', (0, 1.51, -.2), (0, 1.55, -.2), 'head', False)
bone('mouth_cavity', (0, 1.554, -.253), (0, 1.584, -.253), 'head', False)
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
    bone('thigh_' + side, (s * .137, .56, .01), (s * .137, .29, .01), 'root')
    bone('shin_' + side, (s * .137, .29, .01), (s * .137, .08, -.04), 'thigh_' + side)
    bone('foot_' + side, (s * .137, .08, -.04), (s * .137, .08, -.17), 'shin_' + side)
    hand = (s * .1, 1.045, -.39 if s == 1 else -.49)
    elbow = (s * .27, 1.00, -.19)
    bone('arm_' + side, (s * .23, 1.2, -.015), elbow, 'spine')
    bone('forearm_' + side, elbow, hand, 'arm_' + side)
    bone('forearm_twist_' + side, elbow, hand, 'forearm_' + side)
    bone('paw_' + side, hand, (hand[0], hand[1], hand[2] - .061), 'forearm_twist_' + side)
    def paw_point(p):
        return Vector(hand) + Vector((s * p.x, p.z, -p.y))
    for name, (a, b, parent) in digit_bones().items():
        finger = bone('paw_' + name + '_' + side, paw_point(a), paw_point(b),
                      'paw_' + side if parent == 'hand' else 'paw_' + parent + '_' + side)
        finger.align_roll(Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
REST = {b.name: (G(b.head_local), G(b.tail_local)) for b in arm_data.bones}

# ------------------------------------------------------------------ body sculpt
# Explicit cross-sections preserve the shoulder, waist and capybara muzzle.
# Voxel union only joins intersecting surfaces; it does not inflate volumes.
sculpt_vertices, sculpt_faces = [], []
def profile(rows, axis='y', x_offset=0, power=1):
    loops = []
    for along, center, rx, ry in rows:
        ring = []
        for j in range(48):
            a = j * math.tau / 48
            u = math.copysign(abs(math.cos(a)) ** power, math.cos(a))
            v = math.copysign(abs(math.sin(a)) ** power, math.sin(a))
            p = Vector((x_offset + rx * u, along, center + ry * v)) if axis == 'y' else Vector((rx * u, center + ry * v, along))
            if axis == 'z':
                # Recessed eye beds, with the surrounding brow/cheek retained.
                socket = math.exp(-((p.y - 1.665) / .031) ** 2 - ((p.z + .125) / .042) ** 2)
                p.x -= math.copysign(.016 * socket, p.x)
            ring.append(len(sculpt_vertices)); sculpt_vertices.append(tuple(V(p)))
        if loops:
            for j in range(48): sculpt_faces.append((loops[-1][j], loops[-1][(j + 1) % 48], ring[(j + 1) % 48], ring[j]))
        loops.append(ring)
    sculpt_faces.extend([tuple(reversed(loops[0])), tuple(loops[-1])])

profile([(.43, .015, .11, .10), (.52, .018, .20, .15), (.65, .023, .238, .18),
         (.78, .008, .224, .185), (.88, -.012, .239, .215), (1.00, -.012, .244, .213),
         (1.12, .0, .225, .185), (1.23, .012, .234, .161), (1.29, .02, .20, .14),
         (1.35, .018, .145, .124), (1.44, .015, .146, .127), (1.50, .012, .12, .115)])
profile([(-.264, 1.608, .068, .048), (-.253, 1.608, .097, .068),
         (-.231, 1.608, .119, .088), (-.185, 1.613, .137, .103),
         (-.12, 1.617, .153, .126), (-.035, 1.61, .163, .142),
         (.045, 1.601, .158, .139), (.105, 1.595, .128, .114),
         (.151, 1.594, .072, .078), (.166, 1.594, .012, .024)], axis='z', power=.62)
for s in (-1, 1):
    profile([(.035, -.08, .068, .118), (.07, -.075, .075, .119), (.13, -.018, .071, .077),
             (.22, .003, .076, .077), (.30, .01, .081, .084), (.40, .023, .100, .103),
             (.50, .023, .113, .114), (.58, .018, .108, .11)], x_offset=s * .137)
body_mesh = bpy.data.meshes.new('body_sculpt')
body_mesh.from_pydata(sculpt_vertices, [], sculpt_faces); body_mesh.update()
bm = bmesh.new(); bm.from_mesh(body_mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(body_mesh); bm.free()
body = bpy.data.objects.new('body', body_mesh)
scene.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
rem = body.modifiers.new('remesh', 'REMESH')
rem.mode = 'VOXEL'
rem.voxel_size = .007
rem.use_smooth_shade = True
sm = body.modifiers.new('smooth', 'SMOOTH')
sm.factor = .5
sm.iterations = 3
bpy.ops.object.modifier_apply(modifier='remesh')
bpy.ops.object.modifier_apply(modifier='smooth')
# Budget the skin now: garments are cut from this surface, and nothing
# downstream decimates LOD0 (collapsing across thin cloth layers tears it).
body.data.calc_loop_triangles()
dec = body.modifiers.new('budget', 'DECIMATE')
dec.ratio = 15000 / len(body.data.loop_triangles)
bpy.ops.object.modifier_apply(modifier='budget')

body.data.update()


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
    # Preserve exact horizontal hems while smoothing and offsetting the shell.
    # Otherwise the boundary normals push individual rim vertices into a
    # sawtooth edge, especially along the vest's lower seam.
    hems = [(v, co[1]) for v in bm.verts if v.is_boundary for co, no in cuts
            if no == (0, 1, 0) and abs(G(v.co).y - co[1]) < .00001]
    if name == 'vest':
        boundary = [v for v in bm.verts if v.is_boundary]
        for _ in range(4): bmesh.ops.smooth_vert(bm, verts=boundary, factor=.45, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    for v, height in hems:
        v.co.z = height
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
shirt = shell('shirt', lambda p: .84 < p.y < 1.37,
              .008, .006, C['shirt'], cuts=[((0, .84, 0), (0, 1, 0)), ((0, 1.37, 0), (0, 1, 0))])
vest = shell('vest', lambda p: .93 < p.y < 1.30 and not (p.z < -.08 and abs(p.x) < .05)
             and not (abs(p.x) > .15 and p.y > 1.16 and abs(p.z) < .105),
             .028, .010, C['vest'], cuts=[((0, .93, 0), (0, 1, 0)), ((0, 1.30, 0), (0, 1, 0)),
             ((.05, 0, 0), (1, 0, 0)), ((-.05, 0, 0), (1, 0, 0))])
shorts = shell('shorts', lambda p: .18 < p.y < .86,
               .014, .01, C['shorts'], cuts=[((0, .18, 0), (0, 1, 0)), ((0, .86, 0), (0, 1, 0))])
belt = shell('belt', lambda p: .79 < p.y < .85, .024, .012, C['belt'], cuts=[((0, .79, 0), (0, 1, 0)), ((0, .85, 0), (0, 1, 0))])
bandana_ring = shell('bandana_ring', lambda p: 1.38 < p.y < 1.435 and not near_arm(p, -.2), .012, .01, C['team'], region='team',
                     cuts=[((0, 1.38, 0), (0, 1, 0)), ((0, 1.435, 0), (0, 1, 0))])
ellipsoid('bandana_knot', (0, 1.385, -.135), (.026, .03, .019), C['team'], 'team', 18, 12)

# Draped bandana with a soft raised centre fold.
bm = bmesh.new()
outline = [(-.09, 1.39, -.092), (0, 1.40, -.124), (.09, 1.39, -.092),
           (.065, 1.29, -.145), (0, 1.205, -.191), (-.065, 1.29, -.145)]
vs = [bm.verts.new(V(p)) for p in outline]
center = bm.verts.new(V((0, 1.31, -.171)))
for i in range(len(vs)): bm.faces.new([vs[i], vs[(i + 1) % len(vs)], center])
scarf = mesh_from_bm('bandana_flap', bm, C['team'], 'team')
bpy.context.view_layer.objects.active = scarf
solid = scarf.modifiers.new('cloth thickness', 'SOLIDIFY'); solid.thickness = .004
bpy.ops.object.modifier_apply(modifier=solid.name)
# Compact field kit: open canvas vest, ivory placket, belt pouches and brass snaps.
for side in (-1, 1):
    rounded_box('pouch', (side * .18, .81, -.151), (.092, .12, .055), C['pouch'], bevel=.015)
    rounded_box('pouch_flap', (side * .18, .855, -.182), (.096, .038, .014), C['strap'], bevel=.007)
    ellipsoid('pouch_snap', (side * .18, .85, -.192), (.008, .008, .003), C['brass'], segments=12, rings=8)
    rounded_box('vest_pocket', (side * .12, 1.105, -.180), (.087, .092, .025), C['vest'], bevel=.009)
    rounded_box('pocket_welt', (side * .12, 1.148, -.194), (.090, .012, .008), C['shirt_dark'], bevel=.002)
    rounded_box('collar', (side * .085, 1.300, -.151), (.061, .067, .012), C['shirt'], bevel=.009, rotation=Matrix.Rotation(side * .35, 3, 'Y'))
    rounded_box('cargo_pocket', (side * .245, .45, -.02), (.028, .11, .10), C['pocket'], bevel=.009)
    rounded_box('cargo_flap', (side * .252, .502, -.02), (.014, .022, .105), C['shorts'], bevel=.006)
for y, z in [(.96, -.237), (1.04, -.222), (1.12, -.20)]:
    ellipsoid('shirt_button', (0, y, z), (.006, .006, .003), C['brass'], segments=12, rings=8)
rounded_box('buckle', (0, .82, -.230), (.065, .044, .014), C['brass'], bevel=.006)
rounded_box('buckle_inset', (0, .82, -.239), (.043, .024, .005), C['belt'], bevel=.003)

# The first-person and world character share paw anatomy and explicit weights.
arm_parts = []
for side_sign, side in [(-1, 'L'), (1, 'R')]:
    vertices, faces, influences, surfaces, fine_vertices = arm_geometry()
    shoulder, elbow = REST['arm_' + side]
    hand = REST['paw_' + side][0]
    def map_arm(p):
        x, y, z = p
        if y >= .447:
            return hand + Vector((side_sign * x, z, -(y - .447)))
        a, b, t = (shoulder, elbow, y / .245) if y <= .245 else (elbow, hand, (y - .245) / .202)
        direction = (b - a).normalized()
        back = Vector((0, 1, 0)); back = (back - direction * back.dot(direction)).normalized()
        width = direction.cross(back).normalized()
        if y > .37:
            blend = min(1, (y - .37) / .077)
            width = width.lerp(Vector((1, 0, 0)), blend)
            back = back.lerp(Vector((0, 1, 0)), blend)
        return a.lerp(b, t) + width * (side_sign * x) + back * z
    mesh = bpy.data.meshes.new('arm_' + side)
    mesh.from_pydata([tuple(V(map_arm(p))) for p in vertices], [], faces)
    mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new('arm_' + side, mesh); scene.collection.objects.link(obj)
    obj['region'] = 'arm'; obj['color'] = list(C['fur'])
    detail = mesh.attributes.new('fine', 'INT', 'POINT')
    for i, value in enumerate(fine_vertices): detail.data[i].value = int(value)
    kind = mesh.attributes.new('surface_id', 'INT', 'POINT')
    for i, value in enumerate(surfaces): kind.data[i].value = value
    names = {'upper': 'arm_' + side, 'fore': 'forearm_' + side, 'fore_twist': 'forearm_twist_' + side, 'hand': 'paw_' + side}
    groups = {}
    for i, weights in enumerate(influences):
        for source, weight in weights.items():
            if weight <= 0: continue
            name = names.get(source, 'paw_' + source + '_' + side)
            if name not in groups: groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([i], weight, 'REPLACE')
    arm_parts.append(obj); parts.append(obj)

# Broad cloth folds are geometry; the atlas supplies fine woven fibres.
for obj in (shirt, vest, shorts):
    for vertex in obj.data.vertices:
        p = G(vertex.co)
        hem = max(0, 1 - abs(p.y - (.88 if obj is shirt else .95 if obj is vest else .20)) / .08)
        if obj is shorts: hem = max(hem, math.exp(-((p.y - .30) / .065) ** 2) * .85)
        fold = math.sin(p.x * 60 + p.z * 31) * .0045 + math.sin(p.y * 40 + p.x * 11) * .003
        vertex.co += vertex.normal * fold * (.25 + .75 * hem)
    obj.data.update()

# ------------------------------------------------------------------ face, ears, paws
skin_tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())


def on_surface(point, direction, inset=0.0):
    """Game-space point projected onto the skin along -direction from outside."""
    d = V(direction) - V((0, 0, 0))
    d.normalize()
    hit = skin_tree.ray_cast(V(point) + d * .3, -d, .6)
    return G(hit[0]) - Vector(direction).normalized() * inset if hit[0] is not None else Vector(point)


def seam(name, points, radius, color, region='detail'):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.resolution_u = 2; curve.bevel_depth = radius; curve.bevel_resolution = 2
    spline = curve.splines.new('POLY'); spline.points.add(len(points) - 1)
    for vertex, p in zip(spline.points, points): vertex.co = (*V(p), 1)
    obj = bpy.data.objects.new(name, curve); scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH'); obj = bpy.context.object
    obj['region'] = region; obj['color'] = list(color); parts.append(obj)
    return obj

for side in (-1, 1):
    hem = [Vector((side * .137 + .088 * math.cos(i * math.tau / 40), .196, .003 + .090 * math.sin(i * math.tau / 40))) for i in range(41)]
    seam('trouser_cuff', hem, .007, C['shorts'], 'cloth')

for s, side in [(-1, 'L'), (1, 'R')]:
    eye = on_surface((s * EYE[0], EYE[1], EYE[2]), (s * .75, .1, -.6), .009)
    look = Matrix.Rotation(-s * .90, 3, 'Z')
    out = Vector((s * .75, .1, -.6)).normalized()
    ellipsoid('eye_' + side, tuple(eye), (.028, .017, .010), C['pupil'], 'blink_' + side, 20, 14, look)
    ellipsoid('iris_' + side, tuple(eye + out * .009), (.010, .012, .0015), C['iris'], 'blink_' + side, 16, 10, look)
    ellipsoid('pupil_' + side, tuple(eye + out * .0105), (.007, .009, .001), C['pupil'], 'blink_' + side, 14, 8, look)
    ellipsoid('glint_' + side, tuple(eye + out * .012 + Vector((-s * .003, .004, 0))), (.0024, .0024, .001), C['white'], 'glint_' + side, 10, 6)
    tangent = Vector((.625, 0, s * .78))
    for upper in (True, False):
        angles = [i * math.pi / 12 + (0 if upper else math.pi) for i in range(13)]
        points = [eye + tangent * (.027 * math.cos(a)) + Vector((0, .015 * math.sin(a), 0)) + out * .006 for a in angles]
        seam('eyelid_' + side, points, .0035 if upper else .0025, C['fur_dark'] if upper else C['fur'], 'blink_' + side)
    brow = on_surface(eye + Vector((0, .027, .006)), out, .009)
    ellipsoid('brow_' + side, tuple(brow), (.035, .007, .008), C['fur'], 'brow_' + side, 18, 10, look)
    ear = Vector((s * .113, 1.749, .044))
    ellipsoid('ear_' + side, tuple(ear), (.038, .047, .025), C['fur'], 'ear_' + side, 20, 14, Matrix.Rotation(s * .25, 3, 'Y'))
    ellipsoid('ear_in_' + side, tuple(ear + Vector((-s * .002, .002, -.018))), (.025, .032, .008), C['ear_in'], 'ear_' + side, 16, 10, Matrix.Rotation(s * .25, 3, 'Y'))
    ellipsoid('nostril_' + side, tuple(on_surface((s * .054, 1.638, -.26), (s * .12, .2, -1), .0015)), (.010, .005, .0035), C['nose'], 'detail', 16, 8, Matrix.Rotation(s * .22, 3, 'Y'))
    for x, y, z in [(s * .062, 1.59, -.26), (s * .073, 1.575, -.248), (s * .044, 1.572, -.27)]:
        point = on_surface((x, y, z), (s * .35, 0, -1), .001)
        ellipsoid('whisker_pore', tuple(point), (.0022, .0022, .0018), C['fur_dark'], 'detail', 8, 6)
    for dx in (-.04, 0, .04):
        toe = Vector((s * .137 + dx, .033, -.18))
        ellipsoid('toe', tuple(toe), (.025, .025, .04), C['paw'], 'body', 10, 6)
        ellipsoid('toe_claw', tuple(toe + Vector((0, -.004, -.04))), (.012, .01, .016), C['claw'], 'body', 8, 6)
mouth_points = [on_surface((x, 1.554 + (abs(x) / .072) ** 1.4 * .018, -.27), (0, 0, -1), -.001) for x in [-.072, -.052, -.025, 0, .025, .052, .072]]
seam('mouth', mouth_points, .0023, C['mouth'], 'mouth_cavity')

# Opaque short fur tufts retain a soft silhouette in the close LOD.
source_vertices = [tuple(v.co) for v in body.data.vertices]
source_faces = [tuple(p.vertices) for p in body.data.polygons]
def tuft_region(index):
    p = G(body.data.vertices[index].co)
    if not (1.42 < p.y < 1.77 and p.z > -.19): return False
    return all((p - Vector((sign * .13, 1.665, -.105))).length > .075 for sign in (-1, 1))
vertices, faces, _ = fur_tufts(source_vertices, source_faces, [{} for _ in source_vertices], tuft_region, (0, 0, -1), 300)
mesh = bpy.data.meshes.new('fur_tufts'); mesh.from_pydata(vertices, [], faces); mesh.update()
obj = bpy.data.objects.new('fur_tufts', mesh); scene.collection.objects.link(obj)
obj['region'] = 'body'; obj['color'] = list(C['fur']); parts.append(obj)

# ------------------------------------------------------------------ colour
def fur_colour(p, n):
    """Painted fur: warm top light, lighter belly and throat, darker back,
    darker muzzle ring and nose, leathery paws and feet, soft clump noise."""
    col = C['fur']
    belly = max(0, -n.z) * max(0, 1 - abs(p.x) / .22) * (1 if .5 < p.y < 1.45 else 0)
    col = col.lerp(C['fur_light'], belly * .65)
    col = col.lerp(C['fur_dark'], max(0, n.z) ** 2 * .45 * (1 if p.y < 1.45 else .3))
    # Muzzle darkening toward the nose, nose pad.
    snout = max(0, min(1, (-p.z - .11) / .12)) * max(0, min(1, (1.70 - p.y) / .08)) * (1 if p.y > 1.47 else 0)
    col = col.lerp(C['muzzle'], snout * .80)
    nose = max(0, 1 - math.hypot(p.x / .078, (p.y - 1.639) / .039)) * (1 if p.z < -.235 else 0)
    col = col.lerp(C['nose'], min(.82, nose * 2.0))
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
FINE_PARTS = {'finger', 'claw', 'toe', 'toe_claw', 'iris_L', 'iris_R', 'pupil_L', 'pupil_R', 'glint_L', 'glint_R', 'nostril_L', 'nostril_R',
              'fur_tufts', 'whisker_pore', 'patch', 'patch_palm', 'pouch_flap', 'cargo_flap', 'roll_strap', 'vest_buckle', 'brow_L', 'brow_R', 'ear_in_L', 'ear_in_R', 'mouth'}


def log(message):
    print('CAPY_STEP', message, flush=True)


# 1. Base colour and region ids per part, then one joined mesh.
for obj in [body] + parts:
    mesh = obj.data
    mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    mesh.attributes.new('_TEAM', 'FLOAT', 'POINT')
    mesh.attributes.new('region_id', 'INT', 'POINT')
    if 'fine' not in mesh.attributes: mesh.attributes.new('fine', 'INT', 'POINT')
    if 'surface_id' not in mesh.attributes:
        kind = FUR
        name = obj.name.split('.')[0]
        if obj is body: kind = FUR
        elif name.startswith(('eye_', 'iris_', 'pupil_', 'glint_')): kind = EYE_SURFACE
        elif name in ('claw', 'toe_claw'): kind = NAIL
        elif name.startswith(('nostril_', 'ear_in_')) or name in ('toe', 'mouth'): kind = PAW
        elif name in ('buckle', 'pouch_snap', 'shirt_button'): kind = METAL
        elif name.startswith(('pouch', 'belt', 'buckle_inset')): kind = LEATHER
        elif obj.get('region') == 'team' or name.startswith('shirt'): kind = CLOTH
        elif obj.get('region') == 'cloth': kind = CANVAS
        surface = mesh.attributes.new('surface_id', 'INT', 'POINT')
        for v in mesh.vertices: surface.data[v.index].value = PAW if obj is body and G(v.co).y < .13 else kind
    # Adding attributes reallocates storage: fetch every reference afterwards.
    attr, team, rid = mesh.color_attributes['Color'], mesh.attributes['_TEAM'], mesh.attributes['region_id']
    fine = mesh.attributes['fine']
    # Sub-pixel beyond ~25 m: dropped from the far LOD instead of decimated.
    small = obj.name.split('.')[0] in FINE_PARTS
    for i in range(len(mesh.vertices)):
        if small: fine.data[i].value = 1
    region = obj.get('region', 'body')
    base = Vector(obj['color']) if obj is not body else None
    for v in mesh.vertices:
        col = fur_colour(G(v.co), G(v.normal)) if obj is body or obj.name == 'fur_tufts' else base
        if obj in arm_parts:
            kind = mesh.attributes['surface_id'].data[v.index].value
            col = {FUR: C['fur'], PAW: srgb('665044'), CLOTH: C['shirt'], NAIL: C['claw']}[kind]
            if kind == FUR: col = col.lerp(C['fur_light'], max(0, -G(v.normal).y) * .35)
        attr.data[v.index].color = (col.x, col.y, col.z, 1)
        team.data[v.index].value = 1 if region == 'team' else 0
        rid.data[v.index].value = FACE.index(region) + 1 if region in FACE else 0
for obj in [body] + parts:
    far = [G(v.co) for v in obj.data.vertices if (G(v.co) - Vector((0, .9, 0))).length > 1.3]
    if far or obj is body or obj.name.startswith('shirt'):
        c = obj.data.color_attributes['Color'].data[0].color
        print('CAPY_DEBUG', obj.name, len(obj.data.vertices), [tuple(round(x, 2) for x in f) for f in far[:3]], tuple(round(x, 3) for x in c))
log('painted')
# The closed torso has analytic anatomical weights; shared arms own their
# skin weights. A finger can never attract torso or neighbouring digit vertices.
body.parent = rig
modifier = body.modifiers.new('Armature', 'ARMATURE'); modifier.object = rig
body_groups_by_name = {}
def body_weight(index, name, weight):
    if weight <= 0: return
    if name not in body_groups_by_name: body_groups_by_name[name] = body.vertex_groups.new(name=name)
    body_groups_by_name[name].add([index], weight, 'REPLACE')
for v in body.data.vertices:
    p = G(v.co)
    if p.y > 1.26:
        head = max(0, min(1, (p.y - 1.33) / .17))
        body_weight(v.index, 'neck', 1 - head); body_weight(v.index, 'head', head)
    elif p.y > .72:
        neck = max(0, min(1, (p.y - 1.15) / .16))
        body_weight(v.index, 'spine', 1 - neck); body_weight(v.index, 'neck', neck)
    else:
        side = 'R' if p.x >= 0 else 'L'
        if p.y > .42:
            # A broad hip transition avoids inverting the trouser surface
            # between the lowered torso and rotated thigh during a crouch.
            torso = max(0, min(1, (p.y - .42) / .30))
            body_weight(v.index, 'spine', torso); body_weight(v.index, 'thigh_' + side, 1 - torso)
        elif p.y > .23:
            thigh = max(0, min(1, (p.y - .23) / .13))
            body_weight(v.index, 'thigh_' + side, thigh); body_weight(v.index, 'shin_' + side, 1 - thigh)
        else:
            shin = max(0, min(1, (p.y - .075) / .155))
            body_weight(v.index, 'shin_' + side, shin); body_weight(v.index, 'foot_' + side, 1 - shin)
from mathutils.kdtree import KDTree
body_tree = KDTree(len(body.data.vertices))
for v in body.data.vertices:
    body_tree.insert(v.co, v.index)
body_tree.balance()
body_groups = {g.index: g.name for g in body.vertex_groups}
for obj in parts:
    if obj.get('region') in FACE or obj in arm_parts:
        continue
    if obj.name.startswith('cargo_'):
        # Sewn cargo pockets move with their thigh; blending their top into the
        # lowered torso crumples the rigid flap through the trouser surface.
        side = 'R' if sum(v.co.x for v in obj.data.vertices) > 0 else 'L'
        group = obj.vertex_groups.new(name='thigh_' + side)
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        continue
    groups = {}
    for v in obj.data.vertices:
        # Distance-weighted blend of nearby skin weights: a single nearest
        # vertex made sleeves and vest tear where torso and arm weights meet.
        blend = {}
        found = body_tree.find_n(v.co, 8)
        total = 0.0
        for _co, source, distance in found:
            k = 1 / (distance + .01) ** 2
            total += k
            for g in body.data.vertices[source].groups:
                blend[g.group] = blend.get(g.group, 0) + g.weight * k
        for index, weight in blend.items():
            if weight / total < .01:
                continue
            name = body_groups[index]
            group = groups.get(name) or obj.vertex_groups.new(name=name)
            groups[name] = group
            group.add([v.index], weight / total, 'REPLACE')
log('weights transferred')
# Hidden body faces have no visual role beneath the opaque shirt/trousers.
# Removing them prevents skin from poking through folded cloth during crouches.
bm = bm_of(body)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if .184 < G(f.calc_center_median()).y < 1.355], context='FACES')
bm.to_mesh(body.data); bm.free()
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
# Validate the authored form; never project it onto the collision primitives.
arm_groups = {g.index for g in skin.vertex_groups if g.name.startswith(('arm_', 'forearm_', 'paw_'))}
outside = []
for v in skin.data.vertices:
    if any(g.group in arm_groups and g.weight > 0 for g in v.groups): continue
    p = G(v.co)
    body_p = Vector((p.x, min(1.42, max(0, p.y)), p.z))
    radius = math.hypot(body_p.x, body_p.z)
    if radius > .30:
        body_p.x *= .30 / radius; body_p.z *= .30 / radius
    center = Vector((0, 1.6, -.04)); delta = p - center
    head_p = p if delta.length <= .25 else center + delta.normalized() * .25
    if min((body_p - p).length, (head_p - p).length) > .012: outside.append(tuple(p))
if outside: raise RuntimeError(f'Authored character exceeds gameplay envelope: {len(outside)} vertices, {outside[:3]}')
bm = bm_of(skin); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(skin.data); bm.free()
log('anatomical envelope')
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
    shade = .74 + .26 * occ ** 1.2
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
fine_lods = True
surface_ids = [entry.value for entry in skin.data.attributes['surface_id'].data]
map_surfaces(skin.data, surface_ids, game_space=True)
skin.data.attributes.remove(skin.data.attributes['surface_id'])
material = make_material('capybara_surfaces', OUT)
skin.data.materials.clear()
skin.data.materials.append(material)
skin.data.calc_loop_triangles()
lod0 = len(skin.data.loop_triangles)
report = {'sourceTriangles': source_tris, 'lods': [], 'hitbox': {'head': {'center': [0, 1.6, -.04], 'radius': .25}, 'body': {'radius': .30, 'top': 1.42}},
          'clips': ['idle', 'run', 'jump'], 'material': 'UV fur/canvas/leather + normal/ORM + vertex palette + _TEAM mask'}
for level, budget in enumerate([lod0, 9800, 2450]):
    obj = skin.copy()
    obj.data = skin.data.copy()
    scene.collection.objects.link(obj)
    obj.name = f'Capybara_LOD{level}'
    obj.data.name = obj.name
    bpy.context.view_layer.objects.active = obj
    if level == 2:
        bm = bm_of(obj)
        fine_layer = bm.verts.layers.int.get('fine')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[fine_layer]], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
    for _attempt in range(3):
        obj.data.calc_loop_triangles()
        current = len(obj.data.loop_triangles)
        if current <= budget * 1.03:
            break
        dec = obj.modifiers.new('budget', 'DECIMATE')
        dec.ratio = budget / current
        dec.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.data.validate(verbose=False, clean_customdata=False)
    obj.data.calc_loop_triangles()
    report['lods'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
bpy.data.objects.remove(skin, do_unlink=True)
for level in range(3):
    lod = bpy.data.objects[f'Capybara_LOD{level}']
    if 'fine' in lod.data.attributes:
        lod.data.attributes.remove(lod.data.attributes['fine'])
log('lods')
exec((Path(__file__).resolve().parent / 'capybara_clips.py').read_text())
if '--character-only' not in sys.argv:
    exec((Path(__file__).resolve().parent / 'capybara_statue.py').read_text())
