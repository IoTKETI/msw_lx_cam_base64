/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
const fsextra = require('fs-extra');
const moment = require("moment");
const sendFTP = require("basic-ftp");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const {spawn} = require('child_process');

const my_lib_name = 'lib_lx_cam';

let mission = '';
let ftp_dir = '';
let drone_name = process.argv[3];

let ftp_client = null;
let ftp_host = process.argv[2];
let ftp_user = 'lx_ftp';
let ftp_pw = 'lx123!';

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Init';
let count = 0;
let external_memory = '/media/pi/';

init();

function init() {
    let check_memory = spawn('df', ['-h']);

    check_memory.stdout.on('data', (data) => {
        // console.log('stdout: ' + data);
        data.toString().split('\n').forEach((list) => {
            if (list.includes('/dev/root')) {
                list.split(' ').forEach((d) => {
                    if (d.includes('%')) {
                        console.log('Free memory is ' + d);
                        if ((100 - parseInt(d.substring(0, d.length - 1))) <= 20) {
                            if (directorys.length > 0) {
                                console.log('./' + directorys[0]);
                                fs.rmdir('./' + directorys[0], {recursive: true}, (err) => {
                                    if (err) {
                                        console.log(err);
                                    } else {
                                        console.log('./' + directorys[0] + " Deleted!");
                                    }
                                });
                            }
                        }
                    }
                });
            }
        })
    });

    check_memory.stderr.on('data', (data) => {
        console.log('stderr: ' + data);
    });
    check_memory.on('exit', (code) => {
        console.log('exit: ' + code);
    });
    check_memory.on('error', function (code) {
        console.log('error: ' + code);
    });

    let directorys = [];
    fs.readdirSync('./', {withFileTypes: true}).forEach(p => {
        let dir = p.name;
        if (p.name.includes('FTP-')) {
            if (p.isDirectory()) {
                directorys.push(dir);
            }
        }
    });
    ftp_dir = directorys[directorys.length - 1];
    console.log('보드에서 마지막 사진 폴더 이름 : ' + ftp_dir);

    setTimeout(ftp_connect, 500, ftp_host, ftp_user, ftp_pw, ftp_dir);

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

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][2];
    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];

    lib_mqtt_connect('localhost', 1883, control_topic);
}

function lib_mqtt_connect(broker_ip, port, control) {
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
            console.log('[ftp_lib_mqtt_connect] connected to ' + broker_ip);

            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[ftp_lib_mqtt] lib_sub_control_topic: ' + control);
                });
            }
            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', function (topic, message) {
            if (topic === control) {
                if (message.toString().includes('g')) {
                    if (status === 'Init' || status === 'Finish') {
                        console.log(message.toString());
                        let command_arr = message.toString().split(' ');
                        mission = command_arr[2];

                        ftp_dir = 'FTP-' + moment().format('YYYY-MM-DDTHH') + '-' + mission + '-' + drone_name;
                        if (!ftp_client.closed) {
                            ftp_client.ensureDir("/" + ftp_dir);
                        } else {
                            ftp_client.close();
                            setTimeout(ftp_connect, 100, ftp_host, ftp_user, ftp_pw);
                        }

                        !fs.existsSync(ftp_dir) && fs.mkdirSync(ftp_dir);
                        console.log('[ftp_lib_mqtt] Create ( ' + ftp_dir + ' ) directory');

                        count = 0;

                        status = 'Start';
                        let msg = status + ' ' + ftp_dir;
                        lib_mqtt_client.publish(my_status_topic, msg);
                    }
                } else if (message.toString() === 'copy') {
                    checkUSB.then((result) => {
                        if (result === 'finish') {
                            status = 'Copy';
                            lib_mqtt_client.publish(my_status_topic, status);
                            copy2USB(ftp_dir, external_memory + '/' + ftp_dir);
                        } else {
                            status = 'Finish';
                            let msg = status + ' Not found external memory';
                            lib_mqtt_client.publish(my_status_topic, msg);
                        }
                    });
                }
            } else {
                console.log('From ' + topic + 'message is ' + message.toString());
            }
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

async function ftp_connect(host, user, pw, dir) {
    ftp_client = new sendFTP.Client(0)
    ftp_client.ftp.verbose = false;
    try {
        await ftp_client.access({
            host: host, user: user, password: pw, port: 50023
        })

        if (dir !== undefined) {
            ftp_client.ensureDir("/" + dir);
            console.log('Connect FTP server to ' + host);
            console.log('Create ( ' + dir + ' ) directory');
        } else {
            console.log('Connect FTP server to ' + host);
        }

        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
            } else {
                if (dir !== undefined) {
                    if (files.length > 0) {
                        console.log('FTP directory is ' + dir);
                        status = 'Start';
                        lib_mqtt_client.publish(my_status_topic, status);
                    } else {
                        console.log('Geotagged directory is empty');
                    }
                }
            }
        });
    } catch (err) {
        console.log('[FTP] Error\n', err)
        console.log('FTP connection failed');
    }
}

