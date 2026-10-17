precision highp float;
precision highp sampler2D;

varying vec2 vUv;
// Fluid dye: red = mist in the air, green = wet soil.
uniform sampler2D uTexture;
uniform float uAspect;
uniform float uTime;
uniform float uBedTop;
uniform float uBedBottom;

#include <noise>

float ridge (float x, float base, float amp, float freq, float phase) {
    return base + amp * sin(x * freq + phase) + amp * 0.45 * sin(x * freq * 2.3 + phase * 1.7);
}

// Soft-edged "below this line" mask.
float below (float y, float line) {
    return smoothstep(line + 0.0025, line - 0.0025, y);
}

void main () {
    vec2 uv = vUv;
    float x = uv.x * uAspect;

    // A big, open morning sky.
    vec3 col = mix(vec3(0.99, 0.94, 0.85), vec3(0.48, 0.72, 0.93), smoothstep(0.38, 1.0, uv.y));
    vec2 sun = (uv - vec2(0.8, 0.9)) * vec2(uAspect, 1.0);
    col += vec3(1.0, 0.85, 0.55) * (0.5 * exp(-dot(sun, sun) * 26.0) + 0.25 * exp(-dot(sun, sun) * 4.0));
    col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.035, 0.03, length(sun)));
    float clouds = fbm(vec2(x * 1.3 + uTime * 0.008, uv.y * 3.2));
    col = mix(col, vec3(1.0), smoothstep(0.6, 0.76, clouds) * smoothstep(0.58, 0.85, uv.y) * 0.6);

    // Layers of land getting closer: far hills, a hill with a tree line, the meadow.
    float far = ridge(x, uBedTop + 0.2, 0.022, 1.6, 0.6);
    col = mix(col, vec3(0.73, 0.83, 0.72), below(uv.y, far));

    float mid = ridge(x, uBedTop + 0.135, 0.018, 2.4, 2.0);
    float trees = 0.0;
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = 0.016 + 0.012 * fract(sin(fi * 78.233) * 43758.5);
        float tx = (fi + 0.5) / 16.0 * uAspect + 0.03 * sin(fi * 12.9);
        float ty = ridge(tx, uBedTop + 0.135, 0.018, 2.4, 2.0) + r * 0.55;
        float d = length(vec2(x - tx, uv.y - ty));
        trees = max(trees, smoothstep(r, r - 0.003, d));
    }
    col = mix(col, vec3(0.43, 0.61, 0.45), trees);
    col = mix(col, vec3(0.58, 0.75, 0.55), below(uv.y, mid));

    float near = ridge(x, uBedTop + 0.07, 0.01, 3.1, 4.0);
    float meadow = below(uv.y, near);
    // Meadow: darker as it comes toward you, mottled tufts, and tiny wildflowers.
    float depth = smoothstep(near, 0.0, uv.y);
    vec3 grass = mix(vec3(0.55, 0.74, 0.47), vec3(0.34, 0.55, 0.31), depth);
    float tufts = valueNoise(vec2(x, uv.y) * mix(60.0, 22.0, depth));
    grass *= 0.9 + 0.18 * tufts;
    vec2 cellSize = vec2(mix(0.018, 0.045, depth));
    vec2 cell = floor(vec2(x, uv.y) / cellSize);
    float pick = hash12(cell);
    vec2 inCell = fract(vec2(x, uv.y) / cellSize) - 0.5;
    float flower = step(0.9, pick) * smoothstep(0.22, 0.12, length(inCell));
    vec3 petal = pick > 0.965 ? vec3(1.0, 0.86, 0.4) : pick > 0.93 ? vec3(1.0, 0.75, 0.85) : vec3(1.0);
    grass = mix(grass, petal, flower * (uv.y < uBedBottom - 0.01 || uv.y > uBedTop ? 1.0 : 0.0));
    col = mix(col, grass, meadow);

    // The raised wooden garden bed.
    float inX = smoothstep(0.03, 0.035, uv.x) * smoothstep(0.97, 0.965, uv.x);
    float soilTop = uBedTop + 0.004 * sin(x * 38.0);
    float bedMask = inX * below(uv.y, soilTop) * smoothstep(uBedBottom - 0.002, uBedBottom + 0.002, uv.y);
    float soilBand = smoothstep(uBedTop - 0.03, uBedTop - 0.026, uv.y);
    float grain = valueNoise(vec2(x, uv.y) * 140.0);
    vec3 soil = mix(vec3(0.46, 0.32, 0.22), vec3(0.38, 0.26, 0.18), grain);
    float plank = fract((uv.y - uBedBottom) / ((uBedTop - 0.03 - uBedBottom) / 3.0));
    vec3 wood = mix(vec3(0.70, 0.52, 0.34), vec3(0.62, 0.45, 0.29), valueNoise(vec2(x * 4.0, uv.y * 120.0)));
    wood *= 0.88 + 0.12 * smoothstep(0.0, 0.08, plank) * smoothstep(1.0, 0.92, plank);
    vec3 bed = mix(wood, soil, soilBand);

    // Rain soaks the soil darker.
    float wet = texture2D(uTexture, uv).g;
    bed *= 1.0 - 0.35 * clamp(wet, 0.0, 1.0) * soilBand;
    col = mix(col, bed, bedMask);
    // A soft shadow under the bed.
    col *= 1.0 - 0.18 * inX * smoothstep(uBedBottom, uBedBottom - 0.02, uv.y) * smoothstep(uBedBottom - 0.05, uBedBottom - 0.02, uv.y);

    // Mist swirls show where the wind blows.
    float mist = max(texture2D(uTexture, uv).r, 0.0);
    col = mix(col, vec3(0.95, 0.97, 1.0), (1.0 - exp(-mist * 1.8)) * 0.4);

    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
