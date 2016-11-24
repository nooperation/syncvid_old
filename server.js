var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var shortid = require('shortid');
var Room = require('./room')(io);
var request = require('request');

var rooms = {};

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
  socket.on('disconnect', function () {
    console.log('disconnect: ' + socket.user_name);
    if (socket.valid == false) {
      return;
    }

    socket.room.RemoveUser(socket);
  });

  socket.user_name = null;
  socket.room = null;
  socket.valid = false;

  console.log('New connection');
  socket.emit('init', 'Something');

  socket.on('join', function (user_name, room_name) {
    socket.user_name = user_name;

    if (room_name in rooms == false) {
      console.log('Creating new room "' + room_name + '"');
      rooms[room_name] = new Room(room_name);
    }
    var room = rooms[room_name];
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
    var address = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + video_id + '&format=json';

    request(address, function (error, response, body) {
      if (socket == null || socket.room == null) {
        return;
      }

      try {
        var video_details = JSON.parse(body);
      }
      catch (e) {
        socket.room.SendSystemMessage(socket.user_name + ' queued invalid video id: ' + video_id);
        return;
      }

      video_details.video_id = video_id;
      video_details.url = 'https://www.youtube.com/watch?v=' + video_id;
      socket.room.QueuePlaylistItem(socket, video_details);
    });
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});
