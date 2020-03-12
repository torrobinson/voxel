// BEGIN RENDERING

var ticksPerSecond = 20;

var debug = true;
var debugSegments = true;
var lodFalloff = true;
var falloffStepAmount = 0.025;
var enableFade = false;

var worldWidth = 0;
var worldHeight = 0;
var scaleHeight = 300;

// Represents much the view is scaled up compared to the map. Derived later.
var scaleX = 0;
var scaleY = 0;

var debugScaleX = 0;
var debugScaleY = 0;

var colorImageData = null;
var heightImageData = null;
var frameImageData = null;

var playView = {
    canvasHeight: 400,
    canvasWidth: 600,
    context: null,
    canvasElement: null,
    pixelRatio: null,
    initialWidth: null,
    initialHeight: null,
};


var debugView = {
    canvasHeight: 300,
    canvasWidth: 300,
    context: null,
    canvasElement: null,
    pixelRatio: null,
    initialWidth: null,
    initialHeight: null,
};

var camera = {
    sky: {
        color: {
            r: 255,
            g: 255,
            b: 255
        }
    },
    fov: 60.00,
    position: {
        x: 925,//Math.ceil(worldWidth / 2.0) - 0, // Default in the middle
        y: 525,//Math.ceil(worldHeight / 2.0) - 0, // Default in the middle
        z: 0.05 * scaleHeight // Start 5% off the ground
    },
    velocity: {
        x: 0.00,
        y: 0.00,
        z: 0.00,
        friction:{
            x: 0.008, // per tick
            y: 0.008, // per tick
            z: 0.008  // per tick
        }
    },
    speeds: {
        x: 0.04,  // per tick
        y: 0.04,  // per tick
        z: 0.04,  // per tick
        max: {
            x: 2,
            y: 2,
            z: 2
        }
    },
    maxHeight: 1000,
    viewdistance: 500,
    horizon: 0 // Default the horizon to drawing in the exact middle
};

var allViews = [playView, debugView];

function getPixelRatio(context) {
  dpr = window.devicePixelRatio || 1,
    bsr = context.webkitBackingStorePixelRatio ||
    context.mozBackingStorePixelRatio ||
    context.msBackingStorePixelRatio ||
    context.oBackingStorePixelRatio ||
    context.backingStorePixelRatio || 1;
    return dpr / bsr;
}


function rescale(view) {
  var width = view.initialWidth * view.pixelRatio;
  var height = view.initialHeight * view.pixelRatio;
  if (width != view.context.canvas.width)
    view.context.canvas.width = width;
  if (height != view.context.canvas.height)
    view.context.canvas.height = height;

  view.context.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
}

function getSharpPixel(view, thickness, pos) {
  if (thickness % 2 == 0) {
    return pos;
  }
  return pos + view.pixelRatio / 2;
}

function init(view, canvasElementId){
    view.canvasElement = document.getElementById(canvasElementId);
    view.canvasElement.style.height = view.canvasHeight;
    view.canvasElement.style.width = view.canvasWidth;
    view.context = view.canvasElement.getContext("2d");
    view.pixelRatio = getPixelRatio(view.context);
    view.initialWidth = view.canvasElement.clientWidth * view.pixelRatio;
    view.initialHeight = view.canvasElement.clientHeight * view.pixelRatio;
    rescale(view);
}

function drawLine(view, options) {
    view.context.beginPath();
    view.context.lineWidth = options.width * view.pixelRatio;
    view.context.strokeStyle = options.color;
    view.context.moveTo(getSharpPixel(view,options.width, options.fromX), getSharpPixel(view,options.width, options.fromY));
    view.context.lineTo(getSharpPixel(view,options.width, options.toX), getSharpPixel(view,options.width, options.toY));
    view.context.stroke();
};


function drawPixelToBuffer(imageData, x, y, r, g, b, a) {
    index = (x + y * imageData.width) * 4;
    imageData.data[index+0] = r;
    imageData.data[index+1] = g;
    imageData.data[index+2] = b;
    imageData.data[index+3] = a;
}

