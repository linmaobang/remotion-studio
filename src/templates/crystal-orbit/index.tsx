import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, Stage } from '../shared';

export const schema = z.object({
  title: z.string().max(24).describe('场景标题'),
  color: zColor().describe('晶体颜色'),
  background: zColor().describe('背景颜色'),
  speed: z.number().min(0.1).max(3).describe('旋转速度'),
}).describe('晶体轨道三维场景');

export const CrystalOrbit = ({ title, color, background, speed }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const angle = frame / fps * speed;
  return (
    <Stage background={background}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 7], fov: 45 }} style={{ position: 'absolute', inset: 0 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 5, 6]} intensity={3} />
        <pointLight position={[-4, -2, 3]} color={color} intensity={30} />
        <group position={[0.7, 0, 0]} rotation={[angle * 0.3, angle * 0.6, 0.15]}>
          <mesh rotation={[angle * 0.4, angle * 0.2, 0]}>
            <icosahedronGeometry args={[1.15, 0]} />
            <meshStandardMaterial color={color} roughness={0.25} metalness={0.65} flatShading />
          </mesh>
          {[0, 1, 2].map((i) => <group key={i} rotation={[i * Math.PI / 3, i * Math.PI / 4, 0]}>
            <mesh>
              <torusGeometry args={[1.8 + i * 0.2, 0.018, 8, 80]} />
              <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
            </mesh>
            <mesh position={[Math.cos(angle + i) * (1.8 + i * 0.2), Math.sin(angle + i) * (1.8 + i * 0.2), 0]}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.6} />
            </mesh>
          </group>)}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: '7%', top: '12%', pointerEvents: 'none' }}>
        <div style={{ color, fontSize: width * 0.016, letterSpacing: 6 }}>形体观察 / 三维实验</div>
        <h1 style={{ fontSize: width * 0.042, marginTop: 24 }}>{title}</h1>
      </div>
    </Stage>
  );
};

export default {
  meta: { id: 'crystal-orbit', name: '晶体公转', category: '3D 场景', tags: ['三维', '晶体', '轨道'], prompt: '用原创低多边形晶体、三条金属轨道和小球构成三维场景，晶体与小球随帧旋转，左上角展示中文标题。', description: 'ThreeCanvas 实时生成几何体，无需模型或贴图。' },
  component: CrystalOrbit,
  schema,
  defaultProps: { title: '换个角度看世界', color: '#79c8ff', background: '#101c2a', speed: 1 },
  defaultConfig,
} satisfies TemplateDef;
