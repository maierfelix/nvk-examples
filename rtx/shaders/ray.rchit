#version 460
#extension GL_NV_ray_tracing : require
#extension GL_EXT_nonuniform_qualifier : require

struct VertexAttribute {
    vec4 normal;
    vec4 uv;
};
struct RayPayload {
    vec4 colorAndDist;
    vec4 normalAndObjId;
};

vec2 BaryLerp(vec2 a, vec2 b, vec2 c, vec3 barycentrics) {
    return a * barycentrics.x + b * barycentrics.y + c * barycentrics.z;
}

vec3 BaryLerp(vec3 a, vec3 b, vec3 c, vec3 barycentrics) {
    return a * barycentrics.x + b * barycentrics.y + c * barycentrics.z;
}

layout(set = 1, binding = 0, std430) readonly buffer MatIDsBuffer {
    vec3 MatIDs[];
} MatIDsArray[];

layout(set = 2, binding = 0, std430) readonly buffer AttribsBuffer {
    VertexAttribute VertexAttribs[];
} AttribsArray[];

layout(set = 3, binding = 0, std430) readonly buffer FacesBuffer {
    uvec4 Faces[];
} FacesArray[];

layout(location = 0) rayPayloadInNV RayPayload PrimaryRay;
hitAttributeNV vec2 HitAttribs;

void main() {
    const vec3 barycentrics = vec3(1.0f - HitAttribs.x - HitAttribs.y, HitAttribs.x, HitAttribs.y);

    const vec3 matID = MatIDsArray[nonuniformEXT(gl_InstanceCustomIndexNV)].MatIDs[0];

    const uvec4 face = FacesArray[nonuniformEXT(gl_InstanceCustomIndexNV)].Faces[gl_PrimitiveID];

    VertexAttribute v0 = AttribsArray[nonuniformEXT(gl_InstanceCustomIndexNV)].VertexAttribs[int(face.x)];
    VertexAttribute v1 = AttribsArray[nonuniformEXT(gl_InstanceCustomIndexNV)].VertexAttribs[int(face.y)];
    VertexAttribute v2 = AttribsArray[nonuniformEXT(gl_InstanceCustomIndexNV)].VertexAttribs[int(face.z)];

    // interpolate our vertex attribs
    const vec3 normal = mat3(gl_ObjectToWorldNV) * normalize(BaryLerp(v0.normal.xyz, v1.normal.xyz, v2.normal.xyz, barycentrics));
    const vec2 uv = BaryLerp(v0.uv.xy, v1.uv.xy, v2.uv.xy, barycentrics);

    //const vec3 texel = textureLod(TexturesArray[nonuniformEXT(matID)], uv, 0.0f).rgb;

    int objId = gl_InstanceCustomIndexNV;

    PrimaryRay.colorAndDist = vec4(matID, gl_HitTNV);
    PrimaryRay.normalAndObjId = vec4(normal, objId);
}
