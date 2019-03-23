import fs from 'fs';
import nvk from 'nvk';
import { performance } from 'perf_hooks';
import glm from 'gl-matrix';
const { vec3, vec4, mat4 } = glm;
import { Plane, Cube } from './geometry';
import { VkGeometryInstance, Camera, SBT, UniformStorage } from './src/objects';
import {
  createVertexBuffer,
  getMemoryTypeIndex,
  ASSERT_VK_RESULT
} from './src/utils';

let result = null;
let FRAME = 0;

Object.assign(global, nvk);

class Vulkan {
  constructor() {
    const scene = [Plane, Cube];
    this.frames = 0;
    this.t0 = 0;
    this.numMeshes = scene.length;

    const win = this.createWin();

    const instance = this.createInstance(win);
    const pDevice = this.createPhysicalDevice(instance);
    const { physicalDevice, rayTracingProperties } = pDevice;
    this.createDeviceMemory(physicalDevice);
    this.createDeviceQueue(physicalDevice);
    const device = this.createDevice(physicalDevice, pDevice.deviceFeatures);
    const queue = this.createQueue(device);
    const surface = this.createSurface(win, instance, physicalDevice);
    const swapchain = this.createSwapchain(win, surface, device);
    const { cmdBuffers, fenses, cmdPool } = this.createCommandsBuffer(device, swapchain.amountOfImagesInSwapchain);

    const semaphores = this.createSemaphore(device);
    const uboBuffer = this.RTcreateUniform(win, device, physicalDevice);

    this.instancesBufferLength = 0;
    const bAS = [];
    global.bAS = bAS;
    const geometries = [];
    const uniforms = [];
    global.uniforms = uniforms;
    let instanceCount = 0;
    for (const mesh of scene) {
      const geometry = this.createGeometry(device, physicalDevice, mesh);
      geometries.push(geometry);
      const rtgeometry = this.createRTGeometry(geometry);
      bAS.push(
        this.CreateAS(
          physicalDevice,
          device,
          VK_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL_NV,
          1,
          [rtgeometry],
          0,
          instanceCount,
          mesh.transform
        )
      );

      instanceCount++;
    }

    const tAS = this.CreateAS(physicalDevice, device, VK_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL_NV, 0, null, instanceCount);
    const scratchBuffer = this.createScratch(physicalDevice, device, bAS, tAS.accelerationStructure);
    

    const imageView = new VkImageView();
    const image = new VkImage();
    const g = [geometries.map(g => g.matBuffer), geometries.map(g => g.meshBuffer), geometries.map(g => g.facesBuffer)];
    const uniformStorage = new UniformStorage(win, device, physicalDevice, true);
    uniformStorage.addAccelerationStructure(0, 0, [tAS.accelerationStructure]);
    uniformStorage.addStorageImage(1, 0, [imageView, image]);
    uniformStorage.addUniformBuffer(VK_SHADER_STAGE_RAYGEN_BIT_NV, 2, 0, [uboBuffer.uboBuffer]);
    uniformStorage.addStorageBuffer(0, 1, 3, this.numMeshes, g);
    const descriptorPool = uniformStorage.createDescriptorPool(device);
    const descriptorSetLayout = uniformStorage.createDescriptorSetLayout(device);
    const descriptorSets = uniformStorage.createDescriptorSet(
      device,
      descriptorPool,
      descriptorSetLayout
    );

    const shaderStages = this.createShader(device, rayTracingProperties);
    const pipeline = this.createPipeline(device, shaderStages, descriptorSetLayout);

    const SBT = this.CreateSBT(physicalDevice, device, pipeline, shaderStages);

    this.createCommands(
      win,
      physicalDevice,
      device,
      cmdBuffers,
      descriptorSets,
      pipeline,
      bAS,
      tAS,
      scratchBuffer,
      SBT,
      queue,
      shaderStages,
      cmdPool,
      image,
      swapchain.swapchainImages
    );

    this.draw(win, device, swapchain.swapchain, queue, semaphores, cmdBuffers, fenses);
  }

  createInstance(win) {
    const instance = new VkInstance();
    const appInfo = new VkApplicationInfo({
      pApplicationName: 'Hello!',
      applicationVersion: VK_MAKE_VERSION(1, 0, 0),
      pEngineName: 'No Engine',
      engineVersion: VK_MAKE_VERSION(1, 0, 0),
      apiVersion: VK_API_VERSION_1_0
    });

    const validationLayers = ['VK_LAYER_LUNARG_core_validation', 'VK_LAYER_LUNARG_standard_validation'];
    const instanceExtensions = win.getRequiredInstanceExtensions();
    instanceExtensions.push('VK_KHR_get_physical_device_properties2');
    const createInfo = new VkInstanceCreateInfo({
      pApplicationInfo: appInfo,
      enabledExtensionCount: instanceExtensions.length,
      ppEnabledExtensionNames: instanceExtensions,
      enabledLayerCount: validationLayers.length,
      ppEnabledLayerNames: validationLayers
    });

    result = vkCreateInstance(createInfo, null, instance);
    ASSERT_VK_RESULT(result);

    const amountOfLayers = { $: 0 };
    vkEnumerateInstanceLayerProperties(amountOfLayers, null);
    const layers = [...Array(amountOfLayers.$)].map(() => new VkLayerProperties());
    vkEnumerateInstanceLayerProperties(amountOfLayers, layers);

    return instance;
  }

