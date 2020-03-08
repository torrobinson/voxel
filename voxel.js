// BEGIN RENDERING
var debug = true;
var debugSegments = false;
var autoForward = true;
var lodFalloff = true;

var worldWidth = 0;
var worldHeight = 0;

// Represents much the view is scaled up compared to the map. Derived later.
var scaleX = 0;
var scaleY = 0;

var colorImageData = null;
var heightImageData = null;
var frameImageData = null;

var playView = {
    canvasHeight: 300,
    canvasWidth: 300,
    context: null,
    canvasElement: null,
    pixelRatio: null,
    initialWidth: null,
    initialHeight: null,
};

//var scaleCoefficient = 0.9 + (0.010*playView.canvasHeight) - (0.00003*playView.canvasHeight^2);
var scaleCoefficient = -0.1149488 + (0.02408385*playView.canvasHeight) - (0.00002536409*Math.pow(playView.canvasHeight,2)) + (1.03815*(Math.pow(10,-8))*Math.pow(playView.canvasHeight,3));

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
        color: 'rgb(192, 221, 237)'
    },
    position: {
        x: Math.ceil(worldWidth / 2.0) - 0, // Default in the middle
        y: Math.ceil(worldHeight / 2.0) - 0 // Default in the middle
    },
    height: 0.50,  // Default to inbetween the min and max altitudes
    distance: 200,
    horizon: Math.ceil(playView.canvasHeight / 2.0) // Default the horizon to drawing in the exact middle
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

window.addEventListener('resize', function(args) {
    for(var i = 0; i< allViews.length; i++){
        rescale(allViews[i]);
    }
    render();
}, false);

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

    playView.canvasElement.bufarray = new ArrayBuffer(playView.canvasWidth * playView.canvasHeight * 4);
    playView.canvasElement.buf8     = new Uint8Array(playView.canvasElement.bufarray);
    playView.canvasElement.buf32    = new Uint32Array(playView.canvasElement.bufarray);

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

function render(){
    if(debug){renderDebugView();}
    renderPlayView();
    requestAnimationFrame(render);
    if(autoForward){
        moveForward();
    }
}

