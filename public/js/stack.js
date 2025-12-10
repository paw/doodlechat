function performAction(event) {
  switch(event.type) {
    case "NEW_STROKE": {
      // push stroke
      //console.log(`layers before:`,LAYERS[event.action.layer].stroke_history)
      
      if(event.action.type == 'delete_layer' || event.action.type == 'add_layer' || event.action.type == 'clear_layer' || event.action.type == 'resize_canvas') {
        console.log("EVENT",event,event.action.layer,LAYERS[event.action.layer])
        try {
          if(event.action.type == 'delete_layer') {
            deleteCurrentLayer(event.action.layer)
          } else if (event.action.type == 'add_layer') {
            createNewLayer()
          } else if (event.action.type == 'clear_layer') {
            clearLayer(event.action.layer,event.action.new_index);
            LAYERS[event.action.layer].stroke_history.push(event.action)
          } else {
            changeDrawingAreaSize(event.action.new_width, event.action.new_height)
            LAYERS[event.action.layer].stroke_history.push(event.action)
          }
        } catch(err) {
          console.warn('error!',err)
        }
      } else {
        try {
          LAYERS[event.action.layer].stroke_history.push(event.action)
          LAYERS[event.action.layer].live.clear();
          LAYERS[event.action.layer].mask.background((255,255,255,255));
        } catch(err) {
          console.warn(`error!`,err)
        }
      }
      //console.log(`layers after:`,LAYERS[event.action.layer].stroke_history)
      // check undo stack and mark some stuff as bakeable for later
      if (UNDO_STACK.length > MAX_UNDOS) {
        for(let i = 0; i < BAKE_UNDOS; i++) {
          try {
            let act = UNDO_STACK.shift(),
              to_bake = LAYERS[act.layer].stroke_history.find(action => action.id == act.id);
              to_bake.baked = true;
              //socket.emit('bake_req',{})
          } catch(err) {
            console.log(err)
          }
        }
        //ACTION_QUEUE.push({type: "BAKE"})
      }
      // push a bake event
      break;
    }
    case "UNDO_LOCAL": {
      undo()
      break;
    }
    case "UNDO_REMOTE": {
      receiveUndo(event.action);
      LAYERS[event.action.layer].live.clear();
      LAYERS[event.action.layer].mask.background((255,255,255,255));
      break;
    }
    case "REDO_LOCAL": {
      redo()
      break;
    }
    case "REDO_REMOTE": {
      receiveRedo(event.action)
      LAYERS[event.action.layer].live.clear();
      LAYERS[event.action.layer].mask.background((255,255,255,255));
      break;
    }
    case "MARK_BAKE": {
      let to_bake = LAYERS[event.action.layer].filter(action => {action.id == act.id});
      to_bake.baked = true;
      ACTION_QUEUE.push({type: "BAKE"})
      break;
    }
    case "BAKE": {
       // CHECK FOR BAKEABLE
       for(let c = 0; c < LAYERS.length; c++) {
        console.log(`layer ${c} hist b4:`,LAYERS[c].stroke_history.length)
        let layer = LAYERS[c],
            strokes = layer.stroke_history,
            bakeable = strokes.filter(ele => ele.baked == true);
          bakeable.sort(function(x, y){ return x.timestamp - y.timestamp; });
          // bake only if true
          if (bakeable.length > 0) {
            for (let b = 0; b < bakeable.length; b++) {
              let bake_me = bakeable[b] // rmv 1st of bakeable
              if (!bake_me.undid) {
                if(bake_me.type == 'eraser') {
                  layer.baked.mask(bake_me.img);        
                }
                else {
                  layer.baked.copy(bake_me.img, 0, 0, bake_me.width, bake_me.height, bake_me.x, bake_me.y, bake_me.width, bake_me.height);
                }
              }
              strokes.splice(strokes.indexOf(bake_me),1); // remove from layer history
            }
          }

        console.log(`layer ${c} hist after:`,LAYERS[c].stroke_history.length)
       }

      break;
    }
    case "SORT": {
      break;
    }
    default: {
      console.warn(`Unknown dispatch type`)
    }
  }

}

