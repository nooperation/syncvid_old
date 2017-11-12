const shortid = require('shortid');
const generateName = require('sillyname');

module.exports = function RoomListExport(logger, io) {
  const Room = require('./room')(io);

  return function RoomList() {
    this.room_list = [];

    this.Delete = function Delete(roomName) {
      logger.info('Server.disconnect.delete_room', {
        Room: roomName,
      });
      delete this.room_list[roomName];
    };

    this.GetOrCreate = function GetOrCreate(roomName) {
      if (roomName in this.room_list === false) {
        this.room_list[roomName] = new Room(roomName, io);
        logger.info('Server.join.create_room', {
          Room: roomName,
        });
      }

      return this.room_list[roomName];
    };

    // Move to Room
    this.GetOrCreateUsername = function GetOrCreateUsername(roomName, desiredUsername) {
      let username = desiredUsername;
      if (roomName in this.room_list === false) {
        logger.info('Server.join.get_valid_username: No such room', {
          Room: roomName,
        });
        throw 'Invalid room';
      }

      const room = this.room_list[roomName];

      if (username == null || room.IsUsernameInUse(username)) {
        for (let i = 0; i < 100; i += 1) {
          const tempName = generateName();
          if (room.IsUsernameInUse(tempName) === false) {
            username = tempName;
            break;
          }
        }
        if (username == null) {
          username = 'Guest';
        }
      }

      return username;
    };

    this.GetListJson = function GetListJson() {
      for (let room_name in this.room_list) {
        const room = this.room_list[room_name];
        room_list.push({
          name: room_name,
          population: room.users.length,
        });
      }
    };

    this.GetUnusedRoomName = function GetUnusedRoomName() {
      let roomName = shortid.generate();

      for (let i = 0; i < 100; i += 1) {
        if (roomName in this.room_list === false) {
          return roomName;
        }
        roomName = shortid.generate();
      }

      // Giving up
      return roomName;
    };
  };
};
