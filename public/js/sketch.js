const seenActions = new Set(),
      ACTION_QUEUE = [];

let user,
    current_tool = 'pen',
    current_layer = 0,
    isDrawing = false,
    boundingBoxStart,
    boundingBoxEnd,
    strokeWidth = 4,
    activeSelection = false,
    selectionStart = {x: 0, y: 0},
    selectionEnd = {x: 0, y: 0},

    ucolor = "black",
    my_colors = ['red','yellow','orange','cyan','blue','magenta','pink','purple','black','grey','white','sienna','green','lime'],
    ualpha = 255, //TODO make this work with transparency, it just isn't working right

    /*IMPORTANT VARS*/
    barHeight = 100,
    LAYERS = [],
    CANVAS,
    UI_LAYER,
    CHECKERBOARD,
    ACTIVE_AREA,
    ACTION_LAYER,
    UNDO_STACK = [],
    REDO_STACK = [],    
    ZOOM = {scale_factor: 1, pan_x: 0, pan_y: 0},
    STARTING_LAYER_COUNT = 3,
    MAX_LAYERS = 10,
    OFFSET,
    MAX_UNDOS = 5,
    BAKE_UNDOS = 3,


    action_cnt = 0,

    cWidth = 700,
    cHeight = 700,
    
    ucolor_index = 0;

