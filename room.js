
var request = require('request');
var shortid = require('shortid');

var io = null;

var Room = function (room_name) {
  this.room_name = room_name;
  this.description = 'Untitled Room';
  this.owner = null;
  this.users = [];
  this.usernames = [];
  this.playlist = [];
  this.current_playlist_index = -1;

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

  this.SelectPlaylistItem = function (user_socket, unique_id) {
    var item_index_to_play = this.playlist.findIndex(function (item) {
      return item.unique_id == unique_id;
    });

    if (item_index_to_play == -1) {
      console.warn('Attempted to play an unknown video: ' + unique_id);
      return;
    }

    var item_to_play = this.playlist[item_index_to_play];
    this.SendSystemMessage(user_socket.user_name + ' changed to video "' + item_to_play.title + '"');
    this.PlayPlaylistItem(item_index_to_play);
  };

  this.PlayPlaylistItem = function (item_index_to_play) {
    if (item_index_to_play > this.playlist.length) {
      this.SendSystemMessage("Unable to play item");
      return;
    }
    this.current_playlist_index = item_index_to_play;

    for (var i = 0; i < this.playlist.length; ++i) {
      if (i == item_index_to_play) {
        this.playlist[i].state = 'Playing';
      }
      else if (i > item_index_to_play) {
        this.playlist[i].state = 'Queued';
      }
      else {
        this.playlist[i].state = 'Played';
      }
    }

    var item_to_play = this.playlist[item_index_to_play];
    this.SendUpdatePlaylist();
    io.to(this.room_name).emit('play_playlist_item', item_to_play);
  };

  this.RemovePlaylistItem = function (user_socket, unique_id) {
    var item_index_to_remove = this.playlist.findIndex(function (item) {
      return item.unique_id == unique_id;
    });

    if (item_index_to_remove == -1) {
      console.warn('Attempted to remove an unknown video: ' + unique_id);
      return;
    }

    this.SendSystemMessage(user_socket.user_name + ' removed video "' + this.playlist[item_index_to_remove].title + '"'); 

    this.playlist.splice(item_index_to_remove, 1);
    this.SendUpdatePlaylist();

    if (this.playlist.length > 0 && item_index_to_remove == this.current_playlist_index) {
      this.PlayNextPlaylistItem();
    }
  };

  this.PlayNextPlaylistItem = function (user_socket) {
    for (var i = 0; i < this.playlist.length; ++i) {
      if (this.playlist[i].state == 'Queued') {
        this.SendSystemMessage('Playing next video: "' + this.playlist[i].title + '"');
        this.PlayPlaylistItem(i);
        return;
      }
    }
    if (this.playlist.length > 0) {
      this.playlist[this.playlist.length - 1].state = 'Played';
    }
    this.SendSystemMessage('End of playlist');
  };

  this.GetVideoIdFromUrl = function (video_url) {
    var pattern_video_id = /^([a-z0-9A-Z\-_]+)/;
    var match_video_id = video_url.match(pattern_video_id);
    if (match_video_id && match_video_id[1].length >= 11) {
      return match_video_id[1];
    }

    // http://stackoverflow.com/a/9102270
    var pattern_video_url = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match_url = video_url.match(pattern_video_url);
    if (match_url && match_url[2].length >= 11) {
      return match_url[2];
    }
    else {
      return null;
    }
  };

  this.QueuePlaylistItem = function (user_socket, video_url) {
    var video_id = this.GetVideoIdFromUrl(video_url);
    if (video_id == null) {
      this.SendSystemMessage(user_socket.user_name + ' queued invalid url: ' + video_url);
      return;
    }

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
      video_details.unique_id = shortid.generate();
      video_details.state = 'Queued';

      var should_play_this_video = false;
      if (this_room.playlist.length == 0 || this_room.playlist[this_room.playlist.length - 1].state == 'Played') {
        should_play_this_video = true;
      }

      this_room.playlist.push(video_details);

      if (should_play_this_video) {
        this_room.PlayNextPlaylistItem();
      }
      else {
        this_room.SendUpdatePlaylist();
      }
    });
  };
};

module.exports = function (io_handle) {
  io = io_handle;
  return Room;
};
