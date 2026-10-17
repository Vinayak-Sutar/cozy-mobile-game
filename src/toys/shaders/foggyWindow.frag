precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
// Dye red channel = fog on the glass (1 = fully fogged).
uniform sampler2D uTexture;
uniform sampler2D uPicture;
uniform sampler2D uPictureBlur;
uniform float uAspect;

#include <noise>

void main () {
    // Canvas images are stored top row first; the screen's y runs up.
    vec2 picUv = vec2(vUv.x, 1.0 - vUv.y);
    vec3 pic = texture2D(uPicture, picUv).rgb;
    vec3 blurred = texture2D(uPictureBlur, picUv).rgb;

    float fog = clamp(texture2D(uTexture, vUv).r, 0.0, 1.0);
    float fl = texture2D(uTexture, vL).r;
    float fr = texture2D(uTexture, vR).r;
    float ft = texture2D(uTexture, vT).r;
    float fb = texture2D(uTexture, vB).r;
    float edge = length(vec2(fr - fl, ft - fb));

    // Frosted glass: soft, bright, with a fine speckle of condensation.
    vec2 p = vUv * vec2(uAspect, 1.0);
    float cloudy = fbm(p * 16.0);
    float speckle = valueNoise(p * 240.0);
    vec3 frost = mix(vec3(0.80, 0.85, 0.92), vec3(0.97, 0.98, 1.0), cloudy) + (speckle - 0.5) * 0.05;

    // Through the fog you can just make out blurry shapes: enough to make you curious.
    vec3 hidden = mix(blurred, frost, 0.74);
    float a = smoothstep(0.06, 0.8, fog);
    vec3 col = mix(pic, hidden, a);

    // The rim of a wiped patch catches the light, like real condensation.
    col += vec3(1.0) * clamp(edge * 2.5, 0.0, 0.2) * (1.0 - a * 0.4);

    // A faint diagonal reflection across the glass.
    float streak = smoothstep(0.03, 0.0, abs(vUv.x + vUv.y * 0.55 - 0.7)) * 0.03;
    col += streak;

    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
