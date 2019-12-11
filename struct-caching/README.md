# Struct Caching

This example demonstrates automatic struct caching (or "fake stack allocation") to reduce Garbage Collector pressure in code hot spots.

Imagine the following situation:
````js
let commandBuffers = [...Array(8)].map(() => new VkCommandBuffer());
for (let ii = 0; ii < commandBuffers.length; ++ii) {
  let commandBufferBeginInfo = new VkCommandBufferBeginInfo();
  vkBeginCommandBuffer(commandBuffers[ii], cmdBufferBeginInfo);
  ...
};
````
This results in *8* allocations of `VkCommandBufferBeginInfo` structures. When this code gets executed in frequently used code sections, the heap pressure will be high.

Now *nvk* has a mechanism to simulate stack allocation:
````js
let commandBuffers = [...Array(8)].map(() => new VkCommandBuffer());
for (let ii = 0; ii < commandBuffers.length; ++ii) {
  let commandBufferBeginInfo = VkCommandBufferBeginInfo("0x0"); // cached
  vkBeginCommandBuffer(commandBuffers[ii], cmdBufferBeginInfo);
  ...
};
````

Open the [bundle.js](https://github.com/maierfelix/nvk-examples/blob/master/struct-caching/bundle.js) file to see the processed output of the plugin.

On the first iteration of the loop, a `VkCommandBufferBeginInfo` structure is allocated on the heap but also gets cached internally. Based on the String id `0x0` you have added, *nvk* uses this id to identify this structure and return a cached one whenever this code gets executed again.

Now obviously, you don't want to add your own ids to each structure by hand. There is a [rollup](https://rollupjs.org/) plugin, which detects *nvk* structure calls (when invoked without `new`) and inserts a unique id automatically. You can find this plugin [here](https://www.npmjs.com/package/nvk-struct-cache).
