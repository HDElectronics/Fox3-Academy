/**
 * Cosmetic pod-video treatment over an actual 3D view. This is deliberately not a thermal sensor
 * model: IR is a contrast treatment, and green night vision is an independent artistic viewing aid.
 * Keep instrument text/reticles in the crisp overlay above this output, outside the filter.
 */
import {
  BufferGeometry, Camera, Color, Float32BufferAttribute, HalfFloatType, LinearFilter,
  Mesh, Scene, ShaderMaterial, Vector2, Vector4, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import type { Theme } from '../../ui/theme';

export interface SensorFilterOptions {
  infrared: boolean;
  whiteHot: boolean;
  nightVision: boolean;
  /** Cosmetic animation clock in seconds. It never changes lesson/simulation state. */
  time: number;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D image;
uniform vec2 resolution;
uniform vec3 phosphor;
uniform float clock;
uniform bool infrared;
uniform bool whiteHot;
uniform bool nightVision;
varying vec2 vUv;

// Cosmetic pixel grain only; no simulation randomness is consumed here.
float grain(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

float videoLuminance(vec3 color) {
  float value = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (infrared) {
    value = clamp((value - 0.30) * 1.22 + 0.36, 0.025, 0.95);
    if (!whiteHot) value = 1.0 - value;
  }
  return value;
}

float brightSample(vec2 uv) {
  vec3 color = texture2D(image, uv).rgb;
  #ifdef TONE_MAPPING
    color = toneMapping(color);
  #endif
  return max(videoLuminance(color) - 0.70, 0.0);
}

void main() {
  vec3 source = texture2D(image, vUv).rgb;
  if (nightVision || infrared) {
    // Small optical softness retains edges and the shading that makes the scene read as 3D.
    vec2 pixel = 1.0 / resolution;
    vec3 surround = texture2D(image, vUv + vec2(pixel.x, 0.0)).rgb
      + texture2D(image, vUv - vec2(pixel.x, 0.0)).rgb
      + texture2D(image, vUv + vec2(0.0, pixel.y)).rgb
      + texture2D(image, vUv - vec2(0.0, pixel.y)).rgb;
    source = mix(source, surround * 0.25, 0.14);
  }

  // The target contains linear HDR scene color. Tone-map exactly once, before the artistic
  // treatment, then encode to the renderer's output color space exactly once at the end.
  gl_FragColor = vec4(source, 1.0);
  #include <tonemapping_fragment>
  vec3 color = gl_FragColor.rgb;
  float luminance = videoLuminance(color);
  if (infrared) {
    color = vec3(luminance);
  }
  if (nightVision) {
    // Compress terrain into darker midtones; preserve a broad highlight range for object facets.
    float gain = pow(clamp(luminance, 0.0, 1.0), 1.22);
    color = phosphor * (0.004 + gain * 0.75);
    color = mix(color, vec3(gain), smoothstep(0.44, 0.92, gain) * 0.72);
    // Only bright detail glows. The main scene remains sharp; no whole-frame blur pass.
    vec2 radius = 2.5 / resolution;
    float glow = brightSample(vUv + vec2(radius.x, 0.0))
      + brightSample(vUv - vec2(radius.x, 0.0))
      + brightSample(vUv + vec2(0.0, radius.y))
      + brightSample(vUv - vec2(0.0, radius.y));
    radius *= 1.8;
    glow += (brightSample(vUv + radius) + brightSample(vUv - radius)
      + brightSample(vUv + vec2(radius.x, -radius.y))
      + brightSample(vUv + vec2(-radius.x, radius.y))) * 0.5;
    color += mix(phosphor, vec3(1.0), 0.25) * glow * 0.045;
  }
  if (nightVision || infrared) {
    vec2 offset = vUv * 2.0 - 1.0;
    float vignette = 1.0 - smoothstep(0.18, 1.65, dot(offset, offset)) * 0.30;
    float noise = grain(floor(vUv * resolution) + floor(clock * 24.0)) - 0.5;
    float scan = sin(vUv.y * resolution.y * 3.14159265) * 0.006;
    color *= vignette * (1.0 + scan);
    color += (nightVision ? phosphor : vec3(1.0)) * noise * 0.006;
  }
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  #include <colorspace_fragment>
}
`;

export class SensorFilter {
  private readonly target: WebGLRenderTarget;
  private readonly screen = new Scene();
  private readonly camera = new Camera();
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly viewport = new Vector4();
  private readonly scissor = new Vector4();
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer, theme: Theme) {
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: Math.min(4, renderer.capabilities.maxSamples),
    });
    this.target.texture.name = 'ATFLIR scene color';
    this.material = new ShaderMaterial({
      name: 'ATFLIR cosmetic video filter',
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        image: { value: this.target.texture },
        resolution: { value: new Vector2(1, 1) },
        phosphor: { value: new Color(theme.sym).lerp(new Color(theme.placard), 0.22) },
        clock: { value: 0 },
        infrared: { value: false },
        whiteHot: { value: true },
        nightVision: { value: false },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    // One oversized triangle avoids the diagonal seam of a two-triangle fullscreen quad.
    this.geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.screen.add(mesh);
  }

  /** Physical drawing-buffer pixels, including the renderer's device pixel ratio. */
  resize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.target.setSize(w, h);
    this.material.uniforms.resolution!.value.set(w, h);
  }

  /** Renders to the default framebuffer and leaves the renderer's target null. */
  render(scene: Scene, camera: Camera, options: SensorFilterOptions): void {
    if (this.disposed) return;
    const { renderer } = this;
    const autoClear = renderer.autoClear;
    const scissorTest = renderer.getScissorTest();
    renderer.getViewport(this.viewport);
    renderer.getScissor(this.scissor);
    const uniforms = this.material.uniforms;
    uniforms.infrared!.value = options.infrared;
    uniforms.whiteHot!.value = options.whiteHot;
    uniforms.nightVision!.value = options.nightVision;
    uniforms.clock!.value = options.time;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(this.target);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setViewport(this.viewport);
      renderer.setScissorTest(false);
      renderer.render(this.screen, this.camera);
    } finally {
      renderer.setRenderTarget(null);
      renderer.setViewport(this.viewport);
      renderer.setScissor(this.scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.screen.clear();
  }
}
