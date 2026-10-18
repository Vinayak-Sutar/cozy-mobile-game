precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
// Wet pigment, stored as how much of each colour channel it absorbs
// (Beer-Lambert), so overlapping washes multiply like real watercolour.
uniform sampler2D uTexture;
uniform sampler2D uPaper;
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

    // Pigment settles into the paper's tooth, and pools darker at the rim of a wash.
    float wash = smoothstep(0.02, 0.4, a);
    vec3 d = pigment * (0.72 + 0.56 * tooth) * (0.85 + 0.3 * cloud);
    d *= 1.0 + clamp(edge * 5.0, 0.0, 0.8) * wash;
    // Heavy layers deepen up to a cap instead of turning to mud.
    float m = max(d.r, max(d.g, d.b));
    d *= uDepth * (1.0 - exp(-m / uDepth)) / max(m, 0.0001);

    // How much light gets through, then the same as paint on a clear layer:
    // the most-absorbed channel sets the opacity (colour-to-alpha), so over
    // white paper it looks exactly like the wash. Output is premultiplied.
    vec3 through = exp(-d);
    float alpha = 1.0 - min(through.r, min(through.g, through.b));
    // Barely-there pigment is dropped so the layer stays clean.
    alpha = alpha < 0.004 ? 0.0 : alpha;
    vec3 rgb = alpha > 0.0 ? through + alpha - 1.0 : vec3(0.0);
    gl_FragColor = vec4(max(rgb, 0.0), alpha);
}
