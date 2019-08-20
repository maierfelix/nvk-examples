import {
  getMemoryTypeIndex,
  ASSERT_VK_RESULT
} from './utils.mjs';

let result = null;

export class MemoryLayout {
  constructor(layout) {
    this.byteSize = this.calculateLayoutByteSize(layout);
    this.buffer = new ArrayBuffer(this.byteSize);
    this.view = new Int8Array(this.buffer);
    this.layout = this.createLayout(layout);
  }
  calculateLayoutByteSize(layout) {
    let byteSize = 0;
    layout.map(l => byteSize += Object.values(l)[0]);
    return byteSize;
  }
  createLayout(layout) {
    let {view} = this;
    let out = {};
    let offset = 0;
    layout.map(l => {
      let entry = Object.entries(l)[0];
      let name = entry[0];
      let byteLength = entry[1];
      out[name] = view.subarray(offset, offset + byteLength);
      offset += byteLength;
    });
    return out;
  }
  update(name, value) {
    value = new Int8Array(value.buffer);
    for (let i = 0; i < this.layout[name].length; i++) {
      this.layout[name][i] = value[i];
    }
  }
}

export class VkGeometryInstance extends MemoryLayout {
  constructor() {
    super([
      { transform: 12 * Float32Array.BYTES_PER_ELEMENT },
      { instanceId: 3 },
      { mask: 1 },
      { instanceOffset: 3 },
      { flags: 1 },
      { accelerationStructureHandle: 1 * BigUint64Array.BYTES_PER_ELEMENT }
    ]);
  }
}

export class Camera extends MemoryLayout {
  constructor() {
    super([
      { sunPosAndAmbient: 4 * Float32Array.BYTES_PER_ELEMENT },
      { camPos: 4 * Float32Array.BYTES_PER_ELEMENT },
      { camDir: 4 * Float32Array.BYTES_PER_ELEMENT },
      { camUp: 4 * Float32Array.BYTES_PER_ELEMENT },
      { camSide: 4 * Float32Array.BYTES_PER_ELEMENT },
      { camNearFarFov: 4 * Float32Array.BYTES_PER_ELEMENT },
      { gFrameCount: 4 * Float32Array.BYTES_PER_ELEMENT }
    ]);
  }
}

export class SBT {
  constructor(shaderGroupHandleSize) {
    this.stages = [];
    this.shaderGroupHandleSize = shaderGroupHandleSize;
  }

  getSize() {
    return this.stages.length * this.shaderGroupHandleSize;
  }
  getStride() {
    return this.shaderGroupHandleSize;
  }
  getRaygenOffset() {
    return 0;
  }
  getHitOffset() {
    return this.stages.filter(s => s.__type === 'raygen').length * this.shaderGroupHandleSize;
  }
  getMissOffset() {
    return (this.stages.filter(s => s.__type === 'raygen').length + this.stages.filter(s => s.__type === 'hit').length) * this.shaderGroupHandleSize;
  }

  addRaygen() {
    const s = new VkRayTracingShaderGroupCreateInfoNV(this.build(
      VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_NV,
      this.stages.length
    ));
    s.__type = 'raygen';
    this.stages.push(s);
  }

  addHit() {
    const s = new VkRayTracingShaderGroupCreateInfoNV(this.build(
      VK_RAY_TRACING_SHADER_GROUP_TYPE_TRIANGLES_HIT_GROUP_NV,
      undefined,
      this.stages.length
    ));
    s.__type = 'hit';
    this.stages.push(s);
  }

  addMiss() {
    const s = new VkRayTracingShaderGroupCreateInfoNV(this.build(
      VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_NV,
      this.stages.length
    ));
    s.__type = 'miss';
    this.stages.push(s);
  }

  build(
    type, 
    generalShader = VK_SHADER_UNUSED_NV,
    closestHitShader = VK_SHADER_UNUSED_NV,
    anyHitShader = VK_SHADER_UNUSED_NV,
    intersectionShader = VK_SHADER_UNUSED_NV
  ) {
    return {
      type,
      generalShader,
      closestHitShader,
      anyHitShader,
      intersectionShader
    };
  }
}



export class UniformStorage {
  constructor(win, device, physicalDevice, hasExtension) {
    this.device = device;
    this.physicalDevice = physicalDevice;
    this.win = win;
    this.descriptors = [];
    this.layout = new Map();
    this.hasExtension = hasExtension;
  }

