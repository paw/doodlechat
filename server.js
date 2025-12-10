const express = require('express')
const http = require('http');
const app = express();
const expressLayouts = require('express-ejs-layouts'); // backend rendered layouts for testing
const PORT = process.env.PORT || 3000;
const bodyParser  = require( 'body-parser' );

var connections = [],
    rooms = [];

// Static Files
app.use(express.static('public'))
// Example for other folders - not required
// app.use('/css', express.static(__dirname + 'public/css'))

// Set Templating Engine
app.use(expressLayouts)
app.set('layout', './layouts/full-width')
app.set('view engine', 'ejs')

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

const server = http.createServer(app)

server.on('listening', () => {
 console.log('Listening on port 3000')
})

// Web sockets
const io = require('socket.io')(server, {
  maxHttpBufferSize: 1e8    // 100 MB
});

// our custom "verbose errors" setting
// which we can use in the templates
// via settings['verbose errors']
app.enable('verbose errors');

app.get('/', (req, res) => {
  res.render('index', { title: 'MAIN PAGE', layout: './layouts/main' })
})
app.get('/settings', (req, res) => {
  res.render('settings', { title: 'USER SETTINGS', layout: './layouts/main' })
})
app.get('/join', (req, res) => {
  res.render('rooms', { title: 'JOIN AN OPEN ROOM', rooms: rooms.filter(ele => ele.public == true), layout: './layouts/main' })
})
app.get('/open', (req, res) => {
  res.render('open', { title: 'OPEN A ROOM', layout: './layouts/main' })
})
app.post('/open-room', (req, res) => {
    console.log(req.body);
    let id = req.body.url,
        name = req.body.name,
        public = true;
    if (req.body.private == 'on') {
      public = false;
    }
    // remove invalid chars -> remove double spaces -> replace spaces with dashes
    let fin_id = id.replace(/[^\w\s]/gi, '').replace(/ +(?= )/g,'').trim().replace(/ /gi,'-');
    if (rooms.filter(ele => ele.id == id).length > 0 || fin_id.length == 0) {
      res.send("error!")
    } else {
      // create a new room
        rooms.push({
        name: name,
        id: fin_id,
        public: public,
        actions_stack: [],
        chat_stack: []
      });
      console.log(`success! room ${fin_id} was created.`)
      res.redirect(`/draw/${fin_id}`)
    }
})
app.get('/draw/:id', (req, res) => {
  res.render('paint', { title: 'DRAW', layout: './layouts/paint' })
})
app.get('/login', (req, res) => {
    res.send('<form method=POST action=/login><input type=text name=username><input type=number name=age><input type=submit></form>')
})
app.post('/login', (req, res) => {
    console.log(req.body)
    res.send('data has been recieved by the server')
})

