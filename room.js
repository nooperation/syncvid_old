
var request = require('request');

var io = null;

var Room = function (room_name) {
  this.room_name = room_name;
  this.description = 'Untitled Room';
  this.owner = null;
  this.users = [];
  this.usernames = [];
  this.playlist = [];

  this.AddUser = function (user_socket) {
    this.users.push(user_socket);
    this.usernames.push(user_socket.user_name);
    user_socket.room = this;
    user_socket.join(this.room_name);
    user_socket.valid = true;

    if (this.users.length == 1) {
      this.SetOwner(user_socket);
    }

    user_socket.emit('join_success', {
      room_name: this.room_name,
      room_description: this.room_description,
      owner: this.owner.user_name,
    });

    this.SendUpdateUserList();
    this.SendUpdatePlaylist();
    this.SendSystemMessage('"' + user_socket.user_name + '" has joined the room.');
  };

  this.RemoveUser = function (user_socket) {
    if (user_socket.room != this) {
      console.error('User attempted to leave the wrong room.');
      return;
    }

    user_index = this.users.indexOf(user_socket);
    if (user_index == -1) {
      console.error('User attempted to leave room they were assigned to, but room has no knowledge of them.');
      return;
    }

    this.users.splice(user_index, 1);
    this.usernames.splice(user_index, 1);

    if (this.owner == user_socket) {
      if (this.users.length != 0) {
        var new_owner = this.users[0];
        this.SetOwner(new_owner);
      }
      else {
        console.log('Room "' + this.room_name + '" is now empty.');
      }
    }

    this.SendUpdateUserList();
    this.SendSystemMessage('"' + user_socket.user_name + '" has left the room.');

    user_socket.leave(this.room_name);
    user_socket.room = null;
    user_socket.valid = false;
  };

  this.SetOwner = function (new_owner) {
    if (this.owner != null) {
      this.owner.emit('change_owner', false);
    }
    this.owner = new_owner;
    new_owner.emit('change_owner', true);

    this.SendSystemMessage('"' + this.owner.user_name + '" is now the owner of the room.');
  };

  this.SendMessage = function (message, user_socket, user_color) {
    io.to(this.room_name).emit('message', 'USER', message, user_socket.user_name, user_color);
  };

  this.SendSystemMessage = function (message) {
    io.to(this.room_name).emit('message', 'SYSTEM', message, 'Server', '#000000');
  };

  this.SendUpdateUserList = function () {
    io.to(this.room_name).emit('update_user_list', this.usernames);
  };

  this.SendUpdatePlaylist = function () {
    io.to(this.room_name).emit('update_playlist', this.playlist);
  };

  this.SetPlayerState = function (user_socket, new_state) {
    user_socket.broadcast.to(this.room_name).emit('player_state_change', new_state);
  };

  this.QueuePlaylistItem = function (user_socket, video_id) {
    var address = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + video_id + '&format=json';
    var this_room = this;

    request(address, function (error, response, body) {
      try {
        var video_details = JSON.parse(body);
        this_room.SendSystemMessage(user_socket.user_name + ' queued ' + video_details.title);
      }
      catch (e) {
        this_room.SendSystemMessage(user_socket.user_name + ' queued invalid video id: ' + video_id);
        return;
      }

      video_details.video_id = video_id;
      video_details.url = 'https://www.youtube.com/watch?v=' + video_id;

      this_room.playlist.push(video_details);
      this_room.SendUpdatePlaylist();

      if (this_room.playlist.length == 1) {
        io.to(this_room.room_name).emit('player_state_change', {
          'video_id': video_details.video_id,
          'player_state': -1,
          'current_time': 0,
          'playback_rate': 1,
        });
      }
    });
  };
};

module.exports = function (io_handle) {
  io = io_handle;
  return Room;
};
