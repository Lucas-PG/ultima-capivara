"""Última Capivara player character v6. Blender 5.0.1, run by build-characters.mjs.

1. The sculpt (capybara_form.py, signed distance fields) is polygonized at 2.5 mm with
   OpenVDB: the dense source for baking, one watertight surface of fur, cloth and gear.
2. The game mesh is that surface decimated to three LODs that share one UV layout.
3. Cycles bakes position, normals (object and tangent space) and occlusion from the dense
   source into the game UVs (4096) and caches them. After Blender exits, capybara_maps.py
   paints albedo, roughness, metal, the team mask and fine relief (groomed fur, weave, grain,
   seams and stitches) per texel from that cache and the SDF's own material ids, so material
   borders are crisp at texel resolution; build-characters.mjs packs the maps into the GLB.
4. The rig keeps every v4/v5 bone name and adds chest, toes, pack and hipcloth. Weights
   come from the nearest body part of the sculpt (soft minimum of part distances), the paws
   from digit ownership like the first-person arms, the face from its own bones.
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

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import capy_sdf as S
import capybara_form as C
import capy_hand as P

ROOT = HERE.parents[1]
OUT = ROOT / 'output/characters'; OUT.mkdir(parents=True, exist_ok=True)
CACHE = OUT / 'v6'; CACHE.mkdir(exist_ok=True)
TEX = 4096       # bake, albedo and normal; the ORM map (roughness, metal, team mask) ships at half size
ORM_TEX = 2048
VOXEL = float(__import__('os').environ.get('CAPY_VOXEL', '.0025'))
LOD_BUDGET = [40000, 9500, 2300]
started = time.time()


def log(*a):
    print(f'[capy_v6 {time.time() - started:6.1f}s]', *a, flush=True)


def V(p):
    """Game -> Blender coordinates (x, -z, y), arrays or tuples."""
    p = np.asarray(p, np.float32)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def G(p):
    p = np.asarray(p, np.float32)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1)


bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for data in (bpy.data.actions, bpy.data.materials, bpy.data.meshes, bpy.data.armatures, bpy.data.images):
    for item in list(data):
        data.remove(item)
scene = bpy.context.scene
scene.render.fps = 30


def link(obj):
    scene.collection.objects.link(obj); return obj


def mesh_object(name, verts_game, faces):
    """Fast mesh creation from numpy (game-space verts, quads or triangles)."""
    verts = V(verts_game).astype(np.float32)
    faces = np.asarray(faces, np.int64)
    k = faces.shape[1]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * k).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(faces), k, np.int32))
    me.update(calc_edges=True); me.validate(clean_customdata=False)
    me.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
    return link(bpy.data.objects.new(name, me))


def coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('co', co)
    return G(co.reshape(-1, 3))


def normals(obj):
    n = np.empty(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('normal', n)
    return G(n.reshape(-1, 3))


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# ------------------------------------------------------------------ 1. sculpt
root, parts = C.build()
eyes_node = C.eyes()
log('form')
verts, quads = S.mesh(root, *C.BOUNDS, VOXEL, log=log)
# OpenVDB winds quads clockwise seen from outside; flip them outward.
quads = quads[:, ::-1]
log('dense surface', len(verts), 'vertices')
hi = mesh_object('skin_hi', verts, quads)
# Eyeballs: UV spheres (their own island), the dense and the game version.
def eye_mesh(name, segments, rings):
    bm = bmesh.new()
    for s in (-1, 1):
        e, out = C.eye_point(s)
        geom = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=C.EYE_R)
        R = C.frame(out)  # local +y along the gaze
        M = Matrix([[float(R[i][j]) for j in range(3)] for i in range(3)])
        vs = geom['verts']
        for vtx in vs:
            local = Vector((vtx.co.x, vtx.co.z, -vtx.co.y))  # sphere pole (+z) onto local +y
            g = M @ local + Vector(tuple(float(x) for x in e))
            vtx.co = Vector((g.x, -g.z, g.y))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return link(bpy.data.objects.new(name, me))


eyes_hi = eye_mesh('eyes_hi', 48, 32)

# ------------------------------------------------------------------ 2. game mesh
select_only(hi)
lo = hi.copy(); lo.data = hi.data.copy(); link(lo); lo.name = 'skin_lo'
select_only(lo)
m = lo.modifiers.new('dec', 'DECIMATE'); m.ratio = LOD_BUDGET[0] / (len(lo.data.polygons) * 2); m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=m.name)
eyes_lo = eye_mesh('eyes_lo', 14, 10)
bm = bmesh.new(); bm.from_mesh(eyes_lo.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(eyes_lo.data); bm.free()
tag = lo.data.attributes.new('part', 'INT', 'POINT'); tag.data.foreach_set('value', np.zeros(len(lo.data.vertices), np.int32))
tag = eyes_lo.data.attributes.new('part', 'INT', 'POINT'); tag.data.foreach_set('value', np.ones(len(eyes_lo.data.vertices), np.int32))
select_only(lo, eyes_lo); bpy.ops.object.join()
game = bpy.context.view_layer.objects.active; game.name = 'game'
game.data.calc_loop_triangles()
log('game mesh', len(game.data.loop_triangles), 'triangles')

# UVs: one atlas; the head gets 2.1x texel density (faces are read close up), the paws 1.5x, the soles less.
select_only(game)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003, area_weight=.3, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
me = game.data
uv = me.uv_layers.active.data
pts = coords(game)
part = np.empty(len(me.vertices), np.int32); me.attributes['part'].data.foreach_get('value', part)
loop_v = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', loop_v)
uvs = np.empty(len(me.loops) * 2, np.float32); uv.foreach_get('uv', uvs); uvs = uvs.reshape(-1, 2)
poly_start = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', poly_start)
poly_total = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', poly_total)
# Scale islands per region by scaling every loop UV about its polygon's island (approximate with
# connected-UV islands via bmesh).
bm = bmesh.new(); bm.from_mesh(me); uvl = bm.loops.layers.uv.active
bm.faces.ensure_lookup_table()
seen = set()
for f in bm.faces:
    if f.index in seen:
        continue
    island, stack = [], [f]; seen.add(f.index)
    while stack:
        g = stack.pop(); island.append(g)
        for l in g.loops:
            for other in l.edge.link_faces:
                if other.index in seen:
                    continue
                # Same island when the shared edge has the same UVs on both sides.
                la = [x for x in other.loops if x.edge == l.edge][0]
                if (la[uvl].uv - l.link_loop_next[uvl].uv).length < 1e-5 and (la.link_loop_next[uvl].uv - l[uvl].uv).length < 1e-5:
                    seen.add(other.index); stack.append(other)
    cen = sum((Vector(G(np.array(tuple(g.calc_center_median())))) for g in island), Vector()) / len(island)
    eye = any(part[l.vert.index] == 1 for g in island for l in g.loops)
    head = cen.y > 1.47 and cen.z < .20
    paw = min(np.linalg.norm(np.array(tuple(cen)) - C.wrist(s)) for s in (-1, 1)) < .24
    k = 2.6 if eye else 2.1 if head else 1.3 if paw else .5 if cen.y < .03 else 1.0
    if k != 1.0:
        uv_c = sum((l[uvl].uv for g in island for l in g.loops), Vector((0, 0))) / sum(len(g.loops) for g in island)
        for g in island:
            for l in g.loops:
                l[uvl].uv = uv_c + (l[uvl].uv - uv_c) * k
bm.to_mesh(me); bm.free()
select_only(game)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(margin=.0025, rotate=True, scale=True)
bpy.ops.object.mode_set(mode='OBJECT')
# Keep a free strip along the left and bottom edges of the atlas: the painter puts flat swatches
# there (C.SWATCH) for geometry that is not baked, such as the whiskers.
uvs = np.empty(len(game.data.loops) * 2, np.float32); game.data.uv_layers.active.data.foreach_get('uv', uvs)
game.data.uv_layers.active.data.foreach_set('uv', (uvs * (1 - C.SWATCH_STRIP) + C.SWATCH_STRIP).astype(np.float32))
log('uv')

# ------------------------------------------------------------------ 3. bake
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 1
_t = int(__import__('os').environ.get('BLENDER_THREADS', '3')); scene.render.threads_mode = 'AUTO' if _t == 0 else 'FIXED'; scene.render.threads = max(1, _t)
scene.render.bake.margin = 10; scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .008; scene.render.bake.max_ray_distance = .02
hi_pts = coords(hi)
pos = hi.data.color_attributes.new('pos', 'FLOAT_COLOR', 'POINT')
pos.data.foreach_set('color', np.concatenate([hi_pts, np.ones((len(hi_pts), 1), np.float32)], 1).ravel())
eye_pts = coords(eyes_hi)
epos = eyes_hi.data.color_attributes.new('pos', 'FLOAT_COLOR', 'POINT')
epos.data.foreach_set('color', np.concatenate([eye_pts, np.full((len(eye_pts), 1), 2.0, np.float32)], 1).ravel())
highs = [hi, eyes_hi]


def emit_material(name, layer, alpha=False):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = layer
    if alpha:
        comb = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'): nt.links.new(attr.outputs['Alpha'], comb.inputs[k])
        nt.links.new(comb.outputs['Color'], em.inputs['Color'])
    else:
        nt.links.new(attr.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mt


bake_mat = bpy.data.materials.new('bake_target'); bake_mat.use_nodes = True
node = bake_mat.node_tree.nodes.new('ShaderNodeTexImage'); bake_mat.node_tree.nodes.active = node
game.data.materials.clear(); game.data.materials.append(bake_mat)


def bake(kind, name, material=None, size=TEX, **kw):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    node.image = img
    for o in highs:
        o.data.materials.clear()
        if material: o.data.materials.append(material)
    select_only(game, *highs); bpy.context.view_layer.objects.active = game
    bpy.ops.object.bake(type=kind, **kw)
    px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px)
    node.image = None; bpy.data.images.remove(img)
    return px.reshape(size, size, 4)[..., :3].copy()


# CAPY_REUSE_BAKES=1 reuses the cache when only the rig, clips or paint changed (the sculpt, the
# meshing and the UVs are deterministic, so the cache still fits the game mesh).
if __import__('os').environ.get('CAPY_REUSE_BAKES') and (CACHE / 'bakes.npz').exists():
    log('bakes reused')
else:
    log('bake position'); P_map = bake('EMIT', 'pos', emit_material('emit_pos', 'pos'))
    log('bake eye mask'); E_map = bake('EMIT', 'eyemask', emit_material('emit_eye', 'pos', alpha=True))[..., 0]
    # Direct low-surface positions resolve material ownership where a decimated armhole bridges
    # a crevice. Projection rays there can alternately hit the vest and the sleeve behind it.
    low_pos = game.data.color_attributes.new('pos', 'FLOAT_COLOR', 'POINT')
    low_pos.data.foreach_set('color', np.concatenate([coords(game), np.ones((len(game.data.vertices), 1), np.float32)], 1).ravel())
    low_material = emit_material('emit_low_pos', 'pos')
    low_node = low_material.node_tree.nodes.new('ShaderNodeTexImage'); low_material.node_tree.nodes.active = low_node
    low_img = bpy.data.images.new('low_pos', TEX, TEX, alpha=False, float_buffer=True); low_img.colorspace_settings.name = 'Non-Color'; low_node.image = low_img
    game.data.materials.clear(); game.data.materials.append(low_material)
    select_only(game); scene.render.bake.use_selected_to_active = False; bpy.ops.object.bake(type='EMIT')
    low_px = np.empty(TEX * TEX * 4, np.float32); low_img.pixels.foreach_get(low_px); P_low = low_px.reshape(TEX, TEX, 4)[..., :3].copy()
    low_node.image = None; bpy.data.images.remove(low_img); del low_px
    scene.render.bake.use_selected_to_active = True; game.data.materials.clear(); game.data.materials.append(bake_mat)
    game.data.color_attributes.remove(low_pos)
    log('bake object normal'); N_obj = bake('NORMAL', 'nobj', bpy.data.materials.new('plain_a'), normal_space='OBJECT').astype(np.float16)
    log('bake tangent normal'); N_tan = bake('NORMAL', 'ntan', bpy.data.materials.new('plain_b'), normal_space='TANGENT').astype(np.float16)
    scene.cycles.samples = 48; scene.world = scene.world or bpy.data.worlds.new('w'); scene.world.light_settings.distance = .06
    # Occlusion is soft: baked at half size (a quarter of the samples) and filtered up.
    log('bake occlusion'); AO = bake('AO', 'ao', bpy.data.materials.new('plain_c'), size=TEX // 2)[..., 0]
    AO = np.repeat(np.repeat(AO, 2, 0), 2, 1)
    AO = ((AO + np.roll(AO, 1, 0) + np.roll(AO, -1, 0) + np.roll(AO, 1, 1) + np.roll(AO, -1, 1)) / 5).astype(np.float16)
    # Coverage: texels the bake wrote (margin included) have a nonzero object normal.
    covered = np.abs(np.linalg.norm(N_obj.astype(np.float32) * 2 - 1, axis=2) - 1) < .08
    # The painter (capybara_maps.py) runs from this cache after Blender exits.
    np.savez(CACHE / 'bakes.npz', P=P_map, P_low=P_low, E=E_map.astype(np.float16), N_obj=N_obj, N_tan=N_tan, AO=AO, covered=covered)
    del P_map, P_low, N_obj, N_tan, AO, E_map, covered
    log('bakes cached')
for o in highs:
    bpy.data.objects.remove(o)


# ------------------------------------------------------------------ 4. material
# Small placeholders keep the exported material's texture slots; build-characters.mjs puts the
# painted maps (capybara_maps.py, from the bake cache) into them when it packs the GLB.
def placeholder(name, rgb, colour):
    img = bpy.data.images.new(name, 8, 8, alpha=False)
    if not colour:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.tile(np.array([*rgb, 1], np.float32), 64))
    img.filepath_raw = str(CACHE / f'{name}.png'); img.file_format = 'PNG'; img.save()
    return img


albedo_img = placeholder('capybara_albedo', (.5, .5, .5), True)
normal_img = placeholder('capybara_normal', (.5, .5, 1), False)
orm_img = placeholder('capybara_orm', (0, .8, 0), False)
mat = bpy.data.materials.new('capybara_v6'); mat.use_nodes = True; nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
t = nt.nodes.new('ShaderNodeTexImage'); t.image = albedo_img; nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal_img; nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm_img; sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(to.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
# The red channel of the ORM map is the team mask (occlusion is already in the albedo).
mat['capyCharacterV6'] = True
game.data.materials.clear(); game.data.materials.append(mat)
log('paint')

# ------------------------------------------------------------------ 5. rig
BONES = C.bones()
arm_data = bpy.data.armatures.new('Capivara_rig')
rig = link(bpy.data.objects.new('Capivara', arm_data))
select_only(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, (a, b, parent) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(tuple(V(a).tolist())), Vector(tuple(V(b).tolist()))
    if name.startswith('paw_') and name[4:].split('_')[0][:-1] in P.FINGERS:
        eb.align_roll(Vector((0, 0, 1)))
    if parent:
        eb.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
REST = {b.name: (G(np.array(tuple(b.head_local))), G(np.array(tuple(b.tail_local)))) for b in arm_data.bones}


def whisker_mesh():
    """Real whiskers for the close LOD: thin tapered three-sided strands from the whisker pads,
    sweeping out and back. They sample the whisker swatch of the atlas (not baked)."""
    verts, faces = [], []
    centre = C.v(0, 1.6, -.07)
    for s in (-1, 1):
        roots = C.whisker_roots(s)
        for k, root in enumerate(roots):
            out = C.norm(C.v(s * .80, -.10 - .06 * (k % 3), .42 + .05 * (k % 4)))
            length = .070 + .030 * ((k * 7) % 5) / 4
            base = len(verts)
            for i in range(5):
                t = i / 4
                # A gentle droop and sweep along the strand, tapering to a point.
                c = root + out * (length * t) + C.v(0, -.018 * t * t, .022 * t * t) - out * .002
                # The head hit sphere bounds every head vertex.
                d = c - centre; r = float(np.linalg.norm(d))
                if r > .292: c = centre + d * (.292 / r)
                w = .0011 * (1 - t) + .0002
                a = C.norm(np.cross(out, C.v(0, 1, 0))); b = np.cross(out, a)
                for j in range(3):
                    ang = j * math.tau / 3
                    verts.append(c + (a * math.cos(ang) + b * math.sin(ang)) * w)
            for i in range(4):
                for j in range(3):
                    p0, p1 = base + i * 3 + j, base + i * 3 + (j + 1) % 3
                    faces += [(p0, p1, p1 + 3), (p0, p1 + 3, p0 + 3)]
    obj = mesh_object('whiskers', np.array(verts, np.float32), faces)
    layer = obj.data.uv_layers.new(name=game.data.uv_layers.active.name)
    layer.data.foreach_set('uv', np.tile(np.array(C.SWATCH['whisker'], np.float32), len(obj.data.loops)))
    tag = obj.data.attributes.new('part', 'INT', 'POINT'); tag.data.foreach_set('value', np.full(len(obj.data.vertices), 2, np.int32))
    obj.data.materials.append(game.data.materials[0])
    return obj


def lod_copy(level, budget):
    obj = game.copy(); obj.data = game.data.copy(); link(obj); obj.name = f'Capybara_LOD{level}'; obj.data.name = obj.name
    if level == 0:
        select_only(obj, whisker_mesh()); bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active; obj.name = 'Capybara_LOD0'; obj.data.name = obj.name
    if level:
        select_only(obj)
        for _ in range(3):
            obj.data.calc_loop_triangles(); current = len(obj.data.loop_triangles)
            if current <= budget * 1.03: break
            d = obj.modifiers.new('budget', 'DECIMATE'); d.ratio = budget / current; d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=d.name)
    return obj


import capybara_weights as W
report = {'lods': [], 'hitbox': {'head': {'center': [0, 1.6, -.07], 'radius': .29}, 'body': {'radius': .335, 'top': 1.42}},
          'clips': ['idle', 'jump'], 'material': 'baked sculpt: albedo + normal + ORM (R team mask), _fur vertex mask', 'voxel': VOXEL}
lods = []
for level, budget in enumerate(LOD_BUDGET):
    obj = lod_copy(level, budget)
    if level == 2:
        # The far LOD drops the eyes (sub-pixel beyond 28 m).
        bm = bmesh.new(); bm.from_mesh(obj.data); layer = bm.verts.layers.int.get('part')
        bmesh.ops.delete(bm, geom=[vx for vx in bm.verts if vx[layer] == 1], context='VERTS'); bm.to_mesh(obj.data); bm.free()
    pts, nrm = coords(obj), normals(obj)
    partv = np.empty(len(obj.data.vertices), np.int32); obj.data.attributes['part'].data.foreach_get('value', partv)
    weights, team, fur = W.weights(parts, root, REST, pts, nrm, partv)
    # The gameplay head sphere bounds every head vertex. Decimation can leave a coarse LOD's vertex
    # a centimetre off the dense surface at the muzzle corners: bring any such vertex back inside
    # (the head then still has room to turn in its clips).
    hit = report['hitbox']['head']; centre = np.array(hit['center'], np.float32)
    head_w = np.array([sum(v for k, v in w.items() if k.startswith(('head', 'jaw', 'nose', 'ear_', 'blink_', 'socket_', 'glint_', 'brow_', 'mouth_'))) for w in weights], np.float32)
    d = pts - centre; r = np.linalg.norm(d, axis=1); limit = hit['radius'] - .0035
    out = (head_w > .5) & (r > limit)
    if out.any():
        pts[out] = centre + d[out] * (limit / r[out])[:, None]
        obj.data.vertices.foreach_set('co', V(pts).ravel()); obj.data.update()
    log('LOD', level, 'head vertices brought inside the head sphere:', int(out.sum()))
    t_attr = obj.data.attributes.new('_TEAM', 'FLOAT', 'POINT'); t_attr.data.foreach_set('value', team)
    f_attr = obj.data.attributes.new('_FUR', 'FLOAT', 'POINT'); f_attr.data.foreach_set('value', fur)
    col = obj.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', np.ones(len(pts) * 4, np.float32))
    obj.data.attributes.remove(obj.data.attributes['part'])
    groups = {}
    for name in BONES:
        groups[name] = obj.vertex_groups.new(name=name)
    for i, influence in enumerate(weights):
        for name, value in influence.items():
            groups[name].add([i], value, 'REPLACE')
    obj.parent = rig; mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    obj.data.calc_loop_triangles()
    report['lods'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
    lods.append(obj)
    log('LOD', level, len(obj.data.loop_triangles))
bpy.data.objects.remove(game)
# The glTF exporter validates every mesh and warns when that fixes anything: report what was
# wrong here (the verbose log names it) and export the cleaned meshes.
for obj in lods:
    counts = (len(obj.data.vertices), len(obj.data.polygons))
    fixed = obj.data.validate(verbose=True, clean_customdata=False)
    log('validate', obj.name, 'fixed' if fixed else 'clean', counts, '->', (len(obj.data.vertices), len(obj.data.polygons)))
report['eye'] = {s: [float(x) for x in C.eye_point(k)[0]] for s, k in (('L', -1), ('R', 1))}
# Where each planted foot touches the ground (the sole under the toe hinge): the gait test and
# the runtime ground clamp read it.
report['footContact'] = {s: [float(x) for x in C.foot_contact(k)] for s, k in (('L', -1), ('R', 1))}
exec((HERE / 'capybara_clips.py').read_text())
