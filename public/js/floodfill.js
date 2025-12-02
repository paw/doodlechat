

function colorsEqual(c1,c2) {
  return JSON.stringify(c1) === JSON.stringify(c2); // lazy
}

function getPixelRGBA(layer,x,y) {
  let index = (x + y * layer.width) * 4;
  return [
    layer.pixels[index + 0],
    layer.pixels[index + 1],
    layer.pixels[index + 2],
    layer.pixels[index + 3]
  ]
}
function setPixel(layer,x,y,ucolor) {
  let index = (x + y * layer.width) * 4;
    layer.pixels[index + 0] = ucolor[0]
    layer.pixels[index + 1] = ucolor[1]
    layer.pixels[index + 2] = ucolor[2]
    layer.pixels[index + 3] = ucolor[3]
}

function squareFill(layer,startX,startY,endX,endY,ucolor) {
  layer.loadPixels();
  for (var x = startX; x < endX; x++) {
    for (var y = startY; y < endY; y++) {
      setPixel(layer,x,y,ucolor)
    }
  }
}

function scanAdjacents(snapshot,stack,start_color,left, right, newY) {
    let inScanline = false;
    for (let i = left; i <= right; i++) {
      let same = colorsEqual(start_color, getPixelRGBA(snapshot, i, newY));
      if (same && !inScanline) { // only want to push next row once
        stack.push({ x: i, y: newY });
        inScanline = true;
      } else if (!same && inScanline) {
        inScanline = false;
      }
    }
  }

// TODO add tolerance?
function floodScanFill(layer,action_layer,clickX,clickY,ucolor) {
  clickX = int(clickX)
  clickY = int(clickY)
  let scan = true;
  
  // create a snapshot of the current layer including baked and all
  let snapshot = redrawLayer(layer);
  snapshot.loadPixels();
  action_layer.loadPixels();
  
  // get pixel color of clicked pixel
  let start_color = getPixelRGBA(snapshot,clickX,clickY)
  console.log(start_color,ucolor)
  if (colorsEqual(start_color,ucolor)) scan = false;
  
  if (scan) {
    let stack = [{x:clickX,y:clickY}];
    do {
      let pnt = stack.pop(),
          left = pnt.x,
          right = pnt.x;
      while (left >= 0 && colorsEqual(start_color,getPixelRGBA(snapshot,left-1,pnt.y))) {
        left--;
      }
      while (right <= layer.live.width && colorsEqual(start_color,getPixelRGBA(snapshot,right+1,pnt.y))) {
        right++;
      }
      
      // loop over pixels in row
      for (let i = left; i <= right; i++) {
        setPixel(action_layer,i,pnt.y,ucolor)
        setPixel(snapshot,i,pnt.y,ucolor)
      }
      // scan adjacent pixels in the snapshot
      if (pnt.y - 1 >= 0) {
        scanAdjacents(snapshot,stack,start_color,left,right,pnt.y - 1)
      }
      if (pnt.y + 1 < snapshot.width) {
        scanAdjacents(snapshot,stack,start_color,left,right,pnt.y + 1)
      }
    } while (stack.length > 0)
  }
  
  action_layer.updatePixels();
}
        