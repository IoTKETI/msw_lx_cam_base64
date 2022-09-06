/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
const fsextra = require('fs-extra');
const moment = require("moment");
const axios = require("axios");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const {spawn} = require('child_process');

const my_lib_name = 'lib_lx_cam';

let mission = '';
let sended_dir = '';
let drone_info = JSON.parse(process.env.drone_info);
let drone_name = drone_info.drone;
let host = drone_info.host;
// let drone_name = 'drone1';
// let host = '10.252.73.230';

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Start';
let count = 0;
let external_memory = 'D:\\';
let copyable = false;

const num_proc = 3;

const remainder = 0;

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
        if (p.name.includes('Send-')) {
            if (p.isDirectory()) {
                directorys.push(dir);
            }
        }
    });
    sended_dir = directorys[directorys.length - 1];
    console.log('[sendImages' + remainder + ']마지막 사진 폴더 이름 : ' + sended_dir);

    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = "./lib_lx_cam.js";
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"];
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
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'send_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', function () {
            console.log('[send_lib_mqtt_connect' + remainder + '] connected to ' + broker_ip);

            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[send_lib_mqtt' + remainder + '] lib_sub_control_topic: ' + control);
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

                        sended_dir = 'Send-' + moment().format('YYYY-MM-DDTHH') + '-' + mission + '-' + drone_name;

                        !fs.existsSync(sended_dir) && fs.mkdirSync(sended_dir);
                        console.log('[send_lib_mqtt' + remainder + '] Create ( ' + sended_dir + ' ) directory');

                        status = 'Start';
                        let msg = status + ' ' + sended_dir;
                        lib_mqtt_client.publish(my_status_topic, msg);
                        // axios.post("http://" + host + ":4500/lists/",
                        //     {
                        //         listid: sended_dir,
                        //         content: []
                        //     }
                        // ).then((response) => {
                        //     status = 'Start';
                        //     let msg = status + ' ' + sended_dir;
                        //     lib_mqtt_client.publish(my_status_topic, msg);
                        // }).catch((error) => {
                        //     console.log('[list init]', error.message)
                        //     if (error.message.includes('500')) {
                        //         axios.get("http://" + host + ":4500/lists/listid/" + sended_dir)
                        //             .then((response) => {
                        //                 console.log(response.data.content)
                        //                 images = response.data.content
                        //                 status = 'Start';
                        //                 let msg = status + ' ' + sended_dir;
                        //                 lib_mqtt_client.publish(my_status_topic, msg);
                        //             }).catch((error) => {
                        //             console.log('[list init]', error.message)
                        //         })
                        //     }
                        // })
                        count = 0;
                    }
                } else if (message.toString() === 'copy') {
                    checkUSB.then((result) => {
                        if (result === 'finish') {
                            if (copyable) {
                                status = 'Copy';
                                lib_mqtt_client.publish(my_status_topic, status);
                                copy2USB(sended_dir, external_memory + '/' + sended_dir);
                            }
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

let empty_count = 0;
let imageIndex = 0;

function send_image() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
                setTimeout(send_image, 50);
            } else {
                if (files.length > 0) {
                    let index
                    try {
                        index = files[imageIndex].split('.')[0].substring(20, 22);
                    } catch (e) {
                        console.log(e)
                        imageIndex = 0;
                        setTimeout(send_image, 100);
                        return
                    }
                    if (index % num_proc === remainder) {
                        console.log('=================================================')
                        console.log(files[imageIndex])
                        console.time('Cycle' + remainder);
                        console.time('OnlySend' + remainder);
                        let readFile = fs.readFileSync('./' + geotagging_dir + '/' + files[imageIndex]); // 이미지 파일 읽기
                        let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
                        let header = {
                            maxContentLength: Infinity,
                            maxBodyLength: Infinity,
                        };
                        axios.post("http://" + host + ":4500/images",
                            {
                                imageid: files[imageIndex],
                                content: "data:image/jpg;base64," + encode,
                            },
                            header
                        ).then(function (response) {
                            console.timeEnd('OnlySend' + remainder)
                            move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', files[imageIndex])
                                .then((result) => {
                                    if (result === 'finish') {
                                        count++;
                                        imageIndex = 0;
                                        empty_count = 0;
                                        let msg = status + ' ' + count + ' ' + files[imageIndex];
                                        lib_mqtt_client.publish(my_status_topic, msg);
                                        console.timeEnd("Cycle" + remainder);
                                        setTimeout(send_image, 100);
                                        return
                                    } else {
                                        console.timeEnd("Cycle" + remainder);
                                        setTimeout(send_image, 100);
                                        return
                                    }
                                }).catch((error) => {
                                console.log(error.message);
                                fs.stat('./' + sended_dir + '/' + files[imageIndex], (err) => {
                                    // console.log(err);
                                    if (err !== null && err.code === "ENOENT") {
                                        console.log('[sendImages' + remainder + ']사진이 존재하지 않습니다.');
                                    }
                                    console.timeEnd('Cycle' + remainder)
                                    console.log('[sendImages' + remainder + ']이미 처리 후 옮겨진 사진 (' + files[imageIndex] + ') 입니다.');
                                });
                                setTimeout(send_image, 100);
                                return
                            })
                        }).catch(function (error) {
                            console.log('[image_send' + remainder + ']', error.message)
                            if (error.response.status === 500) {
                                axios.delete("http://" + host + ":4500/images/imageid/" + files[imageIndex])
                                    .then((res) => {
                                        // console.log(res)
                                        console.timeEnd('Cycle' + remainder)
                                        console.timeEnd('OnlySend' + remainder)
                                        setTimeout(send_image, 100);
                                        return
                                    }).catch((error) => {
                                    console.log(error.message)
                                    console.timeEnd('Cycle' + remainder)
                                    console.timeEnd('OnlySend' + remainder)
                                    setTimeout(send_image, 100);
                                    return
                                })
                            }
                        });
                    } else {
                        if (imageIndex < files.length - 1) {
                            imageIndex++;
                            setTimeout(send_image, 100);
                            return
                        } else {
                            imageIndex = 0;
                            setTimeout(send_image, 100);
                            return
                        }
                    }
                } else {
                    if (status === 'Started') {
                        empty_count++;
                        // console.log('Waiting - ' + empty_count);
                        if (empty_count > 200) {
                            console.timeEnd('Finish')
                            status = 'Finish';
                            empty_count = 0;
                            let msg = status + ' ' + count;
                            lib_mqtt_client.publish(my_status_topic, msg);
                        } else {
                            setTimeout(send_image, 50);
                            return
                        }
                    } else {
                        setTimeout(send_image, 100);
                        return
                    }
                }
            }
        });
    } catch (e) {
        setTimeout(send_image, 100);
        return
    }
}

