precision highp float;
precision highp sampler2D;

varying vec2 vUv;
// Dye is soft bioluminescent glow; velocity bends the light on the water.
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform float uTime;
uniform float uAspect;
uniform vec2 uMoon;

#include <noise>

float ripple (vec2 p, float t) {
    float v = sin(p.x * 3.1 + t * 0.9 + sin(p.y * 2.3 + t * 0.6));
    v += sin(p.y * 3.7 - t * 0.7 + sin(p.x * 2.9 - t * 0.5));
    v += sin((p.x + p.y) * 2.6 + t * 0.8);
    return v / 3.0;
}

// Thin bright lines where interfering ripples cross zero: a cheap caustic net.
float lightNet (vec2 p, float t) {
    float a = 1.0 - abs(ripple(p, t));
    float b = 1.0 - abs(ripple(p * 1.7 + 3.1, t * 1.3));
    return pow(a, 8.0) * 0.6 + pow(b, 10.0) * 0.4;
}

void main () {
    vec2 vel = texture2D(uVelocity, vUv).xy;
    float speed = length(vel);
    float t = uTime * 0.35;

    vec2 p = vUv * vec2(uAspect, 1.0) * 5.0;
    p += vel * 0.0009;

    vec3 deep = vec3(0.010, 0.030, 0.062);
    vec3 shallow = vec3(0.026, 0.085, 0.140);
    vec3 col = mix(deep, shallow, smoothstep(0.0, 1.0, vUv.y));

    float net = lightNet(p, t);
    col += vec3(0.22, 0.52, 0.62) * net * (0.05 + min(speed * 0.0012, 0.14));

    // The moon's reflection, broken up by the ripples and by your fingers.
    vec2 m = (vUv - uMoon) * vec2(uAspect, 1.0);
    m.x += 0.012 * ripple(p * 2.0, t * 2.0) + vel.x * 0.00025;
    float moon = exp(-(m.x * m.x) * 55.0 - (m.y * m.y) * 6.0);
    float glint = smoothstep(0.5, 1.0, net) * moon;
    col += vec3(0.72, 0.80, 0.95) * (moon * 0.09 + glint * 0.45);

    vec3 glow = texture2D(uTexture, vUv).rgb;
    col += glow * (1.0 + net * 0.6);

    vec2 q = vUv - 0.5;
    q.x *= uAspect;
    col *= 1.0 - 0.35 * dot(q, q);
    col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(col, 1.0);
}
