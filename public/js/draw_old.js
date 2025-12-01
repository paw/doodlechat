const num_layers = 3;
const connections = [];
const p5layers = [],
      p5baked = [],
      p5states = [],
      my_actions = [],
      global_actions = [];
let counter = 1000,
    previous_state = null,
    messages_sent = 0;

var socket, username, ucolor,
    cWidth = 800, cHeight = 600,
    colorPicker,
    alphaSlider,
    strokeWidth = 4,
    currentLayer = 0,
    current_tool = 'pen',
    current_action = [],
    current_state = 0,
    current_connection_cnt = 0;

    //p5 setup
function setup() {

    // kick out to settings if they refresh or don't have anything set up
    username = localStorage.getItem('draw-username');
    const navType = getNavigationType();
    const isReload = navType === 'reload';
    const isBackForward = navType === 'back_forward';
    if (username == null) {
        window.location.replace("/settings");
    }

    // otherwise we get stuff from local storage ^_^
    ucolor = localStorage.getItem('draw-color');
    // instance mode for layers:
    // https://github.com/processing/p5.js/wiki/

    const wrapper = document.querySelector("#art")
    const canvas = createCanvas(cWidth, cHeight);
    canvas.parent(wrapper);
    wrapper.style = `--width: ${cWidth}px;--height: ${cHeight}px`;
    pixelDensity(1);
    cursor('crosshair');

    // making layers as "graphics" which will render them as separate hidden canvases
    for (let i = 0; i < num_layers; i++) {
        let layer = {
            live: createGraphics(cWidth, cHeight),
            baked: createGraphics(cWidth, cHeight),
            states: [createGraphics(cWidth, cHeight)]
        };
        p5layers.push(layer); //keep track of layers
    }

    // connect to socket
    socket = io.connect('http://localhost:3000');

    socket.on('initial_connection', data => {
        socket.emit("new_connection", {
            username: username,
            color: ucolor
        });
    });
    socket.on('disconnect', data => {
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
	socket.on('canvas_action', data => {
        // draw on canvas
        console.log(`received action from ${data.username}!`)
        global_actions.push(data);
        global_actions.sort(function(x, y){
            return x.timestamp - y.timestamp;
        })
        // each person gets 5 actions
        if (global_actions > 5*current_connection_cnt) {
            // find oldest action by user
            let found = global_actions.find((element) => element.username == data.username);
            // remove
            global_actions.splice(global_actions.indexOf(found),1);
            actOnCanvas(found,true);
        }
		actOnCanvas(data);
        // do actions
        /*data.forEach(action => {

        })*/
	});

    // Callback functions
	socket.on('get_canvas_progress', data => {
        data.forEach(action => {
            actOnCanvas(action);
        });
        console.log("loaded active canvas");
	});
    socket.on('get_chat_history', data => {
        data.forEach(action => {
            actOnCanvas(action);
        });
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
    colorPicker.value(ucolor);
    set_color(document.querySelector("#color-select")); // upodate visuals

	const stroke_width_picker = select('#stroke-width-picker'),
        stroke_label = document.querySelector('#current_stroke_width'),
        layer_select = select('#layer_select'),
        pen_button = select('#pen'),
        pencil_button = select('#pencil'),
        eraser_button = select('#eraser'),
        eyedropper_button = select('#eyedropper'),
        undo = select('#undo'),
        redo = select('#redo'),
        clear_button = select('li[data-action="clear"]');

    
    canvas.mouseClicked(() => {
        current_action.push(record_action());
    });
    canvas.mouseReleased(() => {
        finalize_action(current_action);
    });

    undo.mouseClicked(() => {
        p5layers[currentLayer]["live"].clear();
        //p5layers[currentLayer]["live"].set(p5layers[currentLayer]["states"][p5layers[currentLayer]["states"].length-1]);
        // loop thru global actions and redraw each user's sprite here
        my_actions.pop();
        my_actions.forEach(action => {
            action.forEach(subaction => {
                actOnCanvas(subaction)
            })
        })
    });

    /*layer_select.mouseReleased(() => {
        let val = layer_select.value();
        currentLayer = val;
    });*/
    document.querySelector("#layer_select").addEventListener("change", function() {
        let val = layer_select.value();
        currentLayer = val;
        console.log(`layer is now ${currentLayer}`)
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
        console.log(`clear layer: ${currentLayer}`);
        p5layers[currentLayer].clear();
        sendCanvasAction(`clear`, 0, 0, cWidth, cHeight);
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

async function getState() {
    
}
/* <div id="chatinput">
            <input type="text" id="chatmsg" placeholder="Chat..."/><button id="chatsend">Send</button>
        </div> */
function sendChatMessage() {

    let message = document.querySelector("#chatmsg");
    if (message.value.length > 0) {
        let data = {
            username: username,
            color: ucolor,
            message: message.value
        };
        document.querySelector("#chatwrap ul").append(chatLine(username,ucolor,`: ${message.value}`));
        socket.emit("send_chat_message", data);
        message.value = '';
        message.focus();
        console.log("sent chat message");
    } else {
        console.log("no message no sending.");
        message.focus();
    }  
}

function record_action() {
    let action = {
        tool: current_tool,
        x: parseInt(mouseX),
        y: parseInt(mouseY),
        px: parseInt(pmouseX),
        py: parseInt(pmouseY),
        color: colorPicker.value(),
        alpha: alphaSlider.value(),
        strokeWidth: strokeWidth,
        layer: currentLayer,
        username: username
    };
    local_action(action); // do local action
    return action; // return data that was done
}

function local_action(data) {
    actOnCanvas(data);
    // Send the mouse coordinates to server
    if (current_tool != "eyedropper") {
        sendCanvasAction(current_tool, parseInt(mouseX), parseInt(mouseY), parseInt(pmouseX), parseInt(pmouseY));
        // add to global actions
    }
}
function finalize_action(action) {
    my_actions.push(action);
    if (my_actions.length > 5) {
        let time_to_bake = my_actions.shift();
        time_to_bake.forEach(subaction => {
            actOnCanvas(subaction,true)
        })
    }
    let state = createGraphics(cWidth,cHeight,p5layers[action[0].layer]["live"]);
    p5layers[action[0].layer]["states"].push(state);
    console.log(`layer ${action[0].layer} with states:`);
    console.log(p5layers[action[0].layer]["states"]);
    console.log(`my actions of length ${my_actions.length}:`);
    console.log(my_actions);
    current_action = []
}

function mouseDragged() {
    if (mouseInBounds()) {
        current_action.push(record_action());
    }
}

// RENDERING LOOP
function draw() {
    // clear
    clear();
    background('rgba(0, 0, 0, 0)');
    // Display the mouse's coordinates.

    p5layers.forEach(layer => {
        image(layer["baked"], 0, 0)
        image(layer["live"], 0, 0)
    })
    text(`x: ${parseInt(mouseX)} y: ${parseInt(mouseY)}`, 10, 15);
}

function squareSelect() {

}

function mousePressed() {
    // start recording action
}
function mouseReleased() {
    // add action to stack
    if (mouseInBounds()) {
        console.log(`stuff in action: ${messages_sent}`)
        messages_sent = 0;
    }
}

function actOnCanvas(data, bake = false) {
    let what_kind = (bake == true) ? "baked" : "live";
    if (data.tool == 'pen') {
        // Draw
        p5layers[data.layer][what_kind].stroke(red(data.color),green(data.color),blue(data.color),data.alpha)
        p5layers[data.layer][what_kind].strokeWeight(data.strokeWidth)
        p5layers[data.layer][what_kind].line(parseInt(data.x), parseInt(data.y), parseInt(data.px), parseInt(data.py));
        console.log(`${data.username} drawing on ${data.layer}`)
    } else if (data.tool == 'pencil') {

        p5layers[data.layer][what_kind].loadPixels();

        let left_x = (data.x - data.strokeWidth/2 >= 0) ? parseInt(data.x - data.strokeWidth/2) : 0,
            right_x = (data.x + data.strokeWidth/2 <= cWidth) ? parseInt(data.x + data.strokeWidth/2) : cWidth,
            top_y = (data.y - data.strokeWidth/2 >= 0) ? parseInt(data.y - data.strokeWidth/2) : 0,
            bottom_y = (data.y + data.strokeWidth/2 <= cHeight) ? parseInt(data.y + data.strokeWidth/2) : cHeight;

        //console.log(`top left: (${left_x},${top_y}) & bottom right: (${right_x},${bottom_y})`);
        //console.log(`r: ${red(data.color)} g: ${green(data.color)} b: ${blue(data.color)} a: ${data.alpha}`)

        for (y = 0; y < cHeight; y++) {
            for (x = 0; x < cWidth; x++) {
                let index = (x+y*cWidth)*4; // index of current pixel

               let in_x_range = (x >= left_x && x <= right_x) ? true : false,
                    in_y_range = (y >= top_y && y <= bottom_y) ? true : false;

                // currently square shape, will apply logic to make a circle later
                if (in_x_range && in_y_range) {
                    p5layers[currentLayer].pixels[index] = red(data.color);
                    p5layers[currentLayer].pixels[index+1] = green(data.color);
                    p5layers[currentLayer].pixels[index+2] = blue(data.color);
                    p5layers[currentLayer].pixels[index+3] = data.alpha;
                }
               //
            }
        }
        p5layers[data.layer][what_kind].updatePixels();

        //console.log(`${data.username} pencil brush on ${data.layer}`)
    } else if (data.tool == 'eraser') {

        p5layers[data.layer][what_kind].loadPixels();

        let left_x = (data.x - data.strokeWidth/2 >= 0) ? parseInt(data.x - data.strokeWidth/2) : 0,
            right_x = (data.x + data.strokeWidth/2 <= cWidth) ? parseInt(data.x + data.strokeWidth/2) : cWidth,
            top_y = (data.y - data.strokeWidth/2 >= 0) ? parseInt(data.y - data.strokeWidth/2) : 0,
            bottom_y = (data.y + data.strokeWidth/2 <= cHeight) ? parseInt(data.y + data.strokeWidth/2) : cHeight;

        console.log(`top left: (${left_x},${top_y}) & bottom right: (${right_x},${bottom_y})`);
        //let density = p5layers[currentLayer].pixelDensity();

        /*Given a circle centered at (0,0) and radius r and a point p(x,y) 
            F(p) = x2 + y2 - r2 
            if F(p)<0, the point is inside the circle
            F(p)=0, the point is on the perimeter
            F(p)>0, the point is outside the circle */

        for (y = 0; y < cHeight; y++) {
            for (x = 0; x < cWidth; x++) {
                let index = (x+y*cWidth)*4; // index of current pixel

               let in_x_range = (x >= left_x && x <= right_x) ? true : false,
                    in_y_range = (y >= top_y && y <= bottom_y) ? true : false;
                //let fp = (strokeWidth > 5) ? x^2 + y^2 - (strokeWidth/2)^2 : 0;

                /*if ((in_x_range && in_y_range) && fp <= 0) {
                    console.log(`point (${x},${y}) in range with fp of ${fp}. x^2 = ${x^2}, y^2= ${y^2}, r^2 = ${(strokeWidth/2)^2} vs stroke width: ${strokeWidth}`)
                    p5layers[currentLayer].pixels[index] = 0;
                    p5layers[currentLayer].pixels[index+1] = 0;
                    p5layers[currentLayer].pixels[index+2] = 0;
                    p5layers[currentLayer].pixels[index+3] = 0;
                }*/

                // currently square shape, will apply logic to make a circle later
                if (in_x_range && in_y_range) {
                    if (p5layers[data.layer][what_kind].pixels[index+3] != 0) {
                        p5layers[data.layer][what_kind].pixels[index+3] -= data.alpha;
                    }
                }
               //
            }
        }
        p5layers[data.layer][what_kind].updatePixels();

        //console.log(`${data.username} erasing on ${data.layer}`)
    } else if (data.tool == "eyedropper") {
        var selected_pixel = color(canvas.get(data.x,data.y));
        //console.log(selected_pixel);
        if (alpha(selected_pixel) > 0) {
            colorPicker.value(selected_pixel.toString("#rrggbb"));
            alphaSlider.value(255);
            set_color(document.querySelector("#color-select")); //update color picker
        }
        //alphaSlider.value(alpha(selected_pixel));
    } else if (data.tool == "clear") {
        p5layers[data.layer]["live"].clear()
        p5layers[data.layer]["baked"].clear();
        //console.log(`${data.username} cleared layer ${data.layer}`)
    }
    if (!bake) {

    }
    //p5states[currentLayer] = p5layers[currentLayer].get();
    //socket.emit('update_layer_state', {index: currentLayer, state: p5states[currentLayer]});
}

// Sending data to the socket
function sendCanvasAction(tool, x, y, pX, pY) {
	const data = {
        tool: tool,
		x: x,
		y: y,
		px: pX,
		py: pY,
		color: colorPicker.value(),
        alpha: alphaSlider.value(),
		strokeWidth: strokeWidth,
        layer: currentLayer,
        username: username,
        time: Date.now()
	}
    //messages_sent++;
    //console.log(`#${messages_sent}:` + data);

	socket.emit('canvas_action', data)
}

function sendState(layer, state) {
    const data = {
        layer: layer,
        state: state
    }
    socket.emit('canvas_action', data)
}

function mouseInBounds() {
    return ((mouseX >= 0 && mouseX <= cWidth) && (mouseY >= 0 && mouseY <= cHeight));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function chatLine(name, color, message) {
    let line = document.createElement("li");
    line.innerHTML = `<span class="name"></span><span class="message"></span>`;
    line.querySelector(".name").style = `color: ${color}`;
    line.querySelector(".name").innerText = name;
    line.querySelector(".message").innerText = message;
    return line;
}

function set_color(el){
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