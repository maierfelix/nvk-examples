let result = null;

export function ASSERT_VK_RESULT(result) {
  if (result !== VK_SUCCESS) {
    throw new Error('Vulkan assertion failed!');
  }
}

export function memoryCopy(dstPtr, srcData, byteLen) {
  const dstBuffer = ArrayBuffer.fromAddress(dstPtr, byteLen);
  const srcBuffer = srcData.buffer;
  const dstView = new Uint8Array(dstBuffer);
  const srcView = new Uint8Array(srcBuffer);
  for (let ii = 0; ii < byteLen; ++ii) {
    dstView[ii] = srcView[ii];
  }
}

export function memoryCopy2(dstPtr, srcData, dstbyteLen, srcbyteLen, offset) {
  const dstBuffer = ArrayBuffer.fromAddress(dstPtr, dstbyteLen);
  const srcBuffer = srcData.buffer;
  const dstView = new Uint8Array(dstBuffer);
  const srcView = new Uint8Array(srcBuffer);
  for (let ii = offset; ii < offset + srcbyteLen; ++ii) {
    dstView[ii] = srcView[ii - offset];
  }
}

export function getMemoryTypeIndex(physicalDevice, typeFilter, propertyFlag) {
  const memoryProperties = new VkPhysicalDeviceMemoryProperties();
  vkGetPhysicalDeviceMemoryProperties(physicalDevice, memoryProperties);
  for (let ii = 0; ii < memoryProperties.memoryTypeCount; ++ii) {
    if (typeFilter & (1 << ii) && (memoryProperties.memoryTypes[ii].propertyFlags & propertyFlag) === propertyFlag) {
      return ii;
    }
  }
  return -1;
}

export function createVertexBuffer(physicalDevice, device, buffer, bufferMemory, vertices, usage, typedArray) {
  const bufferInfo = new VkBufferCreateInfo({
    size: vertices.byteLength,
    usage: usage,
    sharingMode: VK_SHARING_MODE_EXCLUSIVE,
    queueFamilyIndexCount: 0,
    pQueueFamilyIndices: null
  });
  result = vkCreateBuffer(device, bufferInfo, null, buffer);
  ASSERT_VK_RESULT(result);

  const memoryRequirements = new VkMemoryRequirements();
  vkGetBufferMemoryRequirements(device, buffer, memoryRequirements);

  const propertyFlag = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
  const memAllocInfo = new VkMemoryAllocateInfo({
    allocationSize: memoryRequirements.size,
    memoryTypeIndex: getMemoryTypeIndex(physicalDevice, memoryRequirements.memoryTypeBits, propertyFlag)
  });

  result = vkAllocateMemory(device, memAllocInfo, null, bufferMemory);
  ASSERT_VK_RESULT(result);

  result = vkBindBufferMemory(device, buffer, bufferMemory, 0n);
  ASSERT_VK_RESULT(result);

  const dataPtr = { $: 0n };

  result = vkMapMemory(device, bufferMemory, 0n, bufferInfo.size, 0, dataPtr);
  ASSERT_VK_RESULT(result);

  const verticesBuffer = ArrayBuffer.fromAddress(dataPtr.$, bufferInfo.size);
  const verticesView = new typedArray(verticesBuffer);
  for (let ii = 0; ii < vertices.length; ++ii) {
    verticesView[ii] = vertices[ii];
  }
  vkUnmapMemory(device, bufferMemory);

  return verticesView;
}
