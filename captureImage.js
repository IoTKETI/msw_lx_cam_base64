const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const fs = require('fs');
const {spawn} = require("child_process");
const db = require('node-localdb');

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
let interval = 5;
let mission = '';

let capture_flag = false;
let count = 0;

let status = 'Init';

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
        lib.data = ["Capture_Status", "Geotag_Status", "FTP_Status", "Captured_GPS", "Geotagged_GPS"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];
    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][0];
    captured_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][3];
    gpi_topic = '/MUV/control/' + lib['name'] + '/global_position_int';

    lib_mqtt_connect('localhost', 1883, gpi_topic, control_topic);

    lib_mqtt_client.publish(my_status_topic, status);

    setTimeout(() => {
        let camera_test = spawn("gphoto2", ["--summary"]);
        console.log('Get camera summary to check connection');

        camera_test.stdout.on('data', (data) => {
            console.log('stdout: ' + data);
        });
        camera_test.stderr.on('data', (data) => {
            console.log('stderr: ' + data);
            if (data.includes('gphoto2: not found')) {
                console.log('Please install gphoto library');
            } else if (data.includes('PTP Timeout')) {
                status = 'Please reconnect the camera cable.';
                lib_mqtt_client.publish(my_status_topic, status);
            } else if (data.includes('no camera found')) {
                status = 'Please check the camera.';
                lib_mqtt_client.publish(my_status_topic, status);
            }
        });
        camera_test.on('exit', (code) => {
            console.log('exit: ' + code);
            if (code === 0) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
            }
        });
        camera_test.on('error', function (code) {
            console.log('error: ' + code);
        });
    }, 100);
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
                    console.log('[Capture command] - ' + message.toString());
                    let command_arr = message.toString().split(' ');
                    interval = command_arr[1];
                    mission = command_arr[2];

                    count = 0;

                    if (status === 'Ready') {
                        capture_flag = true;
                    } else {
                        status = 'Check camera..';
                        lib_mqtt_client.publish(my_status_topic, status);
                    }
                } else if (message.toString() === 's') {
                    if (capture_command !== null) {
                        process.kill(capture_command.pid, 'SIGINT');
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
        // gphoto2 --capture-image-and-download --filename 20%y-%m-%dT%H:%M:%S.jpg --interval 5 --folder ./
        capture_command = spawn("gphoto2", ['--capture-image-and-download', '--filename', '20%y-%m-%dT%H:%M:%S.jpg', '--interval', interval, '--folder', './']);

        capture_command.stdout.on('data', (data) => {
            console.log('data: ' + data);

            console.timeEnd('capture');
            if (data.toString().split('\n')[1].includes('.jpg')) {
                let data_arr = data.toString().split('\n')[1].split(' ')
                for (let idx in data_arr) {
                    if (data_arr[idx].includes('.jpg')) {
                        gpi_data.image = data_arr[idx];

                        gps_filename.insert(gpi_data);
                        lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data)); // backup gps and image name
                    }
                }
                status = 'Capture';
                count++;
                let msg = status + ' ' + count;
                lib_mqtt_client.publish(my_status_topic, msg);
            }
            console.time('capture');
        });

        capture_command.stderr.on('data', (data) => {
            if (data.toString().includes('gphoto2: not found')) {
                console.log('Please install gphoto library');
            } else if (data.toString().includes("Operation cancelled.")) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
                console.log('Operation cancelled.');
            } else if (data.toString().includes('PTP General')) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
                console.log('Cancelled.');
            } else if (data.toString().includes('You need to specify a folder starting with')) {
                status = 'Error';
                let msg = status + ' - Board Memory Full';
                lib_mqtt_client.publish(my_status_topic, msg);
                console.log(msg);
            } else if (data.toString().includes('Could not capture image')) {
                status = 'Error';
                let msg = status + ' - Could not capture';
                lib_mqtt_client.publish(my_status_topic, msg);
                console.log(msg);
                process.kill(capture_command.pid, 'SIGINT');
                setTimeout(capture_image, 100);
                // TODO: 재실행 되는지 확인
            } else {
                console.log('stderr: ' + data);
            }
        });

        capture_command.on('exit', (code) => {
            console.log(count, 'exit: ' + code);

            console.timeEnd('capture');
            if (code === null) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
            }
        });

        capture_command.on('error', (code) => {
            console.log('error: ' + code);
        });
        // console.time('capture');
        // gps_filename.insert(gpi_data);
        // lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data));
        // console.timeEnd('capture');
        // status = 'Capture';
        // count++;
        // let msg = status + ' ' + count;
        // lib_mqtt_client.publish(my_status_topic, msg);
        // setInterval(() => {
        //     console.time('capture');
        //     gps_filename.insert(gpi_data);
        //     lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data));
        //     console.timeEnd('capture');
        //     status = 'Capture';
        //     count++;
        //     let msg = status + ' ' + count;
        //     lib_mqtt_client.publish(my_status_topic, msg);
        // }, interval * 1000);
    }
}

setInterval(() => {
    if (status === 'Ready') {
        if (capture_flag) {
            // clearInterval(tid);
            capture_image();
        }
    }
}, interval * 1000);