let empty_count = 0;

function send_image_via_ftp() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
                setTimeout(send_image_via_ftp, 50);
            } else {
                if (files.length > 0) {
                    console.time('ftp');
                    console.time('ftpmove');
                    if (!ftp_client.closed) {
                        ftp_client.uploadFrom('./' + geotagging_dir + '/' + files[0], "/" + ftp_dir + '/' + files[0]).then(() => {
                            console.timeEnd('ftp');
                            move_image('./' + geotagging_dir + '/', './' + ftp_dir + '/', files[0]).then((result) => {
                                if (result === 'finish') {
                                    count++;

                                    empty_count = 0;
                                    let msg = status + ' ' + count + ' ' + files[0];
                                    lib_mqtt_client.publish(my_status_topic, msg);
                                    console.timeEnd('ftpmove');

                                    setTimeout(send_image_via_ftp, 200);
                                } else {
                                    setTimeout(send_image_via_ftp, 200);
                                }
                            }).catch((err) => {
                                console.log(err);
                                fs.stat('./' + ftp_dir + '/' + files[0], (err) => {
                                    console.log(err);
                                    if (err !== null && err.code === "ENOENT") {
                                        console.log("[sendFTP]사진이 존재하지 않습니다.");
                                    }
                                    console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + files[0] + ") 입니다.");
                                });
                                setTimeout(send_image_via_ftp, 200);
                            });

                            // count++;
                            //
                            // empty_count = 0;
                            // let msg = status + ' ' + count;
                            // lib_mqtt_client.publish(my_status_topic, msg);
                            //
                            // setTimeout(send_image_via_ftp, 5);
                        });
                    } else {
                        ftp_client.close();
                        setTimeout(ftp_connect, 100, ftp_host, ftp_user, ftp_pw);
                    }
                } else {
                    if (status === 'Started') {
                        empty_count++;
                        console.log('Waiting - ' + empty_count);
                        if (empty_count > 200) {
                            status = 'Finish';
                            empty_count = 0;
                            let msg = status + ' ' + count;
                            lib_mqtt_client.publish(my_status_topic, msg);

                        } else {
                            setTimeout(send_image_via_ftp, 50);
                        }
                    } else {
                        setTimeout(send_image_via_ftp, 100);
                    }
                }
            }
        });
    } catch (e) {
        setTimeout(send_image_via_ftp, 100);
    }
}

setInterval(() => {
    // 환경이 구성 되었다. 이제부터 시작한다.
    if (status === 'Start') {
        status = 'Started';

        send_image_via_ftp();
    }
}, 1000);

const move_image = ((from, to, image) => {
    return new Promise((resolve, reject) => {
        // try {
        //     // fs.renameSync(from + image, to + image);
        //     fs.copyFile(from + image, to + image, (err) => {
        //         fs.unlink(from + image, (err) => {
        //         });
        //     });
        // } catch (e) {
        //     console.log(e);
        //     fs.stat(to + image, (err) => {
        //         console.log(err);
        //         if (err !== null && err.code === "ENOENT") {
        //             console.log("[sendFTP]사진이 존재하지 않습니다.");
        //         }
        //         console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        //     });
        // }
        try {
            fs.copyFile(from + image, to + image, (err) => {
                fs.unlink(from + image, (err) => {
                });
            });
            resolve('finish');
        } catch (e) {
            reject('no such file');
        }
    });
});

const checkUSB = new Promise((resolve, reject) => {
    // 외장 메모리 존재 여부 확인
    fs.readdirSync(external_memory, {withFileTypes: true}).forEach(p => {
        let dir = p.name;
        if (p.isDirectory()) {
            external_memory += dir;
            console.log('외장 메모리 경로 : ' + external_memory);
        }
    });
    resolve('finish');
});

function copy2USB(source, destination) {
    try {
        !fs.existsSync(destination) && fs.mkdirSync(destination);
    } catch (e) {
        if (e.includes('permission denied')){
            console.log(e);
        }
    }

    status = 'Copying';
    lib_mqtt_client.publish(my_status_topic, status);

    fsextra.copy(source, destination, function (err) {
        if (err) {
            console.log(err);
        }
        status = 'Finish';
        lib_mqtt_client.publish(my_status_topic, status);
    });
}