  createPhysicalDevice(instance) {
    const deviceCount = { $: 0 };
    vkEnumeratePhysicalDevices(instance, deviceCount, null);
    if (deviceCount.$ <= 0) {
      console.error('Error: No render devices available!');
    }

    const devices = [...Array(deviceCount.$)].map(() => new VkPhysicalDevice());
    result = vkEnumeratePhysicalDevices(instance, deviceCount, devices);
    ASSERT_VK_RESULT(result);

    // auto pick first found device
    const [physicalDevice] = devices;

    const descriptorIndexing = new VkPhysicalDeviceDescriptorIndexingFeaturesEXT();
    const deviceFeatures = new VkPhysicalDeviceFeatures2({
      pNext: descriptorIndexing
    });
    vkGetPhysicalDeviceFeatures2(physicalDevice, deviceFeatures);

    const rayTracingProperties = new VkPhysicalDeviceRayTracingPropertiesNV({
      maxRecursionDepth: 0,
      shaderGroupHandleSize: 0
    });

    const deviceProperties = new VkPhysicalDeviceProperties2({
      pNext: rayTracingProperties
    });

    vkGetPhysicalDeviceProperties2(physicalDevice, deviceProperties);

    console.log(`Using device: ${deviceProperties.properties.deviceName}`);

    return { physicalDevice, deviceFeatures, rayTracingProperties };
  }

  createDeviceMemory(physicalDevice) {
    const deviceMemoryProperties = new VkPhysicalDeviceMemoryProperties();
    vkGetPhysicalDeviceMemoryProperties(physicalDevice, deviceMemoryProperties);
  }

  createDeviceQueue(physicalDevice) {
    const queueFamilyCount = { $: 0 };
    vkGetPhysicalDeviceQueueFamilyProperties(physicalDevice, queueFamilyCount, null);

    const queueFamilies = [...Array(queueFamilyCount.$)].map(() => new VkQueueFamilyProperties());
    vkGetPhysicalDeviceQueueFamilyProperties(physicalDevice, queueFamilyCount, queueFamilies);
  }

  createDevice(physicalDevice, deviceFeatures) {
    const device = new VkDevice();
    const deviceQueueInfo = new VkDeviceQueueCreateInfo({
      queueFamilyIndex: 0,
      queueCount: 1,
      pQueuePriorities: new Float32Array([1.0, 1.0, 1.0, 1.0])
    });

    const deviceExtensions = [
      VK_KHR_SWAPCHAIN_EXTENSION_NAME,
      VK_NV_RAY_TRACING_EXTENSION_NAME,
      VK_KHR_GET_MEMORY_REQUIREMENTS_2_EXTENSION_NAME,
      VK_EXT_DESCRIPTOR_INDEXING_EXTENSION_NAME,
      VK_KHR_MAINTENANCE3_EXTENSION_NAME
    ];

    const deviceInfo = new VkDeviceCreateInfo({
      pNext: deviceFeatures,
      queueCreateInfoCount: 1,
      pQueueCreateInfos: [deviceQueueInfo],
      enabledExtensionCount: deviceExtensions.length,
      ppEnabledExtensionNames: deviceExtensions,
      pEnabledFeatures: null
    });

    result = vkCreateDevice(physicalDevice, deviceInfo, null, device);
    ASSERT_VK_RESULT(result);

    return device;
  }

  createQueue(device) {
    const queue = new VkQueue();
    vkGetDeviceQueue(device, 0, 0, queue);

    return queue;
  }

  createCommandsBuffer(device, amountOfImagesInSwapchain) {
    const fenceCreateInfo = new VkFenceCreateInfo({
      flags: VK_FENCE_CREATE_SIGNALED_BIT
    });

    const fenses = [...Array(amountOfImagesInSwapchain.$)].map(() => {
      const fence = new VkFence();
      vkCreateFence(device, fenceCreateInfo, null, fence);
      return fence;
    });

    const cmdPool = new VkCommandPool();

    const cmdPoolInfo = new VkCommandPoolCreateInfo({
      flags: VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT,
      queueFamilyIndex: 0
    });

    result = vkCreateCommandPool(device, cmdPoolInfo, null, cmdPool);
    ASSERT_VK_RESULT(result);

    const cmdBufferAllocInfo = new VkCommandBufferAllocateInfo({
      commandPool: cmdPool,
      level: VK_COMMAND_BUFFER_LEVEL_PRIMARY,
      commandBufferCount: amountOfImagesInSwapchain.$
    });

    const cmdBuffers = [...Array(amountOfImagesInSwapchain.$)].map(() => new VkCommandBuffer());

    result = vkAllocateCommandBuffers(device, cmdBufferAllocInfo, cmdBuffers);
    ASSERT_VK_RESULT(result);

    return { cmdBuffers, fenses, cmdPool };
  }

