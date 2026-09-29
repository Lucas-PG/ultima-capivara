import foliageMetrics from '../../tools/art/foliage-atlas.metrics.json';
import groundMetrics from '../../tools/art/ground-atlas.metrics.json';

export interface AssetEntry { path: string; kind: 'texture' | 'hdr' | 'gltf' | 'glb' | 'fbx' | 'buffer' | 'ktx2'; bytes: number; label: string }

// File sizes weight completion events for image loads that have no byte callback.
// The manifest test checks these sizes against the shipped files.
export const ASSET_MANIFEST: readonly AssetEntry[] = [
  // The atlas builder records each file's exact size, so regenerating the art never desyncs the manifest.
  { path: 'textures/foliage-atlas.webp', kind: 'texture', bytes: foliageMetrics.bytes, label: 'Folhas pintadas' },
  { path: 'textures/ground-atlas.webp', kind: 'texture', bytes: groundMetrics.bytes, label: 'Gramas e flores' },
  { path: 'textures/terrain-color.png', kind: 'texture', bytes: 509690, label: 'Cores da ilha' },
  { path: 'textures/clouds-painted-v4.png', kind: 'texture', bytes: 894096, label: 'Nuvens pintadas' },
  { path: 'textures/island-signs.png', kind: 'texture', bytes: 88682, label: 'Placas da ilha' },
  { path: 'textures/vfx-flipbooks.png', kind: 'texture', bytes: 148876, label: 'Efeitos pintados' },
];
