precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
// Dye here is pigment *absorption* per RGB channel, so overlapping colours
// multiply like real paint (blue + yellow = green) instead of adding like light.
uniform sampler2D uTexture;
uniform sampler2D uPaper;
uniform vec3 uPaperColor;
uniform float uAspect;
uniform float uDepth;

float amount (vec3 c) {
    return c.r + c.g + c.b;
}

void main () {
    vec3 pigment = max(texture2D(uTexture, vUv).rgb, 0.0);
    float a = amount(pigment);
    float aL = amount(max(texture2D(uTexture, vL).rgb, 0.0));
    float aR = amount(max(texture2D(uTexture, vR).rgb, 0.0));
    float aT = amount(max(texture2D(uTexture, vT).rgb, 0.0));
    float aB = amount(max(texture2D(uTexture, vB).rgb, 0.0));
    float edge = length(vec2(aR - aL, aT - aB));

    vec3 paper = texture2D(uPaper, vUv).rgb;
    float tooth = paper.r;
    float cloud = paper.g;
    float fibre = paper.b;

    // Pigment settles into the paper's tooth, and pools darker at the rim of a wash.
    float wash = smoothstep(0.02, 0.4, a);
    vec3 d = pigment * (0.72 + 0.56 * tooth) * (0.85 + 0.3 * cloud);
    d *= 1.0 + clamp(edge * 5.0, 0.0, 0.8) * wash;
    // Heavy layers deepen up to a cap (uDepth) instead of turning to mud.
    // Scaling the whole vector (not each channel) keeps sky blue from drifting purple.
    float m = max(d.r, max(d.g, d.b));
    d *= uDepth * (1.0 - exp(-m / uDepth)) / max(m, 0.0001);

    vec3 base = uPaperColor * (0.955 + 0.05 * tooth + 0.02 * (fibre - 0.5) + 0.025 * (cloud - 0.5));
    vec3 col = base * exp(-d);

    vec2 q = vUv - 0.5;
    q.x *= uAspect;
    col *= 1.0 - 0.16 * dot(q, q);
    gl_FragColor = vec4(col, 1.0);
}
