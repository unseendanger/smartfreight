import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Grid } from '@react-three/drei';

// Inches -> scene units. Keeps the container a manageable size in the viewport.
const SCALE = 1 / 12;

function ContainerFrame({ container }) {
  const { length, width, height } = container;
  return (
    <group position={[(length * SCALE) / 2, (height * SCALE) / 2, (width * SCALE) / 2]}>
      <mesh>
        <boxGeometry args={[length * SCALE, height * SCALE, width * SCALE]} />
        {/* depthWrite=false: this is just a translucent reference shell around the
            load. Without this, its faces can win the depth test against solid
            item boxes depending on transparent-object draw order, which is what
            was making boxes near the camera intermittently vanish. */}
        <meshBasicMaterial color="#3DBFA8" transparent opacity={0.04} depthWrite={false} />
        <Edges color="#3DBFA8" />
      </mesh>
    </group>
  );
}

function ItemBlock({ placement, highlighted, dimmed }) {
  const { x, y, z, length, width, height, color } = placement;
  const cx = (x + length / 2) * SCALE;
  const cy = (z + height / 2) * SCALE;
  const cz = (y + width / 2) * SCALE;
  const violation = placement.overhang || placement.overHeight || placement.stackViolation;

  // Only "dimmed" boxes (hidden ahead of the current loading step) need
  // alpha blending. Every other box renders fully opaque so the WebGL
  // depth buffer alone decides what's in front — alpha-blended objects are
  // sorted per-object by the renderer, and with dozens of overlapping crates
  // that sort can get it wrong and make boxes nearest the camera disappear
  // until you rotate the view. Opaque geometry doesn't have that problem.
  return (
    <group position={[cx, cy, cz]}>
      <mesh>
        <boxGeometry args={[length * SCALE * 0.97, height * SCALE * 0.97, width * SCALE * 0.97]} />
        <meshStandardMaterial
          color={violation ? '#E86A5C' : color}
          transparent={dimmed}
          opacity={dimmed ? 0.12 : 1}
          depthWrite={!dimmed}
          roughness={0.5}
          metalness={0.1}
          emissive={highlighted ? (violation ? '#E86A5C' : color) : '#000000'}
          emissiveIntensity={highlighted ? 0.35 : 0}
        />
        <Edges color={violation ? '#ffffff' : '#0A0E14'} opacity={dimmed ? 0.15 : 1} transparent={dimmed} />
      </mesh>
    </group>
  );
}

export default function ContainerViewer3D({ instance, container, stepIndex }) {

  const cameraTarget = useMemo(
    () => [(container.length * SCALE) / 2, (container.height * SCALE) / 2, (container.width * SCALE) / 2],
    [container]
  );

  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-ink-950 relative">
      <Canvas camera={{ position: [container.length * SCALE * 1.3, container.height * SCALE * 1.1, container.width * SCALE * 1.8], fov: 45 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[10, 15, 10]} intensity={0.9} />
          <directionalLight position={[-10, 5, -10]} intensity={0.3} />

          <ContainerFrame container={container} />

          {instance.placements.map((p, i) => (
            <ItemBlock key={p.unitId} placement={p} highlighted={i === stepIndex - 1} dimmed={stepIndex !== null && i > stepIndex - 1} />
          ))}

          <Grid
            position={[cameraTarget[0], 0, cameraTarget[2]]}
            args={[container.length * SCALE * 2, container.width * SCALE * 2]}
            cellColor="#202B3D"
            sectionColor="#2E3B52"
            fadeDistance={30}
            infiniteGrid={false}
          />

          <OrbitControls target={cameraTarget} minDistance={2} maxDistance={40} enableDamping dampingFactor={0.08} />
        </Suspense>
      </Canvas>
    </div>
  );
}