  addAccelerationStructure(binding, layout, data) {
    this.descriptors.push({
      binding,
      stage: VK_SHADER_STAGE_RAYGEN_BIT_NV,
      type: VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_NV,
      descriptorCount: 1,
      count: 1,
      index: layout,
      data
    });
    this.layout.set(layout, new Array(1).fill(1));
  }

  addStorageImage(binding, layout, data) {
    this.descriptors.push({
      binding,
      stage: VK_SHADER_STAGE_RAYGEN_BIT_NV,
      type: VK_DESCRIPTOR_TYPE_STORAGE_IMAGE,
      descriptorCount: 1,
      count: 1,
      index: layout,
      data
    });
    this.layout.set(layout, new Array(1).fill(1));
  }

  addUniformBuffer(stage, binding, layout, data) {
    this.descriptors.push({
      binding,
      stage,
      type: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
      descriptorCount: 1,
      count: 1,
      index: layout,
      data
    });
    this.layout.set(layout, new Array(1).fill(1));
  }

  addStorageBuffer(binding, layout, count, numMeshes, data) {
    this.descriptors.push({
      binding,
      stage: VK_SHADER_STAGE_CLOSEST_HIT_BIT_NV,
      type: VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
      descriptorCount: count * numMeshes,
      count: count,
      index: layout,
      data
    });
    this.layout.set(layout, new Array(count).fill(numMeshes));
  }

  addImageSampler(stage, binding, layout, data, sampler) {
    this.descriptors.push({
      binding,
      stage,
      type: VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
      descriptorCount: 1,
      count: 1,
      index: layout,
      data,
      sampler
    });
    this.layout.set(layout, new Array(1).fill(1));
  }

  addInputSampler(stage, binding, layout, data, sampler) {
    this.descriptors.push({
      binding,
      stage,
      type: VK_DESCRIPTOR_TYPE_INPUT_ATTACHMENT,
      descriptorCount: 1,
      count: 1,
      index: layout,
      data,
      sampler
    });
    this.layout.set(layout, new Array(1).fill(1));
  }

  createAccelerationStructure(binding, descriptorSet, accelerationStructures) {
    const descriptorAccelerationStructureInfo = new VkWriteDescriptorSetAccelerationStructureNV({
      accelerationStructureCount: accelerationStructures.length,
      pAccelerationStructures: accelerationStructures
    });

    return new VkWriteDescriptorSet({
      pNext: descriptorAccelerationStructureInfo,
      dstSet: descriptorSet,
      dstBinding: binding,
      dstArrayElement: 0,
      descriptorCount: 1,
      descriptorType: VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_NV,
      pImageInfo: null,
      pBufferInfo: null,
      pTexelBufferView: null
    });
  }

