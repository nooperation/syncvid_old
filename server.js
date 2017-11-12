
module.exports = function serverExport(io, logger) {
  const RoomList = require('./room_list')(logger, io);
  const roomList = new RoomList();

  return function server(socket) {
    socket.username = null;
    socket.room = null;
    socket.valid = false;

    socket.on('disconnect', () => {
      if (socket.valid === false) {
        return;
      }
      const roomName = socket.room.name;
      socket.room.RemoveUser(socket);

      if (socket.room === null) {
        roomList.Delete(roomName);
      }
    });

    socket.on('join', (desiredUserName, roomName) => {
      const room = roomList.GetOrCreate(roomName);
      const userName = roomList.GetOrCreateUsername(roomName, desiredUserName);

      socket.username = userName;
      room.AddUser(socket);
    });

    socket.on('get_roomlist', () => {
      const roomListJson = roomList.GetListJson();
      io.emit('roomlist', roomListJson);
    });

    socket.on('init_frontpage', () => {
      const unusedRoomName = roomList.GetUnusedRoomName();

      socket.emit('init_frontpage_complete', {
        suggested_room_name: unusedRoomName,
      });
    });

    socket.on('message', (message, userColor) => {
      if (socket.valid) {
        socket.room.SendMessage(message, socket, userColor);
      }
    });

    socket.on('player_state_change', (event) => {
      if (socket.valid && socket.room.owner === socket) {
        socket.room.SetPlayerState(socket, event);
      }
    });

    socket.on('queue_playlist_item', (videoId) => {
      if (socket.valid && socket.room.owner === socket) {
        socket.room.QueuePlaylistItem(socket, videoId);
      }
    });

    socket.on('remove_playlist_item', (uniqueId) => {
      if (socket.valid && socket.room.owner === socket) {
        socket.room.RemovePlaylistItem(socket, uniqueId);
      }
    });

    socket.on('select_playlist_item', (uniqueId) => {
      if (socket.valid && socket.room.owner === socket) {
        socket.room.SelectPlaylistItem(socket, uniqueId);
      }
    });

    socket.on('play_next_playlist_item', () => {
      if (socket.valid && socket.room.owner === socket) {
        socket.room.PlayNextPlaylistItem(socket);
      }
    });

    socket.on('change_username', (newUsername) => {
      if (socket.valid) {
        socket.room.ChangeUsername(socket, newUsername);
      }
    });
  };
};
