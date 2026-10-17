precision highp float;
precision highp sampler2D;

// One output pixel per probe point: the average of the dye in a small cross
// around that point, scaled and clamped to 0..1 so it survives an 8-bit
// readback. With RGB defined all three channels are kept, otherwise just red.
// (GLSL ES 1.0 can't index a uniform array with a computed index, hence the loop.)
uniform sampler2D uTexture;
uniform vec2 uPoints[8];
uniform float uRadius;
uniform float uAspect;
uniform float uScale;

void main () {
    float index = floor(gl_FragCoord.x);
    vec2 p = vec2(-1.0);
    for (int i = 0; i < 8; i++) {
        if (float(i) == index) p = uPoints[i];
    }
    vec2 r = vec2(uRadius / uAspect, uRadius);
    vec3 sum = texture2D(uTexture, p).rgb;
    sum += texture2D(uTexture, p + vec2(r.x, 0.0)).rgb;
    sum += texture2D(uTexture, p - vec2(r.x, 0.0)).rgb;
    sum += texture2D(uTexture, p + vec2(0.0, r.y)).rgb;
    sum += texture2D(uTexture, p - vec2(0.0, r.y)).rgb;
    vec3 v = clamp(max(sum, 0.0) * 0.2 * uScale, 0.0, 1.0);
#ifdef RGB
    gl_FragColor = vec4(v, 1.0);
#else
    gl_FragColor = vec4(v.r, 0.0, 0.0, 1.0);
#endif
}