function clearLayer(layer_index,new_history_start) {
  console.log(layer_index,new_history_start)
  let layer = LAYERS[layer_index];
  layer.history_start.push(new_history_start);
  LAYERS[layer_index].live.clear();
  LAYERS[layer_index].mask.background((255,255,255,255));
  console.log(`layer ${layer_index} cleared.`)
}


function undo() {
    
  if (UNDO_STACK.length === 0) {console.log("undo stack empty"); return;}

  try {
    // Pop the last stroke
    let undid_action = UNDO_STACK.pop(),
        hist = LAYERS[undid_action.layer].stroke_history,
        actual_stroke_data = hist.find((action) => action.id == undid_action.id);
    if (undid_action.type == 'clear_layer') {
      LAYERS[undid_action.layer].history_start.pop()
    }
    actual_stroke_data.undid = true;
    undid_action.undid = true;
    REDO_STACK.push(undid_action);
    console.log(`Undid Action #${actual_stroke_data.num}.`);
    socket.emit("undo", { id: undid_action.id, layer: undid_action.layer })
  } catch(err) {
    console.log(`UNDO ERROR: ${err}`)
  }
  
}
function redo() {
  if (REDO_STACK.length === 0) {console.log("redo stack empty"); return;}
  
  try {
    // Pop the last stroke
    let redid_action = REDO_STACK.pop(),
        hist = LAYERS[redid_action.layer].stroke_history,
        actual_stroke_data = hist.find((action) => action.id == redid_action.id);
    if (redid_action.type == 'clear_layer') {
      LAYERS[redid_action.layer].history_start.push(redid_action.new_history_start)
    }
    actual_stroke_data.undid = false;
    redid_action.undid = false;
    UNDO_STACK.push(redid_action);
    console.log(`Redid Action #${actual_stroke_data.num}.`);
    socket.emit("redo", { id: redid_action.id, layer: redid_action.layer })
  } catch(err) {
    console.log(`REDO ERROR: ${err}`)
  }
}
function receiveUndo(data) {
  try {
    let undo_me = LAYERS[data.layer].stroke_history.find(action => action.id === data.id )
    undo_me.undid = true;
    if (undo_me.type == 'clear_layer') {
      LAYERS[undo_me.layer].history_start.pop()
    }
    console.log(`undo action ${undo_me.id} from ${undo_me.username}`)
  } catch(err) {
    console.warn("REMOTE UNDO ISSUE?",err)
  }
  LAYERS[data.layer].live.clear();
}
function receiveRedo(data) {
  try {
    let redo_me = LAYERS[data.layer].stroke_history.find(action => action.id === data.id);
    redo_me.undid = false;
    if (redo_me.type == 'clear_layer') {
      LAYERS[redo_me.layer].history_start.push(redo_me.new_index)
    }
    console.log(`redo action ${redo_me.id} from ${redo_me.username}`)
  } catch (err) {
    console.warn("REMOTE REDO ISSUE?",err)
  }
  LAYERS[data.layer].live.clear();
}

function createCheckerboard() {
  CHECKERBOARD.clear();
  CHECKERBOARD.background(255)
  CHECKERBOARD.noStroke();
  for (let i = 0; i < cWidth / 10; i++) {
    for (let j = 0; j < cHeight / 10; j++) {
      if (j % 2 == 0) {
        if (i % 2 == 0) {
        	CHECKERBOARD.fill(0,0,0,15);
        }
        else {
          CHECKERBOARD.fill(255,255,255,150);
        }
      }
      else {
        if (i % 2 == 0) {
        	CHECKERBOARD.fill(255,255,255,150);
        }
        else {
          CHECKERBOARD.fill(0,0,0,15);
        }
      }
      CHECKERBOARD.rect(i * 10, j * 10, 10, 10);
    }
  }
}

function clearLayer(layer_index) {
  let layer = LAYERS[layer_index];
  layer.history_start.push(layer.stroke_history.length);
  console.log(layer.history_start)
  layer.live.clear();
  layer.mask.background((255,255,255,255));
}

