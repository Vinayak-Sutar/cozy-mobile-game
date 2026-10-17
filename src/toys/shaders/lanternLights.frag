precision highp float;
precision highp sampler2D;

varying vec2 vUv;
// Dye = coloured light drifting up from the lotus flowers.
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform float uAspect;
uniform float uTime;
uniform float uLake;

#include <noise>

vec3 lightAt (vec2 uv) {
    // Soft shoulder: lots of light glows brighter but never burns to flat white.
    return 1.0 - exp(-max(texture2D(uTexture, uv).rgb, 0.0) * 1.3);
}

void main () {
    vec2 uv = vUv;
    float x = uv.x * uAspect;

    // A deep night sky with faint twinkling stars.
    vec3 col = mix(vec3(0.07, 0.09, 0.22), vec3(0.02, 0.03, 0.09), smoothstep(uLake, 1.0, uv.y));
    vec2 cell = floor(vec2(x, uv.y) * 70.0);
    float star = step(0.985, hash12(cell));
    float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + hash12(cell + 7.0) * 2.0) + hash12(cell) * 40.0);
    vec2 inCell = fract(vec2(x, uv.y) * 70.0) - 0.5;
    col += vec3(1.0, 0.95, 0.85) * star * twinkle * smoothstep(0.18, 0.0, length(inCell)) * smoothstep(uLake + 0.05, uLake + 0.3, uv.y) * 0.8;

    // Far hills on the shore.
    float shore = uLake + 0.02 + 0.025 * sin(x * 2.1 + 1.3) + 0.012 * sin(x * 5.3);
    col = mix(col, vec3(0.03, 0.05, 0.11), smoothstep(shore + 0.003, shore - 0.003, uv.y));

    vec3 light = lightAt(uv);
#ifdef BLOOM
    light += texture2D(uBloom, uv).rgb * 0.8;
#endif

    if (uv.y < uLake) {
        // The lake mirrors the sky and the lights, broken up by gentle ripples.
        float depth = (uLake - uv.y) / uLake;
        float ripple = sin(uv.y * 160.0 / (0.3 + depth) + uTime * 1.5) * 0.004 * (0.4 + depth);
        vec2 mirrored = vec2(uv.x + ripple, 2.0 * uLake - uv.y);
        vec3 reflection = lightAt(mirrored) * 0.55;
        col = mix(vec3(0.03, 0.05, 0.12), vec3(0.02, 0.03, 0.07), depth) + reflection;
        col += vec3(0.6, 0.7, 0.9) * 0.05 * smoothstep(0.85, 1.0, sin(uv.y * 300.0 + x * 4.0 + uTime));
        col += light * 0.5;
    } else {
        col += light;
    }

    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
