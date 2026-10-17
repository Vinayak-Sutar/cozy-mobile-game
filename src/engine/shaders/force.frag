precision highp float;
precision highp sampler2D;

// Buoyancy: wherever there is dye, push the fluid up or down in proportion to
// how much there is. A uniform gravity would be cancelled by the pressure
// solve, but weighting by the dye makes water fall (positive) or warm light
// rise (negative) through the surrounding air. uWeights picks which dye
// channels count.
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uBuoyancy;
uniform vec3 uWeights;
uniform float dt;

void main () {
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    float amount = dot(max(texture2D(uDye, vUv).rgb, 0.0), uWeights);
    velocity.y -= uBuoyancy * amount * dt;
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
