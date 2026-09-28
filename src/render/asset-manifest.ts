export interface AssetEntry { path: string; kind: 'texture' | 'hdr' | 'gltf' | 'glb' | 'fbx' | 'buffer' | 'ktx2'; bytes: number; label: string }

// File sizes weight completion events for image loads that have no byte callback.
// The manifest test checks these sizes against the shipped files.
export const ASSET_MANIFEST: readonly AssetEntry[] = [
  { path: 'textures/foliage-atlas.webp', kind: 'texture', bytes: 495674, label: 'Folhas pintadas' },
  { path: 'textures/terrain-color.png', kind: 'texture', bytes: 499277, label: 'Cores da ilha' },
  { path: 'textures/clouds-painted-v4.png', kind: 'texture', bytes: 894096, label: 'Nuvens pintadas' },
  { path: 'textures/island-signs.png', kind: 'texture', bytes: 83386, label: 'Placas da ilha' },
  { path: 'textures/vfx-flipbooks.png', kind: 'texture', bytes: 148876, label: 'Efeitos pintados' },
];