  createCommands(
    win,
    physicalDevice,
    device,
    cmdBuffers,
    descriptorSet,
    pipeline,
    bAS,
    tAS,
    scratchBuffer,
    SBT,
    queue,
    { sbt },
    cmdPool,
    image,
    imageViews
  ) {
    const cmdBufferBeginInfo = new VkCommandBufferBeginInfo({
      flags: VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
      pInheritanceInfo: null
    });

    const commandBufferAllocateInfo = new VkCommandBufferAllocateInfo({
      commandPool: cmdPool,
      level: VK_COMMAND_BUFFER_LEVEL_PRIMARY,
      commandBufferCount: 1
    });

    const cmdBuffer2 = new VkCommandBuffer();
    result = vkAllocateCommandBuffers(device, commandBufferAllocateInfo, [cmdBuffer2]);
    ASSERT_VK_RESULT(result);

    const subresourceRange = new VkImageSubresourceRange({
      aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
      baseMipLevel: 0,
      levelCount: 1,
      baseArrayLayer: 0,
      layerCount: 1
    });

    result = vkBeginCommandBuffer(cmdBuffer2, cmdBufferBeginInfo);
    ASSERT_VK_RESULT(result);

    const memoryBarrier = new VkMemoryBarrier({
      srcAccessMask: VK_ACCESS_ACCELERATION_STRUCTURE_WRITE_BIT_NV | VK_ACCESS_ACCELERATION_STRUCTURE_READ_BIT_NV,
      dstAccessMask: VK_ACCESS_ACCELERATION_STRUCTURE_WRITE_BIT_NV | VK_ACCESS_ACCELERATION_STRUCTURE_READ_BIT_NV
    });

    const instancesView = new Int8Array(this.instancesBufferLength);
    let offset = 0;
    for (const b of bAS) {
      instancesView.set(b.geometryInstance.view, offset);
      offset += b.geometryInstance.view.byteLength;

      vkCmdBuildAccelerationStructureNV(
        cmdBuffer2,
        b.accelerationStructureInfo,
        null,
        0,
        VK_FALSE,
        b.accelerationStructure,
        null,
        scratchBuffer,
        0
      );
      vkCmdPipelineBarrier(
        cmdBuffer2,
        VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_NV,
        VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_NV,
        0,
        1,
        [memoryBarrier],
        0,
        [],
        0,
        []
      );
    }

    const instancesBuffer = new VkBuffer();
    const bufferMemory = new VkDeviceMemory();
    global.BASbufferMemory = bufferMemory;
    createVertexBuffer(
      physicalDevice,
      device,
      instancesBuffer,
      bufferMemory,
      instancesView,
      VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Int8Array
    );

    vkCmdBuildAccelerationStructureNV(
      cmdBuffer2,
      tAS.accelerationStructureInfo,
      instancesBuffer,
      0,
      VK_FALSE,
      tAS.accelerationStructure,
      null,
      scratchBuffer,
      0
    );

    vkCmdPipelineBarrier(
      cmdBuffer2,
      VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_NV,
      VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_NV,
      0,
      1,
      [memoryBarrier],
      0,
      [],
      0,
      []
    );

    result = vkEndCommandBuffer(cmdBuffer2);
    ASSERT_VK_RESULT(result);

    const submitInfo = new VkSubmitInfo({
      waitSemaphoreCount: 0,
      pWaitSemaphores: null,
      pWaitDstStageMask: null,
      commandBufferCount: 1,
      pCommandBuffers: [cmdBuffer2],
      signalSemaphoreCount: 0,
      pSignalSemaphores: null
    });

    vkQueueSubmit(queue, 1, [submitInfo], null);
    vkQueueWaitIdle(queue);

    const cmdBufferBeginInfo2 = new VkCommandBufferBeginInfo({
      flags: 0,
      pInheritanceInfo: null
    });

    for (let ii = 0; ii < cmdBuffers.length; ++ii) {
      const cmdBuffer = cmdBuffers[ii];

      result = vkBeginCommandBuffer(cmdBuffer, cmdBufferBeginInfo2);
      ASSERT_VK_RESULT(result);

      this.ImageBarrier(
        cmdBuffer,
        image,
        subresourceRange,
        0,
        VK_ACCESS_SHADER_WRITE_BIT,
        VK_IMAGE_LAYOUT_UNDEFINED,
        VK_IMAGE_LAYOUT_GENERAL
      );

      vkCmdBindPipeline(cmdBuffer, VK_PIPELINE_BIND_POINT_RAY_TRACING_NV, pipeline.pipeline);

      vkCmdBindDescriptorSets(
        cmdBuffer,
        VK_PIPELINE_BIND_POINT_RAY_TRACING_NV,
        pipeline.pipelineLayout,
        0,
        Object.keys(descriptorSet).length,
        Object.values(descriptorSet),
        0,
        null
      );
      vkCmdTraceRaysNV(
        cmdBuffer,
        SBT,
        sbt.getRaygenOffset(),
        SBT,
        sbt.getMissOffset(),
        sbt.getStride(),
        SBT,
        sbt.getHitOffset(),
        sbt.getStride(),
        null,
        0,
        0,
        win.width,
        win.height,
        1
      );

      this.ImageBarrier(
        cmdBuffer,
        imageViews[ii],
        subresourceRange,
        0,
        VK_ACCESS_TRANSFER_WRITE_BIT,
        VK_IMAGE_LAYOUT_UNDEFINED, 
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL
      );

      this.ImageBarrier(
        cmdBuffer,
        image,
        subresourceRange,
        VK_ACCESS_SHADER_WRITE_BIT,
        VK_ACCESS_TRANSFER_READ_BIT,
        VK_IMAGE_LAYOUT_GENERAL,
        VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
      );

      let copyRegion = new VkImageCopy();
      copyRegion.srcSubresource = new VkImageSubresourceLayers({
        aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
        mipLevel:0,
        baseArrayLayer: 0, 
        layerCount: 1
      });
      copyRegion.srcOffset = new VkOffset3D({
        x: 0,
        y: 0,
        z: 0
      });
      copyRegion.dstSubresource = new VkImageSubresourceLayers({
        aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
        mipLevel:0,
        baseArrayLayer: 0, 
        layerCount: 1
      });
      copyRegion.dstOffset = new VkOffset3D({
        x: 0,
        y: 0,
        z: 0
      });
      copyRegion.extent = new VkExtent3D({
        width: win.width,
        height: win.height,
        depth: 1
      });
      vkCmdCopyImage(
        cmdBuffer,
        image,
        VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        imageViews[ii],
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        1,
        [copyRegion]
      );

      this.ImageBarrier(cmdBuffer,
        imageViews[ii], subresourceRange,
        VK_ACCESS_TRANSFER_WRITE_BIT,
        0,
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
      );

      result = vkEndCommandBuffer(cmdBuffer);
      ASSERT_VK_RESULT(result);
    }
  }

