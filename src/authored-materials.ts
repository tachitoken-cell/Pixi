import * as THREE from 'three';

/** Restore the vertex-emission shader used by Benji's source viewers. glTF
 * preserves the strength in extras; its core material has no vertex emission. */
export function configureAuthoredMaterials(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      const strength = material.userData.benjiVertexEmission;
      if (!(material instanceof THREE.MeshStandardMaterial) || !Number.isFinite(strength) || strength <= 0) continue;
      const value = Math.min(strength, 4).toFixed(3);
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor * ${value};`);
      };
      material.customProgramCacheKey = () => `benji-vertex-emission-${value}`;
      material.needsUpdate = true;
    }
  });
}
