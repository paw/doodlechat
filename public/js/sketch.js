const ACTION_QUEUE = [];

let user, ucolor,
    current_tool = 'pen',
    current_layer = 0,
    IS_DRAWING = false,
    boundingBoxStart,
    boundingBoxEnd,
    strokeWidth = 4,
    activeSelection = false,
    selectionStart = {x: 0, y: 0},
    selectionEnd = {x: 0, y: 0},
    ROOM,

    HOST = false,
    ADMIN = false,

    PANNING = false,
    PAN = {x: 0, y: 0},
    ZOOMING = false,
    ZOOM_MULTIPLIER = 1.0,
    SELECTING = false,

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
    CONNECTIONS = [],


    action_cnt = 0,

    cWidth = 500,
    cHeight = 500,
    
    ucolor_index = 0;

function setup() {
    // kick out to settings if they refresh or don't have anything set up
    user = localStorage.getItem('draw-username');
    const navType = getNavigationType(),
            isReload = navType === 'reload',
            isBackForward = navType === 'back_forward';
            
    if (user == null) {
        window.location.replace("/settings");
    } else if (isReload || isBackForward) {
        window.location.replace("/");
    }

    // otherwise we get stuff from local storage ^_^
    ucolor = localStorage.getItem('draw-color');
    // get room name from url, making sure to drop any junk params jic
    ROOM = window.location.href.split('?')[0].substring(window.location.href.lastIndexOf('/') + 1);

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
        hidden: false,
        history_start: [0],
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
            color: ucolor,
            current_layer: 0,
            room: ROOM
        });
    });
    socket.on('disconnect', data => {
      console.log("DISCONNECTED SOCKET")
      window.location.replace("/");
    });
    socket.on('failure', data => {
      console.log("ROOM DOES NOT EXIST")
      socket.disconnect();
      window.location.replace("/");
    });
    socket.on('set_page_title', data => {
      document.title = `${data} - Drawing on DoodleChat`;
    })
    socket.on('make_host', data => {
      // admin actions are verified on server so even if this is set by client nothing will happen.
      HOST = true;
      ADMIN = true;
      document.querySelectorAll(`[data-type="admin"]`).forEach(ele => {
        ele.classList.remove("disabled")
      })
      console.log("You are now host.")
    });

    socket.on('kick', data => {
      window.location.replace("/?kicked=true");
    });

    // retrieve current global state and render to canvas layers here
    // TODO
    // emit rq

    //
	socket.on('list_current_users', data => {
        document.querySelector("#users").innerHTML = '';
        current_connection_cnt = data.length;
    CONNECTIONS = data;
		data.forEach(user => {
            let block = document.createElement("div");
            block.innerText = user.username;
            block.id = user.socket_id;
            block.style.color = user.color;
            block.classList ="user";
            if (user.host) {
              block.classList.add("host");
              block.innerHTML += `<i class="fa-solid fa-crown" title="Host"></i>`
            } else if (user.admin) {
              block.classList.add("admin");
              block.innerHTML += `<i class="fa-solid fa-chess-knight" title="Admin"></i>`
            }
            if(HOST && user.socket_id != socket.id) {
              // add host controls
              if (!user.admin) {
                block.innerHTML += `<button class="btn" onclick="promote('${user.socket_id}')">Promote</button>`
              } else {
                block.innerHTML += `<button class="btn" onclick="demote('${user.socket_id}')">Demote</button>`
              }
            }
            if ((HOST || ADMIN) && user.socket_id != socket.id && !(user.host || user.admin)) {
              block.innerHTML += `<button class="btn" onclick="kick('${user.socket_id}')">Kick</button>`
            } 
            document.querySelector("#users").append(block);
        })
	})
  

    // Callback functions
	socket.on("get_canvas_action", data => {
        if (!data || !data.id) return;
        // Apply remote partial stroke, not live if we're actively drawing on same layer to prevent weirdness
        //if (data.layer != current_layer && !isDrawing) {
          canvasAction(data, false);
        //}
    });


    socket.on("get_finalized_action", data => {
        if (!data || !data.id) return;
        console.log(`Final stroke received from ${data.username}`);
        // recreate image?
        data.img = createSpriteFromPixelsArray(data)
        // store in layer array
        ACTION_QUEUE.push({
          type: "NEW_STROKE",
          action: data
        });
    });

  socket.on("get_undo", data => {
    ACTION_QUEUE.push({type: "UNDO_REMOTE", action: data})
  });

  socket.on("get_redo", data => {
    ACTION_QUEUE.push({type: "REDO_REMOTE", action: data})
  });

  socket.on("update_users_layer", data => {
    CONNECTIONS.find(ele => ele.socket_id == data.socket_id).current_layer = data.layer
  });

	socket.on('get_canvas_progress', data => {
    // right now just sending & receiving entire action stack from server, eventually will implement getting canvas progress up to a certain point
    console.log(`successfully receieved ${data.length} actions.`)
    data.forEach(action => {
      if (action.pixels != undefined) {
        action.img = createSpriteFromPixelsArray(action)
      }
      ACTION_QUEUE.push({
        type: "NEW_STROKE",
        action: action
      });
    })
    document.querySelector("#loading").classList.add("hide");
    console.log(`got current canvas info`)
	});
  socket.on('get_chat_history', data => {
    console.log(data)
    data.forEach(message => {
      if (message.type == "server") {
        document.querySelector("#chatwrap ul").append(chatLine(`${message.data.username}`, message.data.color, ` ${message.data.message}`,true));
      } else {
        document.querySelector("#chatwrap ul").append(chatLine(`${message.data.username}:`, message.data.color, ` ${message.data.message}`));
      }
    })
    document.querySelector("#chatwrap").scrollTop = document.querySelector("#chatwrap").scrollHeight;
	});

  socket.on('confirm_delete_layer', data => {
      //deleteCurrentLayer(data.layer)
      ACTION_QUEUE.push({
        type: "NEW_STROKE",
        action: data
      })
      console.log(`admin ${data.username} deleted layer ${data.layer}`)
	});

  socket.on('confirm_add_layer', data => {
      //createNewLayer()
      ACTION_QUEUE.push({
        type: "NEW_STROKE",
        action: data
      })
      console.log(`admin ${data.username} created new layer`)
	});

  socket.on('confirm_clear_layer', data => {
      //createNewLayer()
      console.log("CONFIRM CLEAR?",data)
      ACTION_QUEUE.push({
        type: "NEW_STROKE",
        action: data
      })
      console.log(`admin ${data.username} cleared layer`)
	});

  socket.on('confirm_canvas_resize', data => {
      //createNewLayer()
      ACTION_QUEUE.push({
        type: "NEW_STROKE",
        action: data
      })
      console.log(`admin ${data.username} has resized the canvas`)
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
        document.querySelector("#chatwrap").scrollTop = document.querySelector("#chatwrap").scrollHeight;
	})
  socket.on('receive_server_message', data => {
        console.log(`SERVER has sent a message: ${data.message}`);
        document.querySelector("#chatwrap ul").append(chatLine(`${data.username}`, data.color, ` ${data.message}`,true));
        document.querySelector("#chatwrap").scrollTop = document.querySelector("#chatwrap").scrollHeight;
	})
    socket.on('promote', data => {
        console.log(`You have been promoted.`);
        ADMIN = true;
        document.querySelectorAll(`[data-type="admin"]`).forEach(ele => {
          ele.classList.remove("disabled")
        })
        //document.querySelector("#chatwrap ul").append(chatLine(data.username, data.color, ' has been promoted.'));
	})
  socket.on('demote', data => {
        console.log(`You have been demoted.`);
        ADMIN = false;
        document.querySelectorAll(`[data-type="admin"]`).forEach(ele => {
          ele.classList.add("disabled")
        })
        //document.querySelector("#chatwrap ul").append(chatLine(data.username, data.color, ' has been promoted.'));
	})

  // Getting our buttons and the holder through the p5.js dom
  colorPicker = select('#color-picker');
  alphaSlider = select('#alpha-picker');
  const stroke_width_picker = select('#stroke-width-picker'),
        stroke_label = document.querySelector('#current_stroke_width'),
        pen_button = select('#pen'),
        pencil_button = select('#pencil'),
        eraser_button = select('#eraser'),
        fill_button = select('#fill'),
        eyedropper_button = select('#eyedropper'),
        undo_btn = select('#undo'),
        redo_btn = select('#redo'),
        zoom_btn = select('#zoom'),
        exit = select("#exit"),
        chat = document.querySelector("#chat"),
        navbar = document.querySelector(".navbar"),
        tools = document.querySelector("#controls"),
        modals = document.querySelectorAll(".modal");

    colorPicker.value('#000');
    alphaSlider.value(255);
    stroke_width_picker.value(4);

    document.querySelector("#art").setAttribute("style",`--ucolor: ${ucolor};--color: ${colorPicker.value()};`);
    set_color(document.querySelector("#color-select")); // upodate visuals

    undo_btn.mouseClicked(() => {
        ACTION_QUEUE.push({type: "UNDO_LOCAL"})
    });
    redo_btn.mouseClicked(() => {
        ACTION_QUEUE.push({type: "REDO_LOCAL"})
    });

    exit.mouseClicked(() => {
        if (window.confirm("Leave Room?")) {
          window.location.replace("/")
        }
    });

    [chat,navbar,tools].forEach(element => {
      element.addEventListener("mouseover", (event) => {
        document.body.classList.add("modal-open")
      })
      element.addEventListener("mouseout", (event) => {
        document.body.classList.remove("modal-open")
      })
    })
    modals.forEach(element => {
      element.addEventListener("mouseover", (event) => {
        document.body.classList.add("modal-open")
      })
      element.addEventListener("mouseout", (event) => {
        document.body.classList.remove("modal-open")
      })
    });

    eraser_button.mouseClicked(() => {
        changeActiveTool('eraser')
    })
    fill_button.mouseClicked(() => {
        changeActiveTool('fill')
    })
    pen_button.mouseClicked(() => {
        changeActiveTool('pen')
    })
    pencil_button.mouseClicked(() => {
        changeActiveTool('pencil')
    })
    eyedropper_button.mouseClicked(() => {
        changeActiveTool('eyedropper')
    })
    zoom_btn.mouseClicked(() => {
        changeActiveTool('zoom')
    })
    document.querySelector(`[data-action="new-layer"]`).addEventListener("click", (event) => {
        if (ADMIN || HOST) {
          if (window.confirm(`Are you sure you want to add a new layer?`)) {
            request_add_layer()
            event.target.parentNode.classList.remove("show");
          }
        }
    })
    document.querySelector(`[data-action="clear-layer"]`).addEventListener("click", (event) => {
        if (ADMIN || HOST) {
          if (window.confirm(`Are you sure you want to clear layer #${current_layer+1}?`)) {
            request_clear_layer(current_layer)
            event.target.parentNode.classList.remove("show");
          }
        }
    })
    document.querySelector(`[data-action="delete-layer"]`).addEventListener("click", (event) => {
        if (ADMIN || HOST) {
          if (window.confirm(`Are you sure you want to delete layer #${current_layer+1}?`)) {
            request_delete_layer(current_layer)
            event.target.parentNode.classList.remove("show");
          }
        }
    })
    
    document.querySelector(`[data-action="show-layers"]`).addEventListener("click", (event) => {
      event.target.parentNode.classList.remove("show");
      document.body.classList.add("modal-open")
        let modal = document.querySelector("#layers"),
            list = modal.querySelector("#layerlist"),
            temp = modal.querySelector(`[data-name="template"]`);
        modal.classList.remove("hide");
        list.innerHTML = '';
        LAYERS.forEach((layer,index) => {
          let li = temp.cloneNode(true);
          li.setAttribute("data-name",`layer${index}`)
          li.classList.remove('hide');
          let ulist = CONNECTIONS.filter(ele => ele.current_layer == index);
          ulist.forEach(user => {
            li.querySelector(`[data-name="users"]`).innerHTML += `<b style="color:${user.color}">${user.username}</b> `
          })
          li.querySelector('[data-name="number"]').innerText = index+1;
          li.querySelector("button").addEventListener("click", function() {
            current_layer = index;
            CONNECTIONS.find(ele => ele.socket_id == socket.id).current_layer = current_layer;
            socket.emit("update_current_layer",{ layer: current_layer })
            modal.classList.add('hide');
            document.querySelector("#art canvas").focus();
            document.body.classList.remove("modal-open")
          });
          list.append(li)
        })
    })
    
    document.querySelector(`[data-action="change-canvas-size"]`).addEventListener("click", (event) => {
      if (ADMIN || HOST) {  
        event.target.parentNode.classList.remove("show");
        document.body.classList.add("modal-open")
          let modal = document.querySelector("#canvas-size"),
              new_width = modal.querySelector("#new-width"),
              new_height = modal.querySelector(`#new-height`);
          modal.classList.remove("hide");
          new_width.value = cWidth;
          new_height.value = cHeight;
          modal.querySelector("button").addEventListener("click", function() {
            if (new_width.value == cWidth && new_height.value == cHeight) {
              alert("You didn't change the canvas size.");
              new_width.focus()
            } else if ((new_width.value < 50 || new_height.value < 50 || new_width.value > 1500 || new_height.value > 1500)) {
              alert("Invalid size. Canvas must be between 50x50 and 1500x1500")
              new_width.focus()
            } else {
              request_canvas_resize(parseInt(new_width.value),parseInt(new_height.value))
              modal.classList.add('hide');
              document.querySelector("#art canvas").focus();
              document.body.classList.remove("modal-open")
            }
          });
        }
    })

    document.querySelector(`[data-action="save-canvas"]`).addEventListener("click", (event) => {
      event.target.parentNode.classList.remove("show");
      saveFlatCanvas()
    });
    document.querySelector(`[data-action="save-layer"]`).addEventListener("click", (event) => {
      event.target.parentNode.classList.remove("show");
      saveOneLayer(LAYERS[current_layer])
    });

    document.querySelector("#chatsend").addEventListener("click", (event) => {
        sendChatMessage();
    });
    document.querySelector("#chatmsg").addEventListener("keyup", (event) => {
        if (event.key == "Enter") {
            sendChatMessage();
        }
    });

    // set default tool
    changeActiveTool('pen')

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

