precision highp float;
precision highp sampler2D;

// Samples the velocity field on a coarse grid (one output pixel per cell) and
// packs it into 8 bits per axis, so the CPU can move things (raindrops) with
// the wind: 0.5 = still, 0 / 1 = fastest left/down and right/up.
uniform sampler2D uVelocity;
uniform vec2 uGrid;
uniform float uScale;

void main () {
    vec2 uv = (floor(gl_FragCoord.xy) + 0.5) / uGrid;
    vec2 v = texture2D(uVelocity, uv).xy;
    gl_FragColor = vec4(clamp(v / uScale * 0.5 + 0.5, 0.0, 1.0), 0.0, 1.0);
}
