# Running examples

This repository contains examples and demos for [nvk](https://github.com/maierfelix/nvk) - a [Vulkan](https://en.wikipedia.org/wiki/Vulkan_(API)) rendering API for node.js

Some examples use libraries such as [gl-matrix](http://glmatrix.net/) or the WebAssembly port of [tinyobjloader](https://github.com/maierfelix/tolw)

To compile shaders at runtime, [nvk-essentials](https://github.com/maierfelix/nvk-essentials) is used

## Building:
1. Clone this repository
2. Run `npm install`
3. Navigate into an example folder and run `npm run start --vkversion=1.1.106`

Note that the `--vkversion` flag specifies the vulkan version you want to use. Currently the recommended version is `1.1.106`.

## Previews:

#### [Compute](/compute):
<img src="https://i.imgur.com/ZBSsmZT.jpg" width="336">

 - Compute shader rendering the mandelbrot set

#### [Cube](/cube):
<img src="https://i.imgur.com/ey9XooY.gif" width="336">

 - A spinning cube, demonstrating buffer and texture upload

#### [Live Shaders](/live-shaders):

 - Demonstrates hot reloading of shaders based on file changes

 #### [RTX](/rtx):
<img src="https://i.imgur.com/ySyR8OV.jpg" width="336">

 - VK_NV_raytracing example

#### [Triangle](/triangle):
<img src="https://i.imgur.com/nGGxpsQ.gif" width="336">

 - The most basic example - A good starting point

#### [TypeScript](/typescript):

 - Example on how to setup and use ``nvk`` in TypeScript

#### [Webcam](/webcam):
<img src="https://i.imgur.com/cRrVc1N.gif" width="336">

 - A spinning webcam model using a PBR shader
 - Demonstrates ``.obj`` file uploading, uniform buffer objects and window events

#### [Window](/window):

 - Demonstrates usage of the window interface