function setup() {
    // kick out to settings if they refresh or don't have anything set up
    user = localStorage.getItem('draw-username');
    const navType = getNavigationType(),
            isReload = navType === 'reload',
            isBackForward = navType === 'back_forward';
            
    /*if (user == null) {
        window.location.replace("/settings");
    }/* else if (isReload || isBackForward) {
        window.location.replace("/");
    }*/

    // otherwise we get stuff from local storage ^_^
    ucolor = localStorage.getItem('draw-color');


    // instance mode for layers:
    // https://github.com/processing/p5.js/wiki/

    CANVAS = createCanvas(windowHeight, windowHeight).pixelDensity(1);
    frameRate(60); // frame rate cap
    CANVAS.parent(document.querySelector("#art"));
    ACTIVE_AREA = createGraphics(cWidth,cHeight).pixelDensity(1);
    ACTION_LAYER = createGraphics(cWidth,cHeight).pixelDensity(1);
    CHECKERBOARD = createGraphics(cWidth,cHeight).pixelDensity(1);
    UI_LAYER = createGraphics(windowHeight,windowHeight).pixelDensity(1);
    
    createCheckerboard(); // fill checkerboard background
    
    for (let i = 0; i < STARTING_LAYER_COUNT; i++) {
        // push empty layers
        let lyr = {
        live : createGraphics(cWidth,cHeight).pixelDensity(1),
        mask: createGraphics(cWidth,cHeight).pixelDensity(1),
        baked : createImage(cWidth, cHeight).pixelDensity(1),
        removed : false,
        stroke_history: []
        };
        lyr.mask.background(255,255,255,255) 
        LAYERS.push(lyr);
    }
    // prevent context menu
    for (let element of document.getElementsByClassName("p5Canvas")) {
        element.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    resizeCanvas(windowWidth, windowHeight - barHeight);
    UI_LAYER.resizeCanvas(windowWidth, windowHeight - barHeight)
    OFFSET = calculateOffset();
    console.log(CANVAS)

    socket = io({
      maxHttpBufferSize: 1e8
    }).connect('http://localhost:3000');

    socket.on('initial_connection', data => {
        socket.emit("new_connection", {
            username: user,
            color: ucolor
        });
    });
    socket.on('disconnect', data => {
      console.log("DISCONNECTED SOCKET")
        window.location.replace("/");
    });

    // retrieve current global state and render to canvas layers here
    // TODO

    //
	socket.on('list_current_users', data => {
        document.querySelector("#users").innerHTML = '';
        current_connection_cnt = data.length;
		data.forEach(user => {
            let block = document.createElement("div");
            block.innerText = user.username;
            block.id = user.socket_id;
            block.style.color = user.color;
            block.class="user";
            document.querySelector("#users").append(block);
        })
	})

    // Callback functions
	socket.on("get_canvas_action", data => {
        if (!data || !data.id) return;
        if (seenActions.has(data.id)) return; // ignore our own strokes
        seenActions.add(data.id);

        // Apply remote partial stroke, not live if we're actively drawing on same layer to prevent a race condition
        if (data.layer != current_layer && !isDrawing) {
          canvasAction(data, false);
        }
    });


    socket.on("get_finalized_action", data => {
        if (!data || !data.id) return;
        if (seenActions.has(data.id)) return;
        seenActions.add(data.id);
        console.log(`Final stroke received from ${data.username}`);
        // recreate image?
        data.img = createSpriteFromPixelsArray(data)
        // store in layer array
        ACTION_QUEUE.push({
          type: "ADD",
          action: data
        });
    });

  socket.on("get_undo", data => {
    ACTION_QUEUE.push({type: "REMOTE_UNDO", action: data})
  });

  socket.on("get_redo", data => {
    ACTION_QUEUE.push({type: "REMOTE_REDO", action: data})
  });

	socket.on('get_canvas_progress', data => {
        console.log("loaded active canvas");
	});
    socket.on('get_chat_history', data => {
        console.log("loaded active canvas");
	});

    // when disconnect we will remove them
	socket.on('user_disconnect', data => {
        console.log(`${data.username} has left.`);
        document.querySelector("#chatwrap ul").append(chatLine(data.username, data.color, ' has left.'));
	})
    socket.on('user_join', data => {
        console.log(`${data.username} has joined.`);
        document.querySelector("#chatwrap ul").append(chatLine(data.username, data.color, ' has joined.'));
	})
    socket.on('receive_chat_message', data => {
        console.log(`${data.username} has sent a message: ${data.message}`);
        document.querySelector("#chatwrap ul").append(chatLine(`${data.username}:`, data.color, ` ${data.message}`));
	})

    // Getting our buttons and the holder through the p5.js dom
    colorPicker = select('#color-picker');
    alphaSlider = select('#alpha-picker');
    colorPicker.value('#000');

    document.querySelector("#art").setAttribute("style",`--ucolor: ${ucolor};--color: ${colorPicker.value()};`);
    set_color(document.querySelector("#color-select")); // upodate visuals

	const stroke_width_picker = select('#stroke-width-picker'),
        stroke_label = document.querySelector('#current_stroke_width'),
        layer_select = select('#layer_select'),
        pen_button = select('#pen'),
        pencil_button = select('#pencil'),
        eraser_button = select('#eraser'),
        fill_button = select('#fill'),
        eyedropper_button = select('#eyedropper'),
        undo_btn = select('#undo'),
        redo_btn = select('#redo'),
        clear_button = select('li[data-action="clear"]');

    undo_btn.mouseClicked(() => {
        undo()
    });
    redo_btn.mouseClicked(() => {
        redo()
    });

    LAYERS.forEach((layer, index) => {
        let option = document.createElement('option');
        option.value = index;
        option.innerText = `Layer ${index}`;
        document.querySelector("#layer_select").append(option)
    })

    document.querySelector("#layer_select").addEventListener("change", function() {
        let val = layer_select.value();
        current_layer = val;
        console.log(`layer is now ${current_layer}`)
    })

    eraser_button.mouseClicked(() => {
        current_tool = 'eraser';
        console.log(`changed tool: ${current_tool}`);
    })

    pen_button.mouseClicked(() => {
        current_tool = 'pen';
        console.log(`changed tool: ${current_tool}`);
    })
    pencil_button.mouseClicked(() => {
        current_tool = 'pencil';
        console.log(`changed tool: ${current_tool}`);
    })
    eyedropper_button.mouseClicked(() => {
        current_tool = 'eyedropper';
        console.log(`changed tool: ${current_tool}`);
    })
    clear_button.mouseClicked(() => {
        console.log(`clear layer: ${current_layer}`);
        LAYERS[current_layer].clear();
        socket.emit('clear_canvas',{layer: current_layer})
    })
    document.querySelector(`[data-action="new-layer"]`).addEventListener("click", (event) => {
        createNewLayer()
        alert(`added layer`)
    })

    document.querySelector("#chatsend").addEventListener("click", (event) => {
        sendChatMessage();
    });
    document.querySelector("#chatmsg").addEventListener("keyup", (event) => {
        if (event.key == "Enter") {
            sendChatMessage();
        }
    });

	// Adding a mousePressed listener to the button
	
    stroke_width_picker.mouseReleased(() => {
        let width = parseInt(stroke_width_picker.value());
        if (width >= 1 && width <= 100) {
            strokeWidth = width;
            stroke_label.innerText = stroke_width_picker.value();
        }
        else console.log("something wrong with picker")
    });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - barHeight);
  UI_LAYER.resizeCanvas(windowWidth, windowHeight - barHeight);
  OFFSET = calculateOffset();
}