  createStorageImage(binding, descriptorSet, [imageView, image]) {
    const extent = new VkExtent3D({
      width: this.win.width,
      height: this.win.height,
      depth: 1
    });

    const imageCreateInfo = new VkImageCreateInfo({
      flags: 0,
      imageType: VK_IMAGE_TYPE_2D,
      format: VK_FORMAT_B8G8R8A8_UNORM,
      extent: extent,
      mipLevels: 1,
      arrayLayers: 1,
      samples: VK_SAMPLE_COUNT_1_BIT,
      tiling: VK_IMAGE_TILING_OPTIMAL,
      usage: VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_SAMPLED_BIT,
      sharingMode: VK_SHARING_MODE_EXCLUSIVE,
      queueFamilyIndexCount: 0,
      pQueueFamilyIndices: null,
      initialLayout: VK_IMAGE_LAYOUT_UNDEFINED
    });

    result = vkCreateImage(this.device, imageCreateInfo, null, image);

    const memoryRequirements = new VkMemoryRequirements();
    vkGetImageMemoryRequirements(this.device, image, memoryRequirements);

    const memoryAllocateInfo = new VkMemoryAllocateInfo({
      allocationSize: memoryRequirements.size,
      memoryTypeIndex: getMemoryTypeIndex(
        this.physicalDevice,
        memoryRequirements.memoryTypeBits,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
      )
    });

    const bufferMemory = new VkDeviceMemory();
    result = vkAllocateMemory(this.device, memoryAllocateInfo, null, bufferMemory);
    ASSERT_VK_RESULT(result);
    result = vkBindImageMemory(this.device, image, bufferMemory, 0n);
    ASSERT_VK_RESULT(result);

    const components = new VkComponentMapping({
      r: VK_COMPONENT_SWIZZLE_IDENTITY,
      g: VK_COMPONENT_SWIZZLE_IDENTITY,
      b: VK_COMPONENT_SWIZZLE_IDENTITY,
      a: VK_COMPONENT_SWIZZLE_IDENTITY
    });

    const subresourceRange = new VkImageSubresourceRange({
      aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
      baseMipLevel: 0,
      levelCount: 1,
      baseArrayLayer: 0,
      layerCount: 1
    });

    const imageViewInfo = new VkImageViewCreateInfo({
      image: image,
      viewType: VK_IMAGE_VIEW_TYPE_2D,
      format: VK_FORMAT_B8G8R8A8_UNORM,
      components: components,
      subresourceRange: subresourceRange
    });

    result = vkCreateImageView(this.device, imageViewInfo, null, imageView);
    ASSERT_VK_RESULT(result);

    const descriptorOutputImageInfo = new VkDescriptorImageInfo({
      sampler: null,
      imageView: imageView,
      imageLayout: VK_IMAGE_LAYOUT_GENERAL
    });

    return new VkWriteDescriptorSet({
      dstSet: descriptorSet,
      dstBinding: binding,
      dstArrayElement: 0,
      descriptorCount: 1,
      descriptorType: VK_DESCRIPTOR_TYPE_STORAGE_IMAGE,
      pImageInfo: [descriptorOutputImageInfo],
      pBufferInfo: null,
      pTexelBufferView: null
    });
  }

  createBuffer(binding, type, descriptorSet, geometries) {
    const bufferInfos = [];
    for (const g of geometries) {
      const bufferInfo = new VkDescriptorBufferInfo({
        buffer: g,
        offset: 0n,
        range: BigInt(g.length)
      });

      bufferInfos.push(bufferInfo);
    }
    return new VkWriteDescriptorSet({
      dstSet: descriptorSet,
      dstBinding: binding,
      dstArrayElement: 0,
      descriptorCount: bufferInfos.length,
      descriptorType: type,
      pBufferInfo: bufferInfos
    });
  }

  createSampler(binding, descriptorSet, imageViews, sampler) {
    const bufferInfos = [];
    for (const imageView of imageViews) {
      const descriptorImageInfo = new VkDescriptorImageInfo({
        sampler: sampler,
        imageView: imageView,
        imageLayout: VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
      });

      bufferInfos.push(descriptorImageInfo);
    }
    return new VkWriteDescriptorSet({
      dstSet: descriptorSet,
      dstBinding: binding,
      dstArrayElement: 0,
      descriptorCount: 1,
      descriptorType: VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
      pImageInfo: bufferInfos
    });
  }

  createInput(binding, descriptorSet, imageViews, sampler) {
    const bufferInfos = [];
    for (const imageView of imageViews) {
      const descriptorImageInfo = new VkDescriptorImageInfo({
        sampler: sampler,
        imageView: imageView,
        imageLayout: VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
      });

      bufferInfos.push(descriptorImageInfo);
    }
    return new VkWriteDescriptorSet({
      dstSet: descriptorSet,
      dstBinding: binding,
      dstArrayElement: 0,
      descriptorCount: 1,
      descriptorType: VK_DESCRIPTOR_TYPE_INPUT_ATTACHMENT,
      pImageInfo: bufferInfos
    });
  }