function kick(socket_id) {
  socket.emit('initiate_kick',{target: socket_id})
}

function promote(socket_id) {
  socket.emit('admin_promote',{target: socket_id})
}

function demote(socket_id) {
  socket.emit('admin_demote',{target: socket_id})
}

function request_add_layer() {
  if (LAYERS.length == MAX_LAYERS) {
    alert("sorry, too many layers!");
    console.log("hit max layer count");
    return;
  }
  action_cnt++;
  let action = {
        id: genActId(),
        username: user,
        timestamp : Date.now(),
        type: 'add_layer',
        baked: false,
        undid: false,
        finalized: true,
    }
  socket.emit('request_add_layer',action)
}

function request_canvas_resize(width,height) {
  action_cnt++;
  let action = {
        id: genActId(),
        username: user,
        timestamp : Date.now(),
        type: 'resize_canvas',
        new_width: width,
        new_height: height,
        old_width: cWidth,
        old_height: cHeight,
        baked: false,
        undid: false,
        finalized: true,
        layer: 0
    }
  socket.emit('request_canvas_resize',action)
}

function request_clear_layer(layer) {
  if (LAYERS[layer].stroke_history.length-1 == LAYERS[layer].history_start[LAYERS[layer].history_start.length-1]) {
    alert("You just cleared this layer.");
    return;
  }
  action_cnt++;
  let action = {
        id: genActId(),
        username: user,
        timestamp : Date.now(),
        layer: layer,
        type: 'clear_layer',
        new_index: LAYERS[layer].stroke_history.length,
        baked: false,
        undid: false,
        finalized: true,
    }
  socket.emit('request_clear_layer',action)
}

