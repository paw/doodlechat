function lineBresenham(layer, pX, pY, cX, cY, strokeWidth, ucolor) {
  layer.loadPixels();

  let dx = abs(cX - pX),
      dy = -abs(cY - pY),
      
      sx = (pX < cX) ? 1 : -1,
      sy = (pY < cY) ? 1 : -1,
      err = dx + dy,
      sw = (strokeWidth != 1) ? int(strokeWidth / 2) : 1;

  while (true) {

    let xStart = max(0, pX - sw),
        xEnd   = min(layer.width, pX + sw),
        yStart = max(0, pY - sw),
        yEnd   = min(layer.height, pY + sw);
    
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        let index = (x + y * layer.width) * 4;
        layer.pixels[index + 0] = ucolor[0];
        layer.pixels[index + 1] = ucolor[1];
        layer.pixels[index + 2] = ucolor[2];
        layer.pixels[index + 3] = ucolor[3];
      }
    }

    if (pX === cX && pY === cY) break;

    let e2 = 2 * err;

    if (e2 >= dy) {
      err += dy;
      pX += sx;
    }
    if (e2 <= dx) {
      err += dx;
      pY += sy;
    }
  }

  layer.updatePixels();
}


function replaceMaskColor(layer,action) {
  layer.mask.loadPixels();
  layer.mask_baked.loadPixels();
  // loop thru pixels
  for (let y = action.y; y <= action.y + action.img.height; y++) {
    for (let x = action.x; x <= action.x + action.img.width; x++) {
        let index = (x + y * width) * 4;
      if (layer.mask.pixels[index + 0] == 255) {
        layer.mask.pixels[index + 3] = 0;
        layer.mask_baked.pixels[index + 3] = 0;
      }
    }
  }
  layer.mask.updatePixels();
  layer.mask_baked.updatePixels();
}

function getStroke(action, stroke_start_x, stroke_start_y, box_width, box_height) {
  // apparently get always adds bilinear filtering sooo yeah. ughs
  
  let final_stroke = createImage(parseInt(box_width), parseInt(box_height)).pixelDensity(1),
      source_width = action.width,
      source_height = action.height;
  
  // load pixels
  action.loadPixels();
  final_stroke.loadPixels();

  // loop over section
  for (let y = 0; y < box_height; y++) {
    for (let x = 0; x < box_width; x++) {
      // go from whatever starting x/y pixel
      let source_x = stroke_start_x + x,
          source_y = stroke_start_y + y;



      let source_index = (source_x + source_y * source_width) * 4,
          destination_index = (x + y * box_width) * 4;

      // copy pixels
      final_stroke.pixels[destination_index + 0] = action.pixels[source_index + 0];
      final_stroke.pixels[destination_index + 1] = action.pixels[source_index + 1];
      final_stroke.pixels[destination_index + 2] = action.pixels[source_index + 2];
      final_stroke.pixels[destination_index + 3] = action.pixels[source_index + 3];
    }
  }

  final_stroke.updatePixels();
  return final_stroke;
}


function rectSelect(layer) {
  noFill();
  layer.rect(pmouseX, pmouseY, abs(pmouseX - mouseX), abs(pmouseY - mouseY));
}