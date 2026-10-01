import * as THREE from 'three';

// The shadow pass draws every caster with one shared depth material, so each switch between kinds of
// caster (skinned capybaras, instanced or batched props, textured or plain meshes) rebuilt that
// material's program parameters: 26 to 32 times a frame in a crowd, most of the garbage of a royale
// landing. One depth material per kind keeps every program stable. Casters with their own depth
// material (the wind-blown vegetation) keep it.
const variants = new Map<string, THREE.MeshDepthMaterial>();

function kind(mesh: THREE.Mesh) {
  const geometry = mesh.geometry, material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
  return [(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 's' : '', (mesh as THREE.InstancedMesh).isInstancedMesh ? 'i' : '', (mesh as THREE.BatchedMesh).isBatchedMesh ? 'b' : '',
    geometry.morphAttributes.position?.length ?? 0, geometry.morphAttributes.normal?.length ?? 0,
    material?.map ? 'm' : '', (material?.alphaTest ?? 0) > 0 || material?.alphaToCoverage ? 'a' : '', material?.alphaMap ? 'am' : ''].join(':');
}

/** Gives every shadow caster under `root` the depth material of its kind. */
export function assignShadowDepth(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || (mesh.customDepthMaterial && !mesh.customDepthMaterial.userData.shadowKind)) return;
    const key = kind(mesh);
    let material = variants.get(key);
    if (!material) { material = new THREE.MeshDepthMaterial(); material.userData.shadowKind = key; variants.set(key, material); }
    mesh.customDepthMaterial = material;
  });
}
