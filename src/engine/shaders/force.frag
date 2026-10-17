precision highp float;
precision highp sampler2D;

// Buoyancy: wherever there is dye (water), push the fluid downward in
// proportion to how much there is. A uniform gravity would be cancelled by the
// pressure solve, but weighting by the dye makes water fall through air.
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uBuoyancy;
uniform float dt;

void main () {
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    float amount = texture2D(uDye, vUv).r;
    velocity.y -= uBuoyancy * amount * dt;
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
