/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
const piexif = require("piexifjs");
const moment = require("moment");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const db = require('node-localdb');
const {exec} = require("child_process");

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let geotagged_position_topic = '';

let status = 'Init';
let count = 0;

let external_memory = '/mnt/usb';
let memFormat = 'vfat';

let pw = "raspberry";
let dir_name = '';

let copyable = false;

const checkUSB = new Promise((resolve, reject) => {
    // 외장 메모리 존재 여부 확인
    exec("echo " + pw + " | sudo -S fdisk -l | grep sda", (error, stdout, stderr) => {
        if (error) {
            console.log('[getUSB] error:', error);
            reject(error);
        }
        if (stdout) {
            console.log('[getUSB] stdout: ' + stdout);
            if (stdout.includes('sda')) {
                let memoryList = stdout.split('\n');
                memoryList.forEach(mem => {
                    if (mem.includes('sda1')) {
                        let memoryInfo = mem.split(' ');
                        let memPath = memoryInfo[0];
                        if (memoryInfo[memoryInfo.length - 2] === 'FAT32') {
                            memFormat = 'vfat';
                        } else if (memoryInfo[memoryInfo.length - 2] === 'HPFS/NTFS/exFAT') {
                            memFormat = 'ntfs';
                        }
                        setUSB(memPath, memFormat).then(res => {
                            resolve(res);
                        }).catch(error => {
                            reject(error);
                        });
                    }
                });
            }
        }
        if (stderr) {
            console.log('[getUSB] stderr: ' + stderr);
            reject(stderr);
        }
    });
});

function crtDir(dir) {
    return new Promise((resolve, reject) => {
        exec("echo " + pw + " | sudo -S mkdir " + dir, (error, stdout, stderr) => {
            if (error) {
                if (!(error.toString().includes('File exists'))) {
                    console.log('[crtDir] error:', error);
                    reject(error);
                }
            }
            if (stdout) {
                console.log('[crtDir] stdout:', stdout);
            }
            if (stderr) {
                if (stderr.includes('File exists')) {
                    console.log('Already [ ' + dir + ' ] exists');
                    resolve('finish');
                } else {
                    console.log('[crtDir] stderr:', stderr);
                    reject(stderr);
                }
            }
        });
        resolve('finish');
    });
}

function setUSB(path, format) {
    return new Promise((resolve, reject) => {
        // !fs.existsSync(external_memory) && fs.mkdirSync(external_memory);
        crtDir(external_memory).then(() => {
            console.log('Create Directory [ ' + external_memory + ' ]');
            exec("echo " + pw + " | sudo -S mount -t " + format + " " + path + " " + external_memory, (error, stdout, stderr) => {
                if (error) {
                    if (error.toString().includes('already mounted')) {
                        copyable = true;
                        resolve('finish');
                    } else {
                        console.log('[setUSB] error:', error);
                        reject(error);
                    }
                }
                if (stdout) {
                    console.log('[setUSB] stdout:', stdout);
                }
                if (stderr) {
                    if (stderr.toString().includes('already mounted')) {
                        copyable = true;
                        resolve('finish');
                    } else {
                        console.log('[setUSB] stderr:', stderr);
                        reject(stderr);
                    }
                } else {
                    copyable = true;
                    resolve('finish');
                }
            });
            // copyable = true;
            // resolve('finish');
        }).catch((error) => {
            reject(error);
        });
    });
}

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
        lib.scripts = "node ./geotagging.js";
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][1];
    geotagged_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][4];

    lib_mqtt_connect('localhost', 1883);

    let dirName_flag = false;
    checkUSB.then(() => {
        if (copyable) {
            dir_name = moment().format('YYYY-MM-DDTHH');
            try {
                let files = fs.readdirSync(external_memory, {withFileTypes: true});
                files.forEach(p => {
                    let dir = p.name;
                    if (dir === dir_name) {
                        if (p.isDirectory()) {
                            external_memory = external_memory + '/' + dir;
                            console.log('외장 메모리 경로 : ' + external_memory);
                            dirName_flag = true;
                            return;
                        }
                    }
                });
            } catch (e) {
                console.log(e)
                let files = fs.readdirSync(external_memory, {withFileTypes: true});
                files.forEach(p => {
                    let dir = p.name;
                    if (dir === dir_name) {
                        if (p.isDirectory()) {
                            external_memory = external_memory + '/' + dir;
                            console.log('외장 메모리 경로 : ' + external_memory);
                            dirName_flag = true;
                            return;
                        }
                    }
                });
            }

            if (!dirName_flag) {
                external_memory = external_memory + '/' + dir_name;
                // fs.mkdirSync(external_memory);
                crtDir(external_memory).then(() => {
                    console.log('Create directory ---> ' + external_memory);
                }).catch((error) => {
                    console.log('Fail to create [ ' + external_memory + ' ]\n' + error);
                })
            }
        }

        setTimeout(geotag_image, 100);
    }).catch((error) => {
        console.log(error);

        setTimeout(geotag_image, 100);
    });
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

let gps;
let img_count = 0;

function geotag_image() {
    fs.readdir('./', (err, files) => {
        if (err) {
            console.log('[Captured Directory] is empty directory..');

            setTimeout(geotag_image, 100);
        } else {
            files = files.filter(file => file.toLowerCase().includes('.jpg'));

            if (files.length > 0) {
                console.time('geotag');

                let jpeg = fs.readFileSync(files[0]);
                let data = jpeg.toString("binary");
                let exifObj = piexif.load(data);

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

                if (copyable) {
                    fs.copyFile('./' + files[0], external_memory + '/' + files[0], (err) => {
                        if (err) {
                            console.log(err);
                        }
                    });
                }
                setTimeout(move_image, 1, './' + files[0], './' + geotagging_dir + '/' + files[0].replace('.jpg', '_' + img_count.toString().padStart(2, '0') + '.jpg'));
                img_count++
            } else {
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

function move_image(from, to) {
    try {
        console.time('[Geo]move')
        // fs.renameSync(from + image, to + image);
        fs.copyFile(from, to, (err) => {
            if (err) {
                console.log(err);
            }
            fs.unlink(from, (err) => {
                console.timeEnd('[Geo]move')
                console.log(from)
                status = 'Geotagging';
                count++;
                let msg = status + ' ' + count;
                lib_mqtt_client.publish(my_status_topic, msg);
                try {
                    if (gps.hasOwnProperty('_id')) {
                        delete gps['_id'];
                    }
                } catch (e) {
                    // console.log(e);
                }
                lib_mqtt_client.publish(geotagged_position_topic, JSON.stringify(gps));

                console.timeEnd('geotag');

                setTimeout(geotag_image, 100);
            });
        });

        // console.log('move from ' + from + image + ' to ' + to + image);

        // captured_arr = [];
    } catch (e) {
        fs.stat(to, (err) => {
            if (err !== null && err.code === "ENOENT") {
                console.log("[geotagging] 사진이 존재하지 않습니다.");
            }
            console.log("[geotagging] 이미 처리 후 옮겨진 사진 (" + to + ") 입니다.");
        });
        // captured_arr = [];
    }
}
