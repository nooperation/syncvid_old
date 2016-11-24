var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var shortid = require('shortid');

var Room = function (room_name, owner) {
  this.room_name = room_name;
  this.description = 'Untitled Room';
  this.owner = owner;
  this.messages = [];
  this.users = [];
  this.usernames = [];

  this.AddUser = function (user_socket) {
    this.users.push(user_socket);
    this.usernames.push(user_socket.user_name);
    user_socket.room = this;
    user_socket.join(this.room_name);
    user_socket.valid = true;

    console.log('User "' + user_socket.user_name + '" joined "' + this.room_name + '"');
    user_socket.emit('join_success', {
      room_name: this.room_name,
      room_description: this.room_description,
      owner: this.owner.user_name,
      messages: this.message
    });

    this.SendUpdateUserList();
    io.to(this.room_name).emit('message', user_socket.user_name + ' has joined the room.');
  };

  this.RemoveUser = function (user_socket) {
    console.log('Removing user "' + user_socket.user_name + '" from "' + this.room_name + '".');
    
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

    if (this.owner_socket == user_socket) {
      if (this.users.length != 0) {
        var new_owner_socket = this.users[0];
        this.SetOwner(new_owner_socket);
      }
      else {
        console.log('Room "' + this.room_name + '" is now empty.'); 
      }
    }

    this.SendUpdateUserList();    
    user_socket.broadcast.to(this.room_name).emit('message', '"' + user_socket.user_name + '" has left the room.');

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
    
    io.to(this.room_name).emit('message', '"' + this.owner.user_name + '" is now the owner of the room.');
  };
  
  this.SendMessage = function (user_socket, message) {
    this.messages.push(message);
    io.to(this.room_name).emit('message', user_socket.user_name + ': ' + message);
  };

  this.SendUpdateUserList = function(){
    io.to(this.room_name).emit('update_user_list', this.usernames);
  }
};

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
      rooms[room_name] = new Room(room_name, socket);
    }
    var room = rooms[room_name];
    room.AddUser(socket);
  });

  socket.on('message', function (message) {
    if (socket.valid == false) {
      return;
    }

    socket.room.SendMessage(socket, message);    
  });

  socket.on('player_state_change', function (event) {
    if (socket.valid == false) {
      return;
    }

    if (socket.room.owner == socket) {
      socket.broadcast.to(socket.room.room_name).emit('player_state_change', event);
    }
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});
