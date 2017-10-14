
module.exports = function (logger, io) {
  var Room = require('./room')(io);
  var shortid = require('shortid');
  var generateName = require('sillyname');

  return function() {
    this.room_list = [];

    this.delete = function (room_name) {
      logger.info('Server.disconnect.delete_room', { 'Room': room_name });
      delete this.room_list[room_name];
    }

    this.get_or_create = function (room_name) {
      if (room_name in this.room_list == false) {
        this.room_list[room_name] = new Room(room_name, io);
        logger.info('Server.join.create_room', { 'Room': room_name });
      }

      return this.room_list[room_name];
    }

    // Move to Room
    this.get_or_create_username = function (room_name, desired_username) {
      if (room_name in this.room_list == false) {
        logger.info('Server.join.get_valid_username: No such room', { 'Room': room_name });
        throw 'Invalid room';
      }

      var room = this.room_list[room_name];

      if (desired_username == null || room.IsUsernameInUse(desired_username)) {
        for (var i = 0; i < 100; ++i) {
          var temp_name = generateName();
          if (room.IsUsernameInUse(temp_name) == false) {
            desired_username = temp_name;
            break;
          }
        }
        if (desired_username == null) {
          desired_username = 'Guest';
        }
      }

      return desired_username;
    }

    this.get_list_json = function () {
      for (var room_name in this.room_list) {
        var room = this.room_list[room_name];
        room_list.push({
          name: room_name,
          population: room.users.length
        });
      } 
    }

    this.get_unused_room_name = function () {
      var room_name = shortid.generate();

      for (var i = 0; i < 100; ++i) {
        if (room_name in this.room_list == false) {
          return room_name;
        }
        room_name = shortid.generate();
      }

      // Giving up
      return room_name;
    }
  };
}