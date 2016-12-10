var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var shortid = require('shortid');
var Room = require('./room')(io);
var generateName = require('sillyname');

var rooms = {};

app.set('port', (process.env.PORT || 3000));

app.get('/fonts/glyphicons-halflings-regular.woff2', function (req, res) {
  res.sendFile(__dirname + '/node_modules/bootstrap/dist/fonts/glyphicons-halflings-regular.woff2');
});
app.get('/fonts/glyphicons-halflings-regular.woff', function (req, res) {
  res.sendFile(__dirname + '/node_modules/bootstrap/dist/fonts/glyphicons-halflings-regular.woff');
});
app.get('/css/bootstrap.min.css', function (req, res) {
  res.sendFile(__dirname + '/node_modules/bootstrap/dist/css/bootstrap.min.css');
});
app.get('/js/bootstrap.min.js', function (req, res) {
  res.sendFile(__dirname + '/node_modules/bootstrap/dist/js/bootstrap.min.js');
});
app.get('/js/socket.io.slim.min.js', function (req, res) {
  res.sendFile(__dirname + '/node_modules/socket.io-client/dist/socket.io.slim.min.js');
});
app.get('/js/jquery.slim.min.js', function (req, res) {
  res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.slim.min.js');
});

app.get('/', function (req, res) {
  res.redirect('/room/' + shortid.generate());
});
app.get('/room', function (req, res) {
  res.redirect('/room/' + shortid.generate());
});
app.get('/room/:room_name', function (req, res) {
  res.sendFile(__dirname + '/room.html');
});

io.on('connection', function (socket) {
  socket.user_name = null;
  socket.room = null;
  socket.valid = false;

  socket.on('disconnect', function () {
    if (socket.valid == false) {
      return;
    }

    socket.room.RemoveUser(socket);
  });

  socket.on('join', function (user_name, room_name) {
    if (room_name in rooms == false) {
      console.log('Creating new room "' + room_name + '"');
      rooms[room_name] = new Room(room_name);
    }
    var room = rooms[room_name];

    if (user_name == null || room.IsUsernameInUse(user_name)) {
      for (var i = 0; i < 100; ++i) {
        var temp_name = generateName();
        if (room.IsUsernameInUse(temp_name) == false) {
          user_name = temp_name;
          break;
        }
      }
      if (user_name == null) {
        user_name = 'Guest';
      }
    }

    socket.user_name = user_name;
    room.AddUser(socket);
  });

  socket.on('message', function (message, user_color) {
    if (socket.valid == false) {
      return;
    }

    socket.room.SendMessage(message, socket, user_color);
  });

  socket.on('player_state_change', function (event) {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.room.SetPlayerState(socket, event);
    }
  });

  socket.on('queue_playlist_item', function (video_id) {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.room.QueuePlaylistItem(socket, video_id);
    }
  });

  socket.on('remove_playlist_item', function (unique_id) {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.room.RemovePlaylistItem(socket, unique_id);
    }
  });

  socket.on('select_playlist_item', function (unique_id) {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.room.SelectPlaylistItem(socket, unique_id);
    }
  });

  socket.on('play_next_playlist_item', function () {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.room.PlayNextPlaylistItem(socket);
    }
  });

  socket.on('change_username', function (new_username) {
    if (socket.valid == false) {
      return;
    }

    socket.room.ChangeUsername(socket, new_username);
  });
});


http.listen(app.get('port'), function () {
  console.log('listening on ' + app.get('port'));
});