function drawFrameBufferLineToBottom(imageData, lengthDown, x, y, r, g, b){
    for(var i=0;i<lengthDown;i++){
        drawPixelToBuffer(imageData, x, y+i, r, g, b, 255);
    }
}


// Math
// JS trig functions normally accepts radians, not degrees. We use degrees.
function tanDegrees(degrees) {
  return Math.tan(degrees * Math.PI/180);
}
function sinDegrees(degrees) {
  return Math.sin(degrees * Math.PI/180);
}
function cosDegrees(degrees) {
  return Math.cos(degrees * Math.PI/180);
}
// Because javascript doesn't handle negative mod the way you'd expect
function mod(n, m) {
  return ((n % m) + m) % m;
}
// End Math

function drawLineToBottom(view, options) {
    drawLine(view, {
        fromX: options.fromX, fromY: options.fromY,
        toX: options.fromX, toY: view.canvasHeight,
        width: options.width,
        color: options.color
    })
};

function drawCircle(view, options){
    view.context.strokeStyle = options.color || "black";
    view.context.beginPath();
    view.context.arc(options.x, options.y, options.radius, 0, Math.PI * 2, true);
    view.context.stroke();
}

function gameTickElapsed(millisecondsProgressed){
    if(millisecondsProgressed === undefined || isNaN(millisecondsProgressed)) return;

    var ticksElapsed =  millisecondsProgressed / ticksPerSecond;

    // Based on key states, affect run movement
    if(moveForwardPressed) moveForward();
    if(downBackPressed) moveBackward();
    if(moveLeftPressed) moveLeft();
    if(moveRightPressed) moveRight();
    if(risePressed) moveUp();
    if(fallPressed) moveDown();

    // Constantly apply a negative velocity to our movement velocity
    if(camera.velocity.x > 0) camera.velocity.x -= camera.velocity.friction.x;
    else if(camera.velocity.x < 0) camera.velocity.x += camera.velocity.friction.x;

    if(camera.velocity.y > 0) camera.velocity.y -= camera.velocity.friction.y;
    else if(camera.velocity.y < 0) camera.velocity.y += camera.velocity.friction.y;

    if(camera.velocity.z > 0) camera.velocity.z -= camera.velocity.friction.z;
    else if(camera.velocity.z < 0) camera.velocity.z += camera.velocity.friction.z;

    // And stop if we're slow enough
    var stopThreshold = 0.00001;
    if(camera.velocity.x != 0 && Math.abs(camera.velocity.x) < stopThreshold) camera.velocity.x = 0;
    if(camera.velocity.y != 0 && Math.abs(camera.velocity.y) < stopThreshold) camera.velocity.y = 0;
    if(camera.velocity.z != 0 && Math.abs(camera.velocity.z) < stopThreshold) camera.velocity.z = 0;

    // Set camera position based on velocity
    camera.position.x += camera.velocity.x * ticksElapsed;
    camera.position.y += camera.velocity.y * ticksElapsed;
    camera.position.z += camera.velocity.z * ticksElapsed;

    // Wrap us around the map if we just left it
    ensureInMap();

    // Ensure we can't clip into the map
    ensureAboveGround();
}

var lastRender;
function renderLoop(timestamp){
    var millisecondsBetweenRenders = timestamp - lastRender;

    gameTickElapsed(millisecondsBetweenRenders)

    // Render
    if(debug){renderDebugView();}
    renderPlayView();

    lastRender =  timestamp;

    // And loop
    requestAnimationFrame(renderLoop);
}

// TODO: USE
function rotatePointAroundOrigin(x, y, originX, originY, degrees){
    // Translate point to origin, rotate it, then shift back away from origin in opposite direction to "rotate" it around the origin
    // https://stackoverflow.com/a/12161405/1669011
    var newX = originX + (x-originX)*cosDegrees(x) - (y-originY)*sinDegrees(degrees);
    var newY = originY + (x-originX)*sinDegrees(x) + (y-originY)*cosDegrees(degrees);
    return {x: newX, y: newY};
}