function redrawLayer(layer) {
  // make sure everything is drawn in order
  layer.stroke_history.sort(function(x, y){ return x.timestamp - y.timestamp; });

  let temp_image = createImage(layer.live.width, layer.live.height).pixelDensity(1);
    
    noSmooth();
    temp_image.copy(layer.baked, 0, 0, layer.baked.width, layer.baked.height, 0, 0, layer.baked.width, layer.baked.height);
    
    for (let i = layer.history_start[layer.history_start.length-1]; i < layer.stroke_history.length; i++) {
      one_bake = layer.stroke_history[i]
      if(!one_bake.undid) {
        if (one_bake.type == 'clear_layer' || one_bake.type == 'resize_canvas') {
          // do nothing :) we just save this for records
        } else if (one_bake.type == 'eraser') {
          temp_image.mask(one_bake.img);
        }
        else {
          temp_image.copy(one_bake.img, 0, 0, one_bake.width, one_bake.height, one_bake.x, one_bake.y, one_bake.width, one_bake.height);
        } 
      }
    };
    
  // finally mask the layer
    temp_image.mask(layer.mask);
    
    return temp_image;
}

function deleteCurrentLayer(current) {
  
  //console.log(LAYERS)
  if (LAYERS.length == 1) { console.log("need at least one layer"); return; }
  
  // TODO: change this to save layer for undos until a certain point is reached to allow for UNDO delete?
  let deadlayer = LAYERS[current];
  console.log(LAYERS[current],LAYERS)
  let index = LAYERS.indexOf(deadlayer)
  LAYERS.splice(index,1)
  // TODO: temporarily delete layer to allow for undos?
  // REMOVED_LAYERS.push(deadlayer)
  // cleanup
  deadlayer.live.remove();
  deadlayer.mask.remove();
  delete deadlayer.baked;
  delete deadlayer.stroke_history;
  deadlayer.removed = true;
  // remove any actions assigned to this layer index from the undo stack
  UNDO_STACK = UNDO_STACK.filter(function(action){return action.layer != current});
  // shift user to nearest layer
  current_layer = (current_layer-1 < 0 ) ? 0 : current_layer-1;
  CONNECTIONS.find(ele => ele.socket_id == socket.id).current_layer = current_layer;
  socket.emit("update_current_layer",{ layer: current_layer })
}

function createNewLayer() {
  if (LAYERS.length+1 > MAX_LAYERS) { console.log("you hit the max, sorry!"); return; }
    // push empty layer
    try {
      let lyr = {
        live : createGraphics(cWidth,cHeight).pixelDensity(1),
        mask: createGraphics(cWidth,cHeight).pixelDensity(1), // https://p5js.org/reference/p5/clip/
        baked : createImage(cWidth, cHeight).pixelDensity(1), //createGraphics(cWidth,cHeight).pixelDensity(1),
        removed: false,
        hidden: false,
        history_start: [0],
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
  if (x < 50 || y < 50 || x > 1500 || y > 1500) {
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

    let old_live = LAYERS[i].live,
        old_baked = LAYERS[i].baked,
        old_mask = LAYERS[i].mask;

    // create new graphics
    LAYERS[i].live = createGraphics(cWidth, cHeight).pixelDensity(1);
    LAYERS[i].mask = createGraphics(cWidth, cHeight).pixelDensity(1);
    LAYERS[i].baked = createImage(cWidth, cHeight).pixelDensity(1);

    // draw previous content into the new resized canvas
    LAYERS[i].live.image(old_live, 0, 0);
    LAYERS[i].baked.copy(old_baked, 0, 0, old_baked.width, old_baked.height,0, 0, old_baked.width, old_baked.height);

    // fill new mask with white and draw old mask on top
    LAYERS[i].mask.background(255);
    LAYERS[i].mask.image(old_mask, 0, 0);

    // cleanup
    old_live.remove();
    old_mask.remove();
  }

  // recalc offset with NEW width/height
  OFFSET = calculateOffset();
}

function saveOneLayer(layer) {
  let final_layer = redrawLayer(layer);
  save(final_layer, `layer${LAYERS.indexOf(layer)+1}.png`);
}

function importToLayer(layer) {
  // get file input from user
  
  // draw file as image to layer w/ no smooth on
  
}

function saveFlatCanvas() {
  let flat_canvas = createImage(cWidth, cHeight).pixelDensity(1);
  LAYERS.forEach(layer => {
    if (!layer.removed) {
      let myimg = redrawLayer(layer);
      flat_canvas.copy(myimg,0,0,myimg.width, myimg.height,0,0,myimg.width, myimg.height)
    }
  })
  save(flat_canvas, 'canvas.png');
}