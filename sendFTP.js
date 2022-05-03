const fs = require('fs');
const moment = require("moment");
const sendFTP = require("basic-ftp");
const db = require('node-localdb');
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let mission = '';
let ftp_dir = '';
let drone_name = '';

let ftp_client = null;
let ftp_host = process.argv[2];
let ftp_user = 'lx_ftp';
let ftp_pw = 'lx123!';

let geotagging_dir = 'Geotagged';
let geotagged_arr = [];

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';

let status = 'Init';
let count = 0;

init();

function init() {
    read_mission();

    ftp_connect(ftp_host, ftp_user, ftp_pw);

    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = './' + my_lib_name;
        lib.data = ["Capture_Status", "Geotag_Status", "FTP_Status", 'Captured_GPS'];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][2];

    lib_mqtt_connect('localhost', 1883);

    send_image_via_ftp();
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
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'ftp_' + nanoid(15),
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

function read_mission() {
    try {
        let argv = gps_filename.findOne({name: 'mission_name'})._settledValue;
        if (argv === undefined) {
            setTimeout(read_mission, 500);
        } else {
            if (argv.hasOwnProperty('mission')) {
                mission = argv.mission;
            } else {
                mission = 'Empty';
            }
            if (argv.hasOwnProperty('drone')) {
                drone_name = argv.drone;
            } else {
                drone_name = 'undefined';
            }
        }

        ftp_dir = moment().format('YYYY-MM-DD') + '-' + argv.mission + '_' + argv.drone;
        console.log('mission is ', argv.mission);
        console.log('drone is ', argv.drone);
        console.log('FTP directory is ' + ftp_dir);
    } catch (e) {
        if (e instanceof TypeError) {
            setTimeout(read_mission, 500);
        }
    }
}

async function ftp_connect(host, user, pw) {
    ftp_client = new sendFTP.Client(0)
    ftp_client.ftp.verbose = false;
    try {
        await ftp_client.access({
            host: host,
            user: user,
            password: pw,
            port: 50023
        })

        ftp_client.ensureDir("/" + ftp_dir);

        console.log('Connect FTP server to ' + host);
    } catch (err) {
        console.log('[FTP] Error\n', err)
        console.log('FTP connection failed');
    }
}

let empty_count = 0;

async function send_image_via_ftp() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
            } else {
                files.forEach(file => {
                    if (file.includes('.jpg') || file.includes('.JPG')) {
                        if (!geotagged_arr.includes(file)) {
                            geotagged_arr.push(file);
                        }
                    }
                });
            }
        });

        console.time('ftp');

        if (geotagged_arr.length > 0) {
            await ftp_client.uploadFrom('./' + geotagging_dir + '/' + geotagged_arr[0], "/" + ftp_dir + '/' + geotagged_arr[0]).then(() => {
                console.timeEnd('ftp');
                console.log('send ' + geotagged_arr[0]);
                setTimeout(move_image, 1000, './' + geotagging_dir + '/', './' + ftp_dir + '/', geotagged_arr[0]);
                status = 'Send ' + count++;
                empty_count = 0;
                lib_mqtt_client.publish(my_status_topic, status);
            });
        } else {
            if (status.includes('Send')) {
                status = 'empty';
            } else if (status === 'empty') {
                empty_count++;
            }

            if (empty_count > 20) {
                status = 'Finish ' + count;
                empty_count = 0;
                lib_mqtt_client.publish(my_status_topic, status);
            }
        }
    } catch (e) {
    }
    setTimeout(send_image_via_ftp, 1000);
}

function move_image(from, to, image) {
    try {
        fs.renameSync(from + image, to + image);
        geotagged_arr.shift();
    } catch (e) {
        fs.stat(to + image, (err) => {
            console.log(err);
            if (err !== null && err.code === "ENOENT") {
                console.log("[sendFTP]사진이 존재하지 않습니다.");
            }
            console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        });
        geotagged_arr.shift();
    }
}
