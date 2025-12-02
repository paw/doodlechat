function undo() {
    
  if (UNDO_STACK.length === 0) {console.log("undo stack empty"); return;}

  console.log(`before undo ${UNDO_STACK.length}`)
  // Pop the last stroke into redo stack
  let last = UNDO_STACK.pop();
  console.log(`after undo ${UNDO_STACK.length}`)
  REDO_STACK.push(last);
  
  LAYERS[last.layer].stroke_history.pop();

  console.log(`Undid Action #${last.num}.`);
}
function redo() {
  if (REDO_STACK.length === 0) {console.log("redo stack empty"); return;}
  
  let last = REDO_STACK.pop();
  UNDO_STACK.push(last);
  
  LAYERS[last.layer].stroke_history.push(last);
  console.log(`Redid Action #${last.num}.`);
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
  
  let temp_image = createImage(layer.live.width, layer.live.height).pixelDensity(1);
    
    noSmooth();
    temp_image.copy(layer.baked, 0, 0, layer.baked.width, layer.baked.height, 0, 0, layer.baked.width, layer.baked.height);
    
    layer.stroke_history.forEach(one_bake => {
      if(one_bake.type == 'eraser') {
        temp_image.mask(one_bake.img);
      }
      else {
        temp_image.copy(one_bake.img, 0, 0, one_bake.width, one_bake.height, one_bake.x, one_bake.y, one_bake.width, one_bake.height);
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