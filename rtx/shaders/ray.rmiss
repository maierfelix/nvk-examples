#version 460
#extension GL_NV_ray_tracing : require

struct RayPayload {
    vec4 colorAndDist;
    vec4 normalAndObjId;
};

layout(location = 0) rayPayloadInNV RayPayload PrimaryRay;

void main() {
    PrimaryRay.colorAndDist = vec4(0.6, 0.75, 1.0, -1.0f);
    PrimaryRay.normalAndObjId = vec4(0.0f);
}