function inCanvasBounds() {
  if (mouseX >= 0 && mouseX <= CANVAS.width && mouseY >= 0 && mouseY <= CANVAS.height) {
    return true
  } else {
    return false
  }
}

function inDrawingArea() {
  let scaledX = parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor),
      scaledY = parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor);
  if (scaledX >= 0 && scaledX <= cWidth && scaledY >= 0 && scaledY <= cHeight) {
    return true
  } else {
    return false
  }
}

function calculateOffset() {
  return {
    x: (windowWidth  * 0.5) - (cWidth  * ZOOM.scale_factor) / 2 + ZOOM.pan_x,
    y: (windowHeight * 0.5) - (cHeight * ZOOM.scale_factor) / 2 + ZOOM.pan_y
  };
}

function draw() {
  // clear CANVAS
  clear();
  ACTIVE_AREA.clear();
  background(225);
  drawUI();

  while (ACTION_QUEUE.length > 0) {
    let act = ACTION_QUEUE.shift();
    performAction(act)
  }
  
  ACTIVE_AREA.image(CHECKERBOARD,0,0)
  
  // draw LAYERS
  LAYERS.forEach((layer, index) => {
    // must add a check because of a slight lag between removing a layer + the draw loop that causes drawing to fail
    if (!layer.removed) {

   
    
    //... THEN WE REDRAW THE LAYER FOR DISPLAY
    let temp_image = redrawLayer(layer),
        liveImage = createImage(layer.live.width, layer.live.height).pixelDensity(1);
    liveImage.copy(layer.live, 0, 0, layer.live.width, layer.live.height, 0, 0, layer.live.width, layer.live.height);
    
    noSmooth()

    // draw to active area
    ACTIVE_AREA.image(temp_image,0,0)
    ACTIVE_AREA.image(liveImage,0,0)
      
    }
  })

  // put active area on canvas w/ transforms
  image(
    ACTIVE_AREA,
    OFFSET.x,
    OFFSET.y,
    ACTIVE_AREA.width * ZOOM.scale_factor,
    ACTIVE_AREA.height * ZOOM.scale_factor
  );
  //draw ui on top
  image(UI_LAYER,0,0)
}


window.addEventListener("wheel", function(e) {
  if (inCanvasBounds() && key == SHIFT) {
    document.body.style = 'overflow: hidden';
    if (e.deltaY > 0) {
      ZOOM.scale_factor *= 0.95;
    } else {
      ZOOM.scale_factor *= 1.05;
    }
    if (ZOOM.scale_factor <= 0.5) {
      ZOOM.scale_factor = 0.5
    } else if (ZOOM.scale_factor >= 5) {
      ZOOM.scale_factor = 5
    }
    OFFSET = calculateOffset();

    document.body.style = '';
  }
  
  
});

function outOfBounds() {
  if (mouseX < 0 || mouseX >= CANVAS.width || mouseY < 0 || mouseY >= CANVAS.height || pmouseX < 0 || pmouseX >= CANVAS.width || pmouseY < 0 || pmouseY >= CANVAS.height) {
    return true
  } else {
    return false
  }
}