function renderPlayView(){

    // Clear the image data
    frameImageData = playView.context.createImageData(playView.canvasWidth, playView.canvasHeight);

    // paint the sky
    // for(var i=0; i<= frameImageData.data.length; i+=4){
    //     frameImageData.data[i] = camera.sky.color.r;
    //     frameImageData.data[i+1] = camera.sky.color.g;
    //     frameImageData.data[i+2] = camera.sky.color.b;
    //     frameImageData.data[i+3] = 255;
    // }

    var percentFromBackToFade = 0.50;
    var layersFromBackToFade = camera.viewdistance * percentFromBackToFade;
    var maxFadeAdd= 255.0;
    var fadePerLayer = maxFadeAdd/layersFromBackToFade;

    // XXX
    var z = 1;
    var stepLength = 1;
    var tallestLineStartYsPerX = new Array(playView.canvasWidth).fill(playView.canvasHeight);
    while(z < camera.viewdistance){

        // At that distance, we visualize a line of "voxels" that we'll source color and height info from

        // Get the left point and the right point we'll render inbetween

        // We need the distanct left and right of the camera center
        //+
        //|                       +-> WE NEED TO KNOW THIS
        //| distance <------+     |
        //| away            |     |
        //|       XXXXXXXXXX|XXXXXXXXXXXX
        //|        X        |X       + X
        //|         X       |X       |X
        //|          X      |X       |
        //|           X     +X      X|
        //|            X     X     X +------->180-90-(fov/2)
        //|             X    X    X
        //|              X   X   X
        //|               X  X +X
        //|                X X |
        //|                 XXX+--------------------->FOV / 2
        //|                  X
        //+--------------------------------+

        // Since tan(Θ) = opp/adja
        // tan(180-90-(fov/2)) = (distance away to render) / X
        // tan(90-0.5fov) = z / x
        // x = z/(tan*(90-0.5fov))
        // So...
        var hdist = z/(tanDegrees(90-(camera.fov/2)));
        var leftMostPointX = camera.position.x - hdist;
        var rightMostPointX = camera.position.x + hdist;

        // What percent of voxel current distance row is of screenspace?
        var voxelRowToScreenRatio = (rightMostPointX - leftMostPointX) / playView.canvasWidth;

        var layerFadeAdd;
        if(enableFade && (z >= camera.viewdistance - layersFromBackToFade)){
            layerFadeAdd = Math.abs(camera.viewdistance-layersFromBackToFade-z)*fadePerLayer;
        }
        else{
            layerFadeAdd = 0;
        }

        // Debug the voxel rows
         if(debug && debugSegments){
             drawLine(debugView, {
                 fromX: Math.ceil(leftMostPointX * debugScaleX),
                 fromY: (camera.position.y - z) * debugScaleX,
                 toX: Math.ceil(rightMostPointX * debugScaleX),
                 toY: (camera.position.y - z) * debugScaleX,
                 width: 1,
                 color: 'rgba(255,255,255,0.5)'
             });
         }

        // For each pixel in the screen width I need to fill up
        for(var screenX = 0; screenX < playView.canvasWidth; screenX++){

            // Translate the screenspace coordinate (viewX, z) into the map coordinate
            var mapPoint = {
                x: Math.ceil(leftMostPointX + (screenX * voxelRowToScreenRatio)),
                y: Math.ceil(camera.position.y - z)
            };

            var altitudeModifier = getHeightAt(mapPoint.x, mapPoint.y);
            var color = getColorAt(mapPoint.x, mapPoint.y);


            if(layerFadeAdd > 0)
                color = fade(color, layerFadeAdd);

            var screenY = Math.ceil(
                (camera.position.z - altitudeModifier * scaleHeight)    // render lower the higher the camera is
                / z * scaleHeight                                       // and lower proportional to distance from camera (fake perspective)
                + camera.horizon                                        // and lower still to move this false horizon to the center of the "screen"
            );


            // Drawing at anything off screen is useless
            if(screenY<playView.canvasHeight){

                // Calculate how far down we're about to draw by sourcing it from our known max heights
                // This defaults to the screen height (or the very bottom) so we're safe to use it before
                // it gets properly filled (it's been prefilled with screenheight)
                var lengthToDrawDown = tallestLineStartYsPerX[screenX] - screenY;

                // If we're actually doing to draw anything
                if(lengthToDrawDown > 0){

                    drawFrameBufferLineToBottom(frameImageData,
                        lengthToDrawDown,       // length down to draw
                        screenX,                //x origin
                        screenY,                //y origin
                        color[0],               // pixel r
                        color[1],               // pixel g
                        color[2]                // pixel b
                     );
                }

                // Note the tallest heigh so we dont render overtop of it again for this frame
                if(screenY < tallestLineStartYsPerX[screenX]){
                    tallestLineStartYsPerX[screenX] = screenY;
                }
            }

        }

        // Increase our render distance to draw the next slice
        if(lodFalloff){
            stepLength+=falloffStepAmount;
        }
        z+=stepLength;
    }

    // Put the image data to the screen
    // NOTE: I tried using the canva's built-in helpers for drawing lines, but setInterval(function () {
    // was nearly four times as slow. Hilariously, the slowest part was setting the stroke color (???)
    playView.context.putImageData(frameImageData,0,0);
}

