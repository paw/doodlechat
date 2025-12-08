function performAction(event) {
  switch(event.type) {
    case "ADD": {
      // push stroke
      //console.log(`layers before:`,LAYERS[event.action.layer].stroke_history)
      
      if(event.action.type == 'delete' || event.action.type == 'add') {
        try {
          if(event.action.type == 'delete') {
            deleteCurrentLayer(event.action.layer)
          } else {
            createNewLayer()
          }
        } catch(err) {
          console.warn('error!',err)
        }
      } else {
        LAYERS[event.action.layer].stroke_history.push(event.action)
        LAYERS[event.action.layer].live.clear();
        LAYERS[event.action.layer].mask.background((255,255,255,255));
      }
      //console.log(`layers after:`,LAYERS[event.action.layer].stroke_history)
      // check undo stack and mark some stuff as bakeable for later
      if (UNDO_STACK.length > MAX_UNDOS) {
        for(let i = 0; i < BAKE_UNDOS; i++) {
          try {
            let act = UNDO_STACK.shift(),
              to_bake = LAYERS[act.layer].stroke_history.filter(action => action.id == act.id)[0];

            console.log(act,to_bake)
          to_bake.baked = true;
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


function undo() {
    
  if (UNDO_STACK.length === 0) {console.log("undo stack empty"); return;}

  try {
    // Pop the last stroke
    let undid_action = UNDO_STACK.pop(),
        hist = LAYERS[undid_action.layer].stroke_history,
        actual_stroke_data = hist.filter((action) => action.id == undid_action.id)[0];
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
        actual_stroke_data = hist.filter((action) => action.id == redid_action.id)[0];
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
    let undo_me = LAYERS[data.layer].stroke_history.filter(action => action.id === data.id )[0]
    undo_me.undid = true;
    console.log(`undo action ${undo_me.id} from ${undo_me.username}`)
  } catch(err) {
    console.warn("REMOTE UNDO ISSUE?",err)
  }
  LAYERS[data.layer].live.clear();
}
function receiveRedo(data) {
  try {
    let redo_me = LAYERS[data.layer].stroke_history.filter(action => action.id === data.id)[0]
    redo_me.undid = false;
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

function redrawLayer(layer) {
  let stuff = layer.stroke_history;
  // make sure everything is drawn in order
  stuff.sort(function(x, y){ return x.timestamp - y.timestamp; });

  let temp_image = createImage(layer.live.width, layer.live.height).pixelDensity(1);
    
    noSmooth();
    temp_image.copy(layer.baked, 0, 0, layer.baked.width, layer.baked.height, 0, 0, layer.baked.width, layer.baked.height);
    
    stuff.forEach(one_bake => {
      if(!one_bake.undid) {
        if(one_bake.type == 'eraser') {
          temp_image.mask(one_bake.img);
        }
        else {
          temp_image.copy(one_bake.img, 0, 0, one_bake.width, one_bake.height, one_bake.x, one_bake.y, one_bake.width, one_bake.height);
        } 
      }
    })
    
  // finally mask the layer
    temp_image.mask(layer.mask);
    
    return temp_image;
}

function saveOneLayer(layer) {
  let final_layer = redrawLayer(layer);
  save(final_layer, `layer${LAYERS.indexOf(layer)}.png`);
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