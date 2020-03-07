// BEGIN RENDERING
var debug = true;

var worldWidth = 0;
var worldHeight = 0;

var colorBuffer = [];
var heightBuffer = [];

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
    distance: 300,
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
    rescale(view);
}

function drawLine(view, options) {
    view.context.save();
    view.context.beginPath();
    view.context.lineWidth = options.width * view.pixelRatio;
    view.context.strokeStyle = options.color || "black";
    view.context.moveTo(getSharpPixel(view,options.width, options.fromX), getSharpPixel(view,options.width, options.fromY));
    view.context.lineTo(getSharpPixel(view,options.width, options.toX), getSharpPixel(view,options.width, options.toY));
    view.context.stroke();
    view.context.restore();
};



function drawLineToBottom(view, options) {
    drawLine(view, {
        fromX: options.fromX, fromY: options.fromY,
        toX: options.fromX, toY: view.canvasHeight,
        width: options.width,
        color: options.color
    })
};

function drawCircle(view, options){
    view.context.save();
    view.context.strokeStyle = options.color || "black";
    view.context.beginPath();
    view.context.arc(options.x, options.y, options.radius, 0, Math.PI * 2, true);
    view.context.stroke();
    view.context.restore();
}

function render(){
    if(debug){renderDebugView();}
    renderPlayView();
}

function renderPlayView(){
    var scaleX = (playView.canvasWidth / worldWidth); // Difference between the "world" map and the rendering canvas
    var scaleY = (playView.canvasHeight / worldHeight); // Difference between the "world" map and the rendering canvas


    // Paint the sky color
    playView.context.fillStyle = camera.sky.color;
    playView.context.fillRect(0, 0, playView.canvasWidth, playView.canvasHeight);

    var maxZValues = new Array(playView.canvasHeight).fill(0).map(() => new Array(playView.canvasWidth).fill(0));

    // Starting at distance away, move closer and closer and stop 1 px away from "camera"
    for(var z = camera.distance; z > 1; z--){
    //for(var z = camera.distance; z == camera.distance ; z--){

        // At that distance, we visualize a line of "voxels" that we'll source color and height info from
        var leftMostPoint = {
            x: camera.position.x - z, // field of view widens by 1 for every 1 distance away
            y: camera.position.y - z
        };
        var rightMostPoint = {
            x: camera.position.x + z, // field of view widens by 1 for every 1 distance away
            y: camera.position.y - z
        };

        // What percent of voxel current distance row is of screenspace?
        var voxelRowToScreenRatio = (rightMostPoint.x - leftMostPoint.x) / playView.canvasWidth;

        //console.log('dx:' + dx);

        // For each pixel in the screen width I need to fill up

        for(var screenX = 0; screenX < playView.canvasWidth; screenX++){

            // Translate the screenspace coordinate (viewX, z) into the map coordinate
            var mapPoint = {
                x: Math.ceil(leftMostPoint.x + (screenX * voxelRowToScreenRatio)),
                y: Math.ceil(leftMostPoint.y)
            };

            // Debug the mapPoint
            // if(debug){
            //     drawCircle(debugView, {
            //         x: Math.ceil(mapPoint.x * scaleX),
            //         y: Math.ceil(mapPoint.y * scaleY),
            //         radius: 1,
            //         color: 'rgba(255,255,255,0.05)'
            //     });
            // }

            var color = getColorAt(mapPoint.x, mapPoint.y);
            var altitudeModifier = getHeightAt(mapPoint.x, mapPoint.y);


            var scaleHeight = playView.canvasHeight/scaleCoefficient;
            //var screenY =  camera.horizon - (altitudeModifier * playView.canvasHeight) / z * scaleHeight ;
            //(height - heightmap[pleft.x, pleft.y]) / z * scale_height. + horizon
            var screenY = (camera.height * scaleHeight - altitudeModifier * scaleHeight) / z * scaleHeight + camera.horizon


            //console.log(color);

            drawLineToBottom(playView,{
                fromX: screenX,
                fromY: screenY,
                width: 1,
                color: color
            });

            //drawCircle(playView,{
            //    x: screenX,
            //    y: screenY,
            //    radius: 1,
            //    color: color
            //});

        }

    }

}

function renderDebugView(){
    var scaleX = (debugView.canvasWidth / worldWidth); // Difference between the "world" map and the rendering canvas
    var scaleY = (debugView.canvasHeight / worldHeight); // Difference between the "world" map and the rendering canvas

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

// Get the color map's color at a set of coordinates
Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
};
function wrapNumber(index,length){
    if(index < 0){
        index = index.mod(length);
    }
    if(index > length){
        index = index.mod(length);
    }
    return index;
}
function getBufferedValue(arr,x,y){
    x=Math.ceil(x-1);
    y=Math.ceil(y-1);

    y = wrapNumber(y, arr.length);
    x = wrapNumber(x, arr[y].length);

    return arr[y][x];
}

// Get the height map's color at a set of coordinates
function getHeightAt(x,y){
    return getBufferedValue(heightBuffer,x,y);
}
function getColorAt(x,y){
    return getBufferedValue(colorBuffer,x,y);
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

            // Buffer the colors
            colorBuffer = [];
            for(var y = 0; y < img.height; y++){
                var row = [];
                for(var x = 0; x < img.width; x++){
                    var color = colorHolderCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
                    row.push( 'rgb('+color[0]+','+color[1]+','+color[2]+')' );
                }
                colorBuffer.push(row);
            }
        }),

        loadImage("height.png",  (img) => {
            // Draw it to the preview
            heightHolderCanvas = document.getElementById('heightHolderCanvas');
            heightHolderCanvas.width = img.width;
            heightHolderCanvas.height = img.height;
            heightHolderCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

            // Buffer the heights
            heightBuffer = [];
            for(var y = 0; y < img.height; y++){
                var row = [];
                for(var x = 0; x < img.width; x++){
                    var color = heightHolderCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
                    row.push( color[0] / 255 );
                }
                heightBuffer.push(row);
            }

            worldWidth = img.width;
            worldHeight = img.height;
        }),

    ])
    .then(function ()
    {
        var scaleX = (debugView.canvasWidth / worldWidth); // Difference between the "world" map and the rendering canvas
        var scaleY = (debugView.canvasHeight / worldHeight); // Difference between the "world" map and the rendering canvas

        // Loaded
        console.log('Both images loaded.');

        // Initialize views
        init(playView, 'playCanvas');
        init(debugView, 'debugCanvas');
        console.log('Canvases initialized');

        // Render frame
        render();
        console.log('Render complete');

        // On debug map clicks, teleport camera to that location
        debugView.canvasElement.addEventListener('mousedown', function(e) {
            const rect = debugView.canvasElement.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            camera.position.x = x / scaleX;
            camera.position.y = y / scaleY;
            render();
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
};


// BEGIN CONTROL
var movementSpeed = 2;
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
    render();
}
function moveBackward(){
    camera.position.y+=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    render();
}
function moveLeft(){
    camera.position.x-=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    render();
}
function moveRight(){
    camera.position.x+=movementSpeed;
    ensureInMap();
    ensureAboveGround()
    render();
}
function moveUp(){
    camera.height-=0.1;
    ensureAboveGround()
    render();
}
function moveDown(){
    camera.height+=0.1;
    ensureAboveGround()
    render();
}
// END CONTROL