function renderDebugView(){
    // Draw the color map in the background
    debugView.context.drawImage(
        colorHolderCanvas, // the image to draw (which is our color image canvas where we already store the image)
        0, // x
        0, // y
        debugView.canvasWidth, // stretch it into the debug size
        debugView.canvasHeight
    );

    // Draw camera
    drawCircle(debugView,{
        x: camera.position.x * debugScaleX ,
        y: camera.position.y * debugScaleY,
        radius: 3,
        color: 'red'
    });

    var hdist = camera.viewdistance/(tanDegrees(90-(camera.fov/2)));
    var leftMostPointX = camera.position.x - hdist;
    var rightMostPointX = camera.position.x + hdist;

    // Draw the FOV
    // Left
    drawLine(debugView,{
        fromX: camera.position.x * debugScaleX,
        fromY: camera.position.y * debugScaleY,
        toX: (leftMostPointX) * debugScaleX,
        toY: (camera.position.y - camera.viewdistance) * debugScaleY,
        width: 1,
        color: 'red'
    });
    // Right
    drawLine(debugView,{
        fromX: camera.position.x * debugScaleX,
        fromY: camera.position.y * debugScaleY,
        toX: (rightMostPointX) * debugScaleX,
        toY: (camera.position.y - camera.viewdistance) * debugScaleY,
        width: 1,
        color: 'red'
    });

}


// END RENDERING


// START IMAGE

// Loads an image and pushes it to a callback
function loadImage(url, callback) {
  return new Promise(resolve => {
    const image = new Image();
    image.addEventListener('load', () => {
        callback(image);
        resolve();
    });
    image.src = url; // Trigger the load, which will call the load callback when complete
  });
}


function wrapNumber(index,length){
    if(index < 0 || index > length){
        index = mod(index,length);
    }
    return index;
}
function get1DArrayValueAtCoordinates(imageData,x,y){
    // Image coords aren't 0-index. Correct that.
    x=Math.ceil(--x);
    y=Math.ceil(--y);

    // Wrap the x/y coords into postive numbers so that our renderer wraps horizontally and vertically
    y = wrapNumber(y, imageData.height);
    x = wrapNumber(x, imageData.width);

    // Our image data is stored as an array of 0->255 values representing r,g,b,a in a 1D format.
    // Get the value by skipping in groups of 4
    var index = (x + y * imageData.width) * 4;
    // r,g,b,a
    return [
            imageData.data[index],
            imageData.data[index + 1],
            imageData.data[index + 2],
            imageData.data[index + 3]
        ];
}

