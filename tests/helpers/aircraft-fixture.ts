import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

/** The texture-free production model parses in Node without browser image mocks. */
export async function loadAircraftFixture() {
  const bytes = await readFile('public/models/aircraft/aircraft.glb');
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
