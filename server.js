
module.exports = function (io, logger) {
  var RoomList = require('./room_list')(logger, io);

  var room_list = new RoomList();

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
        room_list.delete(room.name);
      }
    });

    socket.on('join', function (user_name, room_name) {
      var room = room_list.get_or_create(room_name);
      var user_name = room_list.get_or_create_username(room_name, user_name);

      socket.user_name = user_name;
      room.AddUser(socket);
    });

    socket.on('get_roomlist', function () {
      var room_list_json = room_list.get_list_json();
      io.emit('roomlist', room_list_json);
    });

    socket.on('init_frontpage', function () {
      var unused_room_name = room_list.get_unused_room_name();

      socket.emit('init_frontpage_complete', {
        suggested_room_name: unused_room_name
      });
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
  }
};
