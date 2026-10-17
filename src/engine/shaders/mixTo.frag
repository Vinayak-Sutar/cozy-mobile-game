precision mediump float;
precision mediump sampler2D;

// Blends every texel toward a fixed colour (used to roll fog back over a window).
varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 uTarget;
uniform float uAmount;

void main () {
    gl_FragColor = vec4(mix(texture2D(uTexture, vUv).rgb, uTarget, uAmount), 1.0);
}
