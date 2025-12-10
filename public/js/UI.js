
const USER_LABELS = [];

function drawUsername(username,usercolor,pos_x,pos_y) {
  push()
  UI_LAYER.stroke(0);
  UI_LAYER.strokeWeight(4);
  UI_LAYER.fill(usercolor);
  UI_LAYER.textAlign(LEFT);
  UI_LAYER.text(username, pos_x+5, pos_y-20);
  pop();
}

function drawUI() {
  UI_LAYER.clear();
  UI_LAYER.textSize(16);

  if (!(current_tool == 'eyedropper' || current_tool == 'fill' || current_tool == 'eraser')) {
    push()
    UI_LAYER.fill(red(colorPicker.value()),green(colorPicker.value()),blue(colorPicker.value()),alphaSlider.value())
    if(current_tool == 'pencil') {
      UI_LAYER.square(parseInt(mouseX - strokeWidth / 2), parseInt(mouseY - strokeWidth / 2), strokeWidth * ZOOM.scale_factor);
    } else {
      UI_LAYER.ellipse(parseInt(mouseX), parseInt(mouseY), strokeWidth * ZOOM.scale_factor, strokeWidth * ZOOM.scale_factor);
    }
    pop();
  } else if (current_tool == 'eyedropper' || current_tool == 'fill') {
    push();
    UI_LAYER.fill(red(colorPicker.value()),green(colorPicker.value()),blue(colorPicker.value()),alphaSlider.value())
    UI_LAYER.ellipse(parseInt(mouseX), parseInt(mouseY), 4, 4);
    pop();
  }
  
  drawUsername(user,ucolor,parseInt(mouseX),parseInt(mouseY))

  while (USER_LABELS.length > 0) {
    let label = USER_LABELS.shift();
    drawUsername(label.username,label.ucolor,parseInt((label.x + OFFSET.x)),parseInt((label.y + OFFSET.y)))
  }
  
  
  UI_LAYER.strokeWeight(0);
  UI_LAYER.fill(0);
  UI_LAYER.text(`actual x: ${parseInt(mouseX)} y: ${parseInt(mouseY)}`, 10, 15);
  
  UI_LAYER.text(`relative x: ${parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor)} y: ${parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor)}`, 10, 30);
  
  
  UI_LAYER.textAlign(RIGHT);
  UI_LAYER.text(`layer #${current_layer+1} / ${LAYERS.length} - ${current_tool} ${strokeWidth}px ${ucolor}`,UI_LAYER.width - 20,15)
  UI_LAYER.text(`total actions: ${action_cnt}`,UI_LAYER.width - 20,30)
}