setInterval(() => {
    // 환경이 구성 되었다. 이제부터 시작한다.
    if (status === 'Start') {
        status = 'Started';

        send_image();
        console.time('Finish')
    }
}, 1000);

const move_image = ((from, to, image) => {
    console.time('moveImage')
    return new Promise((resolve, reject) => {
        try {
            fs.rename(from + image, to + image, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve('finish');
                    console.timeEnd('moveImage')
                }
            });
            // fs.copyFile(from + image, to + image, (err) => {
            //     fs.unlink(from + image, (err) => {
            //         if (err) {
            //             reject(err);
            //         } else {
            //             resolve('finish');
            //             console.timeEnd('moveImage')
            //         }
            //     });
            // });
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
            copyable = true;
            return;
        }
    });
    resolve('finish');
});

function copy2USB(source, destination) {
    try {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination);
            console.log('Create directory ---> ' + destination);
        }
    } catch (e) {
        if (e.includes('permission denied')) {
            console.log(e);
        }
    }

    status = 'Copying';
    lib_mqtt_client.publish(my_status_topic, status);
    console.log('Copy from [ ' + source + ' ] to [ ' + destination + ' ]');

    fsextra.copy(source, destination, function (err) {
        if (err) {
            console.log(err);
        }
        status = 'Finish';
        lib_mqtt_client.publish(my_status_topic, status);
        console.log('Finish copy => from [ ' + source + ' ] to [ ' + destination + ' ]');
    });
}