  createDescriptorSet(
    device,
    descriptorPool,
    descriptorSetLayout
  ) {
    let layouts = [];
    for (const l of this.layout.values()) {
      layouts = [...layouts, ...l];
    }

    const descriptorSets = layouts.map(() => new VkDescriptorSet());

    let variableDescriptorCountInfo = null;
    if (this.hasExtension) {
      const variableDescriptorCounts = new Uint32Array(layouts);
      variableDescriptorCountInfo = new VkDescriptorSetVariableDescriptorCountAllocateInfoEXT({
        descriptorSetCount: descriptorSets.length,
        pDescriptorCounts: variableDescriptorCounts
      });
    }

    const descriptorSetAllocateInfo = new VkDescriptorSetAllocateInfo({
      pNext: variableDescriptorCountInfo,
      descriptorPool: descriptorPool,
      descriptorSetCount: descriptorSets.length,
      pSetLayouts: descriptorSetLayout
    });

    result = vkAllocateDescriptorSets(device, descriptorSetAllocateInfo, descriptorSets);
    ASSERT_VK_RESULT(result);

    const sets = [];
    this.descriptors.forEach(d => {
      if (d.type === VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_NV) {
        sets.push(this.createAccelerationStructure(d.binding, descriptorSets[d.index], d.data));
      }

      if (d.type === VK_DESCRIPTOR_TYPE_STORAGE_IMAGE) {
        sets.push(this.createStorageImage(d.binding, descriptorSets[d.index], d.data));
      }

      if (d.type === VK_DESCRIPTOR_TYPE_STORAGE_BUFFER) {
        sets.push(...d.data.map((data, i) => this.createBuffer(d.binding, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, descriptorSets[d.index + i], data)));
      }

      if (d.type === VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER) {
        sets.push(this.createBuffer(d.binding, VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER, descriptorSets[d.index], d.data));
      }

      if (d.type === VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER) {
        sets.push(this.createSampler(d.binding, descriptorSets[d.index], d.data, d.sampler));
      }
      if (d.type === VK_DESCRIPTOR_TYPE_INPUT_ATTACHMENT) {
        sets.push(this.createInput(d.binding, descriptorSets[d.index], d.data, d.sampler));
      }
    });

    vkUpdateDescriptorSets(device, sets.length, sets, 0, null);

    return descriptorSets;
  }

  createDescriptorSetLayout(device) {
    let layouts = [];
    for (const l of this.layout.values()) {
      layouts = [...layouts, ...l];
    }
    let index = 0;
    const descriptorSetLayouts = layouts.map(() => new VkDescriptorSetLayout());

    const raygenBinding = this.descriptors.filter(d => d.index === 0).map(d => {
      return new VkDescriptorSetLayoutBinding({
        binding: d.binding,
        descriptorType: d.type,
        descriptorCount: d.descriptorCount,
        stageFlags: d.stage
      });
    });

    const layoutInfo = new VkDescriptorSetLayoutCreateInfo({
      flags: 0,
      bindingCount: raygenBinding.length,
      pBindings: raygenBinding
    });

    for (const l of this.layout.get(0)) {
      result = vkCreateDescriptorSetLayout(device, layoutInfo, null, descriptorSetLayouts[index]);
      ASSERT_VK_RESULT(result);
      index++;
    }

    if (this.layout.has(1)) {
      const hitBinding = this.descriptors.filter(d => d.index === 1).map(d => {
        return new VkDescriptorSetLayoutBinding({
          binding: d.binding,
          descriptorType: d.type,
          descriptorCount: d.descriptorCount / d.count,
          stageFlags: d.stage
        });
      });
  
      const bindingFlags = new VkDescriptorSetLayoutBindingFlagsCreateInfoEXT({
        pBindingFlags: new Int32Array([VK_DESCRIPTOR_BINDING_VARIABLE_DESCRIPTOR_COUNT_BIT_EXT]),
        bindingCount: hitBinding.length
      });
  
      const set1LayoutInfo = new VkDescriptorSetLayoutCreateInfo({
        pNext: bindingFlags,
        flags: 0,
        bindingCount: hitBinding.length,
        pBindings: hitBinding
      });
  
      for (const l of this.layout.get(1)) {
        result = vkCreateDescriptorSetLayout(device, set1LayoutInfo, null, descriptorSetLayouts[index]);
        ASSERT_VK_RESULT(result);
        index++;
      }
    }

    return descriptorSetLayouts;
  }

  createDescriptorPool(device) {
    const descriptorPool = new VkDescriptorPool();

    const poolSizes = this.descriptors.map(d => {
      return new VkDescriptorPoolSize({
        type: d.type,
        descriptorCount: d.descriptorCount
      });
    });

    const descriptorPoolInfo = new VkDescriptorPoolCreateInfo({
      flags: 0,
      maxSets: poolSizes.length,
      poolSizeCount: poolSizes.length,
      pPoolSizes: poolSizes
    });

    result = vkCreateDescriptorPool(device, descriptorPoolInfo, null, descriptorPool);
    ASSERT_VK_RESULT(result);

    return descriptorPool;
  }
}