  createGeometry(device, physicalDevice, geometry) {
    const { uvs, indices, normals, vertices, color } = geometry;

    const mesh = new Float32Array(indices.length * 8);
    for (let ii = 0; ii < indices.length; ++ii) {
      const index = indices[ii];
      const offset8 = ii * 8;
      const offset3 = index * 3;
      const offset2 = index * 2;
      mesh[offset8 + 0] = normals[offset3 + 0];
      mesh[offset8 + 1] = normals[offset3 + 1];
      mesh[offset8 + 2] = normals[offset3 + 2];
      mesh[offset8 + 3] = 0;
      mesh[offset8 + 4] = uvs[offset2 + 0];
      mesh[offset8 + 5] = uvs[offset2 + 1];
      mesh[offset8 + 6] = 0;
      mesh[offset8 + 7] = 0;
    }

    const faces = new Uint32Array((indices.length / 3) * 4);
    for (let f = 0; f < indices.length / 3; ++f) {
      const a = 3 * f + 0;
      const b = 3 * f + 1;
      const c = 3 * f + 2;
      faces[4 * f + 0] = a;
      faces[4 * f + 1] = b;
      faces[4 * f + 2] = c;
    }

    const matids = color;

    const vertexBuffer = new VkBuffer();
    const vertexBufferMemory = new VkDeviceMemory();
    vertexBuffer.length = vertices.length;
    createVertexBuffer(
      physicalDevice,
      device,
      vertexBuffer,
      vertexBufferMemory,
      vertices,
      VK_BUFFER_USAGE_VERTEX_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Float32Array
    );

    const indicesBuffer = new VkBuffer();
    const indicesBufferMemory = new VkDeviceMemory();
    indicesBuffer.length = indices.length;
    indicesBuffer.type = indices.BYTES_PER_ELEMENT <= 2 ? VK_INDEX_TYPE_UINT16 : VK_INDEX_TYPE_UINT32;
    createVertexBuffer(
      physicalDevice,
      device,
      indicesBuffer,
      indicesBufferMemory,
      indices,
      VK_BUFFER_USAGE_INDEX_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Uint16Array
    );

    const facesBuffer = new VkBuffer();
    const facesBufferMemory = new VkDeviceMemory();
    facesBuffer.length = faces.byteLength;
    createVertexBuffer(
      physicalDevice,
      device,
      facesBuffer,
      facesBufferMemory,
      faces,
      VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Uint32Array
    );

    const matBuffer = new VkBuffer();
    const matBufferMemory = new VkDeviceMemory();
    matBuffer.length = matids.byteLength;
    createVertexBuffer(
      physicalDevice,
      device,
      matBuffer,
      matBufferMemory,
      matids,
      VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Float32Array
    );

    const meshBuffer = new VkBuffer();
    const meshBufferMemory = new VkDeviceMemory();
    meshBuffer.length = mesh.byteLength;
    createVertexBuffer(
      physicalDevice,
      device,
      meshBuffer,
      meshBufferMemory,
      mesh,
      VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Float32Array
    );

    const normalBuffer = new VkBuffer();
    const normalBufferMemory = new VkDeviceMemory();
    normalBuffer.length = normals.length;
    createVertexBuffer(
      physicalDevice,
      device,
      normalBuffer,
      normalBufferMemory,
      normals,
      VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,
      Float32Array
    );

    return {
      normalBuffer,
      vertexBuffer,
      indicesBuffer,
      length: indices.length,
      meshBuffer,
      matBuffer,
      facesBuffer
    };
  }

