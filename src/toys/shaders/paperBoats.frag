precision highp float;
precision highp sampler2D;

varying vec2 vUv;
// Dye = foam and ripples stirred up by fingers and boat wakes (red channel).
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
// A soft mask of the map's water (1) and land (0), for shallows near the shore.
uniform sampler2D uShore;
// Screen uv to simulation uv: the fluid scrolls in whole texels behind a smooth camera.
uniform vec2 uSimShift;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uWorld;
uniform float uUnit;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform float uCaustic;
uniform float uNight;
uniform float uWave;

#include <noise>

// Sunlight dancing on the bottom: thin bright lines where two drifting noise layers meet.
float caustic (vec2 p, float t) {
    float a = valueNoise(p + vec2(t * 0.16, t * 0.11));
    float b = valueNoise(p * 1.3 - vec2(t * 0.12, -t * 0.09) + 4.0);
    return smoothstep(0.1, 0.0, abs(a - b));
}

void main () {
    vec2 simUv = vUv + uSimShift;
    // This pixel's place on the map, in pixels with y down.
    vec2 world = uCamera + vec2(vUv.x, 1.0 - vUv.y) * uView;
    vec2 velocity = texture2D(uVelocity, simUv).xy;
    // Currents bend the light pattern, so you can see the water move.
    vec2 warp = velocity / (250.0 + length(velocity)) * 0.5;
    vec2 p = world / uUnit * 3.8 - vec2(warp.x, -warp.y);

    float water = texture2D(uShore, world / uWorld).r;
    float shallow = 1.0 - smoothstep(0.3, 0.95, water);
    vec3 col = mix(uDeep, uShallow, shallow);
    col *= 0.94 + 0.08 * fbm(p * 0.35 + uTime * 0.03);
    float light = caustic(p, uTime) + 0.45 * caustic(p * 0.6 + 7.0, uTime * 0.8);
    col += mix(vec3(0.85, 1.0, 0.92), uFoam, uNight) * light * uCaustic;

    // Waves rolling in toward the beach.
    float band = sin(world.y / uUnit * 13.0 - uTime * 1.8 + fbm(p * 0.4) * 4.0);
    col += vec3(1.0) * smoothstep(0.8, 1.0, band) * 0.09 * uWave * (1.0 - shallow * 0.5);

    col += vec3(0.06) * clamp(length(velocity) * 0.004, 0.0, 1.0) * (1.0 - uNight);
    float foam = clamp(texture2D(uTexture, simUv).r, 0.0, 1.0);
    // By day foam whitens the water; at night it glows.
    col = mix(col, uFoam, foam * 0.6 * (1.0 - uNight)) + uFoam * foam * 0.9 * uNight;

    // Moonlight glinting on the dark water.
    vec2 cell = floor(world / 4.0);
    float glint = step(0.997, hash12(cell)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash12(cell + 3.0) * 30.0));
    col += vec3(0.75, 0.85, 1.0) * glint * 0.6 * uNight * (1.0 - shallow);

    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
