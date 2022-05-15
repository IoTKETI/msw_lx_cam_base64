const fs = require('fs');
const piexif = require("piexifjs");
const moment = require("moment");
const db = require('node-localdb');
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let captured_arr = [];

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';

let status = 'Init';
let count = 0;

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
        lib.data = ["Capture_Status", "Geotag_Status", "FTP_Status", "Captured_GPS"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][1];

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
            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', function (topic, message) {
            console.log('From ' + topic + 'message is ' + message.toString());
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function geotag_image() {
    try {
        fs.readdir('./', (err, files) => {
            if (err) {
                console.log('[' + geotagging_dir + '] is empty directory..');
            } else {
                files.forEach(file => {
                    if (file.includes('.jpg') || file.includes('.JPG')) {
                        if (!captured_arr.includes(file)) {
                            captured_arr.push(file);
                        }
                    }
                });
            }
        });

        console.time('geotag');

        if (captured_arr.length > 0) {
            let jpeg = fs.readFileSync(captured_arr[0]);

            let data = jpeg.toString("binary");

            let exifObj = piexif.load(data);
            // captured_arr[0] = captured_arr[0].replace(/_/g, ':');
            let gps = gps_filename.findOne({image: captured_arr[0]})._settledValue;

            exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = (gps.lat / 10000000) < 0 ? 'S' : 'N';
            exifObj.GPS[piexif.GPSIFD.GPSLatitude] = Degree2DMS(gps.lat / 10000000);
            exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = (gps.lon / 10000000) < 0 ? 'W' : 'E';
            exifObj.GPS[piexif.GPSIFD.GPSLongitude] = Degree2DMS(gps.lon / 10000000);
            // exifObj.GPS[piexif.GPSIFD.GPSAltitude] = Degree2DMS(gps.relative_alt / 1000);
            if (gps.alt < 0) {
                gps.alt = 0;
            }
            exifObj.GPS[piexif.GPSIFD.GPSAltitude] = [gps.alt, 1000];
            exifObj.GPS[piexif.GPSIFD.GPSAltitudeRef] = 0;

            let exifbytes = piexif.dump(exifObj);

            let newData = piexif.insert(exifbytes, data);
            let newJpeg = Buffer.from(newData, "binary");
            // captured_arr[0] = captured_arr[0].replace(/:/g, '_');
            fs.writeFileSync(captured_arr[0], newJpeg);
            setTimeout(move_image, 1000, './', './' + geotagging_dir + '/', captured_arr[0], 'geo');
            // status = 'Geotagging ' + count++;
            // lib_mqtt_client.publish(my_status_topic, status);
        }
        console.timeEnd('geotag');
    } catch (e) {
        console.log(e)
        console.time('geotag_catch');

        if (e instanceof TypeError) {
            let edit_file = moment(moment(captured_arr[0].substr(0, captured_arr[0].length - 4)).add("-1", "s")).format("YYYY-MM-DDTHH:mm:ss") + '.jpg';
            try {
                let jpeg = fs.readFileSync(captured_arr[0]);
                let data = jpeg.toString("binary");

                let exifObj = piexif.load(data);
                // captured_arr[0] = captured_arr[0].replace(/_/g, ':');
                let gps = gps_filename.findOne({image: edit_file})._settledValue;

                exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = (gps.lat / 10000000) < 0 ? 'S' : 'N';
                exifObj.GPS[piexif.GPSIFD.GPSLatitude] = Degree2DMS(gps.lat / 10000000);
                exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = (gps.lon / 10000000) < 0 ? 'W' : 'E';
                exifObj.GPS[piexif.GPSIFD.GPSLongitude] = Degree2DMS(gps.lon / 10000000);
                // exifObj.GPS[piexif.GPSIFD.GPSAltitude] = Degree2DMS(gps.relative_alt / 1000);
                exifObj.GPS[piexif.GPSIFD.GPSAltitude] = [gps.alt, 1000];
                exifObj.GPS[piexif.GPSIFD.GPSAltitudeRef] = 0;

                let exifbytes = piexif.dump(exifObj);

                let newData = piexif.insert(exifbytes, data);
                let newJpeg = Buffer.from(newData, "binary");
                // captured_arr[0] = captured_arr[0].replace(/:/g, '_');
                fs.writeFileSync(captured_arr[0], newJpeg);
                setTimeout(move_image, 1000, './', './' + geotagging_dir + '/', captured_arr[0]);
                // status = 'Geotagging ' + count++;
                // lib_mqtt_client.publish(my_status_topic, status);
            } catch (e) {
                console.log('ENOENT: no such file or directory, open ' + captured_arr[0]);
                captured_arr.shift();
            }
        } else {
        }
        console.timeEnd('geotag_catch');
    }
    setTimeout(geotag_image, 1000);
}

function Degree2DMS(coordinate) {
    let d = Math.floor(coordinate);
    let m = Math.floor(((coordinate) - d) * 60);
    let s = ((((coordinate) - d) * 60) - m) * 60;

    return [[d, 1], [m, 1], [s * 100, 100]]
}

function DMS2Degree(exif_coordinate) {
    let coordinate = exif_coordinate[0] + ((exif_coordinate[1] / 60) + (exif_coordinate[2] / 3600));

    return coordinate
}

function move_image(from, to, image) {
    try {
        fs.renameSync(from + image, to + image);
        console.log('move from ' + from + image + ' to ' + to + image);
        status = 'Geotagging ' + count++;
        lib_mqtt_client.publish(my_status_topic, status);
        captured_arr.shift();
    } catch (e) {
        fs.stat(to + image, (err) => {
            if (err !== null && err.code === "ENOENT") {
                console.log("[geotagging] 사진이 존재하지 않습니다.");
            }
            console.log("[geotagging] 이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        });
        captured_arr.shift();
    }
}
