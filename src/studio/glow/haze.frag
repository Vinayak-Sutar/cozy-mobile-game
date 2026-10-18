precision highp float;
precision highp sampler2D;

// Keeps a glow picture crisp: very faint light (the haze that drifting fluid
// spreads everywhere) fades away, while real strokes are left alone.
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uFade;
uniform float uFloor;

void main () {
    vec3 c = max(texture2D(uTexture, vUv).rgb, 0.0);
    float level = max(c.r, max(c.g, c.b));
    float keep = 1.0 - uFade * (1.0 - smoothstep(0.0, uFloor, level));
    gl_FragColor = vec4(c * keep, 1.0);
}
