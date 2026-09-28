"""First-person capybara arms. Blender 5.0.1, metres, +Z up.

Rest pose: both arms point straight ahead along +Y from their shoulders, palms
down, fingers slightly relaxed. The runtime drives every bone with IK, so the
rest pose only has to deform well, not look good.

Right arm: thumb on -X (inner side). The left arm is the exact mirror.
Colour and ambient occlusion are stored per vertex (COLOR_0); no textures.
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/fp'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures):
    for item in list(data):
        data.remove(item)
random.seed(1789)

# ---------------------------------------------------------------- palette
def srgb(hex_value):
    c = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c])

FUR = srgb('9E6235')
FUR_LIGHT = srgb('C8915A')
FUR_DARK = srgb('6A3B1F')
SKIN = srgb('4A3A34')
SKIN_PAD = srgb('6C5448')
CLAW = srgb('241B17')
SLEEVE = srgb('6E6B3F')
SLEEVE_DARK = srgb('4E4C2B')
WRAP = srgb('CDB88C')
WRAP_DARK = srgb('9E8A62')

# ---------------------------------------------------------------- skeleton
# name: (position, (radius x, radius z), parent)
FINGERS = {
    # name, knuckle x, length scale
    'index': (-.028, 1.0),
    'middle': (0.0, 1.07),
    'ring': (.028, .93),
}


def arm_nodes():
    nodes = {
        'shoulder': ((0, 0, 0), (.068, .07), None),
        'upper_mid': ((0, .12, .004), (.063, .063), 'shoulder'),
        'elbow': ((0, .245, 0), (.05, .048), 'upper_mid'),
        'fore_belly': ((0, .3, .006), (.056, .05), 'elbow'),
        'fore_mid': ((0, .372, .003), (.048, .042), 'fore_belly'),
        'wrist': ((0, .447, 0), (.037, .03), 'fore_mid'),
        'palm_back': ((0, .478, -.003), (.051, .029), 'wrist'),
        'palm': ((0, .512, -.005), (.055, .027), 'palm_back'),
    }
    for name, (x, scale) in FINGERS.items():
        y0, z0 = .546, -.006
        segments = [.029 * scale, .025 * scale, .02 * scale]
        radii = [(.0152, .0142), (.0142, .0132), (.013, .012), (.0106, .0096)]
        previous = 'palm'
        y, z = y0, z0
        for i in range(4):
            key = f'{name}{i}'
            nodes[key] = ((x * (1 - .06 * i), y, z), radii[i], previous)
            previous = key
            if i < 3:
                angle = math.radians(12 + 8 * i)
                y += segments[i] * math.cos(angle)
                z -= segments[i] * math.sin(angle)
    thumb = [((-.037, .482, -.014), (.017, .016)), ((-.053, .506, -.022), (.0152, .0142)),
             ((-.061, .528, -.028), (.0132, .0122)), ((-.064, .546, -.033), (.0108, .0098))]
    previous = 'palm_back'
    for i, (position, radius) in enumerate(thumb):
        nodes[f'thumb{i}'] = (position, radius, previous)
        previous = f'thumb{i}'
    return nodes


NODES = arm_nodes()

# Bones: name -> (head node, tail node, parent bone)
BONES = {
    'upper': ('shoulder', 'elbow', None),
    'fore': ('elbow', 'wrist', 'upper'),
    'hand': ('wrist', 'palm', 'fore'),
}
for finger in list(FINGERS) + ['thumb']:
    for i in range(3):
        BONES[f'{finger}{i + 1}'] = (f'{finger}{i}', f'{finger}{i + 1}', 'hand' if i == 0 else f'{finger}{i}')


def pos(node):
    return Vector(NODES[node][0])


# ---------------------------------------------------------------- skin mesh
def build_skin_arm():
    names = list(NODES)
    index = {name: i for i, name in enumerate(names)}
    verts = [NODES[name][0] for name in names]
    edges = [(index[NODES[name][2]], index[name]) for name in names if NODES[name][2]]
    mesh = bpy.data.meshes.new('arm_skin_source')
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new('arm_skin_source', mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new('Skin', 'SKIN')
    skin.branch_smoothing = .6
    data = mesh.skin_vertices[0].data
    for name in names:
        data[index[name]].radius = NODES[name][1]
    data[index['shoulder']].use_root = True
    sub = obj.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    return result


def bm_from_mesh(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    return bm


def add_tuft(bm, base, direction, outward, length, width, thickness=.006, bend=.35):
    """A flattened, curved fur clump whose tip lifts off the surface."""
    direction = direction.normalized()
    outward = (outward - direction * outward.dot(direction)).normalized()
    side = direction.cross(outward).normalized()
    rings = 5
    verts_rings = []
    for r in range(rings + 1):
        t = r / rings
        center = base + direction * (length * t) + outward * (length * bend * t * t)
        w = width * (1 - t) ** .8 * .5 + .0008
        h = thickness * (1 - t) + .0006
        ring = [bm.verts.new(center + side * (w * math.cos(a)) + outward * (h * math.sin(a)))
                for a in [i * math.tau / 6 for i in range(6)]]
        verts_rings.append(ring)
    for r in range(rings):
        a, b = verts_rings[r], verts_rings[r + 1]
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new([a[i], a[j], b[j], b[i]])
    bm.faces.new(list(reversed(verts_rings[0])))
    bm.faces.new(verts_rings[-1])


def surface_point(tree, y, angle, center_z=0.0):
    """Cast from outside toward the arm axis at height y and angle around it."""
    direction = Vector((math.cos(angle), 0, math.sin(angle)))
    origin = Vector((0, y, center_z)) + direction * .3
    hit = tree.ray_cast(origin, -direction, .35)
    if hit[0] is None:
        return None, None
    return hit[0], hit[1]


def build_arm_mesh():
    mesh = build_skin_arm()
    bm = bm_from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tree = BVHTree.FromBMesh(bm)
    # A soft scalloped ruff where the fur meets the paw, and a few broad clumps
    # on the elbow; both displace the skin instead of adding separate fins.
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        x, y, z = v.co
        angle = math.atan2(z, x)
        ruff = max(0, 1 - abs(y - .434) / .016)
        scallop = .5 + .5 * math.cos(angle * 9 + math.sin(angle * 3) * .6)
        push = ruff * (.0035 + .0055 * scallop)
        elbow = max(0, 1 - abs(y - .25) / .045) * max(0, math.sin(angle)) ** 2
        clumps = elbow * (.004 + .003 * (.5 + .5 * math.cos(angle * 7 + y * 90)))
        fore = max(0, 1 - abs(y - .34) / .08) * (.5 + .5 * math.cos(angle * 6 + y * 70)) * .0018
        v.co += v.normal * (push + clumps + fore)
    bm.normal_update()
    # Blunt dark claws at each digit tip.
    for finger in list(FINGERS) + ['thumb']:
        tip, before = pos(f'{finger}3'), pos(f'{finger}2')
        axis = (tip - before).normalized()
        down = Vector((0, 0, -1))
        down = (down - axis * down.dot(axis)).normalized()
        start = tip + axis * .002 + down * .002
        ring_a = []
        ring_b = []
        side = axis.cross(down).normalized()
        for k in range(8):
            a = k / 8 * math.tau
            offset = side * math.cos(a) * .0068 + down * math.sin(a) * .0048 - down * .001
            ring_a.append(bm.verts.new(start + offset))
            ring_b.append(bm.verts.new(start + axis * .0085 + down * .0035 + offset * .62))
        tip_vert = bm.verts.new(start + axis * .0155 + down * .007)
        for k in range(8):
            j = (k + 1) % 8
            bm.faces.new([ring_a[k], ring_a[j], ring_b[j], ring_b[k]])
            bm.faces.new([ring_b[k], ring_b[j], tip_vert])
        bm.faces.new(list(reversed(ring_a)))
    # Short olive sleeve with a rolled hem, over the upper arm.
    sleeve_rings = []
    profile = [(-.03, .08), (.04, .079), (.1, .075), (.126, .073), (.132, .079), (.146, .081), (.153, .076), (.147, .069)]
    for y, r in profile:
        ring = []
        for k in range(24):
            a = k / 24 * math.tau
            ring.append(bm.verts.new(Vector((math.cos(a) * r, y, math.sin(a) * r * 1.02 + .003))))
        sleeve_rings.append(ring)
    for r in range(len(sleeve_rings) - 1):
        a, b = sleeve_rings[r], sleeve_rings[r + 1]
        for k in range(24):
            j = (k + 1) % 24
            bm.faces.new([a[k], a[j], b[j], b[k]])
    # A cloth wrap around the wrist, just behind the fur cuff.
    wrap_rings = []
    for y, grow in [(.388, .004), (.393, .007), (.41, .007), (.415, .004)]:
        ring = []
        for k in range(20):
            a = k / 20 * math.tau
            p, n = surface_point(tree, y, a)
            if p is None:
                p, n = Vector((math.cos(a) * .045, y, math.sin(a) * .04)), Vector((math.cos(a), 0, math.sin(a)))
            ring.append(bm.verts.new(p + n * grow))
        wrap_rings.append(ring)
    for r in range(len(wrap_rings) - 1):
        a, b = wrap_rings[r], wrap_rings[r + 1]
        for k in range(20):
            j = (k + 1) % 20
            bm.faces.new([a[k], a[j], b[j], b[k]])
    bm.normal_update()
    out = bpy.data.meshes.new('arm')
    bm.to_mesh(out)
    bm.free()
    for poly in out.polygons:
        poly.use_smooth = True
    return out


# ---------------------------------------------------------------- colour + AO
def classify(co, normal):
    """Base colour from anatomy. Positions are in right-arm rest space."""
    x, y, z = co
    r = math.hypot(x, z - .003)
    if y < .16 and r > .082:
        hem = max(0, min(1, (y - .12) / .03))
        return SLEEVE.lerp(SLEEVE_DARK, .15 + .35 * max(0, -normal.z) + .25 * hem)
    if .386 < y < .417 and r > .033:
        stripe = .5 + .5 * math.sin(y * 900 + math.atan2(z, x) * 3)
        return WRAP.lerp(WRAP_DARK, .25 * stripe + .3 * max(0, -normal.z))
    tip = False
    for finger in list(FINGERS) + ['thumb']:
        t = pos(f'{finger}3')
        if (Vector(co) - t).length < .018 and (Vector(co) - t).dot(t - pos(f'{finger}2')) > .0015:
            tip = True
    if tip:
        return CLAW
    if y > .445 or (y > .43 and r < .05):
        # Leathery paw, lighter pads on the palm and digit undersides.
        pad = max(0, -normal.z)
        return SKIN.lerp(SKIN_PAD, pad ** 1.5 * .9)
    # Fur: lighter belly underneath, darker along the top; a soft clump noise.
    under = max(0, -normal.z)
    top = max(0, normal.z)
    noise = .5 + .5 * math.sin(x * 140 + y * 53) * math.sin(z * 120 - y * 31)
    color = FUR.lerp(FUR_LIGHT, under ** 1.2 * .75).lerp(FUR_DARK, top ** 2 * .35)
    return color * (.93 + .12 * noise)


def ambient_occlusion(mesh, samples=40, reach=.05):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    rng = random.Random(7)
    directions = []
    while len(directions) < samples:
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if .05 < d.length <= 1:
            directions.append(d.normalized())
    values = []
    for v in mesh.vertices:
        n = v.normal
        origin = v.co + n * .0008
        hits, total = 0.0, 0.0
        for d in directions:
            c = d.dot(n)
            if c <= 0:
                d = -d
                c = -c
            total += c
            hit = tree.ray_cast(origin, d, reach)
            if hit[0] is not None:
                hits += c * (1 - hit[3] / reach) ** .5
        values.append(1 - hits / max(total, 1e-6))
    return values


def paint(mesh):
    attr = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    ao = ambient_occlusion(mesh)
    for v, occlusion in zip(mesh.vertices, ao):
        base = classify(v.co, v.normal)
        shade = .42 + .58 * occlusion ** 1.3
        # Occluded fur warms instead of greying (stylized bounce light).
        warm = Vector((1.0, .86, .78))
        c = Vector((base.x * shade * (warm.x * (1 - occlusion) + occlusion),
                    base.y * shade * (warm.y * (1 - occlusion) + occlusion),
                    base.z * shade * (warm.z * (1 - occlusion) + occlusion)))
        attr.data[v.index].color = (c.x, c.y, c.z, 1)
    mesh.color_attributes.active_color = attr


# ---------------------------------------------------------------- rig
def segment_distance(p, a, b):
    ab = b - a
    t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def weights_for(co):
    p = Vector(co)
    best, best_t, best_d = None, 0, 1e9
    for name, (head, tail, _parent) in BONES.items():
        d, t = segment_distance(p, pos(head), pos(tail))
        # Digits are thin: prefer them only when a vertex is really on them.
        if name[:-1] in FINGERS or name.startswith('thumb'):
            d *= 1.0
        if d < best_d:
            best, best_t, best_d = name, t, d
    head, tail, parent = BONES[best]
    # The sleeve and anything near the shoulder follow the upper arm rigidly.
    if best == 'upper' or p.y < .16:
        return {'upper': 1.0}
    weights = {best: 1.0}
    if best_t < .25 and parent:
        w = .5 + 2 * best_t
        weights = {best: w, parent: 1 - w}
    children = [c for c, (_h, _t, par) in BONES.items() if par == best]
    if best_t > .75 and len(children) == 1:
        child = children[0]
        w = .5 + 2 * (1 - best_t)
        weights = {best: w, child: 1 - w}
    if best == 'hand' and best_t > .6:
        # The knuckle ridge bends a little with the fingers.
        ahead = [c for c in children if pos(BONES[c][0]).y > .54]
        near = min(ahead, key=lambda c: abs(p.x - pos(BONES[c][0]).x))
        w = (best_t - .6) / .4 * .35
        weights = {best: 1 - w, near: w}
    return weights


def build_side(side, arm_mesh, material):
    suffix = 'R' if side > 0 else 'L'
    mesh = arm_mesh.copy()
    mesh.name = f'arm_{suffix}'
    mirror = Matrix.Diagonal((side, 1, 1, 1))
    offset = Vector((side * .2, 0, 0))
    if side < 0:
        mesh.transform(mirror)
        mesh.flip_normals()
    mesh.transform(Matrix.Translation(offset))
    mesh.update()
    obj = bpy.data.objects.new(f'arm_{suffix}', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    arm_data = bpy.data.armatures.new(f'rig_{suffix}')
    rig = bpy.data.objects.new(f'rig_{suffix}', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    edit = {}
    for name, (head, tail, parent) in BONES.items():
        bone = arm_data.edit_bones.new(f'{name}_{suffix}')
        h, t = pos(head), pos(tail)
        h = Vector((h.x * side, h.y, h.z)) + offset
        t = Vector((t.x * side, t.y, t.z)) + offset
        bone.head, bone.tail = h, t
        # Roll so each bone's local Z points up (+Z) in the rest pose.
        bone.align_roll(Vector((0, 0, 1)))
        if parent:
            bone.parent = edit[parent]
            bone.use_connect = False
        edit[name] = bone
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.parent = rig
    modifier = obj.modifiers.new('Armature', 'ARMATURE')
    modifier.object = rig
    groups = {name: obj.vertex_groups.new(name=f'{name}_{suffix}') for name in BONES}
    for v in mesh.vertices:
        co = Vector((v.co.x * side - .2, v.co.y, v.co.z)) if side > 0 else Vector((-(v.co.x + .2), v.co.y, v.co.z))
        for name, w in weights_for(co).items():
            groups[name].add([v.index], w, 'REPLACE')
    return rig, obj


arm_mesh = build_arm_mesh()
paint(arm_mesh)
material = bpy.data.materials.new('fp_arms')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
attribute = material.node_tree.nodes.new('ShaderNodeVertexColor')
attribute.layer_name = 'Color'
material.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = .9
bsdf.inputs['Specular IOR Level'].default_value = .2
rigs = [build_side(1, arm_mesh, material), build_side(-1, arm_mesh, material)]
report = {
    'triangles': sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for _rig, obj in rigs),
    'vertices': sum(len(obj.data.vertices) for _rig, obj in rigs),
    'bones': list(BONES),
    'shoulderOffsetX': .2,
}
bpy.ops.export_scene.gltf(filepath=str(OUT / 'fp-arms.raw.glb'), export_format='GLB', export_vertex_color='ACTIVE',
                          export_skins=True, export_animations=False, export_yup=True, export_def_bones=False)
(OUT / 'fp-arms-report.json').write_text(json.dumps(report, indent=2))
print('FP_ARMS', json.dumps(report))