// Get the height map's color at a set of coordinates
function getHeightAt(x,y){
    return get1DArrayValueAtCoordinates(heightImageData,x,y)[0]/255;
}
function getColorAt(x,y){
    return  get1DArrayValueAtCoordinates(colorImageData,x,y);
}
function fade(color,amount){
    // "Fade" by arbitrarily adding the same namber to r/g/b, which adds white and makes it brighter
    return [
        color[0] - amount,
        color[1] - amount,
        color[2] - amount,
        color[3]
    ];
};

// END IMAGE



function pd(e) {e.preventDefault();}





// MAIN
var colorHolderCanvas = null;
var heightHolderCanvas = null;

window.onload = function(){

	// Define our source map files
	var cacheAvoidance = "?t=" + new Date().getTime();
	var colorFile = "color.png";
	var heightFile = "height.png";

    // Get the color/height images
    Promise.all([

        loadImage(colorFile + cacheAvoidance,  (img) => {
            // Draw it to the preview
            colorHolderCanvas = document.getElementById('colorHolderCanvas');
            colorHolderCanvas.width = img.width;
            colorHolderCanvas.height = img.height;
            colorHolderCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

            // Load colors
            colorImageData =  colorHolderCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
        }),

        loadImage(heightFile + cacheAvoidance,  (img) => {
            // Draw it to the preview
            heightHolderCanvas = document.getElementById('heightHolderCanvas');
            heightHolderCanvas.width = img.width;
            heightHolderCanvas.height = img.height;
            heightHolderCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

            // Load heights
            heightImageData =  heightHolderCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);

            worldWidth = img.width;
            worldHeight = img.height;
        }),

    ])
    .then(function ()
    {
        // Loaded
        console.log('Both images loaded.');

        // Initialize views
        init(playView, 'playCanvas');
        init(debugView, 'debugCanvas');
        scaleX = (playView.canvasWidth / worldWidth); // Difference between the "world" map and the rendering canvas
        scaleY = (playView.canvasHeight / worldHeight); // Difference between the "world" map and the rendering canvas

        debugScaleX = (debugView.canvasWidth / worldWidth);
        debugScaleY = (debugView.canvasHeight / worldHeight);

        console.log('Canvases initialized');

        // Start the render loop
        renderLoop();

        // On debug map clicks, teleport camera to that location
        debugView.canvasElement.addEventListener('mousedown', function(e) {
            const rect = debugView.canvasElement.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            camera.position.x = x / debugScaleX;
            camera.position.y = y / debugScaleY;
        });

        // Track key states
        document.addEventListener('keydown',function(e) {
             // disable the browser usign arrow keys to scroll or anything else
            if(event.keyCode === 65) {moveLeftPressed = true; pd(e);}
            if(event.keyCode === 87) {moveForwardPressed = true; pd(e);}
            if(event.keyCode === 68) {moveRightPressed = true; pd(e);}
            if(event.keyCode === 83) {downBackPressed = true; pd(e);}
            if(event.keyCode === 67) {risePressed = true; pd(e);}
            if(event.keyCode === 69) {fallPressed = true; pd(e);}
        });
        document.addEventListener('keyup',function(e) {
            if(event.keyCode === 65) moveLeftPressed = false;
            if(event.keyCode === 87) moveForwardPressed = false;
            if(event.keyCode === 68) moveRightPressed = false;
            if(event.keyCode === 83) downBackPressed = false;
            if(event.keyCode === 67) risePressed = false;
            if(event.keyCode === 69) fallPressed = false;
        });
    });

    document.getElementById('debugSegmentsOn').onclick = function(e) {
        debugSegments = true;
    };
    document.getElementById('debugSegmentsOff').onclick = function(e) {
        debugSegments = false;
    };
    document.getElementById('lodFalloffOn').onclick = function(e) {
        lodFalloff = true;
    };
    document.getElementById('lodFalloffOff').onclick = function(e) {
        lodFalloff = false;
    };



    document.getElementById('viewDistanceDisplay').innerHTML = camera.viewdistance;
    document.getElementById('viewDistance').oninput = function() {
      camera.viewdistance = parseInt(this.value);
      document.getElementById("viewDistanceDisplay").innerHTML  = this.value;
    }


    document.getElementById('viewFieldOfView').innerHTML = camera.fov;
    document.getElementById('fieldOfView').oninput = function() {
      camera.fov = parseInt(this.value);
      document.getElementById("viewFieldOfView").innerHTML  = this.value;
    }

    var horizonMiddle = Math.ceil(playView.canvasHeight / 2.0);

    var horizonMax = horizonMiddle + playView.canvasHeight * 2.0;
    var horizonMin = horizonMiddle + playView.canvasHeight * -2.0;
    camera.horizon = horizonMiddle;
    document.getElementById("horizonDisplay").innerHTML = camera.horizon;
    document.getElementById("horizon").setAttribute('value', camera.horizon);
    document.getElementById("horizon").setAttribute('min', horizonMin);
    document.getElementById("horizon").setAttribute('max', horizonMax);
    document.getElementById('horizon').oninput = function() {
      camera.horizon = parseInt(this.value);
      document.getElementById("horizonDisplay").innerHTML  = this.value;
    }

    document.getElementById("scaleDisplay").innerHTML  = scaleHeight;
    document.getElementById('scale').oninput = function() {
      scaleHeight  = parseInt(this.value);
      document.getElementById("scaleDisplay").innerHTML  = this.value;
    }

};