function canvasAction(data,local = false) {
  
  if (data.tool == 'pen') {
    
       // draw to current layer
    LAYERS[data.layer].live.stroke(red(data.color),green(data.color),blue(data.color),data.alpha)
    LAYERS[data.layer].live.strokeWeight(data.size)
    LAYERS[data.layer].live.line(data.px, data.py, data.x, data.y);

    LAYERS[data.layer].mask.stroke(255,255,255,255)
    LAYERS[data.layer].mask.strokeWeight(strokeWidth)
    LAYERS[data.layer].mask.line(data.px, data.py, data.x, data.y);
    
    if (local) {
        // also draw to action layer to capture stroke
        ACTION_LAYER.stroke(red(data.color),green(data.color),blue(data.color),data.alpha)
        ACTION_LAYER.strokeWeight(data.size)
        ACTION_LAYER.line(data.px, data.py, data.x, data.y);
        // Expand bounding box while drawing
        boundingBoxEnd.x = max(boundingBoxEnd.x, data.x);
        boundingBoxEnd.y = max(boundingBoxEnd.y, data.y);
        boundingBoxStart.x = min(boundingBoxStart.x, data.x);
        boundingBoxStart.y = min(boundingBoxStart.y, data.y);
    }
    
    

    
  } else if (data.tool == 'pencil') {

    lineBresenham(LAYERS[data.layer].live, data.px, data.py, data.x, data.y, data.size, [red(data.color),green(data.color),blue(data.color),data.alpha]);
    lineBresenham(LAYERS[data.layer].mask, data.px, data.py, data.x, data.y, data.size,[255,255,255,data.alpha]);
    
    if (local) {
        lineBresenham(ACTION_LAYER, data.px, data.py, data.x, data.y, data.size, [red(data.color),green(data.color),blue(data.color),data.alpha]);
        
        // Expand bounding box while drawing
        boundingBoxEnd.x = max(boundingBoxEnd.x, data.x);
        boundingBoxEnd.y = max(boundingBoxEnd.y, data.y);
        boundingBoxStart.x = min(boundingBoxStart.x, data.x);
        boundingBoxStart.y = min(boundingBoxStart.y, data.y);
    }
    
  } else if (data.tool == 'eraser') {
    
        lineBresenham(LAYERS[data.layer].mask, data.px, data.py, data.x, data.y, data.size,[0,0,0,0]);
    
    if (local) {
        boundingBoxEnd.x = max(boundingBoxEnd.x, data.x);
        boundingBoxEnd.y = max(boundingBoxEnd.y, data.y);
        boundingBoxStart.x = min(boundingBoxStart.x, data.x);
        boundingBoxStart.y = min(boundingBoxStart.y, data.y);
    }

  } else if (data.tool == 'fill') {
    if (local) {
        floodScanFill(LAYERS[data.layer],ACTION_LAYER,data.x,data.y,[red(data.color),green(data.color),blue(data.color),data.alpha]);
        boundingBoxEnd.x = LAYERS[current_layer].width;
        boundingBoxEnd.y = LAYERS[current_layer].height;
        boundingBoxStart.x = 0;
        boundingBoxStart.y = 0;
    }

  } else if (data.tool == 'select') {
    rectSelect(UI_LAYER,LAYERS[current_layer])
  }
  if (!local) {
    UI_LAYER.fill(data.ucolor);
    UI_LAYER.stroke(0);
    UI_LAYER.strokeWeight(4);
    UI_LAYER.textAlign(LEFT);
    UI_LAYER.text(data.username, parseInt(data.mouseX)+5, parseInt(data.mouseY)-20);
  }
}

function createSpriteFromPixelsArray(data) {
    let img = createImage(data.width, data.height).pixelDensity(1);
    img.loadPixels()
    const src = new Uint8Array(data.pixels);
    //const src = [...typedArray];
    for (let y = 0; y <= data.height; y++) {
        for (let x = 0; x <= data.width; x++) {
            let index = (x + y * data.width) * 4;
            img.pixels[index + 0] = src[index + 0]
            img.pixels[index + 1] = src[index + 1]
            img.pixels[index + 2] = src[index + 2]
            img.pixels[index + 3] = src[index + 3]
        }
    }
    img.updatePixels()
    return img;
}

function deleteCurrentLayer(current) {
  
  console.log(LAYERS)
  if (LAYERS.length == 1) { console.log("need at least one layer"); return; }
  let deadlayer = LAYERS[current];
  LAYERS.splice(LAYERS[current],1);
  deadlayer.live.remove();
  deadlayer.mask.remove();
  delete deadlayer.baked;
  delete deadlayer.stroke_history;
  deadlayer.removed = true;
  // remove any actions assigned to this layer index from the undo stack
  UNDO_STACK = UNDO_STACK.filter(function(action){return action.layer !== current});
  // shift user to nearest layer
  current_layer = (current-1 < 0 ) ? 0 : current-1;
  /*push delete layer into a global redo/undo stack?*/
}

