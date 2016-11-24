
var io = null;

var Room = function (room_name) {
  this.room_name = room_name;
  this.description = 'Untitled Room';
  this.owner = null;
  this.users = [];
  this.usernames = [];

  this.AddUser = function (user_socket) {
    this.users.push(user_socket);
    this.usernames.push(user_socket.user_name);
    user_socket.room = this;
    user_socket.join(this.room_name);
    user_socket.valid = true;

    if (this.owner == null) {
      this.SetOwner(user_socket); 
    }
    
    user_socket.emit('join_success', {
      room_name: this.room_name,
      room_description: this.room_description,
      owner: this.owner.user_name,
    });

    this.SendUpdateUserList();
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

  this.SetPlayerState = function (user_socket, new_state) {
    user_socket.broadcast.to(this.room_name).emit('player_state_change', new_state);
  };
};

module.exports = function (io_handle) {
    io = io_handle;
    return Room;
};