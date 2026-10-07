import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { DEPTH_BOUNDS, sampleGroundHeight } from "./world";

/** Art-direction controls for the isolated B lab, not the production ocean. */
export const WATER_B = {
  deepColor: new Color3(.045, .285, .45),
  shallowColor: new Color3(.11, .57, .53),
  skyZenithColor: new Color3(.39, .65, .79),
  foamColor: new Color3(.78, .85, .80),
  sunDirection: new Vector3(-.45, .78, .4).normalize(),
  normalStrength: .34,
  reflectionStrength: .82,
  glintStrength: .20,
  foamStrength: .35,
};
export interface LabShipContact {
  x: number;
  z: number;
  /** Babylon Y rotation in radians; bow points along local +z. */
  heading: number;
  halfLength: number;
  halfBeam: number;
}

// Audited J-class waterline at local y=0: (z / 54.35, half-width in metres).
// The square-ish stern is retained; this must not be replaced by an ellipse.
const SHIP_CONTACT_PROFILE = [
  [-1, 1.227631], [-.94, 2.662609], [-.82, 3.71127], [-.64, 4.298396],
  [-.4, 4.653584], [-.12, 4.741503], [.16, 4.596322], [.4, 4.183525],
  [.599843, 3.339704], [.777819, 2.229825], [.902044, 1.115475],
  [.956877, .441188], [.983441, .078919], [.985027, 0],
] as const;
const SHIP_PROFILE_HALF_BEAM = 4.741503;


const DEPTH_SIZE = 512;
const DEPTH_MAX = 60;
const GRID_DIVISIONS = 64;
const TAU = Math.PI * 2;
const WAVES = [
  { x: .94, z: .342, wavelength: 180, amplitude: .17, speed: .50 },
  { x: .90, z: .436, wavelength: 117, amplitude: .09, speed: .67 },
  { x: .68, z: .733, wavelength: 285, amplitude: .04, speed: .37 },
] as const;

function heightAt(x: number, z: number, seconds: number): number {
  let height = 0;
  for (const wave of WAVES) {
    height += wave.amplitude * Math.sin(
      (x * wave.x + z * wave.z) * TAU / wave.wavelength + seconds * wave.speed,
    );
  }
  return height;
}

