const request = require('request');
const shortid = require('shortid');
const logger = require('winston');

module.exports = function RoomExport() {
  return function Room(roomName, io) {
    this.roomName = roomName;
    this.description = 'Untitled Room';
    this.owner = null;
    this.users = [];
    this.usernames = [];
    this.playlist = [];
    this.currentPlaylistIndex = -1;
    this.io = io;

    this.AddUser = function AddUser(userSocket) {
      this.users.push(userSocket);
      this.usernames.push(userSocket.username);
      userSocket.room = this;
      userSocket.join(this.room_name);
      userSocket.valid = true;

      if (this.users.length === 1) {
        this.SetOwner(userSocket);
      }

      userSocket.emit('join_success', {
        room_name: this.room_name,
        room_description: this.room_description,
        owner: this.owner.username,
      });

      this.SendUpdateUserList();
      this.SendUpdatePlaylist();
      this.SendSystemMessage(`${userSocket.username} joined the room.`);
      logger.info('Room.AddUser', { Room: this.room_name, Username: userSocket.username });
    };

    this.RemoveUser = function RemoveUser(userSocket) {
      if (userSocket.room !== this) {
        logger.error('Room.RemoveUser - User attempted to leave the wrong room.', { Room: this.room_name, Username: userSocket.username });
        return;
      }

      const userIndex = this.users.indexOf(userSocket);
      if (userIndex === -1) {
        logger.error('Room.RemoveUser - User attempted to leave room they were assigned to, but room has no knowledge of them.', {
          Room: this.room_name,
          Username: userSocket.username,
        });
        return;
      }

      this.users.splice(userIndex, 1);
      this.usernames.splice(userIndex, 1);

      if (this.owner === userSocket) {
        if (this.users.length !== 0) {
          const newOwner = this.users[0];
          this.SetOwner(newOwner);
        }
      }

      this.SendUpdateUserList();
      this.SendSystemMessage(`${userSocket.username} left the room.`);
      logger.info('Room.RemoveUser', { Room: this.room_name, Username: userSocket.username });

      userSocket.leave(this.room_name);
      userSocket.room = null;
      userSocket.valid = false;
    };

    this.SetOwner = function SetOwner(newOwner) {
      if (this.owner != null) {
        this.owner.emit('change_owner', false);
      }
      this.owner = newOwner;
      newOwner.emit('change_owner', true);

      this.SendSystemMessage(`${this.owner.username} is now owner of the room.`);
    };

    this.SendMessage = function SendMessage(message, userSocket, userColor) {
      this.io.to(this.room_name).emit('message', 'USER', message, userSocket.username, userColor);
    };

    this.SendSystemMessage = function SendSystemMessage(message) {
      this.io.to(this.room_name).emit('message', 'SYSTEM', message, 'Server', '#000000');
    };

    this.SendUpdateUserList = function SendUpdateUserList() {
      this.io.to(this.room_name).emit('update_user_list', this.usernames);
    };

    this.SendUpdatePlaylist = function SendUpdatePlaylist() {
      this.io.to(this.room_name).emit('update_playlist', this.playlist);
    };

    this.SetPlayerState = function SetPlayerState(userSocket, newState) {
      userSocket.broadcast.to(this.room_name).emit('player_state_change', newState);
    };

    this.SelectPlaylistItem = function SelectPlaylistItem(userSocket, uniqueId) {
      const itemIndexToPlay = this.playlist.findIndex(item => item.unique_id === uniqueId);

      if (itemIndexToPlay === -1) {
        logger.warn('Room.SelectPlaylistItem - Attempted to play an unknown video', {
          Room: this.room_name,
          Username: userSocket.username,
          UniqueId: uniqueId,
        });
        return;
      }

      const itemToPlay = this.playlist[itemIndexToPlay];
      this.SendSystemMessage(`${userSocket.username} changed the video to "${itemToPlay.title}"`);
      this.PlayPlaylistItem(itemIndexToPlay);
      logger.info('Room.SelectPlaylistItem', {
        Room: this.room_name,
        User: userSocket.username,
      });
    };

    this.PlayPlaylistItem = function PlayPlaylistItem(itemIndexToPlay) {
      if (itemIndexToPlay > this.playlist.length) {
        this.SendSystemMessage('Unable to play video');
        return;
      }
      this.current_playlist_index = itemIndexToPlay;

      for (let i = 0; i < this.playlist.length; i += 1) {
        if (i === itemIndexToPlay) {
          this.playlist[i].state = 'Playing';
        } else if (i > itemIndexToPlay) {
          this.playlist[i].state = 'Queued';
        } else {
          this.playlist[i].state = 'Played';
        }
      }

      const itemToPlay = this.playlist[itemIndexToPlay];
      logger.info('Room.PlayPlaylistItem', { Room: this.room_name, ID: itemToPlay.video_id, Name: itemToPlay.title });

      this.SendUpdatePlaylist();
      this.io.to(this.room_name).emit('play_playlist_item', itemToPlay);
    };

    this.RemovePlaylistItem = function RemovePlaylistItem(userSocket, uniqueId) {
      const itemIndexToRemove = this.playlist.findIndex(item => item.unique_id === uniqueId);

      if (itemIndexToRemove === -1) {
        logger.warn('Room.RemovePlaylistItem - Attempted to remove an unknown video', {
          Room: this.room_name,
          Username: userSocket.username,
          UniqueId: uniqueId,
        });
        return;
      }

      this.SendSystemMessage(`${userSocket.username} removed "${this.playlist[itemIndexToRemove].title}" from the playlist`);
      logger.info('Room.RemovePlaylistItem', {
        Room: this.room_name,
        User: userSocket.username,
        ID: this.playlist[itemIndexToRemove].video_id,
        Name: this.playlist[itemIndexToRemove].title,
      });

      this.playlist.splice(itemIndexToRemove, 1);
      this.SendUpdatePlaylist();

      if (this.playlist.length > 0 && itemIndexToRemove === this.current_playlist_index) {
        this.PlayNextPlaylistItem();
      }
    };

    this.PlayNextPlaylistItem = function PlayNextPlaylistItem(userSocket) {
      for (let i = 0; i < this.playlist.length; i += 1) {
        if (this.playlist[i].state === 'Queued') {
          this.SendSystemMessage(`Now playing "${this.playlist[i].title}"`);
          this.PlayPlaylistItem(i);
          return;
        }
      }
      if (this.playlist.length > 0) {
        this.playlist[this.playlist.length - 1].state = 'Played';
      }
      this.SendSystemMessage('End of playlist');
    };

    this.GetVideoIdFromUrl = function GetVideoIdFromUrl(videoUrl) {
      const PatternVideoId = /^([a-z0-9A-Z\-_]+)/;
      const matchedVideoId = videoUrl.match(PatternVideoId);
      if (matchedVideoId && matchedVideoId.length >= 1 && matchedVideoId[1].length >= 11) {
        return matchedVideoId[1];
      }

      // http://stackoverflow.com/a/9102270
      const PatternVideoUrl = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const matchedUrl = videoUrl.match(PatternVideoUrl);
      if (matchedUrl && matchedUrl.length >= 2 && matchedUrl[2].length >= 11) {
        return matchedUrl[2];
      }

      return null;
    };

    this.QueuePlaylistItem = function QueuePlaylistItem(userSocket, videoUrl) {
      const videoId = this.GetVideoIdFromUrl(videoUrl);
      if (videoId == null) {
        return;
      }

      const address = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const thisRoom = this;

      request(address, (error, response, body) => {
        let videoDetails = null;
        try {
          videoDetails = JSON.parse(body);
          thisRoom.SendSystemMessage(`${userSocket.username} added "${videoDetails.title}"`);
        } catch (e) {
          thisRoom.SendSystemMessage(`${userSocket.username} added invalid video "${videoId}"`);
          return;
        }

        videoDetails.video_id = videoId;
        videoDetails.url = `https://www.youtube.com/watch?v=${videoId}`;
        videoDetails.unique_id = shortid.generate();
        videoDetails.state = 'Queued';
        logger.info('Room.QueuePlaylistItem', {
          Room: thisRoom.room_name,
          User: userSocket.username,
          ID: videoDetails.video_id,
          Name: videoDetails.title,
        });

        let shouldPlayThisVideo = false;
        if (thisRoom.playlist.length === 0 || thisRoom.playlist[thisRoom.playlist.length - 1].state === 'Played') {
          shouldPlayThisVideo = true;
        }

        thisRoom.playlist.push(videoDetails);

        if (shouldPlayThisVideo) {
          thisRoom.PlayNextPlaylistItem();
        } else {
          thisRoom.SendUpdatePlaylist();
        }
      });
    };

    this.ChangeUsername = function ChangeUsername(userSocket, preferredUsername) {
      const kMaxNameLength = 20;
      const newUsername = preferredUsername.trim().substring(0, kMaxNameLength);
      if (newUsername.length === 0 || this.IsUsernameInUse(newUsername)) {
        userSocket.emit('change_username_result', false);
        return;
      }

      const oldUsername = userSocket.username;
      const usernameIndex = this.usernames.indexOf(oldUsername);
      if (usernameIndex === -1) {
        logger.warn('Room.ChangeUsername: Unknown user attempted to change their name', { Room: this.room_name, User: userSocket.username, OldUsername: oldUsername });
        userSocket.emit('change_username_result', false);
        return;
      }

      this.usernames[usernameIndex] = newUsername;
      userSocket.username = newUsername;
      userSocket.emit('change_username_result', true);
      this.SendSystemMessage(`${oldUsername} changed their name to ${newUsername}`);
      logger.info('Room.ChangeUsername', {
        Room: this.room_name,
        User: userSocket.username,
        From: oldUsername,
        To: newUsername,
      });
    };

    this.IsUsernameInUse = function IsUsernameInUse(username) {
      const usernameLowercase = username.toLowerCase();

      for (let i = 0; i < this.usernames.length; i += 1) {
        if (this.usernames[i].toLowerCase() === usernameLowercase) {
          return true;
        }
      }

      return false;
    };
  };
};
