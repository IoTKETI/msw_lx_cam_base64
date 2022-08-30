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

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Init';
let count = 0;
let external_memory = '/media/pi/';
let copyable = false;

let imgList_first = [];
let imgList_second = [];
let imgList_third = [];
let imgList_fourth = [];
let imgList_fifth = [];

const num_proc = 3;

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
    console.log('보드에서 마지막 사진 폴더 이름 : ' + sended_dir);

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

    if (num_proc === 3) {
        SendBase64_0();
        SendBase64_1();
        SendBase64_2();
    } else if (num_proc === 5) {
        SendBase64_0();
        SendBase64_1();
        SendBase64_2();
        SendBase64_3();
        SendBase64_4();
    }
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
            console.log('[send_lib_mqtt_connect] connected to ' + broker_ip);

            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[send_lib_mqtt] lib_sub_control_topic: ' + control);
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
                        console.log('[send_lib_mqtt] Create ( ' + sended_dir + ' ) directory');

                        axios.post("http://" + host + ":4500/lists/",
                            {
                                listid: sended_dir,
                                content: []
                            }
                        ).then((response) => {
                            status = 'Start';
                            let msg = status + ' ' + sended_dir;
                            lib_mqtt_client.publish(my_status_topic, msg);
                        }).catch((error) => {
                            console.log('[list init]', error.message)
                            if (error.message.includes('500')) {
                                axios.get("http://" + host + ":4500/lists/listid/" + sended_dir)
                                    .then((response) => {
                                        console.log(response.data.content)
                                        images = response.data.content
                                        status = 'Start';
                                        let msg = status + ' ' + sended_dir;
                                        lib_mqtt_client.publish(my_status_topic, msg);
                                    }).catch((error) => {
                                    console.log('[list init]', error.message)
                                })
                            }
                        })
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
let images = []

function SendBase64_0() {
    if (imgList_first.length > 0) {
        try {
            console.time('Cycle0')
            console.time('OnlySend0')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_first[0]); //이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); //파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_first[0],
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend0')
                move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', imgList_first[0])
                    .then((result) => {
                        if (result === 'finish') {
                            count++;

                            empty_count = 0;
                            let msg = status + ' ' + count + ' ' + imgList_first[0];
                            lib_mqtt_client.publish(my_status_topic, msg);
                            console.timeEnd("Cycle0");
                            imgList_first.shift()
                            setTimeout(SendBase64_0, 100);
                            return
                        } else {
                            console.timeEnd("Cycle0");
                            setTimeout(SendBase64_0, 100);
                            return
                        }
                    }).catch((error) => {
                    console.log(error.message);
                    fs.stat('./' + sended_dir + '/' + imgList_first[0], (err) => {
                        // console.log(err);
                        if (err !== null && err.code === "ENOENT") {
                            console.log("[sendImages]사진이 존재하지 않습니다.");
                        }
                        console.timeEnd('Cycle0')
                        console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_first[0] + ") 입니다.");
                    });
                    setTimeout(SendBase64_0, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                if (error.response.status === 500) {
                    axios.delete("http://" + host + ":4500/images/imageid/" + imgList_first[0])
                        .then((res) => {
                            // console.log(res)
                            console.timeEnd('Cycle0')
                            console.timeEnd('OnlySend0')
                            setTimeout(SendBase64_0, 100);
                            return
                        }).catch((error) => {
                        console.log(error.message)
                        console.timeEnd('Cycle0')
                        console.timeEnd('OnlySend0')
                        setTimeout(SendBase64_0, 100);
                        return
                    })
                }
            });
        } catch (e) {
            imgList_first.shift()
            setTimeout(SendBase64_0, 100);
        }
    } else {
        setTimeout(SendBase64_0, 100);
    }
}

function SendBase64_1() {
    if (imgList_second.length > 0) {
        try {
            console.time('Cycle1')
            console.time('OnlySend1')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_second[0]); //이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); //파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_second[0],
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend1')
                move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', imgList_second[0])
                    .then((result) => {
                        if (result === 'finish') {
                            count++;

                            empty_count = 0;
                            let msg = status + ' ' + count + ' ' + imgList_second[0];
                            lib_mqtt_client.publish(my_status_topic, msg);
                            console.timeEnd("Cycle1");
                            imgList_second.shift()
                            setTimeout(SendBase64_1, 100);
                            return
                        } else {
                            console.timeEnd("Cycle1");
                            setTimeout(SendBase64_1, 100);
                            return
                        }
                    }).catch((error) => {
                    console.log(error.message);
                    fs.stat('./' + sended_dir + '/' + imgList_second[0], (err) => {
                        // console.log(err);
                        if (err !== null && err.code === "ENOENT") {
                            console.log("[sendImages]사진이 존재하지 않습니다.");
                        }
                        console.timeEnd('Cycle1')
                        console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_second[0] + ") 입니다.");
                    });
                    setTimeout(SendBase64_1, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                if (error.response.status === 500) {
                    axios.delete("http://" + host + ":4500/images/imageid/" + imgList_second[0])
                        .then((res) => {
                            // console.log(res)
                            console.timeEnd('Cycle1')
                            console.timeEnd('OnlySend1')
                            setTimeout(SendBase64_1, 100);
                            return
                        }).catch((error) => {
                        console.log(error.message)
                        console.timeEnd('Cycle1')
                        console.timeEnd('OnlySend1')
                        setTimeout(SendBase64_1, 100);
                        return
                    })
                }
            });
        } catch (e) {
            imgList_second.shift()
            setTimeout(SendBase64_1, 100);
        }
    } else {
        setTimeout(SendBase64_1, 100);
    }
}