  createShader(device, rayTracingProperties) {
    const rgenSrc = getShaderFile('./shaders/ray-rgen.spv');
    const rchitSrc = getShaderFile('./shaders/ray-rchit.spv');
    const rmissSrc = getShaderFile('./shaders/ray-rmiss.spv');

    const rgenShaderModule = createShaderModule(rgenSrc, new VkShaderModule());
    const rchitShaderModule = createShaderModule(rchitSrc, new VkShaderModule());
    const rmissShaderModule = createShaderModule(rmissSrc, new VkShaderModule());

    const shaderStageInfoRgen = new VkPipelineShaderStageCreateInfo({
      stage: VK_SHADER_STAGE_RAYGEN_BIT_NV,
      module: rgenShaderModule,
      pName: 'main',
      pSpecializationInfo: null
    });
    const shaderStageInfoRchit = new VkPipelineShaderStageCreateInfo({
      stage: VK_SHADER_STAGE_CLOSEST_HIT_BIT_NV,
      module: rchitShaderModule,
      pName: 'main',
      pSpecializationInfo: null
    });
    const shaderStageInfoRmiss = new VkPipelineShaderStageCreateInfo({
      stage: VK_SHADER_STAGE_MISS_BIT_NV,
      module: rmissShaderModule,
      pName: 'main',
      pSpecializationInfo: null
    });

    const sbt = new SBT(rayTracingProperties.shaderGroupHandleSize);
    sbt.addRaygen();
    sbt.addHit();
    sbt.addMiss();

    return {
      sbt,
      shaders: [],
      groups: sbt.stages,
      stages: [shaderStageInfoRgen, shaderStageInfoRchit, shaderStageInfoRmiss]
    };

    function getShaderFile(path) {
      return new Uint8Array(fs.readFileSync(path, null));
    }

    function createShaderModule(shaderSrc, shaderModule) {
      const shaderModuleInfo = new VkShaderModuleCreateInfo({
        pCode: shaderSrc,
        codeSize: shaderSrc.byteLength
      });
      result = vkCreateShaderModule(device, shaderModuleInfo, null, shaderModule);
      ASSERT_VK_RESULT(result);
      return shaderModule;
    }
  }

  draw(win, device, swapchain, queue, semaphores, cmdBuffers, fenses) {
    FRAME++;
    if (!win.shouldClose()) {
      setTimeout(() => this.draw(win, device, swapchain, queue, semaphores, cmdBuffers, fenses), 0);
    }
    this.drawFrame(device, swapchain, queue, semaphores, cmdBuffers, fenses);
    win.pollEvents();

    const t = performance.now();
    if ((t - this.t0) > 1.0 || this.frames === 0) {
      const fps = Math.floor((this.frames / (t - this.t0)) * 1e3);
      win.title = `FPS: ${fps}`;
      this.t0 = t;
      this.frames = 0;
    }
    this.frames++;
  }

  drawFrame(device, swapchain, queue, { semaphoreImageAvailable, semaphoreRenderingAvailable }, cmdBuffers, fenses) {
    const imageIndex = { $: 0 };
    result = vkAcquireNextImageKHR(device, swapchain, Number.MAX_SAFE_INTEGER, semaphoreImageAvailable, null, imageIndex);
    ASSERT_VK_RESULT(result);

    const fence = fenses[imageIndex.$];
    result = vkWaitForFences(device, 1, [fence], VK_TRUE, Number.MAX_SAFE_INTEGER);
    ASSERT_VK_RESULT(result);
    vkResetFences(device, 1, [fence]);

    const waitStageMask = new Int32Array([VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT]);

    const submitInfo = new VkSubmitInfo({
      waitSemaphoreCount: 1,
      pWaitSemaphores: [semaphoreImageAvailable],
      pWaitDstStageMask: waitStageMask,
      commandBufferCount: 1,
      pCommandBuffers: [cmdBuffers[imageIndex.$]],
      signalSemaphoreCount: 1,
      pSignalSemaphores: [semaphoreRenderingAvailable]
    });

    result = vkQueueSubmit(queue, 1, [submitInfo], fence);
    ASSERT_VK_RESULT(result);

    const presentInfo = new VkPresentInfoKHR({
      waitSemaphoreCount: 1,
      pWaitSemaphores: [semaphoreRenderingAvailable],
      swapchainCount: 1,
      pSwapchains: [swapchain],
      pImageIndices: new Uint32Array([imageIndex.$]),
      pResults: null
    });

    result = vkQueuePresentKHR(queue, presentInfo);
    ASSERT_VK_RESULT(result);
  }

