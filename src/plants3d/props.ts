import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// CC0 props from Poly Haven (polyhaven.com), textures cut to 512 px.
// Loaded lazily, only once the viewer is close enough to see them.

export type PropId = 'covered_car' | 'concrete_road_barrier_02' | 'Barrel_01' | 'wooden_crate_02' | 'utility_box_02' | 'shrub_03';
export type PropSpot = { id: PropId; x: number; z: number; rot: number; s?: number };

const CAP: Record<PropId, number> = { covered_car: 60, concrete_road_barrier_02: 40, Barrel_01: 160, wooden_crate_02: 90, utility_box_02: 80, shrub_03: 160 };

export async function loadProps(spots: PropSpot[], groundY: (x: number, z: number) => number, parent: THREE.Object3D) {
  const loader = new GLTFLoader();
  const byId = new Map<PropId, PropSpot[]>();
  for (const s of spots) {
    const l = byId.get(s.id) ?? [];
    if (l.length < CAP[s.id]) l.push(s);
    byId.set(s.id, l);
  }
  await Promise.all([...byId].map(async ([id, list]) => {
    const g = await loader.loadAsync(`/props/${id}/${id}.gltf`);
    g.scene.updateMatrixWorld(true);
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4 }[] = [];
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) parts.push({ geo: mesh.geometry, mat: mesh.material as THREE.Material, m: mesh.matrixWorld.clone() });
    });
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      const t = new THREE.Matrix4();
      list.forEach((s, i) => {
        const base = new THREE.Matrix4().compose(
          new THREE.Vector3(s.x, groundY(s.x, s.z), s.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot),
          new THREE.Vector3().setScalar(s.s ?? 1),
        );
        im.setMatrixAt(i, t.multiplyMatrices(base, p.m));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
    }
  }));
}
