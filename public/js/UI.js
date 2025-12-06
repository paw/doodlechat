
const USER_LABELS = [];

function drawUsername(username,usercolor,pos_x,pos_y) {
  UI_LAYER.fill(usercolor);
  UI_LAYER.stroke(0);
  UI_LAYER.strokeWeight(4);
  UI_LAYER.textAlign(LEFT);
  
  UI_LAYER.text(username, pos_x+5, pos_y-20);
}

function drawUI() {
  UI_LAYER.clear();
  

  if (current_tool == 'eraser') {
    CANVAS.classList = 'p5Canvas eraser'
  } else if (current_tool == 'eyedropper') {
    CANVAS.classList = 'p5Canvas dropper'
  } else{
    CANVAS.classList = 'p5Canvas'
    push()
    UI_LAYER.fill(colorPicker.value(),alphaSlider.value())
    if(current_tool == 'pencil') {
      UI_LAYER.square(parseInt(mouseX - strokeWidth / 2), parseInt(mouseY - strokeWidth / 2), strokeWidth);
    } else {
      UI_LAYER.ellipse(parseInt(mouseX), parseInt(mouseY), strokeWidth, strokeWidth);
    }
    pop();
  }
  
  drawUsername(user,ucolor,parseInt(mouseX),parseInt(mouseY))

  while (USER_LABELS.length > 0) {
    let label = USER_LABELS.shift();
    drawUsername(label.username,label.ucolor,parseInt((label.rawx - OFFSET.x) / ZOOM.scale_factor),parseInt((label.rawy - OFFSET.y) / ZOOM.scale_factor))
  }
  
  
  UI_LAYER.strokeWeight(0);
  UI_LAYER.fill(0);
  UI_LAYER.text(`actual x: ${parseInt(mouseX)} y: ${parseInt(mouseY)}`, 10, 15);
  
  UI_LAYER.text(`relative x: ${parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor)} y: ${parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor)}`, 10, 30);
  
  
  UI_LAYER.textAlign(RIGHT);
  UI_LAYER.text(`layer #${current_layer+1} / ${LAYERS.length} - ${current_tool} ${strokeWidth}px ${ucolor}`,UI_LAYER.width - 20,15)
  UI_LAYER.text(`total actions: ${action_cnt}`,UI_LAYER.width - 20,30)
}