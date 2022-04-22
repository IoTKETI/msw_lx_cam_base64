const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
let fs = require('fs');
const exec = require("child_process").exec;
const moment = require("moment");
var db = require('node-localdb');
var kill = require('tree-kill');

var gps_filename = db('./gps_filename.json');

let my_lib_name = 'lib_lx_cam';

let lib = {};

let lib_mqtt_client = null;
let control_topic = '';
let data_topic = '';
let captured_position_topic = '';
let gpi_topic = '';
let gpi_data = {};

let capture_command = null;
let interval = 6;
let mission = '';

let ftp_dir = '';
let drone_name = process.argv[3];
console.log('[captureImage]', drone_name);

init();

function init() {
    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = './' + my_lib_name;
        lib.data = ['Status', 'Captured_GPS'];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0]
    data_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][0]
    captured_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][1]
    gpi_topic = '/MUV/control/' + lib['name'] + '/global_position_int'

    lib_mqtt_connect('localhost', 1883, gpi_topic, control_topic);

    let camera_summary = exec("gphoto2 --summary");

    camera_summary.stdout.on('data', function (data) {
        console.log('stdout: ' + data);
    });
    camera_summary.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    camera_summary.on('exit', function (code) {
        console.log('exit: ' + code);
    });
    camera_summary.on('error', function (code) {
        console.log('error: ' + code);
    });
}

function lib_mqtt_connect(broker_ip, port, fc, control) {
    if (lib_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', function () {
            console.log('[lib_mqtt_connect] connected to ' + broker_ip);

            if (fc !== '') {
                lib_mqtt_client.subscribe(gpi_topic, function () {
                    console.log('[lib_mqtt] lib_sub_fc_topic: ' + gpi_topic);
                });
            }
            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[lib_mqtt] lib_sub_control_topic: ' + control);
                });
            }
        });

        lib_mqtt_client.on('message', function (topic, message) {
            if (topic === gpi_topic) {
                gpi_data = JSON.parse(message.toString());
            }
            if (topic === control) {
                if (message.toString().includes('g')) {
                    console.log(message.toString());
                    let command_arr = message.toString().split(' ');
                    interval = command_arr[1];
                    mission = command_arr[2];

                    gps_filename.findOne({name: 'mission_name'}).then(function (u) {
                        gps_filename.remove(u).then(function () {
                            gps_filename.insert({name: 'mission_name', mission: 'keti'}).then(function (u) {
                                console.log('insert mission info');
                                console.log(u);
                            });
                        });
                    });

                    ftp_dir = moment().format('YYYY-MM-DD') + '-' + mission + '_' + drone_name;
                    !fs.existsSync(ftp_dir) && fs.mkdirSync(ftp_dir);

                    capture_image();
                } else if (message.toString() === 's') {
                    if (capture_command !== null) {
                        kill(capture_command.pid);
                    }
                }
            }
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function capture_image() {
    capture_command = exec("gphoto2 --capture-image-and-download --filename 20%y-%m-%dT%H:%M:%S.jpg --interval " + interval + " --folder ./");

    capture_command.stdout.on('data', function (data) {
        if (data.split('\n')[1].includes('.jpg')) {
            let data_arr = data.split('\n')[1].split(' ')
            for (let idx in data_arr) {
                if (data_arr[idx].includes('.jpg')) {
                    gpi_data.image = data_arr[idx];

                    gps_filename.insert(gpi_data);

                    lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data)); // backup gps and image name
                }
            }
        }
    });

    capture_command.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
        if (data.includes('gphoto2: not found')) {
            console.log('Please install gphoto library');
        }
    });

    capture_command.on('exit', function (code) {
        console.log('exit: ' + code);
    });

    capture_command.on('error', function (code) {
        console.log('error: ' + code);
    });
}
