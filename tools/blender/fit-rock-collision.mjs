// Fit source stone faces to the shipped decimated and quantized mesh vertices.
// Decoration remains non-solid; alpha zero is the kit's natural stone marker.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
export async function fitRockCollision(root) {
  const path=`${root}/src/shared/rock-hulls.json`;
  const manifest=JSON.parse(await readFile(path,'utf8'));
  const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(`${root}/public/models/kit/kit.glb`);
  for(const [name,hulls] of Object.entries(manifest)) {
    const points=hulls.map(()=>[]);
    for(let lod=0;lod<3;lod++) {
      const node=document.getRoot().listNodes().find(node=>node.getName()===`${name}_LOD${lod}`),matrix=node.getWorldMatrix();
      for(const primitive of node.getMesh().listPrimitives()) {
        const position=primitive.getAttribute('POSITION'),color=primitive.getAttribute('COLOR_0');
        for(let vertex=0;vertex<position.getCount();vertex++) {
          if(color.getElement(vertex,[])[3]>.5)continue;
          const [x,y,z]=position.getElement(vertex,[]);
          const point=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
          const gaps=hulls.map(hull=>Math.max(...hull.planes.map(([nx,ny,nz,d])=>nx*point[0]+ny*point[1]+nz*point[2]-d)));
          points[gaps.indexOf(Math.min(...gaps))].push(point);
        }
      }
    }
    hulls.forEach((hull,index)=> {
      for(const plane of hull.planes) plane[3]=Number(Math.max(plane[3],...points[index].map(point=>plane[0]*point[0]+plane[1]*point[1]+plane[2]*point[2]+.001)).toFixed(8));
      for(let axis=0;axis<3;axis++) {
        hull.bounds[0][axis]=Number(Math.min(hull.bounds[0][axis],...points[index].map(point=>point[axis]-.011)).toFixed(8));
        hull.bounds[1][axis]=Number(Math.max(hull.bounds[1][axis],...points[index].map(point=>point[axis]+.011)).toFixed(8));
      }
    });
  }
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await fitRockCollision(fileURLToPath(new URL('../../',import.meta.url)));
