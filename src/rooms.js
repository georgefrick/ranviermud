var fs = require('fs'),
    util = require('util'),
    events = require('events'),
    Data = require('./data.js').Data;

var rooms_dir = __dirname + '/../entities/areas/';
var l10n_dir = __dirname + '/../l10n/scripts/rooms/';
var rooms_scripts_dir = __dirname + '/../scripts/rooms/';

var Rooms = function () {
    var self = this;
    self.areas = {};
    self.rooms = {};

    self.load = function (verbose, callback) {
        verbose = verbose || false;
        var log = function (message) {
            if (verbose) util.log(message);
        };
        var debug = function (message) {
            if (verbose) util.debug(message);
        };

        var hasManifest = function( fileSet ) {
            for (var file in fileSet) {
                if (fileSet[file].match(/manifest.yml/)) {
                    return true;
                }
            }
            return false;
        };

        var delegateLoadFile = function(path) {
            return require('js-yaml').load(fs.readFileSync(path).toString('utf8'));
        };

        var isManifestOrDirectory = function(path) {
            return (path.match(/manifest/)
                || !fs.statSync(path).isFile()
                || !path.match(/yml$/) );
        };

        var roomIsValid = function(room) {
            var validate = ['title', 'description', 'location'];
            for (var requiredField in validate) {
                if (!(validate[requiredField] in room)) {
                    log("\t\tError loading room in file " + room + ' - no ' + validate[requiredField] + ' specified');
                    return false;
                }
            }
            return true;
        };

        // Load all the areas into the game
        /**
         * Go through the rooms_dir folder, looking for subfolders containing areas.
         */
        fs.readdir(rooms_dir, function (err, files) {
            if (err) {
                log('For some reason reading the entities directory failed for areas' + err);
                return;
            }

            for (var fileKey in files) {
                var file = rooms_dir + files[fileKey];
                // Each area should be in a directory, otherwise, ignore.
                if (!fs.statSync(file).isDirectory()) continue;

                log("\tExamining an area directory - " + file);
                // Go through the files in that directory
                var rooms = fs.readdirSync(file);

                // First, check for an area manifest
                if (!hasManifest(rooms)) {
                    log("\tFailed to load area - " + file + ' - No manifest');
                    return;
                }

                try {
                    var manifest = delegateLoadFile(file + '/manifest.yml' );
                } catch (e) {
                    log("\tError loading area manifest for " + file + ' - ' + e.message);
                    return;
                }

                var areacount = 1;
                for (var area in manifest) {
                    if (!areacount) {
                        log("\tFound more than one area definition in the manifest for " + file + ' ... skipping');
                        break;
                    }

                    if (!('title' in manifest[area])) {
                        log("\tFailed loading area " + area + ', it has no title.');
                        break;

                    }
                    self.areas[area] = manifest[area];
                    log("\tLoading area " + self.areas[area].title + '...');
                    areacount--;
                }

                // Load any room files
                for (var singleRoom in rooms) {
                    var room_file = file + '/' + rooms[singleRoom];

                    if( isManifestOrDirectory(room_file) ) {
                        continue;
                    }

                    // parse the room files
                    try {
                        var room_def = delegateLoadFile(room_file);
                    } catch (e) {
                        log("\t\tError loading room - " + room_file + ' - ' + e.message);
                        continue;
                    }

                    var validate = ['title', 'description', 'location'];
                    // create and load the rooms
                    for (var vnum in room_def) {
                        var room = room_def[vnum];

                        if ( !roomIsValid(room) ) {
                            continue;
                        }

                        log("\t\tLoaded room " + room.location + '...');
                        room.area = area;
                        room.filename = room_file;
                        room.file_index = vnum;
                        room = new Room(room);
                        self.rooms[room.getLocation()] = room;
                    }
                }
            }

            if (callback) {
                callback();
            }
        });
    };

    /**
     * Get a room at a specific location
     * @param int location
     * @return Room
     */
    self.getAt = function (location) {
        return location in self.rooms ? self.rooms[location] : false;
    };

    /**
     * Get an area
     * @param string area
     * @return object
     */
    self.getArea = function (area) {
        return area in self.areas ? self.areas[area] : false;
    };
};

