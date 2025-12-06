const express = require('express')
const http = require('http');
const app = express();
const expressLayouts = require('express-ejs-layouts'); // backend rendered layouts for testing
const PORT = process.env.PORT || 3000;

var connections = [],
    userdata = [],
    layerstates = [],
    global_midpoint_stack = [],
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
    connections.push(data);

    // send global action stack for new joiner to process to be brought up to date
    socket.emit("get_canvas_progress",global_actions_stack);
    //socket.emit("get_chat_history",global_chat_stack);

    // alert everyone to new user
    socket.emit('user_join',data);
    socket.broadcast.emit('user_join',data);

    // everyone redraws users list
    socket.emit('list_current_users',connections);
    socket.broadcast.emit('list_current_users',connections);
    console.log(connections);
  });


  socket.on('send_canvas_action', (data) => {
    socket.broadcast.emit('get_canvas_action', data);
    global_midpoint_stack.push(data);
  });
  socket.on('send_finalized_action', (data) => {
    socket.broadcast.emit('get_finalized_action', data);
    global_actions_stack.push(data);
  });
  socket.on('undo', (data) => {
    socket.broadcast.emit('get_undo', data);
    //global_actions_stack.filter(ele => {ele.id == data.id})[0].undid = true;
  });
  socket.on('redo', (data) => {
    socket.broadcast.emit('get_redo', data);
    //global_actions_stack.filter(ele => {ele.id == data.id})[0].undid = false;
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


