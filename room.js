
module.exports = function () {
  var request = require('request');
  var shortid = require('shortid');
  var logger = require('winston');

  return function (room_name, io) {
    this.room_name = room_name;
    this.description = 'Untitled Room';
    this.owner = null;
    this.users = [];
    this.usernames = [];
    this.playlist = [];
    this.current_playlist_index = -1;
    this.io = io;

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
      this.SendSystemMessage(user_socket.user_name + ' joined the room.');
      logger.info('Room.AddUser', { 'Room': this.room_name, 'Username': user_socket.user_name });

    };

    this.RemoveUser = function (user_socket) {
      if (user_socket.room != this) {
        logger.error('Room.RemoveUser - User attempted to leave the wrong room.', { 'Room': this.room_name, 'Username': user_socket.user_name } );
        return;
      }

      user_index = this.users.indexOf(user_socket);
      if (user_index == -1) {
        logger.error('Room.RemoveUser - User attempted to leave room they were assigned to, but room has no knowledge of them.', { 'Room': this.room_name, 'Username': user_socket.user_name } );
        return;
      }

      this.users.splice(user_index, 1);
      this.usernames.splice(user_index, 1);

      if (this.owner == user_socket) {
        if (this.users.length != 0) {
          var new_owner = this.users[0];
          this.SetOwner(new_owner);
        }
      }

      this.SendUpdateUserList();
      this.SendSystemMessage(user_socket.user_name + ' left the room.');
      logger.info('Room.RemoveUser', { 'Room': this.room_name, 'Username': user_socket.user_name });

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

      this.SendSystemMessage(this.owner.user_name + ' is now owner of the room.');
    };

    this.SendMessage = function (message, user_socket, user_color) {
      this.io.to(this.room_name).emit('message', 'USER', message, user_socket.user_name, user_color);
    };

    this.SendSystemMessage = function (message) {
      this.io.to(this.room_name).emit('message', 'SYSTEM', message, 'Server', '#000000');
    };

    this.SendUpdateUserList = function () {
      this.io.to(this.room_name).emit('update_user_list', this.usernames);
    };

    this.SendUpdatePlaylist = function () {
      this.io.to(this.room_name).emit('update_playlist', this.playlist);
    };

    this.SetPlayerState = function (user_socket, new_state) {
      user_socket.broadcast.to(this.room_name).emit('player_state_change', new_state);
    };

    this.SelectPlaylistItem = function (user_socket, unique_id) {
      var item_index_to_play = this.playlist.findIndex(function (item) {
        return item.unique_id == unique_id;
      });

      if (item_index_to_play == -1) {
        logger.warn('Room.SelectPlaylistItem - Attempted to play an unknown video', { 'Room': this.room_name, 'Username': user_socket.user_name, 'UniqueId': unique_id });
        return;
      }

      var item_to_play = this.playlist[item_index_to_play];
      this.SendSystemMessage(user_socket.user_name + ' changed the video to "' + item_to_play.title + '"');
      this.PlayPlaylistItem(item_index_to_play);
      logger.info('Room.SelectPlaylistItem', { 'Room': this.room_name, 'User': user_socket.user_name });
    };

    this.PlayPlaylistItem = function (item_index_to_play) {
      if (item_index_to_play > this.playlist.length) {
        this.SendSystemMessage('Unable to play video');
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
      logger.info('Room.PlayPlaylistItem', { 'Room': this.room_name, 'ID': item_to_play.video_id, 'Name': item_to_play.title});

      this.SendUpdatePlaylist();
      this.io.to(this.room_name).emit('play_playlist_item', item_to_play);
    };

    this.RemovePlaylistItem = function (user_socket, unique_id) {
      var item_index_to_remove = this.playlist.findIndex(function (item) {
        return item.unique_id == unique_id;
      });

      if (item_index_to_remove == -1) {
        logger.warn('Room.RemovePlaylistItem - Attempted to remove an unknown video', { 'Room': this.room_name, 'Username': user_socket.user_name, 'UniqueId': unique_id });
        return;
      }

      this.SendSystemMessage(user_socket.user_name + ' removed "' + this.playlist[item_index_to_remove].title + '" from the playlist');
      logger.info('Room.RemovePlaylistItem', {'Room': this.room_name, 'User': user_socket.user_name, 'ID': this.playlist[item_index_to_remove].video_id, 'Name': this.playlist[item_index_to_remove].title});

      this.playlist.splice(item_index_to_remove, 1);
      this.SendUpdatePlaylist();

      if (this.playlist.length > 0 && item_index_to_remove == this.current_playlist_index) {
        this.PlayNextPlaylistItem();
      }
    };

    this.PlayNextPlaylistItem = function (user_socket) {
      for (var i = 0; i < this.playlist.length; ++i) {
        if (this.playlist[i].state == 'Queued') {
          this.SendSystemMessage('Now playing "' + this.playlist[i].title + '"');
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
        //this.SendSystemMessage(user_socket.user_name + ' queued invalid url: ' + video_url);
        return;
      }

      var address = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + video_id + '&format=json';
      var this_room = this;

      request(address, function (error, response, body) {
        try {
          var video_details = JSON.parse(body);
          this_room.SendSystemMessage(user_socket.user_name + ' added "' + video_details.title + '"');
        }
        catch (e) {
          this_room.SendSystemMessage(user_socket.user_name + ' added invalid video "' + video_id + '"');
          return;
        }

        video_details.video_id = video_id;
        video_details.url = 'https://www.youtube.com/watch?v=' + video_id;
        video_details.unique_id = shortid.generate();
        video_details.state = 'Queued';
        logger.info('Room.QueuePlaylistItem', {'Room': this_room.room_name, 'User': user_socket.user_name, 'ID': video_details.video_id, 'Name': video_details.title });

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

    this.ChangeUsername = function (user_socket, new_username) {
      var kMaxNameLength = 20;
      new_username = new_username.trim().substring(0, kMaxNameLength);
      if (new_username.length == 0 || this.IsUsernameInUse(new_username)) {
        user_socket.emit('change_username_result', false);
        return;
      }

      var old_username = user_socket.user_name;
      var username_index = this.usernames.indexOf(old_username);
      if (username_index == -1) {
        logger.warn('Room.ChangeUsername: Unknown user attempted to change their name', { 'Room': this.room_name, 'User': user_socket.user_name, 'OldUsername': old_username });
        user_socket.emit('change_username_result', false);
        return;
      }

      this.usernames[username_index] = new_username;
      user_socket.user_name = new_username;
      user_socket.emit('change_username_result', true);
      this.SendSystemMessage(old_username + ' changed their name to ' + new_username);
      logger.info('Room.ChangeUsername', {'Room': this.room_name, 'User': user_socket.user_name, 'From': old_username, 'To': new_username});
    };

    this.IsUsernameInUse = function (username) {
      var username_lowercase = username.toLowerCase();

      for (var i = 0; i < this.usernames.length; ++i) {
        if (this.usernames[i].toLowerCase() == username_lowercase) {
          return true;
        }
      }

      return false;
    };
  };
};