function renderPlayView(){

    // Clear the image data buffer
    frameImageData = playView.context.createImageData(playView.canvasWidth, playView.canvasHeight);


    //playView.context.fillStyle = camera.sky.color;
    //playView.context.fillRect(0, 0, playView.canvasWidth, playView.canvasHeight);

    // Starting at distance away, move closer and closer and stop 1 px away from "camera"
    var z = camera.distance;
    while(z > 1){

        // At that distance, we visualize a line of "voxels" that we'll source color and height info from
        var leftMostPointX = camera.position.x - z; // field of view widens by 1 for every 1 distance away
        var rightMostPointX = camera.position.x + z; // field of view widens by 1 for every 1 distance away

        // What percent of voxel current distance row is of screenspace?
        var voxelRowToScreenRatio = (rightMostPointX - leftMostPointX) / playView.canvasWidth;

        //console.log('dx:' + dx);

        // For each pixel in the screen width I need to fill up

        for(var screenX = 0; screenX < playView.canvasWidth; screenX++){

            // Translate the screenspace coordinate (viewX, z) into the map coordinate
            var mapPoint = {
                x: Math.ceil(leftMostPointX + (screenX * voxelRowToScreenRatio)),
                y: Math.ceil(camera.position.y - z)
            };

            // Debug the mapPoint
             if(debug && debugSegments){
                 drawCircle(debugView, {
                     x: Math.ceil(mapPoint.x * scaleX),
                     y: Math.ceil(mapPoint.y * scaleY),
                     radius: 1,
                     color: 'rgba(255,255,255,0.05)'
                 });
             }


            var altitudeModifier = getHeightAt(mapPoint.x, mapPoint.y)[0]/255;
            var color = getColorAt(mapPoint.x, mapPoint.y);



            var scaleHeight = playView.canvasHeight/scaleCoefficient;

            var screenY = Math.ceil(
                (camera.height * scaleHeight - altitudeModifier * scaleHeight) / z * scaleHeight + camera.horizon
            );

            if(screenY > 0 && screenY < playView.canvasHeight){
                drawFrameBufferLineToBottom(frameImageData,
                    playView.canvasHeight - screenY, // legnthdown
                    screenX, //x
                    screenY, //y
                    color[0], //r
                    color[1], //g
                    color[2] //b
                 );

                 //playView.context.putImageData(frameImageData,0,0);
            }
            // drawLineToBottom(playView,{
            //     fromX: screenX,
            //     fromY: screenY,
            //     width: 1,
            //     color: color
            // });

        }
        if(lodFalloff){
            if(z > 0 && z <= 50){
                z-=0.5;
            }
            else if(z > 50 && z <= 75){
                z-=1;
            }
            else if(z > 75 && z <= 100){
                z-=3;
            }
            else{
                z-=4;
            }
        }
        else{
            z--;
        }
    }

    playView.context.putImageData(frameImageData,0,0);
    //playView.canvasElement.imagedata.data.set(playView.canvasElement.buf8);
    //playView.context.putImageData(playView.canvasElement.imagedata, 0, 0);

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
        x: camera.position.x * scaleX ,
        y: camera.position.y * scaleY,
        radius: 3,
        color: 'red'
    });

    // Draw the FOV
    // Left
    drawLine(debugView,{
        fromX: camera.position.x * scaleX,
        fromY: camera.position.y * scaleY,
        toX: (camera.position.x - camera.distance) * scaleX,
        toY: (camera.position.y - camera.distance) * scaleY,
        width: 1,
        color: 'red'
    });
    // Right
    drawLine(debugView,{
        fromX: camera.position.x * scaleX,
        fromY: camera.position.y * scaleY,
        toX: (camera.position.x + camera.distance) * scaleX,
        toY: (camera.position.y - camera.distance) * scaleY,
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

function mod(n, m) {
  return ((n % m) + m) % m;
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
    return get1DArrayValueAtCoordinates(heightImageData,x,y);
}
function getColorAt(x,y){
    return  get1DArrayValueAtCoordinates(colorImageData,x,y);
}

// END IMAGE









// MAIN
var colorHolderCanvas = null;
var heightHolderCanvas = null;

window.onload = function(){
    // Get the color/height images
    Promise.all([

        loadImage("color.png",  (img) => {
            // Draw it to the preview
            colorHolderCanvas = document.getElementById('colorHolderCanvas');
            colorHolderCanvas.width = img.width;
            colorHolderCanvas.height = img.height;
            colorHolderCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

            // Load colors
            colorImageData =  colorHolderCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
        }),

        loadImage("height.png",  (img) => {
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
        console.log('Canvases initialized');

        // Render frame
        render();

        // On debug map clicks, teleport camera to that location
        debugView.canvasElement.addEventListener('mousedown', function(e) {
            const rect = debugView.canvasElement.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            camera.position.x = x / scaleX;
            camera.position.y = y / scaleY;
            ensureInMap();
            ensureAboveGround()
            //render();
        });

        // On arrow key presses, translate camera
        document.addEventListener('keydown',function(event) {
            switch (event.keyCode) {
               case 37: // LEFT
                    moveLeft();
                  break;
               case 38: // UP
                    moveForward();
                  break;
               case 39: // RIGHT
                    moveRight();
                  break;
               case 40: // DOWN
                    moveBackward();
                  break;
              case 70: // F = FALL
                   moveUp();
                 break;
             case 82: // R = RISE
                  moveDown();
                break;
            }
        });
    });

    document.getElementById('debugOn').onclick = function(e) {
        debug = true;
        document.getElementById('debugSegmentsOn').removeAttribute('disabled');
        document.getElementById('debugSegmentsOff').removeAttribute('disabled');
        document.getElementById('debugCanvas').style.display = 'block';
    };
    document.getElementById('debugOff').onclick = function(e) {
        debug = false;
        document.getElementById('debugSegmentsOn').setAttribute('disabled','disabled');
        document.getElementById('debugSegmentsOff').setAttribute('disabled','disabled');
        document.getElementById('debugCanvas').style.display = 'none';
    };
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


};





// BEGIN CONTROL
var movementSpeed = 1;
function ensureAboveGround(){
    var altitudeAtLocation = getHeightAt(camera.position.x, camera.position.y);
    if(camera.height <= altitudeAtLocation){
        camera.height = altitudeAtLocation + 0.025;
    }
}
function ensureInMap(){
    if(camera.position.y < 0) camera.position.y = worldHeight;
    if(camera.position.y > playView.canvasHeight) camera.position.y = 0;
    if(camera.position.x < 0) camera.position.x = worldWidth;
    if(camera.position.x > worldHeight) camera.position.x = 0;
}
function moveForward(){
    camera.position.y-= movementSpeed;
    ensureInMap();
    ensureAboveGround()
    //render();
}
function moveBackward(){
    camera.position.y+=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    //render();
}
function moveLeft(){
    camera.position.x-=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    //render();
}
function moveRight(){
    camera.position.x+=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    //render();
}
function moveUp(){
    camera.height-=0.1;
    ensureAboveGround()
    //render();
}
function moveDown(){
    camera.height+=0.1;
    ensureAboveGround()
    //render();
}
// END CONTROL
