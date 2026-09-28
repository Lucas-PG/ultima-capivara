"""Capivara Redentora: a robed, arms-wide capybara sculpted in soapstone for the
Morro summit. Executed at the end of capybara_v4.py (helpers in scope); it
builds its own metaball so the arms are modelled open rather than reposed.
Model space matches the character: feet at y = 0, 1.9 m tall, faces -z."""
import bmesh as _bmesh

mb = bpy.data.metaballs.new('statue')
mb.resolution = .018
mb.threshold = .6
statue_mb = bpy.data.objects.new('statue_mb', mb)
scene.collection.objects.link(statue_mb)
# Head: the same capybara box as the character.
blob((0, 1.635, .035), (.16, .13, .165))
blob((0, 1.695, -.07), (.14, .065, .17))
blob((0, 1.6, -.185), (.135, .13, .135))
blob((0, 1.59, -.262), (.115, .115, .062))
for s in (-1, 1):
    blob((s * .095, 1.57, -.095), (.09, .1, .1))
    blob((s * .1, 1.75, .07), (.045, .05, .03))
blob((0, 1.515, -.18), (.095, .058, .1))
# Chest and a robe widening to the plinth.
blob((0, 1.2, 0), (.26, .2, .21))
blob((0, 1.34, -.01), (.2, .12, .17))
blob((0, 1.46, -.04), (.17, .11, .16))
for i, y in enumerate([1.0, .78, .56, .34, .14]):
    r = .26 + i * .035
    blob((0, y, .01), (r, .16, r * .88))
# Arms wide, sleeves hanging below them.
for s in (-1, 1):
    shoulder = Vector((s * .22, 1.3, 0))
    wrist = Vector((s * .92, 1.37, -.04))
    capsule(tuple(shoulder), tuple(wrist), .085, .06)
    blob(tuple(wrist + Vector((s * .07, 0, 0))), (.07, .04, .06))
    # One continuous hanging sleeve rather than separate lobes.
    for i in range(22):
        t = .12 + i * .038
        at = shoulder.lerp(wrist, min(t, .9))
        blob((at.x, at.y - .09 - .07 * t, at.z + .005), (.05, .1 + .07 * t, .04), 2.4)
depsgraph = bpy.context.evaluated_depsgraph_get()
statue_mesh = bpy.data.meshes.new_from_object(statue_mb.evaluated_get(depsgraph))
bpy.data.objects.remove(statue_mb)
statue = bpy.data.objects.new('Capivara_Redentora', statue_mesh)
scene.collection.objects.link(statue)
bpy.context.view_layer.objects.active = statue
rem = statue.modifiers.new('remesh', 'REMESH')
rem.mode = 'VOXEL'
rem.voxel_size = .012
sm = statue.modifiers.new('smooth', 'SMOOTH')
sm.factor = .5
sm.iterations = 5
dec = statue.modifiers.new('budget', 'DECIMATE')
dec.ratio = .35
for m in list(statue.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
statue_mesh = statue.data
# Robe folds: vertical grooves carved by displacing along the normal.
for v in statue_mesh.vertices:
    p = G(v.co)
    if p.y < 1.15:
        angle = math.atan2(p.z, p.x)
        fold = math.sin(angle * 9 + p.y * 1.3) * .012 * min(1, (1.15 - p.y) / .4)
        v.co += v.normal * fold
for poly in statue_mesh.polygons:
    poly.use_smooth = True
bm = _bmesh.new()
bm.from_mesh(statue_mesh)
tree = BVHTree.FromBMesh(bm)
bm.free()
stone, stone_warm = srgb('EFE9DC'), srgb('D9CDB6')
statue_mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
colors = statue_mesh.color_attributes['Color']
rng = random.Random(3)
dirs = []
while len(dirs) < 24:
    d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
    if .1 < d.length <= 1:
        dirs.append(d.normalized())
for v in statue_mesh.vertices:
    hits = total = 0.0
    for d in dirs:
        c = d.dot(v.normal)
        if c <= 0:
            d, c = -d, -c
        total += c
        hit = tree.ray_cast(v.co + v.normal * .002, d, .15)
        if hit[0] is not None:
            hits += c * (1 - hit[3] / .15) ** .6
    occ = 1 - hits / max(total, 1e-6)
    tone = stone.lerp(stone_warm, max(0, -v.normal.z) * .5)
    shade = .45 + .55 * occ ** 1.3
    colors.data[v.index].color = (tone.x * shade, tone.y * shade, tone.z * shade, 1)
statue_mesh.color_attributes.active_color = colors
statue_mat = bpy.data.materials.new('Pedra_sabao')
statue_mat.use_nodes = True
node = statue_mat.node_tree.nodes.new('ShaderNodeVertexColor')
node.layer_name = 'Color'
statue_mat.node_tree.links.new(node.outputs['Color'], statue_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
statue_mesh.materials.clear()
statue_mesh.materials.append(statue_mat)
bpy.ops.object.select_all(action='DESELECT')
statue.select_set(True)
bpy.context.view_layer.objects.active = statue
bpy.ops.export_scene.gltf(filepath=str(OUT / 'statue.raw.glb'), export_format='GLB', use_selection=True, export_vertex_color='ACTIVE',
                          export_animations=False, export_skins=False, export_yup=True)
print('CAPY_STEP statue', len(statue_mesh.polygons))