function createGrid(): VertexData {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const axis = (i: number) => {
    const signed = i / GRID_DIVISIONS * 2 - 1;
    const a = Math.abs(signed);
    return Math.sign(signed) * (a <= .75 ? a / .75 * 750
      : 750 + Math.pow((a - .75) / .25, 2.2) * 15_250);
  };
  for (let z = 0; z <= GRID_DIVISIONS; z++) {
    for (let x = 0; x <= GRID_DIVISIONS; x++) {
      positions.push(axis(x), 0, axis(z));
      normals.push(0, 1, 0);
      if (x < GRID_DIVISIONS && z < GRID_DIVISIONS) {
        const a = z * (GRID_DIVISIONS + 1) + x, b = a + GRID_DIVISIONS + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  return data;
}

function createDepthTexture(scene: Scene): RawTexture {
  const pixels = new Uint8Array(DEPTH_SIZE * DEPTH_SIZE * 4);
  // Sample texel centres: this matches the fragment shader's world-to-UV mapping.
  // No terrain evaluation is done per frame or per fragment.
  for (let z = 0; z < DEPTH_SIZE; z++) {
    for (let x = 0; x < DEPTH_SIZE; x++) {
      const worldX = DEPTH_BOUNDS.minX + (x + .5) / DEPTH_SIZE * DEPTH_BOUNDS.size;
      const worldZ = DEPTH_BOUNDS.minZ + (z + .5) / DEPTH_SIZE * DEPTH_BOUNDS.size;
      const depth = Math.max(0, Math.min(DEPTH_MAX, -sampleGroundHeight(worldX, worldZ)));
      const offset = (z * DEPTH_SIZE + x) * 4;
      pixels[offset] = Math.round(depth / DEPTH_MAX * 255);
      pixels[offset + 1] = pixels[offset + 2] = pixels[offset];
      pixels[offset + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(pixels, DEPTH_SIZE, DEPTH_SIZE, scene,
    false, false, Texture.BILINEAR_SAMPLINGMODE);
  texture.name = "lab-b-static-terrain-depth";
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

function createRipplePixels(size: number): Uint8Array {
  // The dominant spectrum has a clear travel direction, with elongated,
  // domain-warped crests rather than ruler-straight sine bands. High frequencies
  // are slope-budgeted: small height alone does not mean a small normal slope.
  const noise = (nx: number, nz: number, seed: number) => {
    const gradients = Array.from({ length: nx * nz }, (_, i) => {
      let hash = Math.imul(i + seed * 73, 1_597_334_677);
      hash ^= hash >>> 16;
      hash = Math.imul(hash, 2_246_822_507);
      const angle = (hash >>> 0) / 4_294_967_296 * TAU;
      return [Math.cos(angle), Math.sin(angle)] as const;
    });
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const at = (x: number, z: number, dx: number, dz: number) => {
      const g = gradients[((z % nz + nz) % nz) * nx + (x % nx + nx) % nx]!;
      return g[0] * dx + g[1] * dz;
    };
    return (u: number, v: number) => {
      const x = u * nx, z = v * nz;
      const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
      const tx = fade(fx), tz = fade(fz);
      const a = at(ix, iz, fx, fz), b = at(ix + 1, iz, fx - 1, fz);
      const c = at(ix, iz + 1, fx, fz - 1), d = at(ix + 1, iz + 1, fx - 1, fz - 1);
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
  };
  const warpX = noise(3, 4, 13), warpZ = noise(4, 3, 29);
  const broad = noise(5, 7, 41), middle = noise(11, 13, 67), fine = noise(23, 29, 103);
  const heights = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = z / size;
      const wu = u + warpX(u, v) * .15, wv = v + warpZ(u, v) * .12;
      heights[z * size + x] = broad(wu, wv) * .80
        + middle(wu, wv) * .17 + fine(wu, wv) * .03;
    }
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dx = (heights[z * size + (x + 1) % size]!
        - heights[z * size + (x + size - 1) % size]!) * 3;
      const dz = (heights[((z + 1) % size) * size + x]!
        - heights[((z + size - 1) % size) * size + x]!) * 3;
      const length = Math.sqrt(1 + dx * dx + dz * dz), offset = (z * size + x) * 4;
      pixels[offset] = Math.round((.5 + dx / length * .5) * 255);
      pixels[offset + 1] = Math.round((.5 + dz / length * .5) * 255);
      pixels[offset + 2] = Math.round(Math.max(0,
        Math.min(1, .5 + heights[z * size + x]! * .95)) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function createNormalTexture(scene: Scene): RawTexture {
  const size = 128;
  const texture = RawTexture.CreateRGBATexture(createRipplePixels(size), size, size, scene,
    true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = "lab-b-domain-warped-ripple-normal";
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 2;
  return texture;
}

// Generate the GPU displacement from the same constants as CPU heightAt.
const vertexWaves = WAVES.map((wave, index) => {
  const frequency = (TAU / wave.wavelength).toFixed(12);
  const amplitude = wave.amplitude.toFixed(12);
  const direction = "vec2(" + wave.x.toFixed(12) + ", " + wave.z.toFixed(12) + ")";
  const phase = "phase" + index;
  return [
    "  float " + phase + " = dot(p.xz, " + direction + ") * " + frequency
      + " + time * " + wave.speed.toFixed(12) + ";",
    "  p.y += " + amplitude + " * sin(" + phase + ");",
    "  slope += " + amplitude + " * " + frequency + " * cos(" + phase + ") * " + direction + ";",
  ].join("\n");
}).join("\n");


const vertexSource = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float time;
varying vec3 vWorld;
varying vec2 vWaveSlope;
void main() {
  vec3 p = position;
  vec2 slope = vec2(0.0);
${vertexWaves}
  vWaveSlope = slope;
  vWorld = (world * vec4(p, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}
`;

// Unrolled constants keep the experimental silhouette exact in WebGL 1/2,
// without a profile texture, dynamic array indexing or another draw.
const contactProfileGlsl = (() => {
  const number = (value: number) => value.toFixed(12);
  const point = (index: number) => {
    const station = SHIP_CONTACT_PROFILE[index]!;
    return "vec2(" + number(station[1] / SHIP_PROFILE_HALF_BEAM) + ", "
      + number(station[0]) + ") * size.yx";
  };
  const widths = SHIP_CONTACT_PROFILE.slice(1).map((station, i) => {
    const previous = SHIP_CONTACT_PROFILE[i]!;
    return "  if (q <= " + number(station[0]) + ") return mix("
      + number(previous[1] / SHIP_PROFILE_HALF_BEAM) + ", "
      + number(station[1] / SHIP_PROFILE_HALF_BEAM) + ", (q - "
      + number(previous[0]) + ") / " + number(station[0] - previous[0]) + ") * size.y;";
  }).join("\n");
  const distances = SHIP_CONTACT_PROFILE.slice(1).map((_, i) =>
    "  d2 = min(d2, contactSegmentDistanceSq(p, " + point(i) + ", " + point(i + 1) + "));"
  ).join("\n");
  return [
    "float contactSegmentDistanceSq(vec2 p, vec2 a, vec2 b) {",
    "  vec2 edge = b - a;",
    "  vec2 delta = p - (a + edge * clamp(dot(p - a, edge) / max(dot(edge, edge), .000001), 0.0, 1.0));",
    "  return dot(delta, delta);",
    "}",
    "float contactHalfWidth(float z, vec2 size) {",
    "  float q = z / size.x;",
    "  if (q < -1.0 || q > .985027) return -1.0;",
    widths,
    "  return 0.0;",
    "}",
    "float contactDistance(vec2 p, vec2 size) {",
    "  float d2 = contactSegmentDistanceSq(p, vec2(0.0, -size.x), " + point(0) + ");",
    distances,
    "  return sqrt(d2);",
    "}",
  ].join("\n");
})();


const fragmentSource = `
precision highp float;
varying vec3 vWorld;
varying vec2 vWaveSlope;
uniform sampler2D depthSampler;
uniform sampler2D rippleSampler;
uniform vec3 eyePosition;
uniform vec3 sunDirection;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 skyZenithColor;
uniform vec3 fogColor;
uniform vec3 foamColor;
uniform vec3 depthBounds;
uniform vec4 fogInfo;
uniform vec4 controls;
uniform vec4 shipPose;
uniform vec4 shipSize;
uniform float time;

${contactProfileGlsl}

void main() {
  vec3 toEye = eyePosition - vWorld;
  float distanceToEye = length(toEye);
  vec3 viewDir = toEye / max(distanceToEye, .01);
  vec2 mapUV = (vWorld.xz - depthBounds.xy) / depthBounds.z;
  float inBounds = step(0.0, mapUV.x) * step(mapUV.x, 1.0)
    * step(0.0, mapUV.y) * step(mapUV.y, 1.0);
  float depth = mix(60.0, texture2D(depthSampler, mapUV).r * 60.0, inBounds);
  // Broken mid-scale crests preserve calm patches. Wind ripples are weaker,
  // while both interpolated geometry normals and texture normals fade at distance.
  vec2 uv1 = vec2(.94 * vWorld.x + .342 * vWorld.z, -.342 * vWorld.x + .94 * vWorld.z) / 105.0;
  vec2 uv2 = vec2(.682 * vWorld.x + .731 * vWorld.z, -.731 * vWorld.x + .682 * vWorld.z) / 41.0;
  vec4 n1 = texture2D(rippleSampler, uv1 + vec2(time * .0042, time * .0006));
  vec4 n2 = texture2D(rippleSampler, uv2 + vec2(time * .007, -time * .0008));
  float detailFade = 1.0 - smoothstep(350.0, 1900.0, distanceToEye);
  float windFade = 1.0 - smoothstep(120.0, 800.0, distanceToEye);
  vec2 slope1 = mat2(.94, .342, -.342, .94) * (n1.rg * 2.0 - 1.0);
  vec2 slope2 = mat2(.682, .731, -.731, .682) * (n2.rg * 2.0 - 1.0);
  vec2 surfaceSlope = (slope1 * .76 * detailFade + slope2 * .24 * windFade) * controls.x;
  vec3 normal = normalize(vec3(-vWaveSlope.x * detailFade + surfaceSlope.x, 1.0,
    -vWaveSlope.y * detailFade + surfaceSlope.y));

  float shallow = exp(-depth * .125);
  vec3 water = mix(deepColor, shallowColor, shallow);
  // Very low contrast variation, not bright foam/noise across open water.
  water *= 1.0 + ((n1.b - .5) * .12 * detailFade + (n2.b - .5) * .025 * windFade);
  float nDotV = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnel = .02 + .98 * pow(1.0 - nDotV, 5.0);
  vec3 reflected = reflect(-viewDir, normal);
  vec3 sky = mix(fogColor, skyZenithColor, pow(clamp(reflected.y, 0.0, 1.0), .65));
  vec3 color = mix(water, sky, clamp(controls.y * fresnel, 0.0, 1.0));

  vec3 halfDirection = normalize(viewDir + sunDirection);
  float highlight = pow(max(dot(normal, halfDirection), 0.0), 120.0);
  color += vec3(1.0, .95, .81) * controls.z * highlight;

  // Foam is confined to shallow coastal water and broken by two existing samples.
  // Pulses travel along the depth contour; there is no all-ocean white-noise layer.
  float shoreBand = (1.0 - smoothstep(.7, 3.2, depth)) * smoothstep(.02, .40, depth);
  float edgeNoise = n1.b * .64 + n2.b * .36;
  float broken = smoothstep(.44, .63, edgeNoise);
  float pulse = .66 + .34 * sin(depth * 3.0 - time * .9 + n1.b * 3.0);
  float foam = shoreBand * broken * pulse * controls.w * detailFade;
  color = mix(color, foamColor, foam);

  // A weak waterline contact cue, not a projected ship shadow. The exact
  // measured half-profile confines it to the exterior of the real hull.
  if (shipSize.z > .5) {
    vec2 delta = vWorld.xz - shipPose.xy;
    vec2 local = vec2(delta.x * shipPose.z - delta.y * shipPose.w,
      delta.x * shipPose.w + delta.y * shipPose.z);
    vec2 contactPoint = vec2(abs(local.x), local.y);
    if (contactPoint.x < shipSize.y + 1.7
      && local.y > -shipSize.x - 1.7 && local.y < shipSize.x * .985027 + 1.7) {
      float halfWidth = contactHalfWidth(local.y, shipSize.xy);
      if (halfWidth < 0.0 || contactPoint.x >= halfWidth) {
        float gap = contactDistance(contactPoint, shipSize.xy);
        float absorption = (1.0 - smoothstep(.04, 1.60, gap))
          * .12 * (.60 + .40 * n1.b);
        color *= 1.0 - absorption;
        float lip = smoothstep(.03, .13, gap) * (1.0 - smoothstep(.22, .43, gap));
        float fragments = smoothstep(.38, .58, n1.b * .3 + n2.b * .7);
        float lapping = .65 + .35 * sin(time * .65 + n1.b * 6.283185);
        color = mix(color, foamColor, lip * fragments * lapping * .10);
      }
    }
  }


  float fog = 0.0;
  if (fogInfo.x > 2.5) {
    fog = clamp((distanceToEye - fogInfo.y) / max(1.0, fogInfo.z - fogInfo.y), 0.0, 1.0);
  } else if (fogInfo.x > 1.5) {
    float opticalDistance = distanceToEye * fogInfo.w;
    fog = 1.0 - exp(-opticalDistance * opticalDistance);
  } else if (fogInfo.x > .5) {
    fog = 1.0 - exp(-distanceToEye * fogInfo.w);
  }
  color = mix(color, fogColor, fog);
  // The lab has no image-processing post effect; these art-directed values are
  // display-space colors, coordinated with the un-tonemapped StandardMaterials.
  gl_FragColor = vec4(color, 1.0);
}
`;

/** One opaque draw, two small local textures, no render targets or screen depth. */
export function createLabWater(scene: Scene): {
  mesh: Mesh;
  update(seconds: number, shipContact?: LabShipContact): void;
  heightAt(x: number, z: number, seconds: number): number;
  dispose(): void;
} {
  const depthTexture = createDepthTexture(scene);
  const normalTexture = createNormalTexture(scene);
  const material = new ShaderMaterial("lab-b-water", scene,
    { vertexSource, fragmentSource }, {
      attributes: ["position"],
      uniforms: ["world", "worldViewProjection", "time", "eyePosition", "sunDirection",
        "deepColor", "shallowColor", "skyZenithColor", "fogColor", "foamColor",
        "depthBounds", "fogInfo", "controls", "shipPose", "shipSize"],
      samplers: ["depthSampler", "rippleSampler"],
      needAlphaBlending: false,
      needAlphaTesting: false,
    });
  material.backFaceCulling = false;
  material.setTexture("depthSampler", depthTexture);
  material.setTexture("rippleSampler", normalTexture);
  material.setVector3("depthBounds",
    new Vector3(DEPTH_BOUNDS.minX, DEPTH_BOUNDS.minZ, DEPTH_BOUNDS.size));
  const mesh = new Mesh("lab-b-ocean", scene);
  createGrid().applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  // vec4 uniforms require uniform4f, not setFloats/uniform1fv. Keep typed objects
  // alive across frames: the effect cache compares their components on bind.
  const fogUniform = new Vector4();
  const controlsUniform = new Vector4();
  const shipPoseUniform = new Vector4(0, 0, 1, 0);
  const shipSizeUniform = new Vector4(1, 1, 0, 0);
  const fallbackEye = Vector3.Zero();
  const update = (seconds: number, shipContact?: LabShipContact) => {
    material.setFloat("time", seconds);
    material.setVector3("eyePosition", scene.activeCamera?.globalPosition ?? fallbackEye);
    material.setVector3("sunDirection", WATER_B.sunDirection);
    material.setColor3("deepColor", WATER_B.deepColor);
    material.setColor3("shallowColor", WATER_B.shallowColor);
    material.setColor3("skyZenithColor", WATER_B.skyZenithColor);
    material.setColor3("foamColor", WATER_B.foamColor);
    material.setColor3("fogColor", scene.fogColor);
    fogUniform.set(scene.fogEnabled ? scene.fogMode : 0,
      scene.fogStart, scene.fogEnd, scene.fogDensity);
    controlsUniform.set(WATER_B.normalStrength, WATER_B.reflectionStrength,
      WATER_B.glintStrength, WATER_B.foamStrength);
    material.setVector4("fogInfo", fogUniform);
    material.setVector4("controls", controlsUniform);
    const active = shipContact !== undefined
      && Number.isFinite(shipContact.x) && Number.isFinite(shipContact.z)
      && Number.isFinite(shipContact.heading) && Number.isFinite(shipContact.halfLength)
      && Number.isFinite(shipContact.halfBeam)
      && shipContact.halfLength > 0 && shipContact.halfBeam > 0;
    if (active) {
      shipPoseUniform.set(shipContact.x, shipContact.z,
        Math.cos(shipContact.heading), Math.sin(shipContact.heading));
      shipSizeUniform.set(shipContact.halfLength, shipContact.halfBeam, 1, 0);
    } else {
      shipPoseUniform.set(0, 0, 1, 0);
      shipSizeUniform.set(1, 1, 0, 0);
    }
    material.setVector4("shipPose", shipPoseUniform);
    material.setVector4("shipSize", shipSizeUniform);
  };
  update(0);
  return {
    mesh, update, heightAt,
    dispose: () => {
      mesh.dispose(false, false);
      material.dispose(false, false);
      depthTexture.dispose();
      normalTexture.dispose();
    },
  };
}