function request_delete_layer(layer) {
  if (LAYERS.length == 1) {
    alert("you must have at least 1 layer");
    console.log("need at least one layer");
    return;
  }
  action_cnt++;
  let action = {
        id: genActId(),
        username: user,
        timestamp : Date.now(),
        layer: layer,
        type: 'delete_layer',
        baked: false,
        undid: false,
        finalized: true,
    }
  socket.emit('request_delete_layer',action)
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

  if (ZOOMING) {
    ZOOM.scale_factor *= ZOOM_MULTIPLIER
    if (ZOOM.scale_factor <= 0.5) {
      ZOOM.scale_factor = 0.5
    } else if (ZOOM.scale_factor >= 5) {
      ZOOM.scale_factor = 5
    }
    OFFSET = calculateOffset()
  }
  if (PANNING) {
    ZOOM.pan_x += PAN.x
    ZOOM.pan_y += PAN.y
    OFFSET = calculateOffset()
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
        lineBresenham(LAYERS[data.layer].mask, data.px, data.py, data.x, data.y, data.size,[0,0,0,255 - data.alpha]);
    if (local) {
        //lineBresenham(LAYERS[data.layer].mask, data.px, data.py, data.x, data.y, data.size,[0,0,0,0]);
        boundingBoxEnd.x = max(boundingBoxEnd.x, data.x);
        boundingBoxEnd.y = max(boundingBoxEnd.y, data.y);
        boundingBoxStart.x = min(boundingBoxStart.x, data.x);
        boundingBoxStart.y = min(boundingBoxStart.y, data.y);
    }

  } else if (data.tool == 'fill') {
    if (local) {
        floodScanFill(LAYERS[data.layer],ACTION_LAYER,data.x,data.y,[red(data.color),green(data.color),blue(data.color),data.alpha]);
        boundingBoxEnd.x = LAYERS[data.layer].width;
        boundingBoxEnd.y = LAYERS[data.layer].height;
        boundingBoxStart.x = 0;
        boundingBoxStart.y = 0;
    }

  } else if (data.tool == 'select') {
    rectSelect(UI_LAYER,LAYERS[current_layer])
  }
  if (!local) {
    USER_LABELS.push({username: data.username, ucolor: data.ucolor, x: data.rawx, y: data.rawy})
  }
}

