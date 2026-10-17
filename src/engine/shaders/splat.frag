precision highp float;

// A soft Gaussian stamp. It is drawn with blending into a scissored box around
// the point, so it only touches the pixels it changes (no full-screen copy):
// additive blending adds dye/velocity; with MULTIPLY it scales existing dye
// down instead (used to lift paint off the paper without going negative).
varying vec2 vUv;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    float g = exp(-dot(p, p) / radius);
#ifdef MULTIPLY
    gl_FragColor = vec4(vec3(1.0) - color * g, 1.0);
#else
    gl_FragColor = vec4(color * g, 0.0);
#endif
}
