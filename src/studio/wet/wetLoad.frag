precision highp float;
precision highp sampler2D;

// Re-wetting: turns a layer's dry paint (straight RGBA) back into pigment
// (absorption per channel) and adds it to what's already wet.
varying vec2 vUv;
uniform sampler2D uLayer;
uniform sampler2D uDye;

void main () {
    vec4 paint = texture2D(uLayer, vec2(vUv.x, 1.0 - vUv.y));
    // How much light gets through this paint over white paper.
    vec3 through = paint.rgb * paint.a + (1.0 - paint.a);
    vec3 pigment = -log(max(through, vec3(0.02)));
    gl_FragColor = vec4(texture2D(uDye, vUv).rgb + pigment, 1.0);
}
