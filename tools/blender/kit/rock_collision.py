"""Complete collision from the actual rounded stone meshes at every LOD.

Run alone with Blender, or as part of the normal island kit build. No render
asset changes are needed when only this static collision manifest is rebuilt.
"""
import json
import sys
from pathlib import Path


def write_rock_collision(pieces, root):
    import bmesh
    output = {}
    for name, piece in pieces.items():
        rocks = [part for part in piece.parts if part['shape'] == 'rock']
        if not rocks:
            continue
        hulls = []
        for part in rocks:
            points, normals = [], []
            for segments in [3, 2, 1]:
                mesh = bmesh.new()
                vertices = [mesh.verts.new(point) for point in part['vertices']]
                for face in part['faces']:
                    mesh.faces.new([vertices[i] for i in face])
                mesh.normal_update()
                bmesh.ops.bevel(mesh, geom=list(mesh.edges), offset=part['bevel'],
                                segments=segments, affect='EDGES', profile=.5)
                mesh.normal_update()
                points.extend(vertex.co.copy() for vertex in mesh.verts)
                if segments == 2:
                    normals.extend(face.normal.copy().normalized() for face in mesh.faces)
                mesh.free()
            planes = {}
            for normal in normals:
                # A support plane covers the same bevel at every LOD. Using
                # the middle bevel face normals avoids hull triangulation's spurious
                # tiny float32 facets and keeps the runtime face count small. The one-centimetre
                # allowance covers decimation and meshopt quantization.
                distance = max(normal.dot(point) for point in points) + .01
                key = tuple(round(v, 4) for v in normal)
                planes.setdefault(key, tuple(round(v, 8) for v in (*normal, distance)))
            bounds = [[round(operation(point[axis] for point in points), 8) for axis in range(3)]
                      for operation in [min, max]]
            hulls.append(dict(bounds=bounds, planes=sorted(planes.values()), bevel=part['bevel']))
        output[name] = hulls
    path = root / 'src/shared/rock-hulls.json'
    path.write_text(json.dumps(output, indent=2) + '\n')
    print('ROCK_COLLISION', {name: [len(h['planes']) for h in hulls] for name, hulls in output.items()}, flush=True)


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from spec import PIECES, ROOT
    write_rock_collision(PIECES, ROOT)