function createNewLayer() {
  if (LAYERS.length+1 > MAX_LAYERS) { console.log("you hit the max, sorry!"); return; }
    let CANVAS = document.getElementById("defaultCanvas0")
    // push empty layer
    try {
      let lyr = {
        live : createGraphics(cWidth,cHeight).pixelDensity(1),
        mask: createGraphics(cWidth,cHeight).pixelDensity(1), // https://p5js.org/reference/p5/clip/
        baked : createImage(cWidth, cHeight).pixelDensity(1), //createGraphics(cWidth,cHeight).pixelDensity(1),

        stroke_history: []
      };
      lyr.mask.background(255,255,255,255)
      LAYERS.push(lyr)
      console.log(`created new layer: ${LAYERS.length}`)
    } catch (err) {
      console.log(`cannot make new layer! ${err}`)
    }
}

function changeDrawingAreaSize(x, y) {

  // clamping canvas size
  if (x < 50 || y < 50 || x > 1000 || y > 1000) {
    console.log("new canvas dims too big or too small");
    return;
  }
  
  // set new canvas size
  cWidth = x;
  cHeight = y;

  // backup old
  let old_action = ACTION_LAYER,
      old_checkers = CHECKERBOARD,
      old_active = ACTIVE_AREA;

  // recreate with new size
  ACTION_LAYER = createGraphics(cWidth, cHeight).pixelDensity(1);
  CHECKERBOARD = createGraphics(cWidth, cHeight).pixelDensity(1);
  ACTIVE_AREA = createGraphics(cWidth, cHeight).pixelDensity(1);
  createCheckerboard();
  
  // cleanup
  old_action.remove();
  old_checkers.remove();
  old_active.remove();

  // update all layers with the NEW size
  for (let i = 0; i < LAYERS.length; i++) {

    let old_live = LAYERS[i].live;
    let old_mask = LAYERS[i].mask;

    // create new graphics
    LAYERS[i].live = createGraphics(cWidth, cHeight).pixelDensity(1);
    LAYERS[i].mask = createGraphics(cWidth, cHeight).pixelDensity(1);

    // draw previous content into the new resized canvas
    LAYERS[i].live.image(old_live, 0, 0);

    // fill new mask with white and draw old mask on top
    LAYERS[i].mask.background(255);
    LAYERS[i].mask.image(old_mask, 0, 0);

    // clanup
    old_live.remove();
    old_mask.remove();
  }

  // recalc offset with NEW width/height
  OFFSET = calculateOffset();
}

function genActId(cnt = 0) {
    return (
        `${user}-${
        Date.now().toString(36)}-${action_cnt+cnt}`
    );
}

function mousePressed() {
  if (mouseButton.left && inDrawingArea()) {
    if (current_tool == 'eyedropper') {
      var selected_pixel = color(redrawLayer(LAYERS[current_layer]).get((mouseX - OFFSET.x) / ZOOM.scale_factor,(mouseY - OFFSET.y) / ZOOM.scale_factor));
        //console.log(selected_pixel);
        if (alpha(selected_pixel) > 0) {
            colorPicker.value(selected_pixel.toString("#rrggbb"));
            alphaSlider.value(255);
            set_color(document.querySelector("#color-select")); //update color picker
        }
    } else {
      isDrawing = true;
      REDO_STACK = [];
      boundingBoxStart = {x: mouseX, y: mouseY};
      boundingBoxEnd = {x: mouseX, y: mouseY};
      const data = {
              id: genActId(1),
              num: action_cnt+1,
              tool: current_tool,
              x: parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor),
              y: parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor),
              px: parseInt((pmouseX - OFFSET.x) / ZOOM.scale_factor),
              py: parseInt((pmouseY - OFFSET.y) / ZOOM.scale_factor),
              size: strokeWidth,
              color: colorPicker.value(),
              alpha: alphaSlider.value(),
              layer: current_layer,
              username: user,
              ucolor: ucolor,
              timestamp: Date.now(),
              finalized: false
          };

          // mark so echoed version doesn't get applied
          seenActions.add(data.id);

          // apply locally
          canvasAction(data, true);

          // send to server
          socket.emit("send_canvas_action", data);
    }
    
  }
}
function mouseDragged() {
    if (isDrawing && inDrawingArea()) {
        const data = {
            id: genActId(1),
            num: action_cnt+1,
            tool: current_tool,
            x: parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor),
            y: parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor),
            px: parseInt((pmouseX - OFFSET.x) / ZOOM.scale_factor),
            py: parseInt((pmouseY - OFFSET.y) / ZOOM.scale_factor),
            size: strokeWidth,
            color: colorPicker.value(),
            alpha: alphaSlider.value(),
            layer: current_layer,
            username: user,
            timestamp: Date.now(),
            finalized: false
        };

        // mark so echoed version doesn't get applied
        seenActions.add(data.id);

        // apply locally
        canvasAction(data, true);

        // send to server
        socket.emit("send_canvas_action", data);
    }
}