function createSpriteFromPixelsArray(data) {
    let img = createImage(data.width, data.height).pixelDensity(1);
    img.loadPixels()
    const src = new Uint8Array(data.pixels);
    //const src = [...typedArray];
    for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
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

function genActId(cnt = 0) {
    return (
        `${user}-${Date.now().toString(36)}-${action_cnt+cnt}`
    );
}

function mousePressed() {
  if (mouseButton.left && inDrawingArea() && !document.body.classList.contains("modal-open")) {
    if (current_tool == 'eyedropper') {
      var selected_pixel = color(redrawLayer(LAYERS[current_layer]).get((mouseX - OFFSET.x) / ZOOM.scale_factor,(mouseY - OFFSET.y) / ZOOM.scale_factor));
        //console.log(selected_pixel);
        if (alpha(selected_pixel) > 0) {
            colorPicker.value(selected_pixel.toString("#rrggbb"));
            alphaSlider.value(255);
            set_color(document.querySelector("#color-select")); //update color picker
        }
    } else if (current_tool == 'zoom') {
        ZOOMING = true;
        ZOOM_MULTIPLIER = 1.05;
    } else {
      IS_DRAWING = true;
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
              rawx: mouseX - OFFSET.x,
              rawy: mouseY - OFFSET.y,
              rawpx: pmouseX - OFFSET.x,
              rawpy: pmouseY - OFFSET.y,
              size: strokeWidth,
              color: colorPicker.value(),
              alpha: alphaSlider.value(),
              layer: current_layer,
              username: user,
              ucolor: ucolor,
              timestamp: Date.now(),
              finalized: false
          };

          // apply locally
          canvasAction(data, true);

          // send to server
          socket.emit("send_canvas_action", data);
    }
    
  } else if (mouseButton.right && inDrawingArea() && !document.body.classList.contains("modal-open")) {
    if (current_tool == 'zoom') {
      ZOOMING = true;
      ZOOM_MULTIPLIER = 0.95;
    }
  }
}
function mouseDragged() {
    if (IS_DRAWING && inDrawingArea() && current_tool != 'fill' && document.activeElement.id == "paint" && !document.body.classList.contains("modal-open")) {
        const data = {
            id: genActId(1),
            num: action_cnt+1,
            tool: current_tool,
            x: parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor),
            y: parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor),
            px: parseInt((pmouseX - OFFSET.x) / ZOOM.scale_factor),
            py: parseInt((pmouseY - OFFSET.y) / ZOOM.scale_factor),
            rawx: mouseX - OFFSET.x,
            rawy: mouseY - OFFSET.y,
            rawpx: pmouseX - OFFSET.x,
            rawpy: pmouseY - OFFSET.y,
            size: strokeWidth,
            color: colorPicker.value(),
            ucolor: ucolor,
            alpha: alphaSlider.value(),
            layer: current_layer,
            username: user,
            timestamp: Date.now(),
            finalized: false
        };

        // apply locally
        canvasAction(data, true);

        // send to server
        socket.emit("send_canvas_action", data);
    }
}