// BEGIN CONTROL
var moveForwardPressed = false;
var downBackPressed = false;
var moveLeftPressed = false;
var moveRightPressed = false;
var risePressed = false;
var fallPressed = false;
function ensureAboveGround(){
    // 0.0 -> 1.0
    var altitudeAtLocation = getHeightAt(camera.position.x, camera.position.y);
    if(camera.position.z <= (altitudeAtLocation * scaleHeight)){
        // If we go below or collide with the ground, go above ground with a reset and slighty upwards velocity
        camera.position.z = altitudeAtLocation * scaleHeight;
        camera.velocity.z *=-1;
    }
    else if(camera.position.z >= camera.maxHeight){
        // If we're too high, bounce back down
        camera.position.z = camera.maxHeight;
        camera.velocity.z *=-1;
    }
}
function ensureInMap(){
    if(camera.position.y < 0) camera.position.y = worldHeight;
    if(camera.position.y > worldWidth) camera.position.y = 0;
    if(camera.position.x < 0) camera.position.x = worldWidth;
    if(camera.position.x > worldHeight) camera.position.x = 0;
}
function getAngle(){
    var middleHorizonY = playView.canvasHeight / 2;

    var maxHorizon = playView.canvasHeight * 4;

    if(camera.horizon > middleHorizonY){
        // Looking up
        return (camera.horizon - middleHorizonY) / (maxHorizon);
    }
    else if (camera.horizon < middleHorizonY){
        // Looking down
        return -1* ( (middleHorizonY - camera.horizon) / (maxHorizon));
    }
    return 0;
}
var angleCoefficient = 6;
function moveForward(){
    // Speed up, if we're under the limit
    if(camera.velocity.y > -camera.speeds.max.y) camera.velocity.y-= camera.speeds.y;
    if(camera.velocity.z < camera.speeds.max.z) camera.velocity.z += getAngle() * camera.speeds.z * angleCoefficient;
}
function moveBackward(){
    if(camera.velocity.y < camera.speeds.max.y) camera.velocity.y+=camera.speeds.y;
    if(camera.velocity.z > -camera.speeds.max.z) camera.velocity.z -= getAngle() * camera.speeds.z * angleCoefficient;
}
function moveLeft(){
    if(camera.velocity.x > -camera.speeds.max.x) camera.velocity.x-=camera.speeds.x;
}
function moveRight(){
    if(camera.velocity.x < camera.speeds.max.x) camera.velocity.x+=camera.speeds.x;
}
function moveUp(){
    if(camera.velocity.z > -camera.speeds.max.z) camera.velocity.z -= camera.speeds.z;
}
function moveDown(){
    if(camera.velocity.z < camera.speeds.max.z) camera.velocity.z+= camera.speeds.z;
}
// END CONTROL
