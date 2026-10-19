import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
for (const directory of ['avatar', 'pet', 'previews']) mkdirSync(`${assets}/${directory}`, { recursive: true });

function encodeGlb(json, binary) {
  const text = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(paddedJson);
  const paddedBinary = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(paddedBinary);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + paddedBinary.length, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([header, paddedJson, binHeader, paddedBinary]);
  assert.equal(result.readUInt32LE(8), result.length);
  return result;
}

const source = readFileSync(new URL('../../구현소스/dorobus-character-pet-sample/avatar/robot.glb', import.meta.url));
assert.equal(source.readUInt32LE(0), 0x46546c67);
const jsonLength = source.readUInt32LE(12);
const robot = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
// The supplied scene contains three robots; retain the first robot and its animation tracks.
robot.scenes[0].nodes = robot.scenes[0].nodes.slice(0, 4);
robot.animations = robot.animations.slice(0, 3);
writeFileSync(`${assets}/avatar/robot.glb`, encodeGlb(robot, source.subarray(28 + jsonLength)));

const positions = [];
const normals = [];
const indices = [];
const faces = [
  [[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
  [[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
  [[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
  [[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
  [[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
  [[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
];
for (const [normal, vertices] of faces) {
  const start = positions.length / 3;
  for (const vertex of vertices) { positions.push(...vertex.map(v => v / 2)); normals.push(...normal); }
  indices.push(start, start+1, start+2, start, start+2, start+3);
}
const pos = Buffer.from(new Float32Array(positions).buffer);
const norm = Buffer.from(new Float32Array(normals).buffer);
const index = Buffer.from(new Uint16Array(indices).buffer);
const binary = Buffer.concat([pos, norm, index]);
const materials = [[.73,.57,.39,1],[.15,.19,.23,1],[.92,.7,.68,1],[.54,.83,.78,1]];
function simpleModel(parts, filename) {
  const json = {
    asset: { version: '2.0', generator: 'Doroom simple fallback' }, scene: 0,
    scenes: [{ nodes: parts.map((_, i) => i) }],
    nodes: parts.map(([name, translation, scale, material]) => ({ name, translation, scale, mesh: material })),
    meshes: materials.map((_, material) => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }] })),
    materials: materials.map(color => ({ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 1 } })),
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer:0, byteOffset:0, byteLength:pos.length, target:34962 },{ buffer:0, byteOffset:pos.length, byteLength:norm.length, target:34962 },{ buffer:0, byteOffset:pos.length+norm.length, byteLength:index.length, target:34963 }],
    accessors: [{ bufferView:0, componentType:5126, count:24, type:'VEC3', min:[-.5,-.5,-.5], max:[.5,.5,.5] },{ bufferView:1, componentType:5126, count:24, type:'VEC3' },{ bufferView:2, componentType:5123, count:36, type:'SCALAR' }],
  };
  writeFileSync(`${assets}/${filename}`, encodeGlb(json, binary));
}
simpleModel([
  ['body',[0,.5,0],[.7,.6,1],0],['head',[0,1,.38],[.65,.55,.6],0],
  ['ear-l',[-.23,1.37,.4],[.17,.25,.2],0],['ear-r',[.23,1.37,.4],[.17,.25,.2],0],
  ['eye-l',[-.16,1.06,.69],[.075,.1,.025],1],['eye-r',[.16,1.06,.69],[.075,.1,.025],1],
  ['nose',[0,.94,.7],[.08,.07,.035],2],['tail',[0,.65,-.65],[.15,.2,.6],0],
  ...[-.23,.23].flatMap(x=>[-.32,.32].map(z=>['leg',[x,.15,z],[.18,.3,.18],0])),
], 'pet/simple-cat.glb');
simpleModel([
  ['body',[0,.85,0],[.7,.7,.4],3],['head',[0,1.5,0],[.8,.55,.5],3],
  ['eye-l',[-.18,1.55,.26],[.12,.13,.025],1],['eye-r',[.18,1.55,.26],[.12,.13,.025],1],
  ['arm-l',[-.5,.85,0],[.2,.7,.25],3],['arm-r',[.5,.85,0],[.2,.7,.25],3],
  ['leg-l',[-.2,.25,0],[.25,.5,.3],1],['leg-r',[.2,.25,0],[.25,.5,.3],1],
  ['antenna',[0,1.9,0],[.06,.3,.06],3],
], 'avatar/simple-robot.glb');
console.log('Prepared one supplied robot, fallback robot, and fallback cat (source cat texture is missing).');
