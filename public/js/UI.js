function bubble(x, y, r, s) {
  this.x = x;
  this.y = y;
  this.r = r;
  this.s = s;
}

function drawUsername(user,pos) {
  textSize(32);
  fill(255);
  stroke(0);
  strokeWeight(4);
  text(user, 50, 50);
}

function drawUI() {
  UI_LAYER.clear()
  
  UI_LAYER.fill(ucolor);
  UI_LAYER.stroke(0);
  UI_LAYER.strokeWeight(4);
  UI_LAYER.textAlign(LEFT);
  
  UI_LAYER.text(user, parseInt(mouseX)+5, parseInt(mouseY)-20);
  
  UI_LAYER.strokeWeight(0);
  UI_LAYER.fill(0);
  UI_LAYER.text(`actual x: ${parseInt(mouseX)} y: ${parseInt(mouseY)}`, 10, 15);
  
  UI_LAYER.text(`relative x: ${parseInt((mouseX - OFFSET.x) / ZOOM.scale_factor)} y: ${parseInt((mouseY - OFFSET.y) / ZOOM.scale_factor)}`, 10, 30);
  
  
  UI_LAYER.textAlign(RIGHT);
  UI_LAYER.text(`layer #${current_layer+1} / ${LAYERS.length} - ${current_tool} ${strokeWidth}px ${ucolor}`,UI_LAYER.width - 20,15)
  UI_LAYER.text(`total actions: ${action_cnt}`,UI_LAYER.width - 20,30)
}