function mouseReleased() {
  if (IS_DRAWING) {
    // finalize action to send to undo stack here
    
    IS_DRAWING = false;
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
      img = getStroke(LAYERS[action.layer].mask,0,0,LAYERS[action.layer].mask.width,LAYERS[action.layer].mask.height)
      action.x = 0;
      action.y = 0;
      action.width = LAYERS[action.layer].mask.width;
      action.height = LAYERS[action.layer].mask.height;
    } else if (action.type == 'fill') {
      action.x = 0;
      action.y = 0;
      action.width = LAYERS[action.layer].mask.width;
      action.height = LAYERS[action.layer].mask.height;
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
      type: "NEW_STROKE",
      action: action
    });
    UNDO_STACK.push(action)

    LAYERS[action.layer].live.clear();
    LAYERS[action.layer].mask.background((255,255,255,255));
    ACTION_LAYER.clear()

    console.log(action)

    console.log(`Stroke #${action.num} type: ${action.type} on layer #${action.layer} at ${action.timestamp}`);
  }
  ZOOMING = false;
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
  document.querySelector("#art canvas").classList = `p5Canvas ${current_tool}`;
  console.log(`tool is now ${current_tool}`)
}

function keyPressed() {
  if(inCanvasBounds() && document.activeElement.id == "paint") {
    if (key === 'z' || key === 'Z') {
      ACTION_QUEUE.push({type: "UNDO_LOCAL"})
      console.log("pushed undo")
    }
    if (key === 'y' || key === 'Y') {
      ACTION_QUEUE.push({type: "REDO_LOCAL"})
    }
    if (key === 'a' || key === 'A') {
      changeActiveTool('pen')
    }
    if (key === 's' || key === 'S') {
      changeActiveTool('pencil')
    }
    if (key === 'd' || key === 'D') {
      changeActiveTool('eraser')
    }
    if (key === 'f' || key === 'F') {
      changeActiveTool('fill')
    }
    if (key === 'r' || key === 'R') {
      changeActiveTool('zoom')
    }
    if (key === 'e' || key === 'E') {
      changeActiveTool('eyedropper')
    }
    if (key === 'w' || key === 'W') {
      if (current_tool == 'zoom') {
        
      } else if (strokeWidth < 100) {
        strokeWidth += 2;
        document.querySelector("#stroke-width-picker").value = strokeWidth;
        document.querySelector('#current_stroke_width').innerText = document.querySelector("#stroke-width-picker").value;
      }
    }
    if (key === 'q' || key === 'Q') {
      if (strokeWidth > 2) {
        strokeWidth -= 2;
        document.querySelector("#stroke-width-picker").value = strokeWidth;
        document.querySelector('#current_stroke_width').innerText = document.querySelector("#stroke-width-picker").value
      }
    }
    if (key === " ") {
      // create layer
      console.log(`reset scale factor`)
      ZOOM.scale_factor = 1.0
      ZOOM.pan_x = 0
      ZOOM.pan_y = 0
      OFFSET = calculateOffset()
    }
    if (key == UP_ARROW) {
      PANNING = true;
      PAN.y = -10
    }
    if (key == DOWN_ARROW) {
      PAN.y = 10
      PANNING = true;
    }
    if (key == LEFT_ARROW) {
      PANNING = true;
      PAN.x = 10
    }
    if (key == RIGHT_ARROW) {
      PANNING = true;
      PAN.x = -10
    }
  }
}

function keyReleased() {
  if (key === RIGHT_ARROW || key == LEFT_ARROW || key == DOWN_ARROW || key == UP_ARROW ) {
    // Code to run.
    PANNING = false;
    PAN = {x: 0, y: 0}
  }
}

function chatLine(name, color, message, server = false) {
    let line = document.createElement("li");
    if (server) {
      line.innerHTML = `<b>[SERVER]</b> `
    }
    line.innerHTML += `<span class="name"></span><span class="message"></span>`;
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
        document.querySelector("#chatwrap").scrollTop = document.querySelector("#chatwrap").scrollHeight;
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
