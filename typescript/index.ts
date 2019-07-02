import * as nvk from "nvk/generated/1.1.106/win32/index";

Object.assign(global, nvk);

let win = new VulkanWindow({
  width: 480,
  height: 320,
  title: "typescript-example"
});

let instance = new VkInstance();

let appInfo = new VkApplicationInfo({
  pApplicationName: "Hello!",
  applicationVersion: VK_MAKE_VERSION(1, 0, 0),
  pEngineName: "No Engine",
  engineVersion: VK_MAKE_VERSION(1, 0, 0),
  apiVersion: VK_API_VERSION_1_0
});

let validationLayers = [];
let instanceExtensions = win.getRequiredInstanceExtensions();

let instanceInfo = new VkInstanceCreateInfo();
instanceInfo.sType = VkStructureType.VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
instanceInfo.pApplicationInfo = appInfo;
instanceInfo.enabledLayerCount = validationLayers.length;
instanceInfo.ppEnabledLayerNames = validationLayers;
instanceInfo.enabledExtensionCount = instanceExtensions.length;
instanceInfo.ppEnabledExtensionNames = instanceExtensions;

let result = vkCreateInstance(instanceInfo, null, instance);
if (result !== VkResult.VK_SUCCESS) throw `Failed to create VkInstance!`;

setInterval(() => {
  win.pollEvents();
}, 1e3 / 60);

let amountOfLayers = { $: 0 };
vkEnumerateInstanceLayerProperties(amountOfLayers, null);
let layers = new Array(amountOfLayers.$).fill(null).map(() => new VkLayerProperties());
vkEnumerateInstanceLayerProperties(amountOfLayers, layers);