  createWin() {
    return new VulkanWindow({
      width: 1200,
      height: 720,
      title: 'nvk triangle'
    });
  }

  createSemaphore(device) {
    const semaphoreImageAvailable = new VkSemaphore();
    const semaphoreRenderingAvailable = new VkSemaphore();
    const semaphoreInfo = new VkSemaphoreCreateInfo();

    result = vkCreateSemaphore(device, semaphoreInfo, null, semaphoreImageAvailable);
    ASSERT_VK_RESULT(result);
    result = vkCreateSemaphore(device, semaphoreInfo, null, semaphoreRenderingAvailable);
    ASSERT_VK_RESULT(result);

    return { semaphoreImageAvailable, semaphoreRenderingAvailable };
  }

  createSurface(win, instance, physicalDevice) {
    const surface = new VkSurfaceKHR();
    result = win.createSurface(instance, null, surface);
    ASSERT_VK_RESULT(result);

    const surfaceCapabilities = new VkSurfaceCapabilitiesKHR();
    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(physicalDevice, surface, surfaceCapabilities);

    const surfaceFormatCount = { $: 0 };
    vkGetPhysicalDeviceSurfaceFormatsKHR(physicalDevice, surface, surfaceFormatCount, null);
    const surfaceFormats = [...Array(surfaceFormatCount.$)].map(() => new VkSurfaceFormatKHR());
    vkGetPhysicalDeviceSurfaceFormatsKHR(physicalDevice, surface, surfaceFormatCount, surfaceFormats);

    const presentModeCount = { $: 0 };
    vkGetPhysicalDeviceSurfacePresentModesKHR(physicalDevice, surface, presentModeCount, null);
    const presentModes = new Int32Array(presentModeCount.$);
    vkGetPhysicalDeviceSurfacePresentModesKHR(physicalDevice, surface, presentModeCount, presentModes);

    const surfaceSupport = { $: false };
    vkGetPhysicalDeviceSurfaceSupportKHR(physicalDevice, 0, surface, surfaceSupport);
    if (!surfaceSupport) {
      console.error('No surface creation support!');
    }

    return surface;
  }

  createSwapchain(win, surface, device) {
    const swapchain = new VkSwapchainKHR();

    const imageExtent = new VkExtent2D({
      width: win.width,
      height: win.height
    });

    const swapchainInfo = new VkSwapchainCreateInfoKHR({
      surface: surface,
      minImageCount: 3,
      imageFormat: VK_FORMAT_B8G8R8A8_UNORM,
      imageColorSpace: VK_COLOR_SPACE_SRGB_NONLINEAR_KHR,
      imageExtent: imageExtent,
      imageArrayLayers: 1,
      imageUsage: VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT,
      imageSharingMode: VK_SHARING_MODE_EXCLUSIVE,
      queueFamilyIndexCount: 0,
      preTransform: VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR,
      compositeAlpha: VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
      presentMode: VK_PRESENT_MODE_FIFO_KHR,
      clipped: VK_TRUE,
      oldSwapchain: null
    });

    result = vkCreateSwapchainKHR(device, swapchainInfo, null, swapchain);
    ASSERT_VK_RESULT(result);

    const amountOfImagesInSwapchain = { $: 0 };
    vkGetSwapchainImagesKHR(device, swapchain, amountOfImagesInSwapchain, null);
    const swapchainImages = [...Array(amountOfImagesInSwapchain.$)].map(() => new VkImage());

    result = vkGetSwapchainImagesKHR(device, swapchain, amountOfImagesInSwapchain, swapchainImages);
    ASSERT_VK_RESULT(result);

    const imageViews = [...Array(amountOfImagesInSwapchain.$)].map(() => new VkImageView());
    for (let ii = 0; ii < amountOfImagesInSwapchain.$; ++ii) {
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
        image: swapchainImages[ii],
        viewType: VK_IMAGE_VIEW_TYPE_2D,
        format: VK_FORMAT_B8G8R8A8_UNORM,
        components: components,
        subresourceRange: subresourceRange
      });

