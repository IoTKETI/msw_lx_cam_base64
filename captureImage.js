const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const fs = require('fs');
const exec = require("child_process").exec;
const moment = require("moment");
const db = require('node-localdb');
const kill = require('tree-kill');

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let lib = {};

let lib_mqtt_client = null;
let control_topic = '';
let my_status_topic = '';
let captured_position_topic = '';
let gpi_topic = '';
let gpi_data = {};

let capture_command = null;
let interval = 6;
let mission = '';

let capture_flag = false;
let count = 0;

let status = 'Init';

let ftp_dir = '';
let drone_name = process.argv[2];
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
        lib.data = ["Capture_Status", "Geotag_Status", "FTP_Status", "Captured_GPS"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];
    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][0];
    captured_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][3];
    gpi_topic = '/MUV/control/' + lib['name'] + '/global_position_int';

    lib_mqtt_connect('localhost', 1883, gpi_topic, control_topic);

    lib_mqtt_client.publish(my_status_topic, status);

    setTimeout(()=> {
        let camera_summary = exec("gphoto2 --summary");

        camera_summary.stdout.on('data', (data) => {
            console.log('stdout: ' + data);

            if (data.includes('sufficient quoting around the arguments')) {
                console.log('Please check the connection with the camera.');
            }
        });
        camera_summary.stderr.on('data', (data) => {
            console.log('stderr: ' + data);
        });
        camera_summary.on('exit', (code) => {
            console.log('exit: ' + code);
            if (code === 0) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
            }
        });
        camera_summary.on('error', function (code) {
            console.log('error: ' + code);
        });
        // // TODO: 테스트용 추후 삭제
        // status = 'Ready';
        // lib_mqtt_client.publish(my_status_topic, status);
    }, 1000);
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
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'capture_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', function () {
            console.log('[capture_lib_mqtt_connect] connected to ' + broker_ip);

            if (fc !== '') {
                lib_mqtt_client.subscribe(gpi_topic, function () {
                    console.log('[capture_lib_mqtt] lib_sub_fc_topic: ' + gpi_topic);
                });
            }
            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[capture_lib_mqtt] lib_sub_control_topic: ' + control);
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
                            gps_filename.insert({
                                name: 'mission_name',
                                mission: mission,
                                drone: drone_name
                            }).then(function (u) {
                                console.log('insert mission info');
                                console.log(u);
                            });
                        });
                    });

                    ftp_dir = moment().format('YYYY-MM-DD') + '-' + mission + '_' + drone_name;
                    !fs.existsSync(ftp_dir) && fs.mkdirSync(ftp_dir);

                    count = 0;

                    if (status !== 'Ready') {
                        status = 'Check camera..';
                        lib_mqtt_client.publish(my_status_topic, status);
                    } else {
                        capture_flag = true;
                    }
                    // // TODO: 테스트용 추후 삭제
                    // status = 'Capture';
                    // lib_mqtt_client.publish(my_status_topic, status);
                } else if (message.toString() === 's') {
                    if (capture_command !== null) {
                        kill(capture_command.pid);
                    }
                    capture_flag = false;
                    status = 'Stop';
                    lib_mqtt_client.publish(my_status_topic, status);
                }
            }
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function capture_image() {
    if (capture_flag) {
        console.time('capture');
        capture_command = exec("gphoto2 --capture-image-and-download --filename 20%y-%m-%dT%H:%M:%S.jpg --interval " + interval + " --folder ./");

        capture_command.stdout.on('data', (data) => {
            // console.log(count++, 'data: ' + data);

            console.timeEnd('capture');
            if (data.split('\n')[1].includes('.jpg')) {
                let data_arr = data.split('\n')[1].split(' ')
                for (let idx in data_arr) {
                    if (data_arr[idx].includes('.jpg')) {
                        gpi_data.image = data_arr[idx];

                        gps_filename.insert(gpi_data);
                        lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data)); // backup gps and image name
                    }
                }
                status = 'Capture ' + count++;
                lib_mqtt_client.publish(my_status_topic, status);
            }
        });

        capture_command.stderr.on('data', (data) => {
            if (data.includes('gphoto2: not found')) {
                console.log('Please install gphoto library');
            } else if (data.includes('PTP Cancel')) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
                console.log('Capture process Stop.');
            } else {
                console.log('stderr: ' + data);
            }
        });

        capture_command.on('exit', (code) => {
            console.log(count++, 'exit: ' + code);
            console.timeEnd('capture');
        });

        capture_command.on('error', (code) => {
            console.log('error: ' + code);
        });
    }
}

var tid = setInterval(() => {
    if (capture_flag) {
        clearInterval(tid);
        capture_image();
        // // TODO: 테스트용 추후 삭제
        // console.log('capture');
    }
}, interval * 1000);