var Room = function (config) {
    var self = this;

    self.title = '';
    self.description = '';
    self.exits = [];
    self.location = null;
    self.area = null;

    // these are only set after load, not on construction and is an array of vnums
    self.items = [];
    self.npcs = [];
    self.filename = '';
    self.file_index = null;


    self.init = function (config) {
        self.title = config.title;
        self.description = config.description;
        self.location = config.location;
        self.exits = config.exits || [];
        self.area = config.area;
        self.filename = config.filename;
        self.file_index = config.file_index;
        Data.loadListeners(config, l10n_dir, rooms_scripts_dir, Data.loadBehaviors(config, 'rooms/', self));
    };

    self.getLocation = function () {
        return self.location;
    };
    self.getArea = function () {
        return self.area;
    };
    self.getExits = function () {
        return self.exits;
    };
    self.getItems = function () {
        return self.items;
    };
    self.getNpcs = function () {
        return self.npcs;
    };

    /**
     * Get the description, localized if possible
     * @param string locale
     * @return string
     */
    self.getDescription = function (locale) {
        return typeof self.description === 'string' ?
            self.description :
            (locale in self.description ? self.description[locale] : 'UNTRANSLATED - Contact an admin');
    };

    /**
     * Get the title, localized if possible
     * @param string locale
     * @return string
     */
    self.getTitle = function (locale) {
        return typeof self.title === 'string' ?
            self.title :
            (locale in self.title ? self.title[locale] : 'UNTRANSLATED - Contact an admin');
    };

    /**
     * Get the leave message for an exit, localized if possible
     * @param object exit
     * @param strign locale
     * @return string
     */
    self.getLeaveMessage = function (exit, locale) {
        return typeof exit.leave_message === 'string' ?
            self.leave_message :
            (locale in self.leave_message ? self.leave_message[locale] : 'UNTRANSLATED - Contact an admin');
    };

    /**
     * Add an item to the quicklookup array for items
     * @param string uid
     */
    self.addItem = function (uid) {
        self.items.push(uid)
    };

    /**
     * Remove an item from the room
     * @param string uid
     */
    self.removeItem = function (uid) {
        self.items = self.items.filter(function (i) {
            return i !== uid;
        });
    };

    /**
     * Add an npc to the quicklookup array for npcs
     * @param string uid
     */
    self.addNpc = function (uid) {
        self.npcs.push(uid)
    };

    /**
     * Remove an npc from the room
     * @param string uid
     */
    self.removeNpc = function (uid) {
        self.npcs = self.npcs.filter(function (i) {
            return i !== uid;
        });
    };

    /**
     * Check to see if an npc is in the room
     * @param string uid
     * @return boolean
     */
    self.hasNpc = function (uid) {
        return self.npcs.some(function (i) {
            return i === uid;
        });
    };

    /**
     * Check to see if an npc is in the room
     * @param string uid
     * @return boolean
     */
    self.hasItem = function (uid) {
        return self.items.some(function (i) {
            return i === uid;
        });
    };

    /**
     * Flatten into a simple structure
     * @return object
     */
    self.flatten = function () {
        return {
            title: self.getTitle('en'),
            description: self.getDescription('en'),
            exits: self.exits,
            location: self.location,
            area: self.area
        };
    };

    /**
     * Get a full object of the room
     * @return object
     */
    self.stringify = function () {
        return {
            title: self.title,
            description: self.description,
            exits: self.exits,
            location: self.location,
            area: self.area
        };
    };

    self.init(config);
};
util.inherits(Room, events.EventEmitter);

exports.Rooms = Rooms;
