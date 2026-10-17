precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform vec2 texelSize;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform float uAspect;
uniform float uTime;

#include <noise>

vec3 linearToGamma (vec3 color) {
    color = max(color, vec3(0.0));
    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0.0));
}

void main () {
    // Soft shoulder: heavy scribbling glows brighter but never blows out to flat white.
    vec3 c = 1.0 - exp(-texture2D(uTexture, vUv).rgb * 1.25);

#ifdef SHADING
    // Treat dye brightness as height and light it from the front: gives the ink body.
    vec3 lc = texture2D(uTexture, vL).rgb;
    vec3 rc = texture2D(uTexture, vR).rgb;
    vec3 tc = texture2D(uTexture, vT).rgb;
    vec3 bc = texture2D(uTexture, vB).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 n = normalize(vec3(dx, dy, length(texelSize)));
    float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
    c *= diffuse;
#endif

#ifdef BLOOM
    vec3 bloom = texture2D(uBloom, vUv).rgb;
#endif

#ifdef SUNRAYS
    float rays = texture2D(uSunrays, vUv).r;
    c *= rays;
#ifdef BLOOM
    bloom *= rays;
#endif
#endif

#ifdef BLOOM
    bloom += (hash12(gl_FragCoord.xy) * 2.0 - 1.0) / 255.0;
    c += linearToGamma(bloom);
#endif

    // Deep night background with a soft vignette; ink sits on top.
    vec2 q = vUv - 0.5;
    q.x *= uAspect;
    vec3 bg = mix(uBgBottom, uBgTop, vUv.y);
    bg *= 1.0 - 0.55 * dot(q, q);
    bg += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.5 / 255.0);

    float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
    gl_FragColor = vec4(c + bg * (1.0 - a), 1.0);
}
