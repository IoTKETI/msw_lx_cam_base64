/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
const piexif = require("piexifjs");
const moment = require("moment");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const db = require('node-localdb');

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let captured_arr = [];

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let lib_sub_fc_topic = '/global_position_int';
let geotagged_position_topic = '';

let status = 'Init';
let count = 0;
let tag_count = 0;

let gps_data = {};

init();

function init() {
    !fs.existsSync(geotagging_dir) && fs.mkdirSync(geotagging_dir);
    console.log('Create [Geotagged] directory..');

    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = './' + my_lib_name;
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][1];
    geotagged_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][4];

    lib_mqtt_connect('localhost', 1883);

    geotag_image();
}

function lib_mqtt_connect(broker_ip, port) {
    if (lib_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'geotag_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', function () {
            console.log('[geotag_lib_mqtt_connect] connected to ' + broker_ip);

            if (lib_sub_fc_topic !== '') {
                lib_mqtt_client.subscribe(lib_sub_fc_topic, function () {
                    console.log('[geotag_lib_mqtt] lib_sub_fc_topic: ' + lib_sub_fc_topic);
                });
            }

            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', function (topic, message) {
            if (lib_sub_fc_topic !== '') {
                let _gps_data = JSON.parse(message.toString());
                gps_data[_gps_data.image] = {
                    "time_boot_ms": _gps_data.time_boot_ms,
                    "lat": _gps_data.lat,
                    "lon": _gps_data.lon,
                    "alt": _gps_data.alt,
                    "vx": _gps_data.vx,
                    "vy": _gps_data.vy,
                    "vz": _gps_data.vz,
                    "hdg": _gps_data.hdg,
                    "relative_alt": _gps_data.relative_alt
                };
                console.log(_gps_data.image, '\n', gps_data[_gps_data.image]);
            } else {
                console.log('From ' + topic + 'message is ' + message.toString());
            }
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function geotag_image() {
    fs.readdir('./', (err, files) => {
        if (err) {
            console.log('[' + geotagging_dir + '] is empty directory..');

            setTimeout(geotag_image, 100);
        } else {
            files = files.filter(file => file.toLowerCase().includes('.jpg'));

            if (files.length > 0) {
                console.time('geotag');

                let jpeg = fs.readFileSync(files[0]);
                let data = jpeg.toString("binary");
                let exifObj = piexif.load(data);

                let gps;
                try {
                    gps = gps_filename.findOne({image: files[0]})._settledValue;
                } catch (e) {
                    let edit_file = moment(moment(files[0].substr(0, files[0].length - 4)).add("-1", "s")).format("YYYY-MM-DDTHH:mm:ss") + '.jpg';
                    gps = gps_filename.findOne({image: edit_file})._settledValue;
                    console.log(edit_file);
                }
                try {
                    if (gps.hasOwnProperty('lat')) {
                        exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = (gps.lat / 10000000) < 0 ? 'S' : 'N';
                        exifObj.GPS[piexif.GPSIFD.GPSLatitude] = Degree2DMS(gps.lat / 10000000);
                    }
                } catch (e) {
                    exifObj.GPS[piexif.GPSIFD.GPSLatitude] = Degree2DMS(0.0);
                }
                try {
                    if (gps.hasOwnProperty('lon')) {
                        exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = (gps.lon / 10000000) < 0 ? 'W' : 'E';
                        exifObj.GPS[piexif.GPSIFD.GPSLongitude] = Degree2DMS(gps.lon / 10000000);
                    }
                } catch (e) {
                    exifObj.GPS[piexif.GPSIFD.GPSLongitude] = Degree2DMS(0.0);
                }
                try {
                    if (gps.hasOwnProperty('alt')) {
                        if (gps.alt < 0.0) {
                            gps.alt = 0.0;
                        }
                        exifObj.GPS[piexif.GPSIFD.GPSAltitude] = [gps.alt, 1000];
                        exifObj.GPS[piexif.GPSIFD.GPSAltitudeRef] = 0;
                    }
                } catch (e) {
                    exifObj.GPS[piexif.GPSIFD.GPSAltitude] = [0.0, 1000];
                    exifObj.GPS[piexif.GPSIFD.GPSAltitudeRef] = 0;
                }

                let exifbytes = piexif.dump(exifObj);

                let newData = piexif.insert(exifbytes, data);
                let newJpeg = Buffer.from(newData, "binary");

                fs.writeFileSync(files[0], newJpeg);
                setTimeout(move_image, 1, './', './' + geotagging_dir + '/', files[0]);
                try {
                    if (gps.hasOwnProperty('_id')) {
                        delete gps['_id'];
                    }
                } catch (e) {
                    console.log(e);
                }
                lib_mqtt_client.publish(geotagged_position_topic, JSON.stringify(gps));

                console.timeEnd('geotag');

                setTimeout(geotag_image, 100);
            } else {
                if (tag_count > 200) {
                    count = 0;
                    tag_count = 0;
                }
                tag_count++;
                setTimeout(geotag_image, 100);
            }
        }
    });
}

function Degree2DMS(coordinate) {
    let d = Math.floor(coordinate);
    let m = Math.floor(((coordinate) - d) * 60);
    let s = ((((coordinate) - d) * 60) - m) * 60;

    return [[d, 1], [m, 1], [s * 100, 100]]
}

// function DMS2Degree(exif_coordinate) {
//     let coordinate = exif_coordinate[0] + ((exif_coordinate[1] / 60) + (exif_coordinate[2] / 3600));
//
//     return coordinate
// }

function move_image(from, to, image) {
    try {
        fs.renameSync(from + image, to + image);
        // console.log('move from ' + from + image + ' to ' + to + image);
        status = 'Geotagging';
        count++;
        let msg = status + ' ' + count;
        lib_mqtt_client.publish(my_status_topic, msg);
        // captured_arr = [];
    } catch (e) {
        fs.stat(to + image, (err) => {
            if (err !== null && err.code === "ENOENT") {
                console.log("[geotagging] 사진이 존재하지 않습니다.");
            }
            console.log("[geotagging] 이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        });
        // captured_arr = [];
    }
}
