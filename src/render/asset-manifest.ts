export interface AssetEntry { path: string; kind: 'texture' | 'hdr' | 'gltf' | 'glb' | 'fbx' | 'buffer' | 'ktx2'; bytes: number; label: string }

// File sizes weight completion events for image loads that have no byte callback.
// The manifest test checks these sizes against the shipped files.
export const ASSET_MANIFEST: readonly AssetEntry[] = [
  { path: 'textures/terrain-color.png', kind: 'texture', bytes: 67309, label: 'Cores da ilha' },
  { path: 'textures/island-signs.png', kind: 'texture', bytes: 64223, label: 'Placas da ilha' },
  { path: 'textures/vfx-flipbooks.png', kind: 'texture', bytes: 371784, label: 'Efeitos pintados' },
  { path: 'models/service-pistol/service_pistol_1k.gltf', kind: 'gltf', bytes: 17614, label: 'Pistola' },
  { path: 'models/service-pistol/service_pistol.bin', kind: 'buffer', bytes: 1052048, label: 'Pistola' },
  { path: 'models/service-pistol/textures/service_pistol_diff_1k.jpg', kind: 'texture', bytes: 718216, label: 'Pistola' },
  { path: 'models/service-pistol/textures/service_pistol_arm_1k.jpg', kind: 'texture', bytes: 921086, label: 'Pistola' },
  { path: 'models/service-pistol/textures/service_pistol_nor_gl_1k.jpg', kind: 'texture', bytes: 588720, label: 'Pistola' },
  { path: 'models/m700/m700.fbx', kind: 'fbx', bytes: 638732, label: 'Rifle' },
  { path: 'models/m700/color.webp', kind: 'texture', bytes: 130470, label: 'Rifle' },
  { path: 'models/m700/normal.webp', kind: 'texture', bytes: 117862, label: 'Rifle' },
  { path: 'models/m700/metalness.webp', kind: 'texture', bytes: 59682, label: 'Rifle' },
  { path: 'models/m700/ao.webp', kind: 'texture', bytes: 73602, label: 'Rifle' },
  { path: 'models/m700/roughness.webp', kind: 'texture', bytes: 110016, label: 'Rifle' },
];