function SendBase64_2() {
    if (imgList_third.length > 0) {
        try {
            console.time('Cycle2')
            console.time('OnlySend2')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_third[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_third[0],
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend2')
                move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', imgList_third[0])
                    .then((result) => {
                        if (result === 'finish') {
                            count++;

                            empty_count = 0;
                            let msg = status + ' ' + count + ' ' + imgList_third[0];
                            lib_mqtt_client.publish(my_status_topic, msg);
                            console.timeEnd("Cycle2");
                            imgList_third.shift()
                            setTimeout(SendBase64_2, 100);
                            return
                        } else {
                            console.timeEnd("Cycle2");
                            setTimeout(SendBase64_2, 100);
                            return
                        }
                    }).catch((error) => {
                    console.log(error.message);
                    fs.stat('./' + sended_dir + '/' + imgList_third[0], (err) => {
                        // console.log(err);
                        if (err !== null && err.code === "ENOENT") {
                            console.log("[sendImages]사진이 존재하지 않습니다.");
                        }
                        console.timeEnd('Cycle2')
                        console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_third[0] + ") 입니다.");
                    });
                    setTimeout(SendBase64_2, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                if (error.response.status === 500) {
                    axios.delete("http://" + host + ":4500/images/imageid/" + imgList_third[0])
                        .then((res) => {
                            // console.log(res)
                            console.timeEnd('Cycle2')
                            console.timeEnd('OnlySend2')
                            setTimeout(SendBase64_2, 100);
                            return
                        }).catch((error) => {
                        console.log(error.message)
                        console.timeEnd('Cycle2')
                        console.timeEnd('OnlySend2')
                        setTimeout(SendBase64_2, 100);
                        return
                    })
                }
            });
        } catch (e) {
            imgList_third.shift()
            setTimeout(SendBase64_2, 100);
        }
    } else {
        setTimeout(SendBase64_2, 100);
    }
}

function SendBase64_3() {
    if (imgList_fourth.length > 0) {
        try {
            console.time('Cycle3')
            console.time('OnlySend3')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_fourth[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_fourth[0],
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend3')
                move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', imgList_fourth[0])
                    .then((result) => {
                        if (result === 'finish') {
                            count++;

                            empty_count = 0;
                            let msg = status + ' ' + count + ' ' + imgList_fourth[0];
                            lib_mqtt_client.publish(my_status_topic, msg);
                            console.timeEnd("Cycle3");
                            imgList_fourth.shift()
                            setTimeout(SendBase64_3, 100);
                            return
                        } else {
                            console.timeEnd("Cycle3");
                            setTimeout(SendBase64_3, 100);
                            return
                        }
                    }).catch((error) => {
                    console.log(error.message);
                    fs.stat('./' + sended_dir + '/' + imgList_fourth[0], (err) => {
                        // console.log(err);
                        if (err !== null && err.code === "ENOENT") {
                            console.log("[sendImages]사진이 존재하지 않습니다.");
                        }
                        console.timeEnd('Cycle3')
                        console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_fourth[0] + ") 입니다.");
                    });
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                if (error.response.status === 500) {
                    axios.delete("http://" + host + ":4500/images/imageid/" + imgList_fourth[0])
                        .then((res) => {
                            // console.log(res)
                            console.timeEnd('Cycle3')
                            console.timeEnd('OnlySend3')
                            setTimeout(SendBase64_3, 100);
                            return
                        }).catch((error) => {
                        console.log(error.message)
                        console.timeEnd('Cycle3')
                        console.timeEnd('OnlySend3')
                        setTimeout(SendBase64_3, 100);
                        return
                    })
                }
            });
        } catch (e) {
            imgList_fourth.shift()
            setTimeout(SendBase64_3, 100);
        }
    } else {
        setTimeout(SendBase64_3, 100);
    }
}

function SendBase64_4() {
    if (imgList_fifth.length > 0) {
        try {
            console.time('Cycle4')
            console.time('OnlySend4')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_fifth[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_fifth[0],
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend4')
                move_image('./' + geotagging_dir + '/', './' + sended_dir + '/', imgList_fifth[0])
                    .then((result) => {
                        if (result === 'finish') {
                            count++;

                            empty_count = 0;
                            let msg = status + ' ' + count + ' ' + imgList_fifth[0];
                            lib_mqtt_client.publish(my_status_topic, msg);
                            console.timeEnd("Cycle4");
                            imgList_fifth.shift()
                            setTimeout(SendBase64_4, 100);
                            return
                        } else {
                            console.timeEnd("Cycle4");
                            setTimeout(SendBase64_4, 100);
                            return
                        }
                    }).catch((error) => {
                    console.log(error.message);
                    fs.stat('./' + sended_dir + '/' + imgList_fifth[0], (err) => {
                        // console.log(err);
                        if (err !== null && err.code === "ENOENT") {
                            console.log("[sendImages]사진이 존재하지 않습니다.");
                        }
                        console.timeEnd('Cycle4')
                        console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_fifth[0] + ") 입니다.");
                    });
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                if (error.response.status === 500) {
                    axios.delete("http://" + host + ":4500/images/imageid/" + imgList_fifth[0])
                        .then((res) => {
                            // console.log(res)
                            console.timeEnd('Cycle4')
                            console.timeEnd('OnlySend4')
                            setTimeout(SendBase64_4, 100);
                            return
                        }).catch((error) => {
                        console.log(error.message)
                        console.timeEnd('Cycle4')
                        console.timeEnd('OnlySend4')
                        setTimeout(SendBase64_4, 100);
                        return
                    })
                }
            });
        } catch (e) {
            imgList_fifth.shift()
            setTimeout(SendBase64_4, 100);
        }
    } else {
        setTimeout(SendBase64_4, 100);
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
