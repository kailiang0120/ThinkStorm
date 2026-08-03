import { memo, useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

/**
 * Aurora — a WebGL aurora curtain rendered on a full-screen triangle with ogl.
 * Replaces the three blurred divs the app used to fake this effect: one
 * GPU pass instead of three large `filter: blur(80px)` layers.
 *
 * Honours prefers-reduced-motion by rendering a single static frame.
 */

const VERT = /* glsl */ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

// Simplex-noise helpers (Ashima / webgl-noise, public domain).
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop { vec3 color; float position; };

vec3 rampColor(ColorStop stops[3], float factor) {
  int index = 0;
  for (int i = 0; i < 2; i++) {
    bool isBetween = stops[i].position <= factor;
    index = int(mix(float(index), float(i), float(isBetween)));
  }
  ColorStop currentColor = stops[index];
  ColorStop nextColor = stops[index + 1];
  float range = nextColor.position - currentColor.position;
  float lerpFactor = (factor - currentColor.position) / max(range, 0.0001);
  return mix(currentColor.color, nextColor.color, clamp(lerpFactor, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  vec3 rampCol = rampColor(colors, uv.x);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  // Soft vertical falloff so the curtain fades into the page background.
  float midPoint = 0.20;
  float alpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  // Alpha has to track brightness, not just the falloff. The upstream shader
  // lets alpha saturate to 1 while the colour is still near black, which reads
  // as a dark sheet over a light page instead of a glow. Tying opacity to
  // luminance keeps dim regions genuinely transparent.
  float luminance = clamp(intensity, 0.0, 1.0);
  float a = luminance * alpha;

  // Premultiplied, matching gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
  fragColor = vec4(rampCol * a, a);
}
`;

function Aurora({
  colorStops = ["#60a5fa", "#22d3ee", "#2dd4bf"],
  amplitude = 1.0,
  blend = 0.5,
  speed = 0.6,
  className = ""
}) {
  const containerRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Read live values inside the rAF loop without re-creating the GL context.
  const propsRef = useRef({ colorStops, amplitude, blend, speed });
  propsRef.current = { colorStops, amplitude, blend, speed };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true });
    } catch {
      return undefined; // No WebGL — the CSS body gradient stays as the fallback.
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = "transparent";
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";

    const geometry = new Triangle(gl);
    // ogl's Triangle ships a uv attribute the shader does not use.
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uBlend: { value: blend },
        uResolution: { value: [container.offsetWidth, container.offsetHeight] },
        uColorStops: { value: colorStops.map((hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; }) }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    // Re-checked every frame rather than only on ResizeObserver callbacks: the
    // container can still be unlaid-out when the effect first runs, and a
    // ResizeObserver that fires once at 0x0 would leave the canvas at 1x1.
    let appliedWidth = 0;
    let appliedHeight = 0;
    const syncSize = () => {
      const width = Math.round(container.clientWidth);
      const height = Math.round(container.clientHeight);
      if (!width || !height || (width === appliedWidth && height === appliedHeight)) return;
      appliedWidth = width;
      appliedHeight = height;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };
    // Only re-parse the hex stops when they actually change.
    let stopsKey = "";
    const syncColorStops = (stops) => {
      const key = stops.join("|");
      if (key === stopsKey) return;
      stopsKey = key;
      program.uniforms.uColorStops.value = stops.map((hex) => {
        const c = new Color(hex);
        return [c.r, c.g, c.b];
      });
    };

    let frame = 0;
    const drawFrame = (time) => {
      syncSize();
      const { colorStops: stops, amplitude: amp, blend: bl, speed: sp } = propsRef.current;
      program.uniforms.uTime.value = (time * 0.001) * sp * 0.4;
      program.uniforms.uAmplitude.value = amp;
      program.uniforms.uBlend.value = bl;
      syncColorStops(stops);
      renderer.render({ scene: mesh });
    };

    // In static (reduced-motion) mode a resize also has to trigger a repaint,
    // since no loop is running to pick the new size up.
    const observer = new ResizeObserver(() => {
      syncSize();
      if (prefersReducedMotion) drawFrame(0);
    });
    observer.observe(container);
    syncSize();

    if (prefersReducedMotion) {
      // One static frame, drawn on the next tick so layout has settled.
      frame = requestAnimationFrame(() => { drawFrame(0); frame = 0; });
    } else {
      const loop = (time) => {
        drawFrame(time);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // colorStops/amplitude/blend/speed are read live via propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion]);

  return <div ref={containerRef} className={`aurora-gl ${className}`} aria-hidden="true" />;
}

export default memo(Aurora);