      result = vkCreateImageView(device, imageViewInfo, null, imageViews[ii]);
      ASSERT_VK_RESULT(result);
    }

    return { swapchain, amountOfImagesInSwapchain, imageViews, swapchainImages };
  }

  createPipeline(device, shaders, descriptorSetLayout) {
    const pipelineLayout = new VkPipelineLayout();
    const pipelineLayoutInfo = new VkPipelineLayoutCreateInfo({
      setLayoutCount: descriptorSetLayout.length,
      pSetLayouts: descriptorSetLayout,
      pushConstantRangeCount: 0
    });

    result = vkCreatePipelineLayout(device, pipelineLayoutInfo, null, pipelineLayout);
    ASSERT_VK_RESULT(result);

    const pipeline = new VkPipeline();

    const rayPipelineInfo = new VkRayTracingPipelineCreateInfoNV({
      flags: 0,
      groupCount: shaders.groups.length,
      stageCount: shaders.stages.length,
      pStages: shaders.stages,
      pGroups: shaders.groups,
      maxRecursionDepth: 1,
      layout: pipelineLayout,
      basePipelineHandle: null,
      basePipelineIndex: 0
    });

    result = vkCreateRayTracingPipelinesNV(device, null, 1, [rayPipelineInfo], null, [pipeline]);
    ASSERT_VK_RESULT(result);

    return { pipeline, pipelineLayout };
  }

  RTcreateUniform(win, device, physicalDevice) {
    const projection = mat4.create();
    const cameraMatrix = mat4.create();
    const view = mat4.create();
    mat4.translate(cameraMatrix, cameraMatrix, vec3.fromValues(0, -4, 10));
    mat4.rotate(cameraMatrix, cameraMatrix, (180 * Math.PI) / 180, vec3.fromValues(0.0, 1.0, 0.0));
    mat4.invert(view, cameraMatrix);

    const near = 1; 
    const far = 100; 
    const fovy = (65.0 * Math.PI) / 180;
    mat4.perspective(projection, fovy, win.width/win.height, near, far);

    const camera = new Camera();
    camera.matrix = cameraMatrix;
    camera.viewMatrix = view;
    camera.projection = projection;

    const light = mat4.create();
    mat4.translate(light, light, vec3.fromValues(0, 0.3, 0.5));

    camera.update('sunPosAndAmbient', vec4.fromValues(light[12], light[13], light[14], 0.1));
    camera.update('camPos', vec4.fromValues(view[12], view[13], view[14], 0));
    camera.update('camDir', vec4.fromValues(view[2], view[6], view[10], 0));
    camera.update('camUp', vec4.fromValues(view[1], view[5], view[9], 0));
    camera.update('camSide', vec4.fromValues(view[0], view[4], view[8], 0));
    camera.update('camNearFarFov', vec4.fromValues(near, far, fovy, 0));
    camera.update('gFrameCount', new Float32Array([FRAME, FRAME, FRAME, FRAME]));

    const uboBuffer = new VkBuffer();
    uboBuffer.length = camera.view.byteLength;
    const uboBufferMemory = new VkDeviceMemory();
    createVertexBuffer(
      physicalDevice,
      device,
      uboBuffer,
      uboBufferMemory,
      camera.view,
      VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Int8Array
    );

    return { uboBuffer, uboBufferMemory, ubo: camera.view, camera, light };
  }

  createRTGeometry({ vertexBuffer, indicesBuffer }) {
    const triangles = new VkGeometryTrianglesNV({
      vertexData: vertexBuffer,
      vertexOffset: 0,
      vertexCount: vertexBuffer.length / 3,
      vertexStride: 3 * Float32Array.BYTES_PER_ELEMENT,
      vertexFormat: VK_FORMAT_R32G32B32_SFLOAT,
      indexData: indicesBuffer,
      indexOffset: 0,
      indexCount: indicesBuffer.length,
      indexType: indicesBuffer.type,
      transformData: null,
      transformOffset: 0
    });

    const aabb = new VkGeometryAABBNV();

    const geometry = new VkGeometryNV({
      flags: VK_GEOMETRY_OPAQUE_BIT_NV,
      geometryType: VK_GEOMETRY_TYPE_TRIANGLES_NV,
      geometry: new VkGeometryDataNV({
        triangles: triangles,
        aabbs: aabb
      }),
    });

    return geometry;
  }

  CreateAS(physicalDevice, device, type, geometryCount, geometries, instanceCount, instanceId, transform) {
    const accelerationStructureInfo = new VkAccelerationStructureInfoNV({
      type: type,
      flags: VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_NV,
      geometryCount: geometryCount,
      instanceCount: instanceCount,
      pGeometries: geometries
    });

    const accelerationStructureCreateInfo = new VkAccelerationStructureCreateInfoNV({
      info: accelerationStructureInfo,
      compactedSize: 0
    });

    const accelerationStructure = new VkAccelerationStructureNV();
    result = vkCreateAccelerationStructureNV(device, accelerationStructureCreateInfo, null, accelerationStructure);
    ASSERT_VK_RESULT(result);

    const memoryRequirementsInfo = new VkAccelerationStructureMemoryRequirementsInfoNV({
      type: VK_ACCELERATION_STRUCTURE_MEMORY_REQUIREMENTS_TYPE_OBJECT_NV,
      accelerationStructure: accelerationStructure
    });

    const memoryRequirements = new VkMemoryRequirements2KHR();
    vkGetAccelerationStructureMemoryRequirementsNV(device, memoryRequirementsInfo, memoryRequirements);

    const memoryAllocateInfo = new VkMemoryAllocateInfo({
      allocationSize: memoryRequirements.memoryRequirements.size,
      memoryTypeIndex: getMemoryTypeIndex(
        physicalDevice,
        memoryRequirements.memoryRequirements.memoryTypeBits,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
      )
    });

    const bufferMemory = new VkDeviceMemory();
    result = vkAllocateMemory(device, memoryAllocateInfo, null, bufferMemory);
    ASSERT_VK_RESULT(result);

    const bindInfo = new VkBindAccelerationStructureMemoryInfoNV({
      accelerationStructure: accelerationStructure,
      memory: bufferMemory,
      memoryOffset: 0,
      deviceIndexCount: 0,
      pDeviceIndices: null
    });

    result = vkBindAccelerationStructureMemoryNV(device, 1, [bindInfo]);
    ASSERT_VK_RESULT(result);

    const dataPtr = { $: 0n };
    const handle = new BigInt64Array([dataPtr.$]);
    result = vkGetAccelerationStructureHandleNV(device, accelerationStructure, BigInt64Array.BYTES_PER_ELEMENT, handle.buffer);
    ASSERT_VK_RESULT(result);

    let geometryInstance;
    if (instanceId !== undefined) {
      geometryInstance = new VkGeometryInstance();
      geometryInstance.update('transform', transform);
      geometryInstance.layout.instanceId[0] = instanceId;
      geometryInstance.layout.mask[0] = 0xff;
      geometryInstance.layout.flags[0] = VK_GEOMETRY_INSTANCE_TRIANGLE_CULL_DISABLE_BIT_NV;
      geometryInstance.update('accelerationStructureHandle', handle);

      this.instancesBufferLength += geometryInstance.view.byteLength;
    }

    return { accelerationStructure, accelerationStructureInfo, geometryInstance };
  }

  createScratch(physicalDevice, device, bAS, tAS) {
    let maximumBlasSize = 0;

    for (const b of bAS) {
      const memoryRequirementsInfo = new VkAccelerationStructureMemoryRequirementsInfoNV({
        type: VK_ACCELERATION_STRUCTURE_MEMORY_REQUIREMENTS_TYPE_BUILD_SCRATCH_NV,
        accelerationStructure: b.accelerationStructure
      });

      const memReqBLAS = new VkMemoryRequirements2KHR();
      vkGetAccelerationStructureMemoryRequirementsNV(device, memoryRequirementsInfo, memReqBLAS);

      maximumBlasSize = Math.max(maximumBlasSize, memReqBLAS.memoryRequirements.size);
    }

    const memReqTLAS = new VkMemoryRequirements2KHR();
    const memoryRequirementsInfo = new VkAccelerationStructureMemoryRequirementsInfoNV({
      type: VK_ACCELERATION_STRUCTURE_MEMORY_REQUIREMENTS_TYPE_BUILD_SCRATCH_NV,
      accelerationStructure: tAS
    });

    vkGetAccelerationStructureMemoryRequirementsNV(device, memoryRequirementsInfo, memReqTLAS);

    const scratchBufferSize = Math.max(maximumBlasSize, memReqTLAS.memoryRequirements.size);

    const buffer = new VkBuffer();
    const bufferMemory = new VkDeviceMemory();
    createVertexBuffer(
      physicalDevice,
      device,
      buffer,
      bufferMemory,
      new Uint8Array(scratchBufferSize),
      VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Uint8Array
    );

    return buffer;
  }

  CreateSBT(physicalDevice, device, pipeline, { stages, sbt }) {
    const sbtSize = sbt.getSize();

    const buffer = new VkBuffer();
    const bufferMemory = new VkDeviceMemory();
    const mem = createVertexBuffer(
      physicalDevice,
      device,
      buffer,
      bufferMemory,
      new Uint8Array(sbtSize),
      VK_BUFFER_USAGE_TRANSFER_SRC_BIT | VK_BUFFER_USAGE_RAY_TRACING_BIT_NV,
      Uint8Array
    );

    result = vkGetRayTracingShaderGroupHandlesNV(device, pipeline.pipeline, 0, stages.length, sbtSize, mem.buffer);
    ASSERT_VK_RESULT(result);

    return buffer;
  }

  ImageBarrier(commandBuffer, image, subresourceRange, srcAccessMask, dstAccessMask, oldLayout, newLayout) {
    const imageMemoryBarrier = new VkImageMemoryBarrier({
      srcAccessMask: srcAccessMask,
      dstAccessMask: dstAccessMask,
      oldLayout: oldLayout,
      newLayout: newLayout,
      srcQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
      dstQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
      image: image,
      subresourceRange: subresourceRange
    });

    vkCmdPipelineBarrier(commandBuffer, VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, 0, 0, null, 0, null, 1, [
      imageMemoryBarrier
    ]);
  }
}

new Vulkan();
