precision highp float;
precision highp sampler2D;

// Slides a field by uOffset (in uv), for a camera that scrolls over a world
// bigger than the screen. Whatever scrolls in from outside starts calm.
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uOffset;

void main () {
    vec2 uv = vUv + uOffset;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    gl_FragColor = texture2D(uSource, uv) * inside;
}
