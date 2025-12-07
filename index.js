const express = require('express')
const http = require('http');
const app = express();
const expressLayouts = require('express-ejs-layouts'); // backend rendered layouts for testing
const PORT = process.env.PORT || 3000;

var connections = [],
    userdata = [],
    layerstates = [],
    global_actions_stack = [],
    global_chat_stack = [];

// Static Files
app.use(express.static('public'))
// Example for other folders - not required
// app.use('/css', express.static(__dirname + 'public/css'))

// Set Templating Engine
app.use(expressLayouts)
app.set('layout', './layouts/full-width')
app.set('view engine', 'ejs')

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded());

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
app.get('/draw', (req, res) => {
  res.render('paint', { title: 'DRAW', layout: './layouts/paint' })
})
app.get('/settings', (req, res) => {
  res.render('settings', { title: 'USER SETTINGS', layout: './layouts/main' })
})

io.sockets.on('connection', (socket) => {
 console.log('Client connected: ' + socket.id);
 socket.emit('initial_connection');

  socket.on('new_connection', (data) => {
    /*if (connections.length > 0) {
      socket.emit('retrieve_current_states',layerstates)
    }*/
    data.socket_id = socket.id;
    if (connections.length == 0) {
      data.host = true;
      data.admin = true;
      socket.emit('make_host')
    } else {
      data.host = false;
    }
    data.admin = false;
    connections.push(data);
    

    // send global action stack for new joiner to process to be brought up to date
    socket.emit("get_canvas_progress",global_actions_stack);
    socket.emit("get_chat_history",global_chat_stack);

    // alert everyone to new user
    socket.emit('user_join',data);
    socket.broadcast.emit('user_join',data);

    // everyone redraws users list
    socket.emit('list_current_users',connections);
    socket.broadcast.emit('list_current_users',connections);
    console.log(connections);
  });

  socket.on('admin_promote', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id);
    let target = connections.find((element) => element.socket_id == data.target);
    if (admin.host) {
      // mark target as admin on server side
      target.admin = true;
      // send promote message to the correct socket
      io.to(target.socket_id).emit('promote');
      // emit a server message
      socket.emit('receive_server_message',msg);
      socket.broadcast.emit('receive_server_message',{
        username: target.username,
        color: target.color,
        message: ' has been promoted to ADMIN.'
      });

      // relist users
      socket.emit('list_current_users',connections);
      socket.broadcast.emit('list_current_users',connections);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick')
      socket.broadcast.emit('receive_server_message',{
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      });
    }
  });

  socket.on('admin_demote', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id);
    let target = connections.find((element) => element.socket_id == data.target);
    if (admin.host) {
      // keep track of who is user on
      target.admin = false;
      io.to(target.socket_id).emit('demote');
      let msg = {
        username: target.username,
        color: target.color,
        message: ' is no longer an ADMIN.'
      };
      socket.emit('receive_server_message',msg);
      socket.broadcast.emit('receive_server_message',msg);
      socket.emit('list_current_users',connections);
      socket.broadcast.emit('list_current_users',connections);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick');
      socket.broadcast.emit('receive_server_message',{
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      });
    }
  });

  socket.on('initiate_kick', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id);
    let target = connections.find((element) => element.socket_id == data.target);
    console.log("KICK!",admin.username,target.username)
    if (admin.host || admin.admin) {
      io.to(target.socket_id).emit('kick');
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ` has KICKED ${target.username}.`
      }
      socket.broadcast.emit('receive_server_message',msg);
      socket.emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick');
      socket.broadcast.emit('receive_server_message',{
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      });
    }
  });

  socket.on('request_delete_layer', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id);
    if (admin.host || admin.admin) {
      socket.emit('confirm_delete_layer',{ layer: data.layer, username: admin.username })
      socket.broadcast.emit('confirm_delete_layer',{ layer: data.layer, username: admin.username })
      global_actions_stack.push({ type: 'delete', layer: data.layer})
      let msg = {
        username: admin.username,
        color: admin.color,
        message: ` has deleted layer ${data.layer}.`
      }
      socket.broadcast.emit('receive_server_message',msg);
      socket.emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick');
      socket.broadcast.emit('receive_server_message',{
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      });
    }
  });

  socket.on('request_add_layer', (data) => {
    let admin = connections.find((element) => element.socket_id == socket.id);
    if (admin.host || admin.admin) {
      socket.emit('confirm_add_layer',{ username: admin.username })
      socket.broadcast.emit('confirm_add_layer', { username: admin.username })
      global_actions_stack.push({ type: 'add' })
      let msg = {
        type: 'server',
        username: admin.username,
        color: admin.color,
        message: ' has added a new layer.'
      };
      socket.emit('receive_server_message',msg);
      socket.broadcast.emit('receive_server_message',msg);
    } else {
      // kick since you're not the host and something funny is happening
      socket.emit('kick');
      socket.broadcast.emit('receive_server_message',{
        username: admin.username,
        color: admin.color,
        message: ' has been KICKED by the server due to funny business.'
      });
    }
  });


  socket.on('send_canvas_action', (data) => {
    socket.broadcast.emit('get_canvas_action', data);
  });
  socket.on('send_finalized_action', (data) => {
    socket.broadcast.emit('get_finalized_action', data);
    global_actions_stack.push(data); // we only care about this :)
  });
  socket.on('undo', (data) => {
    socket.broadcast.emit('get_undo', data);
    let filtered = global_actions_stack.filter(ele => ele.id == data.id)[0];
    filtered.undid = true;
    console.log(filtered.id,`UNDO. undid = ${filtered.undid}`)
  });
  socket.on('redo', (data) => {
    socket.broadcast.emit('get_redo', data);
    let filtered = global_actions_stack.filter(ele => ele.id == data.id)[0];
    filtered.undid = false;
    console.log(filtered.id,`REDO. undid = ${filtered.undid}`)
  });

  socket.on('send_chat_message', (data) => {
    socket.broadcast.emit('receive_chat_message', data);
    global_chat_stack.push(data);
  });

 socket.on("disconnect", (reason, details) => {
  console.log('Client has disconnected');
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
    console.log(connections);
    let removed = connections.indexOf(found);
    socket.broadcast.emit('user_disconnect', found);
    connections.splice(removed,1);

    if (found.host && connections.length > 0) {
      let admins = connections.filter(ele => ele.admin == true);
      // if we had admins, cool
      if (admins.length > 0) {
        admins[0].host = true
        io.to(admins[0].socket_id).emit('make_host')
        console.log(`changed host to`,admins[0].username)
        socket.broadcast.emit('receive_server_message',{
          username: found.username,
          color: found.color,
          message: ` [HOST] has left. ${admins[0].username} is the new HOST.`
        });
      } else {
        // if not we just pass the ball to the next user who was in
        connections[0].host = true;
        connections[0].admin = true
        io.to(connections[0].socket_id).emit('make_host')
        console.log(`changed host to`,connections[0].username)
        socket.broadcast.emit('receive_server_message',{
          username: found.username,
          color: found.color,
          message: ` [HOST] has left. ${connections[0].username} is the new HOST.`
        });
      }
    }
    console.log(connections);
    socket.broadcast.emit('list_current_users', connections);
    // clear canvas and chat if everyone leaves
    if (connections.length == 0) {
      global_actions_stack = [];
      global_chat_stack = [];
    }
  });

  socket.on('update_layer_state', (data) => {
    try {
      layerstates[data.index] = data.state;
      socket.emit('success',{action:`updated layer ${data.index}`})
    } catch(err) {
      console.log(`Error! ${err}`)
    }
  })
});

/*app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`)
})*/

server.on('listening', () => {
 console.log(`Server listening on port ${PORT}`)
})
server.listen(PORT)


