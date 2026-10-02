"""Original Capivara island hopper and nine-cell parachute, in game metres.

All shape, livery, lettering and hardware are authored here. The compact
vertex palette needs no image texture. Blender produces the same three LODs
for the production loader and the review studio.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/aircraft'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

COLORS = {
    'cream': 'F2E5C7', 'light': 'FFF3D5', 'teal': '248F85', 'mint': '7DC5AD',
    'darkteal': '185750', 'orange': 'E87C43', 'gold': 'F4BF57', 'ink': '293B3B',
    'rubber': '304040', 'steel': 'A8BDB5', 'wood': 'AE7B50', 'canvas': 'D4C095',
    'shadow': '918D79', 'red': 'EB674C', 'green': '93CF7A', 'team': 'FFFFFF',
}


def rgb(key):
    code = COLORS.get(key, key)
    values = [int(code[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]


def material(name, roughness=.7, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = .05
    bsdf.inputs['Alpha'].default_value = alpha
    color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha < 1:
        mat.surface_render_method = 'BLENDED'
    return mat


PAINT = material('Pintura_e_tecido_Capivara')
GLASS = material('Vidro_azul_da_cabine', .18, .62)


class Mesh:
    def __init__(self, name, level, mat=PAINT):
        self.name, self.level, self.mat = name, level, mat
        self.verts, self.faces, self.colors, self.smooth = [], [], [], []

    def add(self, vertices, faces, color='cream', smooth=False, shade=1):
        offset = len(self.verts)
        self.verts.extend(vertices)
        for face in faces:
            self.faces.append(tuple(offset + i for i in face))
            self.colors.append([c * shade for c in rgb(color)])
            self.smooth.append(smooth)

    def box(self, at, size, color='cream', bevel=.025):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vertex in bm.verts:
            vertex.co = Vector([vertex.co[i] * size[i] for i in range(3)])
        if bevel and self.level < 2:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .26),
                            segments=2 if self.level == 0 else 1, affect='EDGES')
        bm.verts.index_update()
        self.add([tuple(v.co[i] + at[i] for i in range(3)) for v in bm.verts],
                 [[v.index for v in f.verts] for f in bm.faces], color)
        bm.free()

    def tube(self, points, radius, color='cream', sides=None):
        sides = sides or [8, 6, 4][self.level]
        vertices = []
        for i, point in enumerate(points):
            direction = Vector(points[min(len(points) - 1, i + 1)]) - Vector(points[max(0, i - 1)])
            direction.normalize()
            right = direction.cross(Vector((0, 1, 0)))
            if right.length < .01:
                right = direction.cross(Vector((1, 0, 0)))
            right.normalize()
            up = right.cross(direction).normalized()
            for j in range(sides):
                a = j * math.tau / sides
                vertices.append(tuple(Vector(point) + radius * (math.cos(a) * right + math.sin(a) * up)))
        faces = []
        for i in range(len(points) - 1):
            for j in range(sides):
                faces.append((i * sides + j, (i + 1) * sides + j,
                              (i + 1) * sides + (j + 1) % sides, i * sides + (j + 1) % sides))
        faces.extend([tuple(range(sides)), tuple((len(points) - 1) * sides + j for j in reversed(range(sides)))])
        self.add(vertices, faces, color, True)

    def ellipsoid(self, at, size, color='cream', segments=None, rings=None):
        n, m = segments or [20, 12, 8][self.level], rings or [10, 6, 4][self.level]
        vertices = []
        for i in range(m + 1):
            p = math.pi * i / m
            for j in range(n):
                a = j * math.tau / n
                vertices.append((at[0] + size[0] * math.sin(p) * math.cos(a),
                                 at[1] + size[1] * math.cos(p),
                                 at[2] + size[2] * math.sin(p) * math.sin(a)))
        self.add(vertices, [(i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j, i*n+j)
                            for i in range(m) for j in range(n)], color, True)

    def profile(self, yz, thickness, color, x=0):
        vertices = [(x - thickness / 2, y, z) for y, z in yz] + [(x + thickness / 2, y, z) for y, z in yz]
        n = len(yz)
        faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
        faces += [(j, (j+1)%n, (j+1)%n+n, j+n) for j in range(n)]
        self.add(vertices, faces, color)

    def text(self, label, at, size, color, side=1, top=False, height=None):
        curve = bpy.data.curves.new('letras', 'FONT')
        curve.body = label
        curve.size = size
        curve.align_x = 'CENTER'
        curve.resolution_u = 2
        curve.extrude = .0015
        obj = bpy.data.objects.new('letras', curve)
        bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target='MESH')
        mesh = obj.data
        vertices = [(at[0] + v.co.x, at[1] + v.co.z, at[2] - v.co.y) if top else
                    (at[0] + side * v.co.z, at[1] + v.co.y, at[2] - side * v.co.x) for v in mesh.vertices]
        if height:
            vertices=[(x,height(x,z)+y-at[1],z) for x,y,z in vertices]
        self.add(vertices,[tuple(p.vertices) for p in mesh.polygons],color)
        bpy.data.objects.remove(obj, do_unlink=True)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([(x, -z, y) for x, y, z in self.verts], [], self.faces)
        mesh.update()
        attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for poly, color, smooth in zip(mesh.polygons, self.colors, self.smooth):
            poly.use_smooth = smooth
            for loop in poly.loop_indices:
                attr.data[loop].color = (*color, 1)
        # A painted surface may change color at a panel boundary, but its normals
        # remain continuous. Weld matching corners after preserving loop colors.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.000001)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(self.mat)
        obj['front'] = '-Z'
        obj['up'] = '+Y'
        obj['lod'] = self.level
        mesh.calc_loop_triangles()
        return {'name': self.name, 'triangles': len(mesh.loop_triangles)}


SECTIONS = [(-8.0,.15,.24,-.38),(-7.6,.8,.76,-.20),(-6.7,1.37,1.28,-.08),
            (-5.5,1.65,1.58,0),(-4.3,1.76,1.70,0),(-3.1,1.79,1.73,0),
            (-1.6,1.80,1.74,0),(0,1.80,1.74,0),(1.2,1.78,1.72,.02),
            (4.5,1.63,1.60,.12),(5.3,1.46,1.37,.26),(6.6,1.04,.98,.46),
            (8.0,.57,.56,.63),(9.3,.18,.23,.76),(9.7,.04,.07,.78)]


def section(z):
    for a, b in zip(SECTIONS, SECTIONS[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return [a[i] * (1-t) + b[i] * t for i in range(1, 4)]
    return list(SECTIONS[0 if z < SECTIONS[0][0] else -1][1:])


def hull(z, angle, inset=0):
    rx, ry, cy = section(z)
    return ((rx-inset)*math.cos(angle), cy+(ry-inset)*math.sin(angle), z)


def plane(level):
    p, glass = Mesh('plane_body_LOD'+str(level), level), Mesh('plane_glass_LOD'+str(level), level, GLASS)
    n = [40, 24, 16][level]
    for a, b in zip(SECTIONS, SECTIONS[1:]):
        for j in range(n):
            angles = [math.tau*j/n, math.tau*(j+1)/n]
            center = (angles[0]+angles[1])/2
            z = (a[0]+b[0])/2
            door = 1.2 <= z <= 4.5 and abs(math.cos(center)) > .74
            cockpit = (-7.6 < z < -6.7 and math.sin(center) > .2) or (-6.7 < z < -4.3 and .20 < math.sin(center) < .84)
            if door:
                continue
            vertices = [hull(a[0],angles[0]),hull(b[0],angles[0]),hull(b[0],angles[1]),hull(a[0],angles[1])]
            color = 'teal' if math.sin(center) < -.18 else 'cream'
            if -.18 <= math.sin(center) < .04:
                color = 'orange'
            if cockpit:
                glass.add(vertices,[(3,2,1,0)],'417B80',True)
                continue
            p.add(vertices,[(3,2,1,0)],color,True)
            # A separate inner skin makes the doorway a real hollow cabin.
            if -8.0 <= z <= 5.3 and level < 2:
                inner = [hull(a[0],angles[0],.10),hull(b[0],angles[0],.10),hull(b[0],angles[1],.10),hull(a[0],angles[1],.10)]
                p.add(inner,[(0,1,2,3)],'canvas' if math.sin(center) < .25 else 'cream',True,.88)
    # Cockpit frames and paired oval cabin windows.
    for side in [-1,1]:
        for z in [-3.5,-2.0,-.5]:
            rx, ry, cy = section(z)
            x = side * (rx-.09)
            p.ellipsoid((x,.63,z),(.13,.43,.52),'darkteal',segments=[20,12,8][level],rings=[8,5,4][level])
            p.ellipsoid((x+side*.065,.66,z),(.085,.34,.41),'ink',segments=[20,12,8][level],rings=[8,5,4][level])
            if level == 0:
                p.tube([(x+side*.143,.80,z-.23),(x+side*.16,.88,z+.12)],.022,'mint',4)
        for z in [-6.7,-5.5,-4.3]:
            p.tube([hull(z,a,.005) for a in ([.22,.45,.7,.98] if side>0 else [math.pi-.22,math.pi-.45,math.pi-.7,math.pi-.98])],.055,'cream')
        # A thick rolled frame and yellow threshold describe both jump doors.
        lo, hi = -.66, .66
        angles = [lo+(hi-lo)*i/8 for i in range(9)]
        if side<0:
            angles=[math.pi-a for a in angles]
        for z in [1.2,4.5]:
            p.tube([hull(z,a,-.008) for a in angles],.065,'teal')
        for a in [angles[0],angles[-1]]:
            p.tube([hull(z,a,-.02) for z in [1.2,2.5,3.5,4.5]],.065,'gold')
        p.box((side*1.70,-1.11,2.82),(.54,.16,3.28),'teal',.04)
        if level<2:
            for z in [1.45,1.95,2.45,2.95,3.45,3.95,4.35]:
                p.box((side*1.85,-1.014,z),(.18,.015,.22),'gold',0)
            p.tube([(side*1.75,1.06,1.40),(side*1.78,1.06,4.22)],.039,'darkteal')
            p.tube([(side*1.77,-.62,1.30),(side*1.88,-.62,1.30),(side*1.88,.65,1.30),(side*1.77,.65,1.30)],.04,'steel')
        if level == 0:
            p.text('CAPIVARA',(side*1.803,-.17,-1.75),.37,'light',side)
            p.text('SALTO',(side*1.48,1.36,2.9),.19,'darkteal',side)
            for z in [-4.1,-2.75,-1.25,.9,4.8]:
                for y in [-.92,1.03]:
                    px=section(z)[0]*math.sqrt(max(.1,1-(y/section(z)[1])**2))
                    p.ellipsoid((side*(px+.025),y,z),(.025,.031,.031),'steel',8,4)
    # Cabin floor, forward bulkhead, padded benches, frame ribs and cockpit.
    p.box((0,-1.13,.15),(2.68,.15,10.2),'wood',.035)
    if level<2:
        cockpit_floor=[(-.68,-.97,-6.62),(.68,-.97,-6.62),(1.24,-.97,-4.80),(-1.24,-.97,-4.80)]
        p.add(cockpit_floor,[(3,2,1,0)],'darkteal')
        p.add([(x,y-.08,z) for x,y,z in cockpit_floor],[(0,1,2,3)],'darkteal')
        for x in [-.8,-.4,0,.4,.8]:
            p.box((x,-1.047,.1),(.022,.012,9.65),'shadow',0)
        for side in [-1,1]:
            p.box((side*1.08,-.65,-1.45),(.63,.18,5.9),'teal',.065)
            p.box((side*1.35,-.17,-1.45),(.12,.83,5.9),'mint',.035)
            for z in [-3.8,-2.5,-1.2,.1]:
                p.box((side*1.08,-.539,z),(.54,.035,.035),'cream',.006)
                p.tube([(side*.90,-.52,z-.22),(side*1.16,-.51,z),(side*1.25,-.46,z+.13)],.022,'darkteal',4)
                p.box((side*1.08,-.476,z-.065),(.09,.027,.075),'steel',.01)
                p.tube([(side*1.02,-1.04,z),(side*1.02,-.73,z)],.035,'steel')
                p.tube([(side*1.38,.31,z),(side*1.39,.38,z+.15),(side*1.38,.31,z+.30)],.023,'ink')
        for z in [-4.1,-2.5,-.9,.8,4.7]:
            p.tube([hull(z,.25+(math.pi-.5)*i/18,.16) for i in range(19)],.045,'steel',6)
        p.box((0,.73,-4.30),(2.68,.16,.13),'teal')
        p.box((0,-.32,-6.0),(2.48,.27,.45),'darkteal',.065)
        for side in [-1,1]:
            p.box((side*.61,-.61,-4.89),(.69,.18,.70),'orange',.075)
            p.box((side*.61,-.11,-4.52),(.65,.86,.20),'orange',.06)
            p.tube([(side*.61,-.48,-5.31),(side*.61,-.02,-5.44)],.038,'steel')
            p.tube([(side*.85,.02,-5.48),(side*.85,-.08,-5.49),(side*.37,-.08,-5.49),(side*.37,.02,-5.48)],.035,'ink')
        if level == 0:
            for x in [-.94,-.60,-.26,.26,.60,.94]:
                p.ellipsoid((x,-.14,-5.78),(.115,.115,.022),'steel',12,5)
                p.ellipsoid((x,-.14,-5.752),(.088,.088,.008),'ink',12,5)
                p.tube([(x,-.14,-5.738),(x+.034,-.087,-5.738)],.008,'light',4)
            for side in [-1,1]:
                p.box((side*1.11,-.56,5.00),(.66,.92,.64),'canvas',.06)
                for z in [4.78,5.18]:
                    p.box((side*1.11,-.085,z),(.67,.02,.045),'darkteal',.006)
                p.box((side*1.22,.66,4.87),(.16,.28,.23),'red',.035)
            p.tube([(-.69,1.45,-4.10),(-.69,1.45,4.5)],.021,'steel',6)
            p.tube([(.69,1.45,-4.10),(.69,1.45,4.5)],.021,'steel',6)
    # Rounded airfoil wings, broad at the root, swept and tapered at the tip.
    for side in [-1,1]:
        stations=[(0,2.15,0),(3.6,2.08,.03),(6.6,1.85,.12),(9.6,1.5,.30),(11.7,1.18,.47),(12.15,.88,.55),(12.35,.06,.58)]
        def wing_top(x,z):
            for a,b in zip(stations,stations[1:]):
                if a[0] <= x <= b[0]:
                    t=(x-a[0])/(b[0]-a[0])
                    chord=a[1]*(1-t)+b[1]*t
                    sweep=a[2]*(1-t)+b[2]*t
                    return 1.63+.20*math.sqrt(max(0,1-((z+1.15-sweep)/chord)**2))*(chord/2.15)+.008*x
            return 1.7
        ring=[24,16,10][level]
        for a,b in zip(stations,stations[1:]):
            for j in range(ring):
                points=[]
                for station, k in [(a,j),(b,j),(b,j+1),(a,j+1)]:
                    angle=math.tau*k/ring
                    x,chord,sweep=station
                    points.append((side*x,1.63+.20*math.sin(angle)*(chord/2.15)+.008*x,-1.15+sweep+chord*math.cos(angle)))
                color='orange' if a[0]>11 else 'teal' if j>ring*.65 else 'cream'
                face=(0,1,2,3) if side>0 else (3,2,1,0)
                p.add(points,[face],color,True)
        if level<2:
            p.tube([(side*x,wing_top(x,.15+.04*x)+.009,.15+.04*x) for x in [2.0,4.0,7.0,9.1,10.8]],.015,'darkteal',4)
            for x in [3.4,6.2,9.1]:
                p.box((side*x,1.47,.36+.04*x),(.18,.19,.52),'cream',.025)
        if level==0:
            # Broad original lettering is confined to the nearly flat centre
            # of each wing, so it reads at the orbit camera without decals.
            p.text('ILHA DOURADA',(side*8.0,1.875,-.81),.42,'teal',top=True,height=lambda x,z:wing_top(abs(x),z)+.006)
            for x in [3.6,6.6,9.6]:
                for z in [-1.7,-.9,.0]:
                    p.ellipsoid((side*x,wing_top(x,z)+.010,z),(.025,.009,.025),'shadow',8,4)
        p.ellipsoid((side*12.15,1.79,-.48),(.16,.11,.18),'red' if side<0 else 'green',12,6)
        # Diagonal main wing struts and nacelles have a complete underside.
        p.tube([(side*1.51,-.78,-.8),(side*5.85,1.45,-.7)],.09,'steel')
        x=side*5.05
        p.ellipsoid((x,1.34,-2.00),(.75,.73,2.44),'orange')
        p.tube([(x,1.34,-4.10),(x,1.34,-4.67)],.66,'cream',sides=[24,16,10][level])
        p.tube([(x,1.34,-4.69),(x,1.34,-4.73)],.50,'ink',sides=[24,16,10][level])
        p.ellipsoid((x,1.34,-4.94),(.30,.30,.48),'steel')
        if level<2:
            for j in range(8):
                angle=j*math.tau/8
                p.tube([(x+math.cos(angle)*.57,1.34+math.sin(angle)*.57,-4.30),
                        (x+math.cos(angle)*.58,1.34+math.sin(angle)*.58,-4.53)],.047,'darkteal',4)
            p.tube([(x+side*.49,1.03,-2.36),(x+side*.87,.94,-2.06),(x+side*.88,.94,-1.63)],.12,'ink')
        # Braced wheel legs, fat tyres, cream hubs, and an axle on each side.
        p.tube([(side*.91,-1.34,-.02),(side*1.82,-1.96,.30)],.12,'steel')
        p.tube([(side*1.46,-1.18,1.24),(side*1.82,-1.96,.30)],.073,'teal')
        p.tube([(side*1.61,-2.02,.30),(side*2.08,-2.02,.30)],.49,'rubber',sides=[24,16,12][level])
        p.tube([(side*2.08,-2.02,.30),(side*2.12,-2.02,.30)],.23,'cream',sides=[16,12,8][level])
        p.tube([(side*2.12,-2.02,.30),(side*2.14,-2.02,.30)],.09,'steel',sides=8)
    p.tube([(0,-1.13,-5.64),(0,-1.92,-5.51)],.075,'steel')
    p.tube([(-.14,-2.0,-5.51),(.14,-2.0,-5.51)],.33,'rubber',sides=[20,12,8][level])
    p.tube([(-.151,-2.0,-5.51),(.151,-2.0,-5.51)],.15,'cream',sides=10)
    # Tall swept tail and its cream leading edge.
    p.profile([(.55,5.85),(.95,9.15),(4.6,9.0),(4.93,8.44),(4.82,7.88),(2.00,6.65)],.28,'orange')
    p.profile([(1.02,8.53),(1.02,9.22),(4.63,9.04),(4.9,8.51)],.31,'teal')
    p.tube([(0,1.12,6.12),(0,2.12,6.80),(0,4.70,8.03),(0,4.90,8.44)],.095,'cream')
    for side in [-1,1]:
        p.ellipsoid((side*1.85,.95,8.18),(2.20,.13,.94),'orange',segments=[24,16,10][level],rings=[8,6,4][level])
        if level<2:
            p.tube([(side*.45,1.085,8.6),(side*3.5,1.015,8.6)],.022,'darkteal',4)
            # An original capybara medallion, readable without tiny lettering.
            p.ellipsoid((side*.17,3.17,8.14),(.021,.64,.63),'cream',20,10)
            p.ellipsoid((side*.193,3.17,8.16),(.016,.25,.40),'wood',16,8)
            p.ellipsoid((side*.213,3.12,7.90),(.013,.17,.28),'wood',12,6)
            p.ellipsoid((side*.217,3.43,8.23),(.014,.11,.10),'wood',12,6)
            p.ellipsoid((side*.235,3.26,8.03),(.009,.035,.034),'ink',8,4)
        if level==0:
            p.text('PT-CAP',(side*.167,1.80,8.25),.27,'light',side)
            for z in [-3.5,-1.5,.5]:
                p.tube([hull(z,a,-.008) for a in [3.46,3.9,4.4,4.9,5.4,5.96]],.013,'mint',4)
    p.tube([(0,1.73,-1.4),(0,2.44,-1.1)],.035,'steel')
    p.ellipsoid((0,1.96,.7),(.10,.13,.18),'red',12,6)
    return [p.finish(),glass.finish()]


def propeller(level):
    p=Mesh('plane_propeller_LOD'+str(level),level)
    for blade in range(3):
        a=blade*math.tau/3
        outline=[(-.13,.23),(-.23,.75),(-.17,1.76),(.02,2.12),(.19,2.11),(.31,1.80),(.29,.76),(.12,.23)]
        for layer in [-1,1]:
            vertices=[]
            for x,y in outline:
                vertices.append((x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),layer*.035))
            face=tuple(reversed(range(len(vertices)))) if layer>0 else tuple(range(len(vertices)))
            p.add(vertices,[face],'ink')
            tips=[(-.08,1.79),(.02,2.12),(.19,2.11),(.31,1.80)]
            p.add([(x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),layer*.039) for x,y in tips],
                  [(3,2,1,0) if layer>0 else (0,1,2,3)],'gold')
        for j in range(len(outline)):
            a0,b0=outline[j],outline[(j+1)%len(outline)]
            vertices=[(x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z) for (x,y),z in [(a0,-.035),(b0,-.035),(b0,.035),(a0,.035)]]
            p.add(vertices,[(0,1,2,3)],'ink')
    p.ellipsoid((0,0,-.10),(.30,.30,.32),'cream')
    return p.finish()


def canopy_point(x,t,upper=True,bulge=0):
    arch=4.04-.65*(x/2.65)**2
    z=-1.30+2.55*t+.16*(x/2.65)**2
    y=arch+(.38*math.sin(math.pi*t)**.7+.06 if upper else -.17+.07*math.sin(math.pi*t))
    return (x,y+(bulge if upper else -bulge*.2),z)


def parachute(level):
    base,team=Mesh('chute_base_LOD'+str(level),level),Mesh('chute_team_LOD'+str(level),level)
    cols,rows=[4,3,2][level],[12,8,5][level]
    for cell in range(9):
        target=team if cell in [0,1,3,5,7,8] else base
        color='team' if target is team else 'cream'
        vertices=[]
        for upper in [True,False]:
            for i in range(cols+1):
                x=-2.65+5.30*(cell+i/cols)/9
                bulge=.045*math.sin(math.pi*i/cols)
                for j in range(rows+1):
                    vertices.append(canopy_point(x,j/rows,upper,bulge))
        layer=(cols+1)*(rows+1)
        for k in range(2):
            for i in range(cols):
                for j in range(rows):
                    a=k*layer+i*(rows+1)+j
                    face=(a,a+rows+1,a+rows+2,a+1)
                    target.add([vertices[v] for v in (face if k else tuple(reversed(face)))],[(0,1,2,3)],color,True,1 if k==0 else .84)
        # Dark recessed mouths and closed trailing seams give the wing real thickness.
        for i in range(cols):
            for j in [0,rows]:
                a=i*(rows+1)+j
                face=(a,a+rows+1,a+rows+1+layer,a+layer)
                base.add([vertices[v] for v in face],[(0,1,2,3) if j==0 else (3,2,1,0)],'darkteal' if j==0 else 'cream',False)
        if cell in [0,8]:
            i=0 if cell==0 else cols
            for j in range(rows):
                a=i*(rows+1)+j
                face=(a,a+1,a+1+layer,a+layer)
                base.add([vertices[v] for v in face],[(3,2,1,0) if cell==0 else (0,1,2,3)],'gold',True)
    # Stitched load tapes are modeled once per rib and merged with all hardware.
    for rib in range(10):
        x=-2.65+5.3*rib/9
        points=[canopy_point(x,j/rows,True) for j in range(rows+1)]
        base.tube([(x,y+.009,z) for x,y,z in points],.012 if level<2 else .017,'canvas',4)
        top,bottom=canopy_point(x,0,True),canopy_point(x,0,False)
        base.tube([top,bottom],.018,'cream',4)
    for j in [0,rows]:
        base.tube([canopy_point(-2.65+5.3*i/18,j/rows,True) for i in range(19)],.023,'cream',4)
    # Four risers gather sixteen load lines clear of the head and into the paws.
    for side in [-1,1]:
        for back in [False,True]:
            lower=(side*.245,1.84,.07 if back else -.155)
            join=(side*.34,2.32,.14 if back else -.24)
            base.tube([lower,join],.017,'darkteal',4)
            for span in [.42,1.08,1.75,2.38]:
                attach=canopy_point(side*span,.80 if back else .16,False)
                base.tube([join,attach],.008 if level==0 else .011,'cream',4 if level<2 else 3)
        # Fabric harness and brass release buckles; the controls sit in the paw curl.
        base.tube([(side*.245,1.89,-.155),(side*.25,1.41,-.14),(side*.27,1.08,-.29)],.025,'darkteal',4)
        base.tube([(side*.245,1.84,.07),(side*.27,1.35,.19),(side*.25,1.00,.27)],.024,'darkteal',4)
        base.tube([(side*.21,1.78,-.178),(side*.29,1.78,-.178),(side*.29,1.88,-.178),(side*.21,1.88,-.178),(side*.21,1.78,-.178)],.014,'gold',4)
        if level<2:
            base.box((side*.263,1.33,-.19),(.065,.085,.035),'steel',.009)
    base.tube([(-.27,1.08,-.29),(0,1.05,-.35),(.27,1.08,-.29)],.026,'darkteal',4)
    base.box((0,1.052,-.365),(.105,.08,.036),'gold',.012)
    return [base.finish(),team.finish()]


report={'components':[],'units':'metres','front':'-Z','up':'+Y','textures':0,
        'planeDistances':[0,70,155],'chuteDistances':[0,24,60],
        'propellers':[[-5.05,1.34,-4.91],[5.05,1.34,-4.91]],
        'risers':{'left':[-.245,1.84,-.155],'right':[.245,1.84,-.155]},
        'design':'Original island hopper with hollow jump cabin and nine-cell ram-air canopy'}
for level in range(3):
    report['components'].extend(plane(level)+[propeller(level)]+parachute(level))
(OUT/'blender-report.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.export_scene.gltf(filepath=str(OUT/'aircraft.raw.glb'),export_format='GLB',
    export_animations=False,export_yup=True,export_extras=True,export_vertex_color='NAME',
    export_vertex_color_name='Color',export_cameras=False,export_lights=False)
print('AIRCRAFT_REPORT',json.dumps(report))