function mouseReleased() {
  if (isDrawing) {
    // finalize action to send to undo stack here
    
    isDrawing = false;
    action_cnt++;

    let action, img, x, y, w, h,

        strokeCalculation = (current_tool == 'fill' || current_tool == 'select') ? 0 : strokeWidth,
        
        minX = min(boundingBoxStart.x, boundingBoxEnd.x),
        maxX = max(boundingBoxStart.x, boundingBoxEnd.x),
        minY = min(boundingBoxStart.y, boundingBoxEnd.y),
        maxY = max(boundingBoxStart.y, boundingBoxEnd.y);
      
    x = parseInt(minX - strokeCalculation);
    y = parseInt(minY - strokeCalculation);
    w = parseInt((maxX - minX) + strokeCalculation * 2 + 1); // little extra padding jic
    h = parseInt((maxY - minY) + strokeCalculation * 2 + 1);

    action = {
        id: genActId(),
        username: user,
        timestamp : Date.now(),
        img: null,
        x: x,
        y: y,
        size: strokeCalculation,
        color: colorPicker.value(),
        alpha: alphaSlider.value(),
        width: w,
        height: h,
        layer: current_layer,
        type: current_tool,
        num: action_cnt,
        baked: false,
        undid: false,
        finalized: true,
    }

    if (action.type == 'eraser') {
      img = getStroke(LAYERS[action.layer].mask,0,0,cWidth,cHeight)
    } else if (action.type == 'fill') {
      action.x = 0;
      action.y = 0;
      action.width = cWidth;
      action.height = cHeight;
      img = getStroke(ACTION_LAYER, action.x, action.y, action.width, action.height)
    } else {
      img = getStroke(ACTION_LAYER, x, y, w, h)
    }
    img.loadPixels()
    action.pixels = img.pixels

    try {
      // send w/o canvas element
      socket.emit("send_finalized_action", action);
    } catch (err) {
      console.log(`ERROR! Probably too big, but here's the error msg: ${err}`)
    }

    // now add canvas :)
    action.img = img

    // add to queue
    ACTION_QUEUE.push({
      type: "ADD",
      action: action
    });
    UNDO_STACK.push(action)

    LAYERS[action.layer].live.clear();
    LAYERS[action.layer].mask.background((255,255,255,255));
    ACTION_LAYER.clear()

    console.log(action)
    seenActions.add(action.id);

    console.log(`Stroke #${action.num} type: ${action.type} on layer #${action.layer} at ${action.timestamp}`);
  }
}

function changeActiveTool(tool) {
  current_tool = tool;
  let tools = document.querySelectorAll('#tools button');
  tools.forEach(btn => {
    btn.classList.remove('active');
    if (btn.id == tool) {
      btn.classList.add('active')
    }
  })
  console.log(`tool is now ${current_tool}`)
}

