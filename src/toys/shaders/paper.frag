precision highp float;

varying vec2 vUv;
uniform float uAspect;
uniform vec2 uSeed;

#include <noise>

// Baked once per resize: r = fine paper tooth, g = large soft clouding, b = fibres.
void main () {
    vec2 p = vUv * vec2(uAspect, 1.0);
    float tooth = fbm(p * 170.0 + uSeed);
    float cloud = fbm(p * 4.0 + uSeed * 0.37);
    float fibre = 0.5 * valueNoise(vec2(p.x * 30.0, p.y * 520.0) + uSeed)
                + 0.5 * valueNoise(vec2(p.x * 520.0, p.y * 30.0) + uSeed.yx);
    gl_FragColor = vec4(tooth, cloud, fibre, 1.0);
}
