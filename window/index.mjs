import nvk from "nvk";

Object.assign(global, nvk);

/**
 * Creates a new window
 */
let win = new VulkanWindow({
  width: 480,
  height: 320,
  title: "Title"
});

/**
 * The current width of the window
 */
win.width;

/**
 * The current height of the window
 */
win.height;

/**
 * The current title of the window
 */
win.title;

/**
 * Programmatically closes the window
 */
//win.close();

/**
 * Programmatically focuses the window
 */
win.focus();

/**
 * Processes pending events
 * Put this call into your update/draw loop
 */
win.pollEvents();

/** 
 * Indicates if the window is about to be closed
 */
win.shouldClose();

/**
 * Array of strings containing required extensions for surface creation
 * You probably will use this in VkInstanceCreateInfo.prototype.ppEnabledExtensionNames
 */
win.getRequiredInstanceExtensions();

/**
 * Cross-platform way to create a surface
 * @param {VkInstance}
 * @param {null}
 * @param {VkSurfaceKHR}
 * Returns a VkResult
 */
//win.createSurface(instance, null, surface);

/**
 * Event triggered when the window is focused/unfocues
 */
win.onfocus = e => {
  console.log(`Focus state: ${e.focused}`);
};

/**
 * Event triggered when window is resized
 */
win.onresize = e => {
  console.log(`Window resized! Width: ${e.width} Height: ${e.height}`);
};

/**
 * Event fired before the window closes
 */
win.onclose = e => {
  console.log(`Closing window..`);
};

/**
 * Event fired when the user presses a mouse button inside the window
 */
win.onmousedown = (e) => {
  console.log(`Mouse Down! x: ${e.x} y: ${e.y} button: ${e.button}`);
};

/**
 * Event fired when the user leaves a mouse button inside the window
 */
win.onmouseup = (e) => {
  console.log(`Mouse Up! x: ${e.x} y: ${e.y} button: ${e.button}`);
};

/**
 * Event triggered when the user moves the mouse inside the window
 */
win.onmousemove = (e) => {
  console.log(`Mouse Move! x: ${e.x} y: ${e.y} movementX: ${e.movementX} movementY: ${e.movementY}`);
};

/**
 * Event triggered when the user scrolls with the mouse inside the window
 */
win.onmousewheel = (e) => {
  console.log(`Mouse Wheel! x: ${e.x} y: ${e.y} deltaX: ${e.deltaX} deltaY: ${e.deltaY}`);
};

/**
 * Event triggered when the user presses a key
 */
win.onkeydown = (e) => {
  console.log(`Key Down! keyCode: ${e.keyCode}`);
};

/**
 * Event triggered when the user leaves a key
 */
win.onkeyup = (e) => {
  console.log(`Key Up! keyCode: ${e.keyCode}`);
};

/**
 * Event triggered when dragging files into the window
 * Gives an array of strings containing paths to the files
 */
win.ondrop = e => {
  e.paths.map(path => {
    console.log(`File dropped: ${path}`);
  });
};

(function drawLoop() {
  if (!win.shouldClose()) setTimeout(drawLoop, 0);
  win.pollEvents();
})();