function keyPressed() {
  if(inCanvasBounds()) {
    if (key === 'z' || key === 'Z') {
      ACTION_QUEUE.push({type: "UNDO_LOCAL"})
      console.log("pushed undo")
    }
    if (key === 'y' || key === 'Y') {
      ACTION_QUEUE.push({type: "REDO_LOCAL"})
    }
    if (key === 'a') {
      changeActiveTool('pen')
    }
    if (key === 's') {
      changeActiveTool('pencil')
    }
    if (key === 'g') {
      changeActiveTool('select')
    }
    if (key === 'd' && current_tool != 'select') {
      changeActiveTool('eraser')
    } else if (key === 'd'  && current_tool == 'select') {
      console.log('delete!')
    }
    if (key === 'f' && current_tool != 'select') {
      changeActiveTool('fill')
    } else if (key === 'f' && current_tool == 'select') {
      
    }
    if (key === '1' && current_layer > 0) {
      current_layer--;
      console.log(`now on layer #${current_layer}`)
    }
    if (key === '2' && current_layer < LAYERS.length-1) {
      current_layer++;
      console.log(`now on layer #${current_layer}`) }
    if (key === 'e' && strokeWidth < 100) {
      strokeWidth += 2;
      console.log(`size now ${strokeWidth}`)
    }
    if (key === 'q' && strokeWidth > 2) {
      strokeWidth -= 2;
      console.log(`size now ${strokeWidth}`)
    }
    if (key === '3') {
      ucolor_index = (ucolor_index-1 < 0) ? my_colors.length-1 : ucolor_index-1;
      ucolor = my_colors[ucolor_index]
      console.log(`color now ${ucolor}`)
    }
    if (key === '4') {
      ucolor_index = (ucolor_index+1 > my_colors.length) ? 0 : ucolor_index+1;
      ucolor = my_colors[ucolor_index]
      console.log(`color now ${ucolor}`)
    }
    if (key === ']') {
      // delete layer
      if (window.confirm(`Are you sure you want to delete layer ${current_layer}?`)) {
        deleteCurrentLayer(current_layer)
      } else {
        console.log('cancel delete layer')
      }
    }
    if (key === '[') {
      // create layer
      createNewLayer()
    }
    if (key === "'") {
      // create layer
      saveFlatCanvas()
    }
    if (key === ';') {
      // create layer
      saveOneLayer(LAYERS[current_layer])
    }
    if (key === " ") {
      // create layer
      console.log(`reset scale factor`)
      ZOOM.scale_factor = 1.0
      ZOOM.pan_x = 0
      ZOOM.pan_y = 0
      OFFSET = calculateOffset()
    }
    if (key == '7') {
      cWidth += 200;
      cHeight += 200;
      changeDrawingAreaSize(cWidth,cHeight)
    }
    if (key == '6') {
      cWidth -= 200;
      cHeight -= 200;
      changeDrawingAreaSize(cWidth,cHeight)
    }
    if (key == UP_ARROW) {
      ZOOM.pan_y += 10
      OFFSET = calculateOffset()
    }
    if (key == DOWN_ARROW) {
      ZOOM.pan_y -= 10
      OFFSET = calculateOffset()
    }
    if (key == LEFT_ARROW) {
      ZOOM.pan_x -= 10
      OFFSET = calculateOffset()
    }
    if (key == RIGHT_ARROW) {
      ZOOM.pan_x += 10
      OFFSET = calculateOffset()
    }
  }
}

function chatLine(name, color, message) {
    let line = document.createElement("li");
    line.innerHTML = `<span class="name"></span><span class="message"></span>`;
    line.querySelector(".name").style = `color: ${color}`;
    line.querySelector(".name").innerText = name;
    line.querySelector(".message").innerText = message;
    return line;
}
function sendChatMessage() {

    let message = document.querySelector("#chatmsg");
    if (message.value.length > 0) {
        let data = {
            username: user,
            color: ucolor,
            message: message.value
        };
        document.querySelector("#chatwrap ul").append(chatLine(user,ucolor,`: ${message.value}`));
        socket.emit("send_chat_message", data);
        message.value = '';
        message.focus();
        console.log("sent chat message");
    } else {
        console.log("no message no sending.");
        message.focus();
    }  
}

function set_color(el){
    document.querySelector("#art canvas").style.setProperty('--color', colorPicker.value());
    el.style.backgroundColor=colorPicker.value() + (alphaSlider.value() == 255 ? "" : parseInt(alphaSlider.value()).toString(16).padStart(2, "0"));
}

// https://stackoverflow.com/questions/5004978/check-if-page-gets-reloaded-or-refreshed-in-javascript/53307588#53307588
// There is one navigation entry per document
const entry = performance.getEntriesByType('navigation')[0];

function getNavigationType() {
  if (entry && typeof entry.type === 'string') {
    // 'navigate' | 'reload' | 'back_forward' | 'prerender'
    return entry.type;
  }
  // Fallback to the deprecated API (values: 0,1,2,255)
  if (performance.navigation) {
    const t = performance.navigation.type;
    return t === 1 ? 'reload'
         : t === 2 ? 'back_forward'
         : 'navigate';
  }
  return undefined;
}