io.sockets.on('connection', (socket) => {
 console.log('Client connected: ' + socket.id);
 socket.emit('initial_connection');

  socket.on('new_connection', (data) => {
    if (rooms.find(ele => ele.id == data.room) == undefined) {
      socket.emit('failure','room does not exist')
      socket.disconnect();
      return;
    }
    try {
      data.socket_id = socket.id;
      let room_connections = connections.filter(ele => ele.room == data.room),
          room = rooms.find(room => room.id == data.room);
      if (room_connections.length == 0) {
        data.host = true;
        data.admin = true;
        socket.emit('make_host');
        room.host = data.username;
        let msg = {
          username: data.username,
          color: data.color,
          message: ` has opened ${room.name}. Let's get drawing!`
        };
        room.chat_stack.push({type: "server", data: msg})
      } else {
        data.host = false;
        data.admin = false;
      }

      connections.push(data);
      socket.join(data.room);

      // send global action stack for new joiner to process to be brought up to date
      socket.emit("set_page_title",room.name)
      socket.emit("get_canvas_progress",room.actions_stack);
      socket.emit("get_chat_history",room.chat_stack);

      // alert everyone to new user
      if(!data.host) {
        socket.emit('user_join',data);
        socket.to(data.room).emit('user_join',data);
        room.chat_stack.push({type: "join",data: {
          username: data.username,
          color: data.color,
          message: ' has joined.'
        }})
      }

      // everyone redraws users list
      socket.emit('list_current_users',connections.filter(ele => ele.room == data.room));
      socket.to(data.room).emit('list_current_users',connections.filter(ele => ele.room == data.room));
      console.log(connections);
    } catch(err) {
      //socket.disconnect();
    }
  });

  socket.on('admin_promote', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        target = connections.find((element) => element.socket_id == data.target),
        room = rooms.find(room => room.id == admin.room);
    if (admin.host) {
      // mark target as admin on server side
      target.admin = true;
      // send promote message to the correct socket
      io.to(target.socket_id).emit('promote');
      // emit a server message
      let msg = {
        username: target.username,
        color: target.color,
        message: ' has been promoted to ADMIN.'
      };
      room.chat_stack.push({type: "server", data: msg})
      socket.emit('receive_server_message',msg);
      socket.to(admin.room).emit('receive_server_message',msg);

      // relist users
      socket.emit('list_current_users',connections.filter(ele => ele.room == admin.room));
      socket.to(admin.room).emit('list_current_users',connections.filter(ele => ele.room == admin.room));
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('admin_demote', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        target = connections.find((element) => element.socket_id == data.target),
        room = rooms.find(room => room.id == admin.room);
    if (admin.host) {
      // keep track of who is user on
      target.admin = false;
      io.to(target.socket_id).emit('demote');
      let msg = {
        username: target.username,
        color: target.color,
        message: ' is no longer an ADMIN.'
      };
      room.chat_stack.push({type: "server",data: msg})
      socket.emit('receive_server_message',msg);
      socket.to(admin.room).emit('receive_server_message',msg);
      socket.emit('list_current_users',connections.filter(ele => ele.room == admin.room));
      socket.to(admin.room).emit('list_current_users',connections.filter(ele => ele.room == admin.room));
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('initiate_kick', (data) => {
    try {
      let admin = connections.find((element) => element.socket_id == socket.id),
          target = connections.find((element) => element.socket_id == data.target),
          room = rooms.find(room => room.id == admin.room);
      console.log("KICK!",admin.username,target.username)
      if ((admin.host || admin.admin) && !target.host) {
        io.to(target.socket_id).emit('kick');
        let msg = {
          username: admin.username,
          color: admin.color,
          message: ` has KICKED ${target.username}.`
        }
        room.chat_stack.push({type: "server",data: msg})
        socket.to(admin.room).emit('receive_server_message',msg);
        socket.emit('receive_server_message',msg);
        socket.emit('list_current_users',connections.filter(ele => ele.room == admin.room));
        socket.to(admin.room).emit('list_current_users',connections.filter(ele => ele.room == admin.room));
      } else if (!(admin.host || admin.admin)) {
        // kick since you're not the host and something funny is happening
        socket.emit('kick')
        let msg = {
          username: admin.username,
          color: admin.color,
          message: ' has been KICKED by the server due to funny business.'
        }
        room.chat_stack.push({type: "server", data: msg})
        socket.to(admin.room).emit('receive_server_message',msg);
        }
    } catch(err) {
      console.log("error",err)
    }
  });

  socket.on('request_delete_layer', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        room = rooms.find((ele) => ele.id == admin.room);
    if (admin.host || admin.admin) {
      socket.emit('confirm_delete_layer',data)
      socket.to(admin.room).emit('confirm_delete_layer',data)
      room.actions_stack.push(data)
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ` has deleted Layer ${data.layer+1}.`
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
      socket.emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('request_add_layer', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        room = rooms.find((ele) => ele.id == admin.room);
    if (admin.host || admin.admin) {
      socket.emit('confirm_add_layer',data)
      socket.to(admin.room).emit('confirm_add_layer', data)
      room.actions_stack.push(data)
      let msg = {
        type: 'server',
        username: admin.username,
        color: admin.color,
        message: ' has added a new layer.'
      };
      room.chat_stack.push({type: "server", data: msg})
      socket.emit('receive_server_message',msg);
      socket.to(admin.room).emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('request_canvas_resize', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        room = rooms.find((ele) => ele.id == admin.room);
    if (admin.host || admin.admin) {
      socket.emit('confirm_canvas_resize',data)
      socket.to(admin.room).emit('confirm_canvas_resize', data)
      room.actions_stack.push(data)
      let msg = {
        type: 'server',
        username: admin.username,
        color: admin.color,
        message: ` has resized the canvas from ${data.old_width}x${data.old_height} to ${data.new_width}x${data.new_height}.`
      };
      room.chat_stack.push({type: "server", data: msg})
      socket.emit('receive_server_message',msg);
      socket.to(admin.room).emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('request_clear_layer', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id),
        room = rooms.find((ele) => ele.id == admin.room);
    if (admin.host || admin.admin) {
      socket.emit('confirm_clear_layer',data)
      socket.to(admin.room).emit('confirm_clear_layer', data)
      room.actions_stack.push(data)
      let msg = {
        type: 'server',
        username: admin.username,
        color: admin.color,
        message: ` has cleared Layer ${data.layer+1}.`
      };
      room.chat_stack.push({type: "server", data: msg})
      socket.emit('receive_server_message',msg);
      socket.to(admin.room).emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      }
      room.chat_stack.push({type: "server", data: msg})
      socket.to(admin.room).emit('receive_server_message',msg);
    }
  });

  socket.on('update_current_layer', (data) => {
    let user = connections.find(ele => ele.socket_id == socket.id),
        room = rooms.find(ele => ele.id == user.room);
    user.current_layer = data.layer;
    socket.to(room.id).emit('update_users_layer', {socket_id: socket.id, layer: data.layer});
  });

  socket.on('send_canvas_action', (data) => {
    let room_data = connections.find(ele => ele.socket_id == socket.id).room,
        room = rooms.find(ele => ele.id == room_data);
    socket.to(room.id).emit('get_canvas_action', data);
  });
  socket.on('send_finalized_action', (data) => {
    let room_data = connections.find(ele => ele.socket_id == socket.id).room,
        room = rooms.find(ele => ele.id == room_data);
    socket.to(room.id).emit('get_finalized_action', data);
    room.actions_stack.push(data);
  });
  socket.on('undo', (data) => {
    let room_data = connections.find(ele => ele.socket_id == socket.id).room,
        room = rooms.find(ele => ele.id == room_data);
    socket.to(room.id).emit('get_undo', data);
    let filtered = room.actions_stack.find(ele => ele.id == data.id);
    filtered.undid = true;
    console.log(filtered.id,`UNDO. undid = ${filtered.undid}`)
  });
  socket.on('redo', (data) => {
    let room_data = connections.find(ele => ele.socket_id == socket.id).room,
        room = rooms.find(ele => ele.id == room_data);
    socket.to(room.id).emit('get_redo', data);
    let filtered = room.actions_stack.find(ele => ele.id == data.id);
    filtered.undid = false;
    console.log(filtered.id,`REDO. undid = ${filtered.undid}`)
  });

  socket.on('send_chat_message', (data) => {
    let room_data = connections.find(ele => ele.socket_id == socket.id).room,
        room = rooms.find(ele => ele.id == room_data);
    socket.to(room.id).emit('receive_chat_message', data);
    room.chat_stack.push({type: "normal", data: data});
  });

 socket.on("disconnect", (reason, details) => {
  console.log(`Client ${socket.id} has disconnected`);
  try {
    // the reason of the disconnection, for example "transport error"
    console.log(reason);

    // the low-level reason of the disconnection, for example "xhr post error"
    console.log(details.message);

    // some additional description, for example the status code of the HTTP response
    console.log(details.description);

    // some additional context, for example the XMLHttpRequest object
    console.log(details.context);
  } catch(err) {
    // if they didn't disconnect with details it wasn't a disconnect in error
  }
    // remove them from the list
    let found = connections.find((element) => element.socket_id == socket.id);
    if (!found) {
      console.log("Disconnect: socket was not fully registered, ignoring cleanup");
      return;
    }
    connections.splice(connections.indexOf(found),1);
    console.log("after remove:",connections);

    try {
      socket.to(found.room).emit('user_disconnect', found);
      let connections_in_room = connections.filter(ele => ele.room == found.room);
      socket.to(found.room).emit('list_current_users', connections_in_room);
      let room = rooms.find(room => room.id == found.room);
      room.chat_stack.push({type: "leave",data: {
        username: found.username,
        color: found.color,
        message: ' has left.'
      }})
    
      if (found.host && connections_in_room.length > 0) {
        let admins = connections_in_room.filter(ele => ele.admin == true);
        // if we had admins, cool, the oldest admin gets to rule
        if (admins.length > 0) {
          admins[0].host = true
          room.host = admins[0].username;
          io.to(admins[0].socket_id).emit('make_host')
          console.log(`changed host to`,admins[0].username)
          let msg = {
            username: found.username,
            color: found.color,
            message: ` [HOST] has left. ${admins[0].username} is the new HOST.`
          }
          socket.to(found.room).emit('receive_server_message',msg);
          room.chat_stack.push({type:"server",data:msg})
        } else {
          // if not we just pass the ball to the next oldest user who joined
          connections_in_room[0].host = true;
          connections_in_room[0].admin = true;
          room.host = connections_in_room[0].username;
          io.to(connections_in_room[0].socket_id).emit('make_host')
          console.log(`changed host to`,connections_in_room[0].username)
          let msg = {
            username: found.username,
            color: found.color,
            message: ` [HOST] has left. ${connections[0].username} is the new HOST.`
          }
          socket.to(found.room).emit('receive_server_message',msg);
          room.chat_stack.push({type:"server",data:msg})
        }
      console.log(connections);
      socket.to(found.room).emit('list_current_users', connections.filter(ele => ele.room == found.room));
      // clear canvas and chat if everyone leaves
      }
      if (connections_in_room.length == 0) {
        let room = rooms.find(ele => ele.id == found.room);
        rooms.splice(rooms.indexOf(room),1);
        console.log(`room "${room.id}" empty, now closed.`)
        console.log("ROOMS:",rooms,"CONNECTIONS:",connections)
      }
    } catch (err) {
      console.log("error:",err);
      console.log(connections);
    }
  });

});

// error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', {
    title: "Server Error",
    layout: './layouts/main',
    error: err
  });
});
app.use((req, res, next) => {
  res.status(404).render('404', {
    title: "Page Not Found",
    layout: './layouts/main'
  });
});


server.on('listening', () => {
 console.log(`Server listening on port ${PORT}`)
})
server.listen(PORT)


