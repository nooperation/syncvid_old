
module.exports = function (io, logger) {
  var shortid = require('shortid');
  var generateName = require('sillyname');
  var Room = require('./room')(io);

  var rooms = {};

  return function (socket) {
    socket.user_name = null;
    socket.room = null;
    socket.valid = false;

    socket.on('disconnect', function () {
      if (socket.valid == false) {
        return;
      }

      var room = socket.room;
      room.RemoveUser(socket);

      if (room.users.length == 0) {
        logger.info('Server.disconnect.delete_room', { 'Room': room.room_name });
        delete rooms[room.room_name];
      }
    });

    socket.on('join', function (user_name, room_name) {
      if (room_name in rooms == false) {
        rooms[room_name] = new Room(room_name);
        logger.info('Server.join.create_room', { 'Room': room_name });
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
      if (socket.valid) {
        socket.room.SendMessage(message, socket, user_color);
      }
    });

    socket.on('player_state_change', function (event) {
      if (socket.valid && socket.room.owner == socket) {
        socket.room.SetPlayerState(socket, event);
      }
    });

    socket.on('queue_playlist_item', function (video_id) {
      if (socket.valid && socket.room.owner == socket) {
        socket.room.QueuePlaylistItem(socket, video_id);
      }
    });

    socket.on('remove_playlist_item', function (unique_id) {
      if (socket.valid && socket.room.owner == socket) {
        socket.room.RemovePlaylistItem(socket, unique_id);
      }
    });

    socket.on('select_playlist_item', function (unique_id) {
      if (socket.valid && socket.room.owner == socket) {
        socket.room.SelectPlaylistItem(socket, unique_id);
      }
    });

    socket.on('play_next_playlist_item', function () {
      if (socket.valid && socket.room.owner == socket) {
        socket.room.PlayNextPlaylistItem(socket);
      }
    });

    socket.on('change_username', function (new_username) {
      if (socket.valid) {
        socket.room.ChangeUsername(socket, new_username);
      }
    });

    socket.on('get_roomlist', function () {
      var room_list = [];
      for (var room_name in rooms) {
        var room = rooms[room_name];
        room_list.push({
          name: room_name,
          population: room.users.length
        });
      }
      io.emit('roomlist', room_list);
    });

    function getUnusedRoomName() {
      var room_name = shortid.generate();

      for (var i = 0; i < 100; ++i) {
        if (room_name in rooms == false) {
          return room_name;
        }
        room_name = shortid.generate();
      }

      // Giving up
      return room_name;
    }

    socket.on('init_frontpage', function () {
      var unused_room_name = getUnusedRoomName();

      socket.emit('init_frontpage_complete', {
        suggested_room_name: unused_room_name
      });
    });
  }
};
