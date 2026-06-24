import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useShowStore } from '../store/showStore';
import type { Performer, Prop } from '../lib/types';
import { colors } from '../lib/theme';
import { interpolatePosition, applyEasing } from '../lib/stageHelpers.tsx';

function PerformerMesh({ performer, x, y, stageWidth, stageHeight, isSelected, onPointerDown }: {
  performer: Performer;
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
  isSelected: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cx = x - stageWidth / 2;
  const cz = y - stageHeight / 2;
  const color = new THREE.Color(performer.color);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s * 0.8, hsl.l);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 1.8 + cx * 0.7 + cz * 0.5) * 0.06;
    }
  });

  const mat = { roughness: 0.75, metalness: 0.05 } as const;
  const emissiveFactor = isSelected ? 0.35 : 0.1;
  const emissive = color.clone().multiplyScalar(emissiveFactor);

  return (
    <group ref={groupRef} position={[cx, 0, cz]} onPointerDown={onPointerDown}>
      {/* Left leg */}
      <RoundedBox args={[0.8, 3.2, 0.8]} radius={0.12} smoothness={4} position={[-0.4, 1.6, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>
      {/* Right leg */}
      <RoundedBox args={[0.8, 3.2, 0.8]} radius={0.12} smoothness={4} position={[0.4, 1.6, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>

      {/* Torso */}
      <RoundedBox args={[1.6, 3.0, 0.8]} radius={0.12} smoothness={4} position={[0, 4.7, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>

      {/* Left arm */}
      <RoundedBox args={[0.8, 3.0, 0.8]} radius={0.12} smoothness={4} position={[-1.2, 4.7, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>
      {/* Right arm */}
      <RoundedBox args={[0.8, 3.0, 0.8]} radius={0.12} smoothness={4} position={[1.2, 4.7, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>

      {/* Head */}
      <RoundedBox args={[1.5, 1.5, 1.5]} radius={0.15} smoothness={4} position={[0, 6.95, 0]}>
        <meshStandardMaterial color={color} emissive={emissive} {...mat} />
      </RoundedBox>

      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.8, 32]} />
          <meshBasicMaterial color={color} opacity={0.9} transparent />
        </mesh>
      )}
    </group>
  );
}

function PropMesh({ prop, x, y, stageWidth, stageHeight, isSelected }: {
  prop: Prop;
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
  isSelected: boolean;
}) {
  const size = prop.size || 2;
  const cx = x - stageWidth / 2;
  const cz = y - stageHeight / 2;
  const propColor = useMemo(() => {
    const c = new THREE.Color(prop.color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * 0.01, hsl.l);
    return c;
  }, [prop.color]);

  const PROP_HEIGHT = 7.7;
  const geometry = useMemo(() => {
    switch (prop.shape) {
      case 'circle': return new THREE.CylinderGeometry(size * 0.4, size * 0.4, PROP_HEIGHT, 16);
      case 'triangle': return new THREE.ConeGeometry(size * 0.5, PROP_HEIGHT, 3);
      default: return new THREE.BoxGeometry(size * 0.8, PROP_HEIGHT, size * 0.8);
    }
  }, [prop.shape, size]);

  return (
    <mesh geometry={geometry} position={[cx, PROP_HEIGHT / 2, cz]}>
      <meshStandardMaterial
        color={propColor}
        roughness={0.6}
        metalness={0.1}
        opacity={isSelected ? 1 : 0.85}
        transparent
      />
    </mesh>
  );
}

function StageGrid({ width, height, divisionsX, subdivisionsX, divisionsY, subdivisionsY }: {
  width: number; height: number;
  divisionsX: number; subdivisionsX: number;
  divisionsY: number; subdivisionsY: number;
}) {
  const { minor, major } = useMemo(() => {
    const stepX = width / (divisionsX * subdivisionsX);
    const stepZ = height / (divisionsY * subdivisionsY);
    const majorStepX = width / divisionsX;
    const majorStepZ = height / divisionsY;
    const minorVerts: number[] = [];
    const majorVerts: number[] = [];
    const ox = -width / 2;
    const oz = -height / 2;

    const xCount = divisionsX * subdivisionsX + 1;
    for (let i = 0; i < xCount; i++) {
      const x = ox + i * stepX;
      const isMajor = i === 0 || i === xCount - 1 || Math.abs((i * stepX) % majorStepX) < 0.0001;
      (isMajor ? majorVerts : minorVerts).push(x, 0, oz, x, 0, oz + height);
    }

    const zCount = divisionsY * subdivisionsY + 1;
    for (let i = 0; i < zCount; i++) {
      const z = oz + i * stepZ;
      const isMajor = i === 0 || i === zCount - 1 || Math.abs((i * stepZ) % majorStepZ) < 0.0001;
      (isMajor ? majorVerts : minorVerts).push(ox, 0, z, ox + width, 0, z);
    }

    return { minor: new Float32Array(minorVerts), major: new Float32Array(majorVerts) };
  }, [width, height, divisionsX, subdivisionsX, divisionsY, subdivisionsY]);

  return (
    <group position={[0, 0.01, 0]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[minor, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={colors.textGhost} transparent opacity={0.4} />
      </lineSegments>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[major, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={colors.borderStrong} transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

function StageFloor({ width, height }: { width: number; height: number }) {
  return (
    <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#4a4a4a" roughness={0.85} metalness={0.05} />
    </mesh>
  );
}


interface SceneContentProps {
  animating: boolean;
  animationProgress: number;
  previousFormationId: string | null;
  onDraggingChange: (dragging: boolean) => void;
}

function SceneContent({ animating, animationProgress, previousFormationId, onDraggingChange }: SceneContentProps) {
  const {
    show, performers, props, performerPositions, propPositions, performerPaths,
    activeFormationId, selectedItem, selectedItemIds,
    setSelectedItemIds, movePerformer, pushHistory, captureSnapshot,
  } = useShowStore();
  const stageConfig = show?.stage_config || { width: 60, height: 40, divisionsX: 5, divisionsY: 5, subdivisionsX: 2, subdivisionsY: 2, unit: 'ft' };

  const [draggingId, setDraggingId] = useState<string | null>(null);

  function clampToStage(wx: number, wy: number) {
    return {
      x: Math.max(0, Math.min(stageConfig.width, wx)),
      y: Math.max(0, Math.min(stageConfig.height, wy)),
    };
  }

  function getAnimatedPos(entityId: string, isPerformer: boolean) {
    if (!activeFormationId) return null;
    const positions = isPerformer ? performerPositions : propPositions;
    const currentPos = positions[`${entityId}-${activeFormationId}`];
    if (!currentPos) return null;
    if (animating && previousFormationId) {
      const prevPos = positions[`${entityId}-${previousFormationId}`];
      if (prevPos) {
        let cp: { x: number; y: number } | null = null;
        if (isPerformer) {
          const stored = performerPaths[`${entityId}-${previousFormationId}-${activeFormationId}`];
          if (stored) {
            const mx = (prevPos.x + currentPos.x) / 2;
            const my = (prevPos.y + currentPos.y) / 2;
            cp = { x: mx + stored.cpDx, y: my + stored.cpDy };
          }
        }
        return interpolatePosition(prevPos, currentPos, animationProgress, cp);
      }
    }
    return { x: currentPos.x, y: currentPos.y };
  }

  function handlePerformerPointerDown(e: ThreeEvent<PointerEvent>, performer: Performer) {
    e.stopPropagation();
    if (animating) return;
    captureSnapshot();
    setSelectedItemIds([performer.id]);
    setDraggingId(performer.id);
    onDraggingChange(true);
  }

  function handleDragMove(e: ThreeEvent<PointerEvent>) {
    if (!draggingId || !activeFormationId) return;
    e.stopPropagation();
    const wx = e.point.x + stageConfig.width / 2;
    const wy = e.point.z + stageConfig.height / 2;
    const clamped = clampToStage(wx, wy);
    movePerformer(draggingId, activeFormationId, clamped.x, clamped.y);
  }

  function handleDragEnd(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (draggingId && activeFormationId) {
      const state = useShowStore.getState();
      const perf = state.performerPositions[`${draggingId}-${activeFormationId}`];
      if (perf) {
        (window as any).__spotlineBroadcastPositions?.([{ type: 'performer', id: draggingId, formationId: activeFormationId, x: perf.x, y: perf.y }]);
      }
      pushHistory();
    }
    setDraggingId(null);
    onDraggingChange(false);
  }

  function handleBackgroundClick(_e: ThreeEvent<MouseEvent>) {
    setSelectedItemIds([]);
  }

  return (
    <>
      <color attach="background" args={[colors.bg]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[stageConfig.width * 0.5, stageConfig.height, stageConfig.width * 0.3]}
        intensity={1.2}
      />
      <pointLight position={[-stageConfig.width * 0.3, stageConfig.height * 0.5, -stageConfig.height * 0.3]} intensity={0.4} color={colors.accent} />
      <pointLight position={[stageConfig.width * 0.3, stageConfig.height * 0.5, stageConfig.height * 0.3]} intensity={0.4} color="#3b82f6" />

      <StageFloor width={stageConfig.width} height={stageConfig.height} />

      {/* Invisible background plane for click-to-deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.04, 0]}
        onClick={handleBackgroundClick}
      >
        <planeGeometry args={[stageConfig.width * 4, stageConfig.height * 4]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Invisible drag capture plane — active while dragging */}
      {draggingId && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.1, 0]}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        >
          <planeGeometry args={[stageConfig.width * 4, stageConfig.height * 4]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      <StageGrid
        width={stageConfig.width}
        height={stageConfig.height}
        divisionsX={stageConfig.divisionsX}
        subdivisionsX={stageConfig.subdivisionsX}
        divisionsY={stageConfig.divisionsY}
        subdivisionsY={stageConfig.subdivisionsY}
      />

      {props.map(prop => {
        const pos = getAnimatedPos(prop.id, false);
        if (!pos) return null;
        return (
          <PropMesh
            key={prop.id}
            prop={prop}
            x={pos.x}
            y={pos.y}
            stageWidth={stageConfig.width}
            stageHeight={stageConfig.height}
            isSelected={selectedItem?.type === 'prop' && selectedItem.id === prop.id}
          />
        );
      })}

      {performers.map(performer => {
        const pos = getAnimatedPos(performer.id, true);
        if (!pos) return null;
        return (
          <PerformerMesh
            key={performer.id}
            performer={performer}
            x={pos.x}
            y={pos.y}
            stageWidth={stageConfig.width}
            stageHeight={stageConfig.height}
            isSelected={selectedItemIds.includes(performer.id)}
            onPointerDown={(e) => handlePerformerPointerDown(e, performer)}
          />
        );
      })}

      <OrbitControls
        enabled={!draggingId}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxPolarAngle={Math.PI / 2}
        minDistance={5}
        maxDistance={200}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function Stage3D({ width, height }: {
  width: number;
  height: number;
}) {
  const { show, formations, activeFormationId, isAnimating, rawAnimProgress, animFromFormationId } = useShowStore();
  const stageConfig = show?.stage_config || { width: 60, height: 40, divisionsX: 5, divisionsY: 5, subdivisionsX: 2, subdivisionsY: 2, unit: 'ft' };
  const cameraZ = Math.max(stageConfig.width, stageConfig.height) * 0.8;
  const [isDragging, setIsDragging] = useState(false);

  const activeFormation = formations.find(f => f.id === activeFormationId);
  const animationProgress = applyEasing(rawAnimProgress, activeFormation?.transition_easing);

  return (
    <div style={{ width, height, background: colors.bg, cursor: isDragging ? 'grabbing' : 'default' }}>
      <Canvas
        camera={{
          position: [0, cameraZ * 0.6, cameraZ],
          fov: 45,
          near: 0.1,
          far: 1000,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <SceneContent
          animating={isAnimating}
          animationProgress={animationProgress}
          previousFormationId={animFromFormationId}
          onDraggingChange={setIsDragging}
        />
      </Canvas>
    </div>
  );
}
